/** Typed client for the backend. Every call goes through `send` so errors read the same everywhere. */
import type { Board, Databoard, Overview, PdfImport, Period, PublishedImport, Summary, Timeline, Unit, VersionInfo } from "./types";
import type { PeriodParams } from "./period";

const BASE = (import.meta.env.VITE_API_BASE ?? "") + "/api/v1";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
  let body: { data?: T; error?: string; details?: unknown } | null = null;
  try { body = await res.json(); } catch { /* no body */ }
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `${res.status} ${res.statusText}`, body?.details);
  return body!.data as T;
}
const request = <T,>(path: string, init?: RequestInit) => send<T>(path, { headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, ...init });
/** Multipart: the browser sets the content type (with its boundary) itself. */
const upload = <T,>(path: string, form: FormData) => send<T>(path, { method: "POST", body: form });

const q = (params: Record<string, string | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
  const str = s.toString();
  return str ? `?${str}` : "";
};

export type VersionMode = "LATEST_APPROVED" | "DRAFT";

/** Who is signed in and what the portal lets them do here (GET /api/v1/me). */
export interface Me {
  user: { name: string; email: string };
  roles: string[];
  permissions: string[];
  sso: { enabled: boolean; displayName: string; portalUrl: string };
}

export const api = {
  health: () => request<{ ok: boolean; mongo: string }>("/health"),
  me: () => request<Me>("/me"),
  /** Better Auth's sign-out lives outside /api/v1. */
  signOut: () => fetch((import.meta.env.VITE_API_BASE ?? "") + "/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
  units: () => request<Unit[]>("/units"),
  periods: () => request<Period[]>("/periods"),
  summary: (mode: VersionMode = "LATEST_APPROVED", period: PeriodParams = {}) => request<Summary>(`/finance/summary${q({ versionMode: mode, ...period })}`),
  board: (unit: string, mode: VersionMode = "LATEST_APPROVED", period: PeriodParams = {}) => request<Board>(`/finance/${unit}/board${q({ versionMode: mode, ...period })}`),
  overview: (unit: string, mode: VersionMode = "LATEST_APPROVED", period: PeriodParams = {}) => request<Overview>(`/finance/${unit}/overview${q({ versionMode: mode, ...period })}`),
  /** Month by month inside a range (or everything): one row per month that has an approved board. */
  timeline: (period: PeriodParams = {}, unit?: string) => request<Timeline>(`/finance/timeline${q({ from: period.from, to: period.to, unit })}`),
  saveBoard: (unit: string, board: Board, publish: boolean) =>
    request<Board>(`/finance/${unit}/board${q({ publish: publish ? "true" : undefined })}`, { method: "PUT", body: JSON.stringify(board) }),
  versions: (unit: string) => request<VersionInfo[]>(`/finance/${unit}/versions`),
  approve: (unit: string, versionId: string) => request<VersionInfo>(`/finance/${unit}/versions/${versionId}/approve`, { method: "POST" }),
  /** Read a monthly operating-report PDF into an import batch for preview; nothing is written to a version yet. */
  uploadReportPdf: (unit: string, file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("unit", unit);
    return upload<PdfImport>("/imports/pdf", form);
  },
  /** Turn a validated import into a draft version, or straight into the approved one. */
  publishImport: (id: string, approve: boolean) => request<PublishedImport>(`/imports/${id}/publish${q({ approve: approve ? "true" : undefined })}`, { method: "POST" }),
  /** The newest weekly board as at the selected period; its finance figures follow the same period. */
  databoard: (period: PeriodParams = {}) => request<Databoard>(`/databoard/latest${q(period)}`),
  saveDataboard: (weekEnding: string, doc: unknown, publish: boolean) =>
    request<Databoard>(`/databoard/${encodeURIComponent(weekEnding)}${q({ publish: publish ? "true" : undefined })}`, { method: "PUT", body: JSON.stringify(doc) }),
};
