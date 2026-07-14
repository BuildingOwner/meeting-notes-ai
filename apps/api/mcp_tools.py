"""MCP tools (meeting_notes.*) — list_pending / claim / complete / fail.

main.py가 `app.mount("/mcp", mcp.streamable_http_app())`로 서브-앱 마운트.
스탠드얼론 실행을 원하면 `mcp.run(transport="streamable-http")`도 가능하지만
운영은 항상 FastAPI 진입점을 통한다.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

from apps.api.db import connect

PROMPTS_DIR = Path(__file__).parents[2] / "prompts"

# claim 이 transcript 를 인라인으로 돌려줄 수 있는 상한. 초과하면 get_transcript 로 나눠 받는다.
# MCP tool-result 는 클라이언트 토큰 상한(Claude Code 기본 25k tokens)에 걸리면 통째로
# 파일로 스풀되고, 무인 세션은 그 파일을 읽을 권한이 없어 잡이 통째로 실패한다.
# 한글은 대략 1 char ≈ 1 token 이라 여유를 두고 15k chars 로 자른다.
TRANSCRIPT_CHUNK_CHARS = 15_000

# host/port 는 FastAPI 마운트 모드에서 사용 안 함 (uvicorn 이 바인딩 — server.py 참조).
# streamable_http_path="/" 는 app.mount("/mcp", ...) 와 결합해 /mcp/ 에 응답하게 함.
mcp = FastMCP("meeting-notes", streamable_http_path="/")


@mcp.tool()
def list_pending() -> list[dict[str, Any]]:
    """처리 대기 중인 회의록·세미나·강의 잡 목록 (status=TRANSCRIBED)."""
    conn = connect()
    rows = conn.execute(
        "SELECT id, doc_type, title, created_at FROM jobs "
        "WHERE status = 'TRANSCRIBED' ORDER BY created_at"
    ).fetchall()
    return [dict(r) for r in rows]


@mcp.tool()
def claim(job_id: str) -> dict[str, Any]:
    """잡 점유 + 전체 페이로드 반환. status TRANSCRIBED → PROCESSING (atomic)."""
    conn = connect()
    cur = conn.execute(
        "UPDATE jobs SET status = 'PROCESSING' "
        "WHERE id = ? AND status = 'TRANSCRIBED'",
        (job_id,),
    )
    if cur.rowcount == 0:
        row = conn.execute(
            "SELECT status FROM jobs WHERE id = ?", (job_id,)
        ).fetchone()
        if row is None:
            raise ValueError(f"job not found: {job_id}")
        raise ValueError(
            f"job {job_id} in status {row['status']}, not TRANSCRIBED"
        )

    # 여기서부터는 이미 status=PROCESSING 으로 커밋된 상태(autocommit). 페이로드 구성이
    # 실패하면 잡이 PROCESSING 에 영구 고착되므로, 어떤 예외든 FAILED 로 전이시켜 가시화·
    # retry 가능하게 한 뒤 재던진다. transcript 부재/공백은 "에러 문자열로 위장"하지 않고
    # 명시 실패 처리 — claude 가 빈 본문으로 잘못된 노트를 만들지 않도록.
    try:
        row = conn.execute(
            "SELECT transcript_path, doc_type, title, meta, notion_target "
            "FROM jobs WHERE id = ?",
            (job_id,),
        ).fetchone()

        transcript_path = row["transcript_path"] or ""
        if not transcript_path or not Path(transcript_path).exists():
            raise ValueError(f"transcript file missing: {transcript_path!r}")
        transcript = Path(transcript_path).read_text(encoding="utf-8")
        if not transcript.strip():
            raise ValueError(f"transcript is empty: {transcript_path!r}")

        payload: dict[str, Any] = {
            "doc_type": row["doc_type"],
            "title": row["title"],
            "meta": json.loads(row["meta"]) if row["meta"] else {},
            "notion_target": json.loads(row["notion_target"]),
            "prompt": _load_prompt(row["doc_type"]),
            "completion_contract": (
                "처리 완료 후 반드시 meeting_notes.complete(job_id, notion_url) 호출. "
                "실패 시 meeting_notes.fail(job_id, reason)."
            ),
        }

        chunks = _chunk_transcript(transcript)
        if len(chunks) == 1:
            payload["transcript"] = transcript
        else:
            # 큰 transcript 는 인라인 금지 — tool-result 상한 초과 시 페이로드 전체가
            # 유실된다. 대신 조각 수만 알려주고 get_transcript 로 전부 받아가게 한다.
            payload["transcript"] = None
            payload["transcript_chars"] = len(transcript)
            payload["transcript_chunks"] = len(chunks)
            payload["transcript_contract"] = (
                f"transcript 가 {len(transcript):,}자로 커서 인라인 반환하지 않는다. "
                f"meeting_notes.get_transcript(job_id, chunk_index) 를 "
                f"chunk_index=0..{len(chunks) - 1} 로 빠짐없이 호출해 순서대로 이어붙인 "
                "전문을 확보한 뒤 작성하라. 일부만 읽고 노트를 쓰지 말 것."
            )
        return payload
    except Exception as e:
        conn.execute(
            "UPDATE jobs SET status='FAILED', error=? "
            "WHERE id = ? AND status = 'PROCESSING'",
            (f"claim payload error: {e}", job_id),
        )
        raise


@mcp.tool()
def get_transcript(job_id: str, chunk_index: int) -> dict[str, Any]:
    """대용량 transcript 를 조각 단위로 반환. claim 이 transcript=None 일 때 사용."""
    conn = connect()
    row = conn.execute(
        "SELECT transcript_path FROM jobs WHERE id = ?", (job_id,)
    ).fetchone()
    if row is None:
        raise ValueError(f"job not found: {job_id}")
    transcript_path = row["transcript_path"] or ""
    if not transcript_path or not Path(transcript_path).exists():
        raise ValueError(f"transcript file missing: {transcript_path!r}")

    chunks = _chunk_transcript(Path(transcript_path).read_text(encoding="utf-8"))
    if not 0 <= chunk_index < len(chunks):
        raise ValueError(
            f"chunk_index {chunk_index} out of range [0, {len(chunks)})"
        )
    return {
        "chunk_index": chunk_index,
        "total_chunks": len(chunks),
        "text": chunks[chunk_index],
    }


def _chunk_transcript(text: str) -> list[str]:
    """transcript 를 TRANSCRIPT_CHUNK_CHARS 이하 조각으로 분할 (줄 경계 유지)."""
    chunks: list[str] = []
    cur: list[str] = []
    size = 0
    for line in text.splitlines(keepends=True):
        if cur and size + len(line) > TRANSCRIPT_CHUNK_CHARS:
            chunks.append("".join(cur))
            cur, size = [], 0
        cur.append(line)
        size += len(line)
    if cur:
        chunks.append("".join(cur))
    return chunks or [""]


@mcp.tool()
def complete(job_id: str, notion_url: str, title: str) -> dict[str, bool]:
    """잡 완료 마킹. status PROCESSING → DONE. title은 Notion 페이지에 실제 사용된 제목."""
    conn = connect()
    cur = conn.execute(
        "UPDATE jobs SET status = 'DONE', notion_url = ?, title = ? "
        "WHERE id = ? AND status = 'PROCESSING'",
        (notion_url, title, job_id),
    )
    if cur.rowcount == 0:
        raise ValueError(f"job {job_id} not in PROCESSING state")
    return {"ok": True}


@mcp.tool()
def fail(job_id: str, reason: str) -> dict[str, bool]:
    """잡 실패 마킹. status PROCESSING → FAILED."""
    conn = connect()
    cur = conn.execute(
        "UPDATE jobs SET status = 'FAILED', error = ? "
        "WHERE id = ? AND status = 'PROCESSING'",
        (reason, job_id),
    )
    if cur.rowcount == 0:
        raise ValueError(f"job {job_id} not in PROCESSING state")
    return {"ok": True}


def _load_prompt(doc_type: str) -> str:
    """_base + _people + {doc_type} + _typo_gate 를 이어 붙여 반환.

    _people.md 는 팀 인명·담당 사전 — 팀 구성이 바뀌면 이 파일만 갱신하면 세 doc_type
    모두에 반영된다 (STT 가 한국어 인명을 거의 반드시 틀리므로 실명 복원에 필요).
    """
    base = PROMPTS_DIR / "_base.md"
    people = PROMPTS_DIR / "_people.md"
    specific = PROMPTS_DIR / f"{doc_type}.md"
    typo_gate = PROMPTS_DIR / "_typo_gate.md"
    parts: list[str] = []
    if base.exists():
        parts.append(base.read_text(encoding="utf-8"))
    if people.exists():
        parts.append(people.read_text(encoding="utf-8"))
    if specific.exists():
        parts.append(specific.read_text(encoding="utf-8"))
    if not parts:
        return f"[프롬프트 템플릿 미작성: prompts/{doc_type}.md]"
    if typo_gate.exists():
        parts.append(typo_gate.read_text(encoding="utf-8"))
    return "\n\n".join(parts)
