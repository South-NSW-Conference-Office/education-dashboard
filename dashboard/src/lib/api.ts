/** Typed client for the backend. Every call goes through `request` so errors read the same everywhere. */
import type { Board, Databoard, Overview, Summary, Unit, VersionInfo } from "./types";

const BASE = (import.meta.env.VITE_API_BASE ?? "") + "/api/v1";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, ...init });
  let body: { data?: T; error?: string; details?: unknown } | null = null;
  try { body = await res.json(); } catch { /* no body */ }
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `${res.status} ${res.statusText}`, body?.details);
  return body!.data as T;
}

const q = (params: Record<string, string | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
  const str = s.toString();
  return str ? `?${str}` : "";
};

export type VersionMode = "LATEST_APPROVED" | "DRAFT";

export const api = {
  health: () => request<{ ok: boolean; mongo: string }>("/health"),
  units: () => request<Unit[]>("/units"),
  summary: (mode: VersionMode = "LATEST_APPROVED") => request<Summary>(`/finance/summary${q({ versionMode: mode })}`),
  board: (unit: string, mode: VersionMode = "LATEST_APPROVED", period?: string) => request<Board>(`/finance/${unit}/board${q({ versionMode: mode, period })}`),
  overview: (unit: string, mode: VersionMode = "LATEST_APPROVED", period?: string) => request<Overview>(`/finance/${unit}/overview${q({ versionMode: mode, period })}`),
  saveBoard: (unit: string, board: Board, publish: boolean) =>
    request<Board>(`/finance/${unit}/board${q({ publish: publish ? "true" : undefined })}`, { method: "PUT", body: JSON.stringify(board) }),
  versions: (unit: string) => request<VersionInfo[]>(`/finance/${unit}/versions`),
  approve: (unit: string, versionId: string) => request<VersionInfo>(`/finance/${unit}/versions/${versionId}/approve`, { method: "POST" }),
  databoard: () => request<Databoard>("/databoard/latest"),
  saveDataboard: (weekEnding: string, doc: unknown, publish: boolean) =>
    request<Databoard>(`/databoard/${encodeURIComponent(weekEnding)}${q({ publish: publish ? "true" : undefined })}`, { method: "PUT", body: JSON.stringify(doc) }),
};
