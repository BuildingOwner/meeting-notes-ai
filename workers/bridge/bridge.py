"""meeting-notes-bridge: SQLite 폴링 → tmux send-keys.

slack-bridge.py 패턴 차용. status=TRANSCRIBED & triggered_at IS NULL 잡을
사용자의 tmux Claude Code 세션에 프롬프트로 푸시.

실행: uv run python -m workers.bridge.bridge
"""
from __future__ import annotations

import logging
import os
import subprocess
import time
from apps.api.db import connect
from apps.api.paths import LOG_DIR

POLL_INTERVAL_S = float(os.environ.get("BRIDGE_POLL_INTERVAL", "1.0"))
DEFAULT_TARGET = os.environ.get("CC_TMUX_TARGET", "meeting-notes-cc:0.0")

LOG_PATH = LOG_DIR / "bridge.log"
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_PATH), logging.StreamHandler()],
)
log = logging.getLogger("bridge")


def tmux_session_exists(target: str) -> bool:
    session = target.split(":")[0]
    return (
        subprocess.run(
            ["tmux", "has-session", "-t", session],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        ).returncode
        == 0
    )


def send_to_tmux(target: str, text: str) -> None:
    subprocess.run(["tmux", "send-keys", "-t", target, "-l", text], check=True)
    subprocess.run(["tmux", "send-keys", "-t", target, "Enter"], check=True)
    log.info(f"-> tmux[{target}]: {text[:80]}{'...' if len(text) > 80 else ''}")


def find_due_jobs():
    conn = connect()
    return conn.execute(
        "SELECT id, doc_type FROM jobs "
        "WHERE status = 'TRANSCRIBED' AND triggered_at IS NULL "
        "ORDER BY created_at"
    ).fetchall()


def mark_triggered(job_id: str) -> None:
    conn = connect()
    conn.execute(
        "UPDATE jobs SET triggered_at = datetime('now') WHERE id = ?",
        (job_id,),
    )


def main() -> None:
    target = DEFAULT_TARGET
    log.info(f"bridge start: target={target}, poll={POLL_INTERVAL_S}s")

    while True:
        try:
            jobs = find_due_jobs()
            if jobs and not tmux_session_exists(target):
                log.warning(f"tmux session {target} not found; will retry")
            else:
                for row in jobs:
                    msg = (
                        f"회의록 잡 {row['id']} 처리해줘 "
                        f"(doc_type={row['doc_type']}). "
                        f"meeting_notes.claim으로 시작."
                    )
                    send_to_tmux(target, msg)
                    mark_triggered(row["id"])
        except Exception as e:
            log.exception(f"poll error: {e}")
        time.sleep(POLL_INTERVAL_S)


if __name__ == "__main__":
    main()
