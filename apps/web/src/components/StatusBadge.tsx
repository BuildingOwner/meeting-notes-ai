import type { JobStatus } from "@/lib/api";

const STATUS_TEXT: Record<JobStatus, string> = {
  QUEUED: "대기",
  TRANSCRIBING: "전사 중",
  TRANSCRIBED: "전사 완료",
  PROCESSING: "정리 중",
  DONE: "완료",
  FAILED: "실패",
};

// Notion uses rounded-full for badges only (not regular buttons)
const STATUS_CLASS: Record<JobStatus, string> = {
  QUEUED: "bg-surface text-stone border border-hairline",
  TRANSCRIBING: "bg-surface text-slate border border-hairline",
  TRANSCRIBED: "bg-surface text-ink border border-hairline",
  PROCESSING: "bg-card-tint-peach text-brand-orange",
  DONE: "bg-card-tint-mint text-brand-teal",
  FAILED: "bg-card-tint-rose text-semantic-error",
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-block text-caption px-[10px] py-1 rounded-full whitespace-nowrap ${STATUS_CLASS[status]}`}
    >
      {STATUS_TEXT[status]}
    </span>
  );
}
