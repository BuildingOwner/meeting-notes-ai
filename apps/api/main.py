"""FastAPI app: REST endpoints + 마운트된 MCP 서버 (/mcp).

실행: uv run python -m apps.api.server
환경: MCP_HOST (기본 127.0.0.1), MCP_PORT (기본 8088)
"""
from __future__ import annotations

import json
import shutil
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from apps.api.db import connect, init
from apps.api.mcp_tools import mcp
from apps.api.paths import AUDIO_DIR, TRANSCRIPT_DIR

ALLOWED_EXTS = {".m4a", ".mp3", ".wav", ".webm", ".ogg", ".flac"}
ALLOWED_DOC_TYPES = {"meeting", "seminar", "lecture"}

init()
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp.session_manager.run():
        yield


app = FastAPI(title="meeting-notes-ai", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/mcp", mcp.streamable_http_app())


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}


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

    conn = connect()
    conn.execute(
        "INSERT INTO jobs "
        "(id, doc_type, title, meta, notion_target, audio_path, status, expires_at) "
        "VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', datetime('now', '+7 days'))",
        (
            job_id,
            doc_type,
            title or Path(audio_file.filename).stem,
            json.dumps({}, ensure_ascii=False),
            json.dumps(notion_target_obj, ensure_ascii=False),
            str(audio_path),
        ),
    )
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
