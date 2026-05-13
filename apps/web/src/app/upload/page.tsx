"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createJob } from "@/lib/api";

const DOC_TYPES = [
  { value: "meeting", label: "회의록" },
  { value: "seminar", label: "세미나" },
  { value: "lecture", label: "강의" },
] as const;

type DocType = (typeof DOC_TYPES)[number]["value"];

export default function UploadPage() {
  const router = useRouter();
  const [docType, setDocType] = useState<DocType>("meeting");
  const [notionId, setNotionId] = useState("");
  const [notionKind, setNotionKind] = useState<"database" | "page">("database");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("오디오 파일을 선택해주세요.");
      return;
    }
    if (!notionId.trim()) {
      setError("Notion 페이지 또는 DB ID 를 입력해주세요.");
      return;
    }

    const form = new FormData();
    form.set("audio_file", file);
    form.set("doc_type", docType);
    form.set(
      "notion_target",
      JSON.stringify({ kind: notionKind, id: notionId.trim() })
    );
    if (title.trim()) form.set("title", title.trim());

    setSubmitting(true);
    try {
      const { id } = await createJob(form);
      router.push(`/jobs/${id}`);
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-parchment">
      <div className="max-w-text mx-auto px-8 py-section">
        <header className="mb-12">
          <h1 className="text-display-lg">음성 업로드</h1>
          <p className="text-body text-ink-80 mt-3">
            업로드한 음성은 자동으로 전사 후 Notion 에 정리됩니다.
          </p>
        </header>

        <form onSubmit={onSubmit} className="space-y-8">
          <div className="card-utility">
            <label className="block text-tagline mb-3">문서 유형</label>
            <div className="flex flex-wrap gap-2">
              {DOC_TYPES.map((t) => (
                <button
                  type="button"
                  key={t.value}
                  onClick={() => setDocType(t.value)}
                  className={`px-5 py-2 rounded-pill text-caption transition-transform ${
                    docType === t.value
                      ? "bg-primary text-canvas"
                      : "bg-canvas border border-hairline text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card-utility">
            <label htmlFor="audio" className="block text-tagline mb-3">
              오디오 파일
            </label>
            <input
              id="audio"
              type="file"
              accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.flac"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-body text-ink-80
                         file:mr-4 file:py-2 file:px-5 file:rounded-pill
                         file:border-0 file:bg-primary file:text-canvas
                         file:text-caption file:cursor-pointer"
            />
            {file && (
              <p className="mt-3 text-caption text-ink-48">
                {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
              </p>
            )}
          </div>

          <div className="card-utility">
            <label className="block text-tagline mb-3">Notion 대상</label>
            <div className="flex gap-2 mb-4">
              {(["database", "page"] as const).map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setNotionKind(k)}
                  className={`px-5 py-2 rounded-pill text-caption ${
                    notionKind === k
                      ? "bg-primary text-canvas"
                      : "bg-canvas border border-hairline text-ink"
                  }`}
                >
                  {k === "database" ? "데이터베이스" : "페이지"}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={notionId}
              onChange={(e) => setNotionId(e.target.value)}
              placeholder="32자리 ID 또는 Notion URL 의 마지막 segment"
              className="block w-full rounded-pill border border-hairline
                         px-5 py-3 text-body bg-canvas"
            />
          </div>

          <div className="card-utility">
            <label htmlFor="title" className="block text-tagline mb-3">
              제목 (선택)
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="비워두면 파일명으로 사용"
              className="block w-full rounded-pill border border-hairline
                         px-5 py-3 text-body bg-canvas"
            />
          </div>

          {error && <p className="text-body text-status-failed">{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? "업로드 중…" : "업로드"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-secondary"
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
