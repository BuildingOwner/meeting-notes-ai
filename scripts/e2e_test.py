"""End-to-end 통합 테스트: 업로드 → STT → bridge → Claude Code → Notion → complete.

API 가 떠 있고 (uvicorn @8088), STT 워커가 돌고, bridge 가 돌고,
tmux meeting-notes-cc 에 Claude Code 가 떠 있어야 합니다.

사용:
    uv run python scripts/e2e_test.py temp/data/녹음\\ \\(13\\).m4a \\
      --notion-db 2d156e944e358166b3ccca696a3b8349 \\
      --doc-type meeting [--title ...] [--timeout 900]
"""
from __future__ import annotations

import sys
import time
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import click
import requests

API_BASE = "http://127.0.0.1:8088"
STATE_FLOW = [
    "QUEUED",
    "TRANSCRIBING",
    "TRANSCRIBED",
    "PROCESSING",
    "DONE",
]


@click.command()
@click.argument("audio", type=click.Path(exists=True, path_type=Path))
@click.option("--notion-db", required=True, help="Notion DB ID")
@click.option(
    "--doc-type",
    type=click.Choice(["meeting", "seminar", "lecture"]),
    default="meeting",
)
@click.option("--title", default=None)
@click.option(
    "--timeout", type=int, default=900, help="최대 대기 시간 (초, 기본 15분)"
)
@click.option("--api", default=API_BASE)
def main(
    audio: Path,
    notion_db: str,
    doc_type: str,
    title: str | None,
    timeout: int,
    api: str,
) -> None:
    click.echo(f"=== upload {audio.name} → {api}/jobs ===")
    with audio.open("rb") as f:
        resp = requests.post(
            f"{api}/jobs",
            files={"audio_file": (audio.name, f, "audio/mp4")},
            data={
                "doc_type": doc_type,
                "notion_target": (
                    '{"kind":"database","id":"' + notion_db + '"}'
                ),
                "title": title or f"E2E {audio.stem}",
            },
            timeout=120,
        )
    resp.raise_for_status()
    job = resp.json()
    job_id = job["id"]
    click.echo(f"job_id={job_id} status={job['status']}")

    seen_states = []
    deadline = time.time() + timeout
    last_status: str | None = None
    while time.time() < deadline:
        try:
            j = requests.get(f"{api}/jobs/{job_id}", timeout=10).json()
        except requests.RequestException as e:
            click.echo(f"  poll error: {e}", err=True)
            time.sleep(3)
            continue
        if j["status"] != last_status:
            last_status = j["status"]
            seen_states.append(last_status)
            click.echo(f"  [{time.strftime('%H:%M:%S')}] {last_status}")
        if j["status"] in ("DONE", "FAILED"):
            break
        time.sleep(3)

    click.echo(f"\n=== state transitions: {' → '.join(seen_states)} ===")
    if j["status"] != "DONE":
        click.echo(f"FAILED: {j.get('error')}", err=True)
        sys.exit(1)

    notion_url = j.get("notion_url")
    if not notion_url:
        click.echo("FAILED: notion_url is missing", err=True)
        sys.exit(1)

    parsed = urllib.parse.urlparse(notion_url)
    if parsed.scheme not in ("http", "https") or "notion.so" not in parsed.netloc:
        click.echo(f"FAILED: notion_url not a valid notion URL: {notion_url}", err=True)
        sys.exit(1)

    missing = [s for s in STATE_FLOW if s not in seen_states]
    click.echo(f"notion_url: {notion_url}")
    if missing:
        click.echo(
            f"WARN: state transitions missing: {missing} (전이 너무 빨라 폴링 누락 가능)"
        )
    click.echo("E2E PASS")


if __name__ == "__main__":
    main()
