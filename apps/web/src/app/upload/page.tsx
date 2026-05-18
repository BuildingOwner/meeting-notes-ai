"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createJob, getConfig } from "@/lib/api";
import { AudioRecorder } from "@/components/AudioRecorder";

const DOC_TYPES = [
  { value: "meeting", label: "회의록", desc: "팀 회의, 1:1" },
  { value: "seminar", label: "세미나", desc: "발표, 웨비나" },
  { value: "lecture", label: "강의", desc: "수업, 교육" },
] as const;

type DocType = (typeof DOC_TYPES)[number]["value"];
type InputMode = "file" | "record";

function StepLabel({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-5 h-5 rounded-full bg-primary text-on-primary text-xs font-semibold flex items-center justify-center shrink-0">
        {n}
      </span>
      <span className="text-body-sm font-semibold text-ink">{label}</span>
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [docType, setDocType] = useState<DocType>("meeting");
  const [notionId, setNotionId] = useState("");
  const [notionKind, setNotionKind] = useState<"database" | "page">("database");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    getConfig()
      .then((cfg) => {
        if (cfg.notion_default_target) {
          setNotionId(cfg.notion_default_target.id);
          setNotionKind(cfg.notion_default_target.kind);
        }
      })
      .catch((e) => console.warn("getConfig failed, using defaults:", e));
  }, []);

  function switchMode(mode: InputMode) {
    if (mode === inputMode) return;
    setInputMode(mode);
    setFile(null);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError(
        inputMode === "record"
          ? "'이 녹음 사용' 버튼을 눌러 녹음을 확정해 주세요."
          : "오디오 파일을 선택해주세요."
      );
      return;
    }
    if (!notionId.trim()) {
      setError("Notion 페이지 또는 DB ID를 입력해주세요.");
      return;
    }

    const form = new FormData();
    form.set("audio_file", file);
    form.set("doc_type", docType);
    form.set("notion_target", JSON.stringify({ kind: notionKind, id: notionId.trim() }));
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
    <div className="flex items-center justify-center min-h-[calc(100vh-3rem)] md:min-h-screen px-4 py-8 md:px-8">
      <div className="w-full max-w-3xl">
        {/* Page header */}
        <div className="mb-5 px-1">
          <h1 className="text-heading-4 font-semibold text-ink">새 업로드</h1>
          <p className="text-body-sm text-slate mt-1">
            음성 파일을 전사하여 Notion에 자동 정리합니다.
          </p>
        </div>

        {/* Two-tone card */}
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-hairline shadow-card overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_260px]"
        >
          {/* ── Left panel: Steps 1 & 2 ── */}
          <div className="p-7 bg-canvas space-y-6 border-b border-hairline lg:border-b-0 lg:border-r">
            {/* Step 1 */}
            <div>
              <StepLabel n={1} label="문서 유형" />
              <div className="flex gap-2 flex-wrap">
                {DOC_TYPES.map((t) => (
                  <button
                    type="button"
                    key={t.value}
                    onClick={() => setDocType(t.value)}
                    className={`flex flex-col items-start px-4 py-2.5 rounded-lg border text-left transition-colors ${
                      docType === t.value
                        ? "border-primary bg-card-tint-lavender"
                        : "border-hairline bg-canvas hover:bg-surface hover:border-hairline-strong"
                    }`}
                  >
                    <span className={`text-body-sm font-medium ${docType === t.value ? "text-primary" : "text-ink"}`}>
                      {t.label}
                    </span>
                    <span className="text-caption text-slate mt-0.5">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2 */}
            <div>
              <StepLabel n={2} label="오디오 소스" />
              <div className="flex gap-1 mb-3 p-1 bg-surface rounded-lg border border-hairline w-fit">
                {(
                  [
                    { mode: "file", label: "파일 업로드" },
                    { mode: "record", label: "직접 녹음" },
                  ] as { mode: InputMode; label: string }[]
                ).map(({ mode, label }) => (
                  <button
                    type="button"
                    key={mode}
                    onClick={() => switchMode(mode)}
                    className={`px-3.5 py-1.5 rounded-md text-button-md transition-colors ${
                      inputMode === mode
                        ? "bg-canvas shadow-subtle text-ink font-medium"
                        : "text-slate hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {inputMode === "file" ? (
                <label
                  htmlFor="audio"
                  className={`flex flex-col items-center justify-center w-full h-48 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                    file
                      ? "border-brand-teal bg-card-tint-mint"
                      : isDragging
                      ? "border-primary bg-card-tint-lavender"
                      : "border-hairline-strong bg-surface hover:border-primary hover:bg-card-tint-lavender"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const dropped = e.dataTransfer.files[0];
                    if (dropped) { setFile(dropped); setError(null); }
                  }}
                >
                  {file ? (
                    <>
                      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-brand-teal mb-3">
                        <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M9 14l4 4 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-body-sm text-brand-teal font-medium">{file.name}</span>
                      <span className="text-caption text-slate mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                    </>
                  ) : isDragging ? (
                    <>
                      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-primary mb-3">
                        <path d="M14 18V10m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M6 19v2a4 4 0 004 4h8a4 4 0 004-4v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      <span className="text-body-sm text-primary font-medium">여기에 놓으세요</span>
                    </>
                  ) : (
                    <>
                      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-stone mb-3">
                        <path d="M14 18V10m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M6 19v2a4 4 0 004 4h8a4 4 0 004-4v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      <span className="text-body-sm text-slate">클릭하거나 파일을 드래그</span>
                      <span className="text-caption text-stone mt-1.5">mp3 · wav · m4a · webm · flac</span>
                    </>
                  )}
                  <input
                    id="audio"
                    type="file"
                    accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.flac"
                    className="sr-only"
                    onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
                  />
                </label>
              ) : (
                <div className="border border-hairline rounded-xl p-5 bg-surface">
                  <AudioRecorder
                    onRecorded={(f) => { setFile(f); setError(null); }}
                    onReset={() => setFile(null)}
                  />
                  {file && (
                    <p className="text-body-sm text-brand-teal font-medium mt-3">
                      녹음 확정: {file.name}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Right panel: Steps 3 & 4 + Submit ── */}
          <div className="p-7 bg-surface flex flex-col gap-5">
            {/* Step 3 */}
            <div>
              <StepLabel n={3} label="Notion 대상" />
              <div className="flex gap-1 mb-3 p-1 bg-canvas rounded-lg border border-hairline w-fit">
                {(["database", "page"] as const).map((k) => (
                  <button
                    type="button"
                    key={k}
                    onClick={() => setNotionKind(k)}
                    className={`px-3.5 py-1.5 rounded-md text-button-md transition-colors ${
                      notionKind === k
                        ? "bg-surface shadow-subtle text-ink font-medium"
                        : "text-slate hover:text-ink"
                    }`}
                  >
                    <span className="whitespace-nowrap">{k === "database" ? "데이터베이스" : "페이지"}</span>
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={notionId}
                onChange={(e) => setNotionId(e.target.value)}
                placeholder="32자리 ID 또는 URL segment"
                className="block w-full h-9 rounded-lg border border-hairline-strong px-3 text-body-sm bg-canvas text-ink focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </div>

            {/* Step 4 */}
            <div>
              <StepLabel n={4} label="제목 (선택)" />
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="비워두면 AI가 자동 생성"
                className="block w-full h-9 rounded-lg border border-hairline-strong px-3 text-body-sm bg-canvas text-ink focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="px-3 py-2.5 rounded-lg bg-card-tint-rose border border-semantic-error/20 text-body-sm text-semantic-error">
                {error}
              </div>
            )}

            {/* Actions — pushed to bottom */}
            <div className="mt-auto pt-2 space-y-2">
              <button type="submit" disabled={submitting} className="btn-primary w-full justify-center">
                {submitting ? "업로드 중…" : "업로드 시작"}
              </button>
              <button type="button" onClick={() => router.back()} className="btn-secondary w-full justify-center">
                취소
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
