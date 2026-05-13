"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { getJob, retryJob, type JobDetail } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";

const TERMINAL = new Set(["DONE", "FAILED"]);

export default function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, [id]);

  async function onRetry() {
    try {
      await retryJob(id);
      setJob((prev) => (prev ? { ...prev, status: "QUEUED", error: null } : prev));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section className="bg-canvas">
      <div className="max-w-text mx-auto px-8 py-section">
        <Link href="/" className="link text-caption mb-6 inline-block">
          ← 목록으로
        </Link>

        {error && (
          <div className="card-utility border-status-failed/30 mb-6">
            <p className="text-body text-status-failed">{error}</p>
          </div>
        )}

        {!job && !error && (
          <p className="text-body text-ink-48">불러오는 중…</p>
        )}

        {job && (
          <>
            <header className="flex items-start justify-between mb-8">
              <div>
                <h1 className="text-display-md mb-3">
                  {job.title || "(제목 없음)"}
                </h1>
                <p className="text-caption text-ink-48">
                  {job.doc_type} · {job.id}
                </p>
              </div>
              <StatusBadge status={job.status} />
            </header>

            <dl className="grid grid-cols-2 gap-y-4 text-body mb-12">
              <dt className="text-ink-48 text-caption">생성</dt>
              <dd>{new Date(job.created_at + "Z").toLocaleString("ko-KR")}</dd>
              <dt className="text-ink-48 text-caption">갱신</dt>
              <dd>{new Date(job.updated_at + "Z").toLocaleString("ko-KR")}</dd>
              <dt className="text-ink-48 text-caption">Notion 대상</dt>
              <dd>
                {job.notion_target?.kind} / {job.notion_target?.id}
              </dd>
              <dt className="text-ink-48 text-caption">오디오</dt>
              <dd className="font-mono text-caption">{job.audio_path}</dd>
              {job.transcript_path && (
                <>
                  <dt className="text-ink-48 text-caption">트랜스크립트</dt>
                  <dd className="font-mono text-caption">
                    {job.transcript_path}
                  </dd>
                </>
              )}
            </dl>

            {job.notion_url && (
              <a
                href={job.notion_url}
                target="_blank"
                rel="noreferrer"
                className="btn-primary mb-6"
              >
                Notion 에서 열기
              </a>
            )}

            {job.error && (
              <div className="card-utility border-status-failed/30">
                <h2 className="text-tagline mb-3 text-status-failed">실패 사유</h2>
                <pre className="text-caption whitespace-pre-wrap text-ink-80">
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
    </section>
  );
}
