"""STT 워커 데몬: SQLite 폴링 → faster-whisper 전사 → status 전이.

폴링 주기마다 status=QUEUED 인 잡을 atomic claim 하여 TRANSCRIBING 으로 전이,
faster-whisper 로 전사, 성공시 TRANSCRIBED + transcript_path, 실패시 FAILED.

모델은 작업이 들어올 때만 로드하고, 전사 완료 후 즉시 언로드하여 GPU 메모리를 비운다.

환경변수
- STT_MODEL_PATH (필수): faster-whisper 모델 디렉토리
- STT_GPU_INDEX (기본 1): CUDA device index
- STT_DEVICE (기본 cuda): cuda 또는 cpu
- STT_COMPUTE_TYPE (기본 float16, CPU 면 int8 권장)
- STT_LANGUAGE (기본 ko): 언어 코드 또는 auto
- STT_POLL_INTERVAL (기본 2.0): 폴링 주기 (초)
- STT_IDLE_UNLOAD (기본 1): 1이면 잡 처리 후 모델 언로드, 0이면 상주
- MEETING_NOTES_ROOT (기본 ~/meeting-notes): 작업 디렉토리 루트
- MEETING_NOTES_DB: SQLite 파일 경로 (paths.py 참조)

실행: uv run python -m workers.stt.worker
"""
from __future__ import annotations

import gc
import logging
import os
import time
import traceback
from logging.handlers import RotatingFileHandler
from pathlib import Path

from faster_whisper import WhisperModel

from apps.api.db import connect
from apps.api.paths import AUDIO_DIR, LOG_DIR, TRANSCRIPT_DIR

POLL_INTERVAL_S = float(os.environ.get("STT_POLL_INTERVAL", "2.0"))
# 전사 도중 워커 하드크래시(OOM/SIGKILL/재부팅)로 TRANSCRIBING 에 고착된 잡을 회수하는
# 임계. updated_at(claim 시각)이 이 시간보다 오래된 TRANSCRIBING 만 회수하므로 정상
# 진행 중인 긴 전사를 가로채지 않도록 충분히 크게 둔다(최장 오디오 전사시간 초과).
STALE_TRANSCRIBING_MIN = int(os.environ.get("STALE_TRANSCRIBING_MIN", "120"))
REAP_INTERVAL_S = float(os.environ.get("STT_REAP_INTERVAL", "60"))
MODEL_PATH = os.environ.get(
    "STT_MODEL_PATH",
    "/home/jwchoi/workspace/2026/docs/temp/whisper-transcribe/model/faster-whisper-large-v3",
)
DEVICE = os.environ.get("STT_DEVICE", "cuda")
GPU_INDEX = int(os.environ.get("STT_GPU_INDEX", "1"))
COMPUTE_TYPE = os.environ.get(
    "STT_COMPUTE_TYPE", "float16" if DEVICE == "cuda" else "int8"
)
LANGUAGE = os.environ.get("STT_LANGUAGE", "ko")
IDLE_UNLOAD = os.environ.get("STT_IDLE_UNLOAD", "1") == "1"

LOG_PATH = LOG_DIR / "stt-worker.log"
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
log = logging.getLogger("stt-worker")


def fmt_ts(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def claim_queued() -> dict | None:
    """status=QUEUED 잡 1건을 atomic 하게 TRANSCRIBING 으로 전이."""
    conn = connect()
    row = conn.execute(
        "SELECT id, audio_path FROM jobs "
        "WHERE status = 'QUEUED' ORDER BY created_at LIMIT 1"
    ).fetchone()
    if row is None:
        return None
    cur = conn.execute(
        "UPDATE jobs SET status = 'TRANSCRIBING' "
        "WHERE id = ? AND status = 'QUEUED'",
        (row["id"],),
    )
    if cur.rowcount == 0:
        return None
    return dict(row)


def reap_stale_transcribing() -> int:
    """전사 도중 워커가 통째로 죽어(예외 미발생) TRANSCRIBING 에 고착된 잡을 QUEUED 로
    되돌려 자동 재전사한다. updated_at 임계 가드로 정상 진행 중인 전사는 건드리지 않음.
    단건 atomic UPDATE(autocommit)라 멱등."""
    conn = connect()
    cur = conn.execute(
        "UPDATE jobs SET status='QUEUED', error=NULL "
        "WHERE status='TRANSCRIBING' AND updated_at < datetime('now', ?)",
        (f"-{STALE_TRANSCRIBING_MIN} minutes",),
    )
    return cur.rowcount


def mark_done(job_id: str, transcript_path: Path) -> None:
    conn = connect()
    conn.execute(
        "UPDATE jobs SET status = 'TRANSCRIBED', transcript_path = ? "
        "WHERE id = ? AND status = 'TRANSCRIBING'",
        (str(transcript_path), job_id),
    )


def mark_failed(job_id: str, reason: str) -> None:
    conn = connect()
    conn.execute(
        "UPDATE jobs SET status = 'FAILED', error = ? "
        "WHERE id = ? AND status IN ('TRANSCRIBING','QUEUED')",
        (reason[:1000], job_id),
    )


def transcribe(
    model: WhisperModel, audio_path: Path, transcript_path: Path
) -> int:
    """faster-whisper 전사 → markdown transcript 작성. 반환=segment 수."""
    lang = None if LANGUAGE == "auto" else LANGUAGE
    segments, info = model.transcribe(
        str(audio_path),
        language=lang,
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
    )

    lines: list[str] = []
    for seg in segments:
        lines.append(f"[{fmt_ts(seg.start)}] {seg.text.strip()}")

    header = [
        f"# {audio_path.name} (STT)",
        "",
        f"- duration: {fmt_ts(info.duration)}",
        f"- language: {info.language} (prob {info.language_probability:.2f})",
        f"- segments: {len(lines)}",
        f"- model: {Path(MODEL_PATH).name}",
        "",
        "## 본문",
        "",
    ]
    transcript_path.parent.mkdir(parents=True, exist_ok=True)
    transcript_path.write_text(
        "\n".join(header + lines) + "\n", encoding="utf-8"
    )
    return len(lines)


def load_model() -> WhisperModel:
    log.info(
        f"loading model: device={DEVICE}:{GPU_INDEX} compute={COMPUTE_TYPE} "
        f"path={MODEL_PATH}"
    )
    t0 = time.time()
    try:
        model = WhisperModel(
            MODEL_PATH,
            device=DEVICE,
            device_index=GPU_INDEX,
            compute_type=COMPUTE_TYPE,
        )
    except (ValueError, RuntimeError) as e:
        if DEVICE != "cpu":
            log.warning(f"device={DEVICE} 로드 실패 ({e}), CPU/int8 로 폴백")
            model = WhisperModel(MODEL_PATH, device="cpu", device_index=0, compute_type="int8")
        else:
            raise
    log.info(f"model loaded ({time.time() - t0:.1f}s)")
    return model


def unload_model(model: WhisperModel | None) -> None:
    if model is None:
        return
    del model
    gc.collect()
    if DEVICE == "cuda":
        try:
            import torch

            torch.cuda.empty_cache()
        except Exception:
            pass
    log.info("model unloaded")


def main() -> None:
    log.info(
        f"stt-worker start: poll={POLL_INTERVAL_S}s "
        f"device={DEVICE}:{GPU_INDEX} compute={COMPUTE_TYPE} model={MODEL_PATH} "
        f"idle_unload={IDLE_UNLOAD}"
    )

    model: WhisperModel | None = None

    # 기동 시 직전 인스턴스가 남긴 TRANSCRIBING 고아를 1회 회수.
    try:
        reaped = reap_stale_transcribing()
        if reaped:
            log.warning(f"startup reaped {reaped} stale TRANSCRIBING job(s) -> QUEUED")
    except Exception:
        log.exception("startup reap error")

    last_reap = time.time()
    while True:
        try:
            now = time.time()
            if now - last_reap >= REAP_INTERVAL_S:
                reaped = reap_stale_transcribing()
                if reaped:
                    log.warning(f"reaped {reaped} stale TRANSCRIBING job(s) -> QUEUED")
                last_reap = now
            job = claim_queued()
            if job is None:
                if model is not None and IDLE_UNLOAD:
                    unload_model(model)
                    model = None
                time.sleep(POLL_INTERVAL_S)
                continue

            job_id = job["id"]
            # api 가 컨테이너 절대경로 (/data/audio/...) 로 저장한 경우에도
            # 호스트 워커가 동일 파일을 자기 AUDIO_DIR 아래에서 찾을 수 있게 fallback.
            stored = Path(job["audio_path"])
            audio_path = stored if stored.exists() else (AUDIO_DIR / stored.name)
            log.info(f"claimed {job_id} ({audio_path.name})")

            if not audio_path.exists():
                mark_failed(
                    job_id, f"audio file not found: {stored} (also tried {audio_path})"
                )
                log.error(f"audio missing for {job_id}: {stored}")
                continue

            transcript_path = TRANSCRIPT_DIR / f"{job_id}.md"
            try:
                if model is None:
                    model = load_model()
                n = transcribe(model, audio_path, transcript_path)
                mark_done(job_id, transcript_path)
                log.info(f"done {job_id}: {n} segments → {transcript_path}")
            except Exception as e:
                tb = traceback.format_exc()
                mark_failed(job_id, f"{e}\n{tb}")
                log.exception(f"failed {job_id}: {e}")
                model = None  # 모델 상태 불확실 → 다음 잡에서 재로드
        except Exception as e:
            log.exception(f"poll loop error: {e}")
            time.sleep(POLL_INTERVAL_S)


if __name__ == "__main__":
    main()
