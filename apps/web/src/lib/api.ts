// API base URL.
// - Docker 빌드: "/api" (Caddy 38443 에서 /api/* → api 컨테이너로 strip+proxy)
// - 로컬 next dev: http://localhost:38080 (api 컨테이너 host 노출 포트)
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:38080";

const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB — 서버 CHUNK_SIZE와 동일

// ngrok 무료 플랜 인터셉트 페이지 우회 헤더 (다른 환경에서는 무시됨)
function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: { "ngrok-skip-browser-warning": "true", ...init?.headers },
  });
}

export type JobStatus =
  | "QUEUED"
  | "TRANSCRIBING"
  | "TRANSCRIBED"
  | "PROCESSING"
  | "DONE"
  | "FAILED";

export type JobSummary = {
  id: string;
  doc_type: "meeting" | "seminar" | "lecture";
  title: string | null;
  status: JobStatus;
  notion_url: string | null;
  created_at: string;
  updated_at: string;
};

export type JobDetail = JobSummary & {
  audio_path: string;
  transcript_path: string | null;
  error: string | null;
  notion_target: { kind: "page" | "database"; id: string };
  meta: Record<string, unknown>;
  expires_at: string;
  triggered_at: string | null;
};

export async function listJobs(): Promise<JobSummary[]> {
  const res = await apiFetch(`${API_BASE}/jobs`, { cache: "no-store" });
  if (!res.ok) throw new Error(`listJobs failed: ${res.status}`);
  return res.json();
}

export async function getJob(id: string): Promise<JobDetail> {
  const res = await apiFetch(`${API_BASE}/jobs/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`getJob ${id} failed: ${res.status}`);
  return res.json();
}

export async function createJob(form: FormData): Promise<{ id: string }> {
  const res = await apiFetch(`${API_BASE}/jobs`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createJob ${res.status}: ${text}`);
  }
  return res.json();
}

export async function createJobChunked(
  form: FormData,
  onProgress?: (current: number, total: number) => void,
): Promise<{ id: string }> {
  const file = form.get("audio_file") as File;
  const docType = form.get("doc_type") as string;
  const notionTarget = form.get("notion_target") as string;
  const title = form.get("title") as string | null;

  const sessionRes = await apiFetch(`${API_BASE}/uploads`, { method: "POST" });
  if (!sessionRes.ok) throw new Error(`upload session failed: ${sessionRes.status}`);
  const { upload_id } = await sessionRes.json();

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  for (let i = 0; i < totalChunks; i++) {
    const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const res = await apiFetch(`${API_BASE}/uploads/${upload_id}/chunks/${i}`, {
      method: "PUT",
      body: chunk,
      headers: { "Content-Type": "application/octet-stream" },
    });
    if (!res.ok) throw new Error(`chunk ${i + 1}/${totalChunks} 업로드 실패: ${res.status}`);
    onProgress?.(i + 1, totalChunks);
  }

  const finalForm = new FormData();
  finalForm.set("doc_type", docType);
  finalForm.set("notion_target", notionTarget);
  finalForm.set("filename", file.name);
  if (title) finalForm.set("title", title);

  const res = await apiFetch(`${API_BASE}/uploads/${upload_id}/finalize`, {
    method: "POST",
    body: finalForm,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`finalize ${res.status}: ${text}`);
  }
  return res.json();
}

export async function retryJob(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/jobs/${id}/retry`, { method: "POST" });
  if (!res.ok) throw new Error(`retryJob ${id} failed: ${res.status}`);
}

export async function deleteJob(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/jobs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`deleteJob ${id} failed: ${res.status}`);
}

export type AppConfig = {
  notion_default_target: { id: string; kind: "database" | "page" } | null;
};

export async function getConfig(): Promise<AppConfig> {
  const res = await apiFetch(`${API_BASE}/config`, { cache: "no-store" });
  if (!res.ok) throw new Error(`getConfig failed: ${res.status}`);
  return res.json();
}
