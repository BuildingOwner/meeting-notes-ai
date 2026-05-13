// API base URL.
// - Docker 빌드: "/api" (Caddy 38443 에서 /api/* → api 컨테이너로 strip+proxy)
// - 로컬 next dev: http://localhost:38080 (api 컨테이너 host 노출 포트)
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:38080";

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
  const res = await fetch(`${API_BASE}/jobs`, { cache: "no-store" });
  if (!res.ok) throw new Error(`listJobs failed: ${res.status}`);
  return res.json();
}

export async function getJob(id: string): Promise<JobDetail> {
  const res = await fetch(`${API_BASE}/jobs/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`getJob ${id} failed: ${res.status}`);
  return res.json();
}

export async function createJob(form: FormData): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/jobs`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createJob ${res.status}: ${text}`);
  }
  return res.json();
}

export async function retryJob(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/jobs/${id}/retry`, { method: "POST" });
  if (!res.ok) throw new Error(`retryJob ${id} failed: ${res.status}`);
}

export async function deleteJob(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/jobs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`deleteJob ${id} failed: ${res.status}`);
}
