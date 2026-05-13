"""자동 정리 스크립트.

`expires_at < now()` 인 잡의 `audio_path` 파일을 삭제합니다.
트랜스크립트는 영구 보존이므로 건드리지 않습니다.

cron 예시:
    0 4 * * *  cd /path/to/meeting-notes-ai && uv run python scripts/cleanup.py

옵션:
    --dry-run   삭제하지 않고 대상만 출력
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import click

from apps.api.db import init


@click.command()
@click.option("--dry-run", is_flag=True, help="삭제하지 않고 대상만 표시")
def main(dry_run: bool) -> None:
    conn = init()
    rows = conn.execute(
        "SELECT id, audio_path, expires_at FROM jobs "
        "WHERE expires_at < datetime('now') AND audio_path != ''"
    ).fetchall()

    if not rows:
        click.echo("nothing to clean")
        return

    deleted = 0
    for row in rows:
        path = Path(row["audio_path"])
        exists = path.exists()
        prefix = "[DRY]" if dry_run else "[DEL]"
        click.echo(
            f"{prefix} {row['id']} expires_at={row['expires_at']} "
            f"{path} (exists={exists})"
        )
        if not dry_run and exists:
            try:
                path.unlink()
                deleted += 1
            except OSError as e:
                click.echo(f"  skip: {e}", err=True)

    if not dry_run:
        click.echo(f"deleted {deleted} files")


if __name__ == "__main__":
    main()
