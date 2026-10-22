import type { HealthResponse, PredictResponse } from "./types";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return res.json();
}

export async function predictFile(file: File): Promise<PredictResponse> {
  const body = new FormData();
  body.append("file", file);

  const res = await fetch("/api/predict", { method: "POST", body });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const err = await res.json();
      if (typeof err.detail === "string") detail = err.detail;
    } catch {
      // Non-JSON error body (e.g. proxy error) keeps the generic message.
    }
    throw new Error(detail);
  }
  return res.json();
}
