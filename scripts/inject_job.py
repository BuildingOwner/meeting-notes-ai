"""Dev tool: TRANSCRIBED 상태로 가짜 잡 삽입 (M2 E2E 테스트용).

사용:
    uv run python scripts/inject_job.py <transcript_path> \\
      --notion-page-id <id> [--doc-type meeting] [--title ...]
"""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import click

from apps.api.db import init


@click.command()
@click.argument("transcript_path", type=click.Path(exists=True, path_type=Path))
@click.option(
    "--doc-type",
    type=click.Choice(["meeting", "seminar", "lecture"]),
    default="meeting",
)
@click.option("--title", default=None)
@click.option(
    "--notion-page-id",
    required=True,
    help="Notion 부모 페이지 또는 DB의 ID",
)
@click.option(
    "--notion-kind",
    type=click.Choice(["page", "database"]),
    default="page",
)
def main(
    transcript_path: Path,
    doc_type: str,
    title: str | None,
    notion_page_id: str,
    notion_kind: str,
) -> None:
    conn = init()
    job_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO jobs "
        "(id, doc_type, title, meta, notion_target, audio_path, "
        " transcript_path, status, expires_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, 'TRANSCRIBED', "
        " datetime('now', '+7 days'))",
        (
            job_id,
            doc_type,
            title or transcript_path.stem,
            json.dumps({}, ensure_ascii=False),
            json.dumps(
                {"kind": notion_kind, "id": notion_page_id}, ensure_ascii=False
            ),
            "",
            str(transcript_path.resolve()),
        ),
    )
    click.echo(f"injected job {job_id} (status=TRANSCRIBED)")


if __name__ == "__main__":
    main()
