"""STT PoC: faster-whisper로 오디오를 markdown transcript로 변환.

화자 분리(pyannote)는 M1.5에서 추가 예정.

사용:
    uv run python workers/stt/transcribe.py <audio> [--out PATH] [--gpu N]
"""
from __future__ import annotations

import time
from pathlib import Path

import click
from faster_whisper import WhisperModel
from tqdm import tqdm

DEFAULT_MODEL_PATH = "/home/hipo1/models/whisper/faster-whisper-large-v3"


def fmt_ts(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


@click.command()
@click.argument("audio", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option(
    "--out",
    "-o",
    type=click.Path(dir_okay=False, path_type=Path),
    help="출력 markdown 경로 (기본: <audio>.transcript.md)",
)
@click.option("--model", default=DEFAULT_MODEL_PATH, help="faster-whisper 모델 디렉토리")
@click.option("--gpu", type=int, default=1, help="CUDA device index (기본 1)")
@click.option("--language", default="ko", help="언어 코드 (ko/en/ja/...) 또는 auto")
def main(audio: Path, out: Path | None, model: str, gpu: int, language: str) -> None:
    out = out or audio.with_suffix(audio.suffix + ".transcript.md")
    lang = None if language == "auto" else language

    click.echo(f"모델 로딩: {model} (cuda:{gpu}, float16)")
    t0 = time.time()
    whisper = WhisperModel(model, device="cuda", device_index=gpu, compute_type="float16")
    click.echo(f"  로딩 완료 ({time.time() - t0:.1f}s)")

    click.echo(f"전사 시작: {audio.name}")
    t0 = time.time()
    segments, info = whisper.transcribe(
        str(audio),
        language=lang,
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
    )

    lines: list[str] = []
    with tqdm(total=round(info.duration), unit="sec", desc="transcribing") as pbar:
        last_end = 0.0
        for seg in segments:
            lines.append(f"[{fmt_ts(seg.start)}] {seg.text.strip()}")
            pbar.update(round(seg.end - last_end))
            last_end = seg.end

    elapsed = time.time() - t0
    duration_str = fmt_ts(info.duration)

    header = [
        f"# {audio.name} (STT)",
        "",
        f"- duration: {duration_str}",
        f"- language: {info.language} (prob {info.language_probability:.2f})",
        f"- segments: {len(lines)}",
        f"- model: {Path(model).name}",
        "",
        "## 본문",
        "",
    ]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(header + lines) + "\n", encoding="utf-8")

    click.echo(f"완료 ({elapsed:.1f}s, 길이 {duration_str}) → {out}")


if __name__ == "__main__":
    main()
