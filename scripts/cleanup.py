"""자동 정리 스크립트.

종결된(DONE/FAILED) 잡 중 `expires_at < now()` 인 것의 `audio_path` 파일을 삭제합니다.
미완료(QUEUED/TRANSCRIBING/TRANSCRIBED/PROCESSING) 잡의 오디오는 만료돼도 보존합니다
(원본이 유일 아티팩트라 지우면 복구 불가). 트랜스크립트는 영구 보존이라 건드리지 않습니다.
추가로, finalize 되지 않고 방치된 orphan 업로드 세션 디렉토리도 정리합니다.

cron 예시:
    0 4 * * *  cd /path/to/meeting-notes-ai && uv run python scripts/cleanup.py

옵션:
    --dry-run                삭제하지 않고 대상만 출력
    --orphan-upload-hours N  N시간 이상 방치된 업로드 세션 삭제(기본 24)
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import click

from apps.api.db import init
from apps.api.paths import UPLOAD_DIR


@click.command()
@click.option("--dry-run", is_flag=True, help="삭제하지 않고 대상만 표시")
@click.option(
    "--orphan-upload-hours",
    default=24,
    show_default=True,
    help="N시간 이상 방치된 업로드 세션 디렉토리 삭제",
)
def main(dry_run: bool, orphan_upload_hours: int) -> None:
    conn = init()
    rows = conn.execute(
        "SELECT id, audio_path, expires_at FROM jobs "
        "WHERE expires_at < datetime('now') AND audio_path != '' "
        "AND status IN ('DONE', 'FAILED')"
    ).fetchall()

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

    # orphan 업로드 세션(미 finalize) 정리: mtime 이 임계보다 오래된 디렉토리 제거.
    import shutil

    cutoff = time.time() - orphan_upload_hours * 3600
    orphans = 0
    if UPLOAD_DIR.exists():
        for d in UPLOAD_DIR.iterdir():
            if not d.is_dir() or d.stat().st_mtime >= cutoff:
                continue
            prefix = "[DRY]" if dry_run else "[DEL]"
            click.echo(f"{prefix} orphan upload session {d}")
            if not dry_run:
                shutil.rmtree(d, ignore_errors=True)
                orphans += 1

    if not rows and not orphans:
        click.echo("nothing to clean")
    if not dry_run:
        click.echo(f"deleted {deleted} audio files, {orphans} orphan upload sessions")


if __name__ == "__main__":
    main()
