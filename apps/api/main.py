"""FastAPI app: REST endpoints + 마운트된 MCP 서버 (/mcp).

실행: uv run python -m apps.api.server
환경: MCP_HOST (기본 127.0.0.1), MCP_PORT (기본 8088)
"""
from __future__ import annotations

import json
import os
import re
import shutil
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from apps.api.db import connect, init
from apps.api.mcp_tools import mcp
from apps.api.paths import AUDIO_DIR, TRANSCRIPT_DIR, UPLOAD_DIR

ALLOWED_EXTS = {".m4a", ".mp3", ".wav", ".webm", ".ogg", ".flac"}
ALLOWED_DOC_TYPES = {"meeting", "seminar", "lecture"}
CHUNK_SIZE = 50 * 1024 * 1024  # 50 MB — Cloudflare Tunnel 무료 100 MB 한도의 절반
MAX_CHUNK_BYTES = CHUNK_SIZE + 1024 * 1024  # 청크당 상한(여유 1MB)
MAX_CHUNKS = 400  # 세션당 청크 수 상한(≈20GB) — 무한 누적/디스크 고갈 방지

init()
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp.session_manager.run():
        yield


_CORS_BASE = r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?"
_CORS_VERCEL = r"https://[\w-]+(\.vercel\.app)"
# CORS_EXTRA_ORIGINS: 쉼표로 구분된 추가 origin (예: https://your-domain.com)
_extra = [
    re.escape(o.strip())
    for o in os.environ.get("CORS_EXTRA_ORIGINS", "").split(",")
    if o.strip()
]
_CORS_REGEX = "^(" + "|".join([_CORS_BASE, _CORS_VERCEL] + _extra) + ")$"

app = FastAPI(title="meeting-notes-ai", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=_CORS_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/mcp", mcp.streamable_http_app())


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}


@app.get("/config")
def get_config() -> dict:
    notion_id = os.environ.get("NOTION_DEFAULT_TARGET_ID", "").strip()
    notion_kind = os.environ.get("NOTION_DEFAULT_TARGET_KIND", "database").strip()
    return {
        "notion_default_target": (
            {"id": notion_id, "kind": notion_kind} if notion_id else None
        )
    }


@app.get("/jobs")
def list_jobs(status: str | None = None, limit: int = 50) -> list[dict]:
    conn = connect()
    if status:
        rows = conn.execute(
            "SELECT id, doc_type, title, status, notion_url, created_at, updated_at "
            "FROM jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?",
            (status, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, doc_type, title, status, notion_url, created_at, updated_at "
            "FROM jobs ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    conn = connect()
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(404, f"job not found: {job_id}")
    result = dict(row)
    if result.get("meta"):
        result["meta"] = json.loads(result["meta"])
    if result.get("notion_target"):
        result["notion_target"] = json.loads(result["notion_target"])
    return result


@app.post("/jobs", status_code=201)
async def create_job(
    audio_file: UploadFile = File(...),
    doc_type: str = Form(...),
    notion_target: str = Form(...),
    title: str | None = Form(None),
) -> dict:
    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(400, f"unknown doc_type: {doc_type}")
    try:
        notion_target_obj = json.loads(notion_target)
    except json.JSONDecodeError:
        raise HTTPException(400, "notion_target must be valid JSON")
    if not isinstance(notion_target_obj, dict) or "id" not in notion_target_obj:
        raise HTTPException(400, "notion_target must be an object with at least {id}")
    notion_target_obj.setdefault("kind", "page")

    if not audio_file.filename:
        raise HTTPException(400, "audio_file requires a filename")
    ext = Path(audio_file.filename).suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(
            400,
            f"audio extension {ext} not allowed (allowed: {sorted(ALLOWED_EXTS)})",
        )

    job_id = str(uuid.uuid4())
    audio_path = AUDIO_DIR / f"{job_id}{ext}"
    with audio_path.open("wb") as f:
        shutil.copyfileobj(audio_file.file, f)

    # INSERT 실패 시 방금 저장한 오디오를 보상 삭제(고아 파일 방지).
    try:
        conn = connect()
        conn.execute(
            "INSERT INTO jobs "
            "(id, doc_type, title, meta, notion_target, audio_path, status, expires_at) "
            "VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', datetime('now', '+7 days'))",
            (
                job_id,
                doc_type,
                title or None,
                json.dumps({}, ensure_ascii=False),
                json.dumps(notion_target_obj, ensure_ascii=False),
                str(audio_path),
            ),
        )
    except Exception:
        audio_path.unlink(missing_ok=True)
        raise
    return {"id": job_id, "status": "QUEUED", "audio_path": str(audio_path)}


@app.post("/jobs/{job_id}/retry")
def retry_job(job_id: str) -> dict:
    conn = connect()
    cur = conn.execute(
        "UPDATE jobs SET status = 'QUEUED', error = NULL, triggered_at = NULL "
        "WHERE id = ? AND status = 'FAILED'",
        (job_id,),
    )
    if cur.rowcount == 0:
        row = conn.execute(
            "SELECT status FROM jobs WHERE id = ?", (job_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "job not found")
        raise HTTPException(
            409, f"can only retry FAILED jobs, current status: {row['status']}"
        )
    return {"id": job_id, "status": "QUEUED"}


@app.delete("/jobs/{job_id}")
def delete_job(job_id: str) -> dict:
    conn = connect()
    row = conn.execute(
        "SELECT audio_path, transcript_path FROM jobs WHERE id = ?", (job_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(404, "job not found")
    for p in (row["audio_path"], row["transcript_path"]):
        if p and Path(p).exists():
            try:
                Path(p).unlink()
            except OSError:
                pass
    conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
    return {"id": job_id, "deleted": True}


@app.post("/uploads", status_code=201)
def create_upload_session() -> dict:
    upload_id = str(uuid.uuid4())
    (UPLOAD_DIR / upload_id).mkdir(parents=True, exist_ok=True)
    return {"upload_id": upload_id, "chunk_size": CHUNK_SIZE}


def _resolve_session_dir(upload_id: str) -> Path:
    session_dir = (UPLOAD_DIR / upload_id).resolve()
    if not str(session_dir).startswith(str(UPLOAD_DIR.resolve())):
        raise HTTPException(400, "invalid upload_id")
    if not session_dir.exists():
        raise HTTPException(404, "upload session not found")
    return session_dir


@app.put("/uploads/{upload_id}/chunks/{chunk_index}", status_code=204)
async def upload_chunk(upload_id: str, chunk_index: int, request: Request) -> None:
    session_dir = _resolve_session_dir(upload_id)
    if chunk_index < 0 or chunk_index >= MAX_CHUNKS:
        raise HTTPException(400, f"chunk_index out of range [0, {MAX_CHUNKS})")
    body = await request.body()
    if not body:
        raise HTTPException(400, "empty chunk")
    if len(body) > MAX_CHUNK_BYTES:
        raise HTTPException(413, f"chunk too large (max {MAX_CHUNK_BYTES} bytes)")
    (session_dir / f"{chunk_index:06d}").write_bytes(body)


@app.post("/uploads/{upload_id}/finalize", status_code=201)
def finalize_upload(
    upload_id: str,
    doc_type: str = Form(...),
    notion_target: str = Form(...),
    filename: str = Form(...),
    title: str | None = Form(None),
) -> dict:
    session_dir = _resolve_session_dir(upload_id)

    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(400, f"unknown doc_type: {doc_type}")
    try:
        notion_target_obj = json.loads(notion_target)
    except json.JSONDecodeError:
        raise HTTPException(400, "notion_target must be valid JSON")
    if not isinstance(notion_target_obj, dict) or "id" not in notion_target_obj:
        raise HTTPException(400, "notion_target must be an object with at least {id}")
    notion_target_obj.setdefault("kind", "page")

    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(400, f"audio extension {ext} not allowed")

    # 세션을 원자적으로 점유(POSIX rename) — 같은 upload_id 로 들어온 중복/동시 finalize
    # (네트워크 재시도, 더블클릭)는 두 번째부터 원본 디렉토리가 없어 409 로 거절된다.
    # → 동일 오디오 중복 잡 생성 + rmtree 경합 동시 차단.
    finalizing_dir = session_dir.with_name(session_dir.name + ".finalizing")
    try:
        session_dir.rename(finalizing_dir)
    except OSError:
        raise HTTPException(409, "finalize already in progress or completed")

    try:
        chunk_files = sorted(finalizing_dir.iterdir())
        if not chunk_files:
            raise HTTPException(400, "no chunks uploaded")
        # 청크 연속성 검증: 파일명이 000000..N-1 로 빠짐/뒤바뀜 없이 연속이어야 한다.
        expected = [f"{i:06d}" for i in range(len(chunk_files))]
        if [c.name for c in chunk_files] != expected:
            raise HTTPException(
                400,
                f"chunk sequence broken: got {[c.name for c in chunk_files]}, "
                f"expected contiguous 0..{len(chunk_files) - 1}",
            )

        job_id = str(uuid.uuid4())
        audio_path = AUDIO_DIR / f"{job_id}{ext}"
        # 부분 쓰기/크래시 시 손상 파일이 QUEUED 로 등록되지 않도록 .part 로 쓰고 atomic rename.
        part_path = audio_path.with_name(audio_path.name + ".part")
        with part_path.open("wb") as out:
            for chunk_file in chunk_files:
                out.write(chunk_file.read_bytes())
        part_path.rename(audio_path)
    finally:
        shutil.rmtree(finalizing_dir, ignore_errors=True)

    try:
        conn = connect()
        conn.execute(
            "INSERT INTO jobs "
            "(id, doc_type, title, meta, notion_target, audio_path, status, expires_at) "
            "VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', datetime('now', '+7 days'))",
            (
                job_id,
                doc_type,
                title or None,
                json.dumps({}, ensure_ascii=False),
                json.dumps(notion_target_obj, ensure_ascii=False),
                str(audio_path),
            ),
        )
    except Exception:
        audio_path.unlink(missing_ok=True)
        raise
    return {"id": job_id, "status": "QUEUED", "audio_path": str(audio_path)}
