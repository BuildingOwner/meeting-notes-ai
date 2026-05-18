"use client";

import Link from "next/link";
import { Fragment, use, useEffect, useState } from "react";
import { getJob, retryJob, type JobDetail, type JobStatus } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";

const TERMINAL = new Set(["DONE", "FAILED"]);

const STAGES: { status: JobStatus; label: string }[] = [
  { status: "QUEUED", label: "대기" },
  { status: "TRANSCRIBING", label: "전사 중" },
  { status: "TRANSCRIBED", label: "전사 완료" },
  { status: "PROCESSING", label: "정리 중" },
  { status: "DONE", label: "완료" },
];

function PipelineProgress({ status }: { status: JobStatus }) {
  const isFailed = status === "FAILED";
  // DONE → push activeIdx past last stage so all nodes render as isDone
  const activeIdx = isFailed
    ? -1
    : status === "DONE"
    ? STAGES.length
    : STAGES.findIndex((s) => s.status === status);

  return (
    // Fragment alternating pattern: node → connector → node → ...
    // connectors are flex-1 so spacing is always perfectly even
    <div className="flex items-start overflow-x-auto">
      {STAGES.map(({ status: s, label }, i) => {
        const isDone = !isFailed && i < activeIdx;
        const isActive = !isFailed && i === activeIdx;
        // connector before this node = transition from stage i-1 → i
        // that transition is complete when stage i-1 is done, i.e. i <= activeIdx
        const connectorDone = !isFailed && i <= activeIdx;

        return (
          <Fragment key={s}>
            {i > 0 && (
              <div
                className={`flex-1 h-0.5 mt-[9px] min-w-4 ${
                  connectorDone ? "bg-brand-teal" : "bg-hairline"
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center ${
                  isDone
                    ? "bg-brand-teal border-brand-teal"
                    : isActive
                    ? "bg-brand-orange border-brand-orange animate-pulse"
                    : "bg-canvas border-hairline-strong"
                }`}
              >
                {isDone && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span
                className={`text-caption whitespace-nowrap ${
                  isDone
                    ? "text-brand-teal"
                    : isActive
                    ? "text-brand-orange font-medium"
                    : "text-stone"
                }`}
              >
                {label}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

export default function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const j = await getJob(id);
        if (!alive) return;
        setJob(j);
        if (!TERMINAL.has(j.status)) {
          setTimeout(load, 5000);
        }
      } catch (e) {
        if (alive) setError(String(e));
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [id, retryKey]);

  async function onRetry() {
    try {
      await retryJob(id);
      setRetryKey((k) => k + 1);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      <Link href="/" className="inline-flex items-center gap-1 text-body-sm text-slate hover:text-ink transition-colors mb-6">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11L5 7l4-4" />
        </svg>
        목록으로
      </Link>

      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-card-tint-rose border border-hairline text-body-sm text-semantic-error">
          {error}
        </div>
      )}

      {!job && !error && (
        <p className="text-body-sm text-slate">불러오는 중…</p>
      )}

      {job && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="min-w-0">
              <h1 className="text-display-md font-semibold text-ink break-words">
                {job.title || <span className="text-stone">(제목 없음)</span>}
              </h1>
              <p className="text-body-sm text-slate mt-1">
                {job.doc_type} · {job.id}
              </p>
            </div>
            <StatusBadge status={job.status} />
          </div>

          {/* Pipeline progress */}
          <div className="mb-8 p-5 bg-surface rounded-lg border border-hairline">
            <PipelineProgress status={job.status} />
            {job.status === "FAILED" && (
              <p className="text-caption text-semantic-error text-center -mt-2">처리 실패</p>
            )}
          </div>

          {/* Notion CTA */}
          {job.notion_url && (
            <a
              href={job.notion_url}
              target="_blank"
              rel="noreferrer"
              className="btn-primary inline-flex mb-6 gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 2h7.5L13 5v9H3V2zm7 0v3h3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              </svg>
              Notion에서 열기
            </a>
          )}

          {/* Metadata */}
          <div className="border border-hairline rounded-lg overflow-hidden mb-6">
            {[
              { label: "생성", value: new Date(job.created_at + "Z").toLocaleString("ko-KR") },
              { label: "갱신", value: new Date(job.updated_at + "Z").toLocaleString("ko-KR") },
              { label: "Notion 대상", value: `${job.notion_target?.kind} / ${job.notion_target?.id}` },
              { label: "오디오", value: job.audio_path, mono: true },
              ...(job.transcript_path
                ? [{ label: "트랜스크립트", value: job.transcript_path, mono: true }]
                : []),
            ].map(({ label, value, mono }, i) => (
              <div
                key={label}
                className={`grid grid-cols-[120px_1fr] gap-4 px-4 py-3 text-body-sm ${
                  i > 0 ? "border-t border-hairline" : ""
                }`}
              >
                <span className="text-slate">{label}</span>
                <span className={`text-charcoal break-all ${mono ? "font-mono text-xs" : ""}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* Error */}
          {job.error && (
            <div className="border border-semantic-error/20 rounded-lg bg-card-tint-rose p-5">
              <h2 className="text-heading-sm text-semantic-error mb-3">실패 사유</h2>
              <pre className="text-body-sm whitespace-pre-wrap text-charcoal font-mono leading-relaxed">
                {job.error}
              </pre>
              <button onClick={onRetry} className="btn-secondary mt-4">
                재시도
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
