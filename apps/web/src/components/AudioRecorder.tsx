"use client";

import { useAudioRecorder } from "@/hooks/useAudioRecorder";

export interface AudioRecorderProps {
  onRecorded: (file: File) => void;
  onReset?: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function MicIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

export function AudioRecorder({ onRecorded, onReset }: AudioRecorderProps) {
  const { state, start, stop, pause, resume, reset, blob, url, duration, mimeType, error } =
    useAudioRecorder();

  function handleUse() {
    if (!blob) return;
    const ext = mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("mp4")
      ? "m4a"
      : "webm";
    const file = new File([blob], `recording-${Date.now()}.${ext}`, {
      type: mimeType || "audio/webm",
    });
    onRecorded(file);
  }

  function handleReset() {
    reset();
    onReset?.();
  }

  if (state === "idle" || state === "denied") {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        {state === "denied" && (
          <div className="w-full p-4 rounded-md bg-card-tint-rose border border-semantic-error/20 text-body-sm text-semantic-error">
            <p className="font-medium mb-1">마이크 접근이 거부되었습니다.</p>
            <p className="text-charcoal">
              브라우저 주소창 옆 자물쇠 아이콘에서 마이크 권한을 허용한 뒤
              다시 시도해 주세요.
            </p>
            {error && (
              <p className="mt-2 text-slate text-caption">{error}</p>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={start}
          className="flex items-center gap-2 btn-primary"
        >
          <MicIcon />
          녹음 시작
        </button>
        <p className="text-body-sm text-slate">
          클릭하면 마이크 접근 권한을 요청합니다.
        </p>
      </div>
    );
  }

  if (state === "requesting") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-slate">
        <MicIcon className="w-8 h-8 animate-pulse text-primary" />
        <p className="text-body-sm">마이크 권한을 요청 중입니다…</p>
      </div>
    );
  }

  if (state === "recording" || state === "paused") {
    return (
      <div className="flex flex-col items-center gap-6 py-6">
        <div className="flex items-center gap-3">
          <span className="flex gap-1" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full bg-semantic-error ${
                  state === "recording" ? "animate-bounce" : "opacity-30"
                }`}
                style={
                  state === "recording"
                    ? { animationDelay: `${i * 120}ms` }
                    : undefined
                }
              />
            ))}
          </span>
          <span
            className="text-heading-4 font-mono tabular-nums text-ink"
            aria-live="polite"
            aria-label={`녹음 시간 ${formatDuration(duration)}`}
          >
            {formatDuration(duration)}
          </span>
          {state === "paused" && (
            <span className="text-body-sm text-slate">일시정지</span>
          )}
        </div>

        <div className="flex gap-3">
          {state === "recording" ? (
            <button type="button" onClick={pause} className="btn-secondary">
              일시정지
            </button>
          ) : (
            <button type="button" onClick={resume} className="btn-secondary">
              재개
            </button>
          )}
          <button type="button" onClick={stop} className="btn-primary">
            녹음 완료
          </button>
        </div>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="flex flex-col gap-4 py-2">
        {url && <audio controls src={url} className="w-full" />}
        <p className="text-body-sm text-slate">
          녹음 시간: {formatDuration(duration)}
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={handleUse} className="btn-primary">
            이 녹음 사용
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="btn-secondary"
          >
            다시 녹음
          </button>
        </div>
      </div>
    );
  }

  return null;
}
