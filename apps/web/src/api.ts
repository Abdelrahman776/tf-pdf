export type InputMode = "scanned_pdf" | "image" | "handwriting";

export interface UploadResponse {
  file_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
}

export interface PageBlock {
  id: string;
  kind: string;
  text: string;
  bbox: number[];
  style: Record<string, unknown>;
}

export interface PageData {
  page_number: number;
  width: number;
  height: number;
  blocks: PageBlock[];
}

export interface JobResponse {
  id: string;
  file_id: string;
  mode: InputMode;
  status: string;
  progress: number;
  message: string;
  result_file: string | null;
  pages: PageData[];
}

export interface JobEvent {
  at: string;
  status: string;
  message: string;
}

export interface AdminJob {
  id: string;
  file_id: string;
  mode: string;
  status: string;
  progress: number;
  message: string;
  result_file: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProvidersStatus {
  order: string[];
  configured: Record<string, boolean>;
  active_admin_guard: boolean;
}

export interface LayoutArtifactImageBlock {
  id: string;
  kind: string;
  text: string;
  bbox: number[];
  style: Record<string, unknown>;
}

export interface LayoutArtifactPage {
  page_number: number;
  render_image_url?: string;
  layout: Record<string, unknown>;
  text_blocks: PageBlock[];
  image_blocks: LayoutArtifactImageBlock[];
  composed_page: PageData;
}

export interface LayoutArtifact {
  job_id: string;
  source_file: string;
  language: string;
  prompt_file_spec: string;
  pages: LayoutArtifactPage[];
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN ?? "";

function adminHeaders(): HeadersInit {
  if (!ADMIN_TOKEN) return {};
  return { "x-admin-token": ADMIN_TOKEN };
}

export async function getHealth(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/v1/health`);
  if (!response.ok) {
    throw new Error("API health check failed");
  }
  return response.json();
}

export async function getProvidersStatus(): Promise<ProvidersStatus> {
  const response = await fetch(`${API_BASE}/v1/providers/status`);
  if (!response.ok) {
    throw new Error("Providers status fetch failed");
  }
  return response.json();
}

export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/v1/files/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Upload failed");
  }

  return response.json();
}

export async function createJob(payload: {
  file_id: string;
  mode: InputMode;
  preserve_layout: boolean;
  language: string;
  user_prompt?: string;
}): Promise<JobResponse> {
  const response = await fetch(`${API_BASE}/v1/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to create job");
  }

  return response.json();
}

export async function getJob(jobId: string): Promise<JobResponse> {
  const response = await fetch(`${API_BASE}/v1/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error("Job fetch failed");
  }
  return response.json();
}

export async function patchPage(
  jobId: string,
  pageNumber: number,
  instruction: string,
): Promise<JobResponse> {
  const response = await fetch(
    `${API_BASE}/v1/jobs/${jobId}/pages/${pageNumber}/patch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }),
    },
  );

  if (!response.ok) {
    throw new Error("Patch failed");
  }

  return response.json();
}

export async function getJobEvents(jobId: string): Promise<JobEvent[]> {
  const response = await fetch(`${API_BASE}/v1/jobs/${jobId}/events`);
  if (!response.ok) {
    throw new Error("Job events fetch failed");
  }
  return response.json();
}

export async function getLayoutArtifact(
  jobId: string,
): Promise<LayoutArtifact> {
  const response = await fetch(`${API_BASE}/v1/jobs/${jobId}/layout-artifact`);
  if (!response.ok) {
    throw new Error("Layout artifact fetch failed");
  }
  return response.json();
}

export async function adminListJobs(limit = 50): Promise<AdminJob[]> {
  const response = await fetch(`${API_BASE}/v1/admin/jobs?limit=${limit}`, {
    headers: adminHeaders(),
  });
  if (!response.ok) {
    throw new Error("Admin jobs fetch failed");
  }
  return response.json();
}

export async function adminGetJobEvents(
  jobId: string,
  limit = 200,
): Promise<JobEvent[]> {
  const response = await fetch(
    `${API_BASE}/v1/admin/jobs/${jobId}/events?limit=${limit}`,
    {
      headers: adminHeaders(),
    },
  );
  if (!response.ok) {
    throw new Error("Admin job events fetch failed");
  }
  return response.json();
}

export function resultUrl(jobId: string): string {
  return `${API_BASE}/v1/jobs/${jobId}/result`;
}

export function uploadedFileContentUrl(fileId: string): string {
  return `${API_BASE}/v1/files/${fileId}/content`;
}

export function resultPageImageUrl(jobId: string, pageNumber: number): string {
  return `${API_BASE}/v1/jobs/${jobId}/result/pages/${pageNumber}/image`;
}
