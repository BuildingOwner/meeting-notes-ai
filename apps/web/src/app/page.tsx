"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listJobs, type JobSummary } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";

const DOC_TYPE_LABEL: Record<string, string> = {
  meeting: "회의록",
  seminar: "세미나",
  lecture: "강의",
};

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
    <section className="bg-canvas">
      <div className="max-w-content mx-auto px-8 py-section">
        <header className="flex items-end justify-between mb-12">
          <div>
            <h1 className="text-display-lg">잡 목록</h1>
            <p className="text-body text-ink-80 mt-3">
              업로드된 음성과 진행 상태입니다. 5초마다 갱신됩니다.
            </p>
          </div>
          <Link href="/upload" className="btn-primary">
            새 업로드
          </Link>
        </header>

        {error && (
          <div className="card-utility border-status-failed/30 mb-6">
            <p className="text-body text-status-failed">{error}</p>
          </div>
        )}

        {!jobs && !error && (
          <p className="text-body text-ink-48">불러오는 중…</p>
        )}

        {jobs && jobs.length === 0 && (
          <div className="card-utility text-center">
            <p className="text-lead text-ink-80">아직 잡이 없습니다.</p>
            <Link href="/upload" className="link mt-4 inline-block">
              첫 음성 업로드 →
            </Link>
          </div>
        )}

        {jobs && jobs.length > 0 && (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/jobs/${j.id}`}
                  className="card-utility block hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-caption text-ink-48">
                      {DOC_TYPE_LABEL[j.doc_type] ?? j.doc_type}
                    </span>
                    <StatusBadge status={j.status} />
                  </div>
                  <h3 className="text-body font-semibold mb-2 line-clamp-2">
                    {j.title || "(제목 없음)"}
                  </h3>
                  <p className="text-fine text-ink-48">
                    {new Date(j.created_at + "Z").toLocaleString("ko-KR")}
                  </p>
                  {j.notion_url && (
                    <p className="mt-3 text-caption">
                      <span className="text-primary">Notion →</span>
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
