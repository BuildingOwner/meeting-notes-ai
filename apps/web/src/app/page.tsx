"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listJobs, type JobSummary, type JobStatus } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";

const DOC_TYPE_LABEL: Record<string, string> = {
  meeting: "회의록",
  seminar: "세미나",
  lecture: "강의",
};

const PIPELINE: { status: JobStatus; label: string }[] = [
  { status: "QUEUED", label: "대기" },
  { status: "TRANSCRIBING", label: "전사 중" },
  { status: "TRANSCRIBED", label: "전사 완료" },
  { status: "PROCESSING", label: "정리 중" },
  { status: "DONE", label: "완료" },
];

function PipelineSummary({ jobs }: { jobs: JobSummary[] }) {
  const counts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});
  const failed = counts["FAILED"] ?? 0;

  return (
    <div className="mb-5 rounded-xl border border-hairline bg-surface overflow-hidden">
      <div className="grid grid-cols-5 divide-x divide-hairline">
        {PIPELINE.map(({ status, label }) => {
          const count = counts[status] ?? 0;
          const active = count > 0;
          return (
            <div
              key={status}
              className={`flex flex-col items-center py-3 gap-0.5 transition-colors ${
                active ? "bg-canvas" : ""
              }`}
            >
              <span
                className={`text-base font-semibold tabular-nums leading-none ${
                  active ? "text-primary" : "text-stone"
                }`}
              >
                {count}
              </span>
              <span className="text-[10px] text-slate text-center leading-tight px-1">
                {label}
              </span>
            </div>
          );
        })}
      </div>
      {failed > 0 && (
        <div className="border-t border-hairline px-4 py-2 bg-card-tint-rose flex items-center justify-center gap-1.5 text-body-sm text-semantic-error">
          <span className="font-semibold">{failed}</span>
          <span>건 실패</span>
        </div>
      )}
    </div>
  );
}

export default function JobsListPage() {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      listJobs()
        .then((j) => alive && setJobs(j))
        .catch((e) => alive && setError(String(e)));
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 md:px-8 md:py-8">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-heading-sm font-semibold text-ink">Jobs</h1>
          <p className="text-body-sm text-slate mt-0.5">5초마다 자동 갱신</p>
        </div>
      </header>

      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-card-tint-rose border border-hairline text-body-sm text-semantic-error">
          {error}
        </div>
      )}

      {!jobs && !error && (
        <p className="text-body-sm text-slate">불러오는 중…</p>
      )}

      {jobs && jobs.length === 0 && (
        <div className="text-center py-24">
          <p className="text-body text-slate mb-4">아직 업로드된 음성이 없습니다.</p>
          <Link href="/upload" className="btn-primary inline-flex">
            첫 음성 업로드
          </Link>
        </div>
      )}

      {jobs && jobs.length > 0 && (
        <>
          <PipelineSummary jobs={jobs} />
          <div className="border border-hairline rounded-lg overflow-hidden">
            {/* 헤더: 모바일 2컬럼 / 데스크톱 4컬럼 */}
            <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_72px_96px_130px] px-4 py-2 bg-surface border-b border-hairline">
              <span className="text-caption text-stone">제목</span>
              <span className="hidden md:block text-caption text-stone">유형</span>
              <span className="text-caption text-stone text-right md:text-left">상태</span>
              <span className="hidden md:block text-caption text-stone">생성일</span>
            </div>
            <div className="divide-y divide-hairline">
              {jobs.map((j) => (
                <Link
                  key={j.id}
                  href={`/jobs/${j.id}`}
                  className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_72px_96px_130px] px-4 py-3 hover:bg-surface transition-colors items-center"
                >
                  <span className="text-body-sm text-ink font-medium pr-6 flex items-center gap-2 min-w-0">
                    <span className="truncate">
                      {j.title || <span className="text-stone">(제목 없음)</span>}
                    </span>
                    {j.notion_url && (
                      <span className="hidden sm:inline text-caption text-link-blue shrink-0">Notion</span>
                    )}
                  </span>
                  <span className="hidden md:block text-caption text-slate">
                    {DOC_TYPE_LABEL[j.doc_type] ?? j.doc_type}
                  </span>
                  <span className="flex justify-end md:justify-start">
                    <StatusBadge status={j.status} />
                  </span>
                  <span className="hidden md:block text-body-sm text-stone">
                    {new Date(j.created_at + "Z").toLocaleDateString("ko-KR")}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
