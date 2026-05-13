-- meeting-notes-ai jobs schema (Phase 1, single SQLite file)

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    doc_type TEXT NOT NULL CHECK(doc_type IN ('meeting','seminar','lecture')),
    title TEXT,
    meta TEXT,                           -- JSON
    notion_target TEXT NOT NULL,         -- JSON {kind, id}
    audio_path TEXT NOT NULL,
    transcript_path TEXT,
    notion_url TEXT,
    status TEXT NOT NULL CHECK(status IN (
        'QUEUED','TRANSCRIBING','TRANSCRIBED',
        'PROCESSING','DONE','FAILED'
    )),
    error TEXT,
    triggered_at TEXT,                   -- bridge가 send-keys 한 시각
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_status_triggered ON jobs(status, triggered_at);

CREATE TRIGGER IF NOT EXISTS jobs_updated_at
AFTER UPDATE ON jobs
FOR EACH ROW
BEGIN
    UPDATE jobs SET updated_at = datetime('now') WHERE id = NEW.id;
END;
