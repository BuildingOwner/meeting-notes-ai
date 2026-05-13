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

    row = conn.execute(
        "SELECT transcript_path, doc_type, title, meta, notion_target "
        "FROM jobs WHERE id = ?",
        (job_id,),
    ).fetchone()

    return {
        "transcript_path": row["transcript_path"],
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


@mcp.tool()
def complete(job_id: str, notion_url: str) -> dict[str, bool]:
    """잡 완료 마킹. status PROCESSING → DONE."""
    conn = connect()
    cur = conn.execute(
        "UPDATE jobs SET status = 'DONE', notion_url = ? "
        "WHERE id = ? AND status = 'PROCESSING'",
        (notion_url, job_id),
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
    """prompts/_base.md + prompts/{doc_type}.md 를 이어 붙여 반환."""
    base = PROMPTS_DIR / "_base.md"
    specific = PROMPTS_DIR / f"{doc_type}.md"
    parts: list[str] = []
    if base.exists():
        parts.append(base.read_text(encoding="utf-8"))
    if specific.exists():
        parts.append(specific.read_text(encoding="utf-8"))
    if not parts:
        return f"[프롬프트 템플릿 미작성: prompts/{doc_type}.md]"
    return "\n\n".join(parts)
