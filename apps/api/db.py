"""SQLite connection + schema init for meeting-notes jobs."""
from __future__ import annotations

import sqlite3
from pathlib import Path

from apps.api.paths import DB_PATH

SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def _connect(path: Path = DB_PATH) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, isolation_level=None, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init(path: Path = DB_PATH) -> sqlite3.Connection:
    conn = _connect(path)
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    return conn


def connect(path: Path = DB_PATH) -> sqlite3.Connection:
    return _connect(path)
