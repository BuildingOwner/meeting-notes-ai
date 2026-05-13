"""Shared path resolution. Override via env vars for Docker.

- MEETING_NOTES_ROOT (기본 ~/meeting-notes): 모든 작업 디렉토리의 부모
- MEETING_NOTES_DB (선택): SQLite 파일 경로 직접 지정 (기본 <ROOT>/db.sqlite3)
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(
    os.environ.get("MEETING_NOTES_ROOT", str(Path.home() / "meeting-notes"))
)
AUDIO_DIR = ROOT / "audio"
TRANSCRIPT_DIR = ROOT / "transcripts"
LOG_DIR = ROOT / "logs"
DB_PATH = Path(os.environ.get("MEETING_NOTES_DB", str(ROOT / "db.sqlite3")))
