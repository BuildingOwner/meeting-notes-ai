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
from logging.handlers import RotatingFileHandler

from apps.api.db import connect
from apps.api.paths import LOG_DIR

POLL_INTERVAL_S = float(os.environ.get("BRIDGE_POLL_INTERVAL", "1.0"))
DEFAULT_TARGET = os.environ.get("CC_TMUX_TARGET", "meeting-notes-cc:0.0")

# 고아 잡 회수(reaper) 주기·임계. updated_at(schema 트리거로 자동 갱신) 기준.
REAP_INTERVAL_S = float(os.environ.get("BRIDGE_REAP_INTERVAL", "60"))
# PROCESSING: claude 가 claim 후 complete/fail 없이 죽은 잡 → FAILED(가시화·retry 가능).
PROCESSING_STALE_MIN = int(os.environ.get("STALE_PROCESSING_MIN", "30"))
# TRANSCRIBED 인데 triggered_at 세팅됨(send 후 claude 미수신) → 재트리거.
TRIGGERED_STALE_MIN = int(os.environ.get("STALE_TRIGGERED_MIN", "5"))

LOG_PATH = LOG_DIR / "bridge.log"
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        RotatingFileHandler(
            LOG_PATH, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
        ),
        logging.StreamHandler(),
    ],
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


def reap_stale() -> None:
    """고아 잡 회수. 단건 atomic UPDATE(autocommit)라 멱등·안전.

    - PROCESSING 임계 초과(claude 가 claim 후 사망) → FAILED 로 가시화. retry 로 재실행.
    - TRANSCRIBED 인데 triggered_at 세팅됨(send 됐으나 claude 미수신) → triggered_at=NULL
      로 리셋해 bridge 가 재전송.
    (TRANSCRIBING 고아 회수는 STT 워커가 자기 단계에서 담당.)
    """
    conn = connect()
    failed = conn.execute(
        "UPDATE jobs SET status='FAILED', "
        "error='stale: processing timed out (claude died before complete/fail)' "
        "WHERE status='PROCESSING' AND updated_at < datetime('now', ?)",
        (f"-{PROCESSING_STALE_MIN} minutes",),
    ).rowcount
    retrigger = conn.execute(
        "UPDATE jobs SET triggered_at=NULL "
        "WHERE status='TRANSCRIBED' AND triggered_at IS NOT NULL "
        "AND updated_at < datetime('now', ?)",
        (f"-{TRIGGERED_STALE_MIN} minutes",),
    ).rowcount
    if failed or retrigger:
        log.warning(
            f"reaped: processing->failed={failed} retrigger(triggered_at reset)={retrigger}"
        )


def main() -> None:
    target = DEFAULT_TARGET
    log.info(f"bridge start: target={target}, poll={POLL_INTERVAL_S}s")

    last_reap = 0.0
    while True:
        try:
            now = time.time()
            if now - last_reap >= REAP_INTERVAL_S:
                reap_stale()
                last_reap = now
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
