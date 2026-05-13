import type { JobStatus } from "@/lib/api";

const STATUS_TEXT: Record<JobStatus, string> = {
  QUEUED: "대기",
  TRANSCRIBING: "전사 중",
  TRANSCRIBED: "전사 완료",
  PROCESSING: "정리 중",
  DONE: "완료",
  FAILED: "실패",
};

const STATUS_CLASS: Record<JobStatus, string> = {
  QUEUED: "text-ink-48 bg-divider-soft",
  TRANSCRIBING: "text-ink-48 bg-divider-soft",
  TRANSCRIBED: "text-ink bg-pearl",
  PROCESSING: "text-ink bg-pearl",
  DONE: "text-primary bg-canvas border border-primary/30",
  FAILED: "text-status-failed bg-canvas border border-status-failed/40",
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-block text-caption px-3 py-1 rounded-pill ${STATUS_CLASS[status]}`}
    >
      {STATUS_TEXT[status]}
    </span>
  );
}
