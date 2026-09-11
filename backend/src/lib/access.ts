/**
 * Authorization = the portal's verdict, asked for on demand.
 *
 * The portal (login-adventistbot) owns app entitlements and per-user role
 * grants. This client asks its HMAC-authenticated /internal/app-access endpoint
 * — the same central-authority pattern MorpheusTools uses (its
 * deploy/organization-workspaces.md documents the contract). The credential is
 * bound server-side to ONE app and ONE organization, so this app can never ask
 * about another app's grants. An unavailable authority fails closed.
 *
 * With AUTH_SSO_ENABLED off the guard is a pass-through and the app behaves as
 * it did before SSO existed (open local tool). With it on, every /api/v1 route
 * needs a session AND the named permission.
 */
import { createHmac } from "node:crypto";
import { auth } from "./auth";
import { enterpriseSso } from "./sso";
import { handle, HttpError } from "./http";

export interface AppAccess {
  organizationId: string;
  roles: string[];
  permissions: string[];
}

export interface Viewer {
  user: { id: string; email: string; name: string };
  access: AppAccess;
}

/** Permissions this app's API vocabulary is made of (mirrored in the portal manifest). */
export type Permission = "boards.read" | "boards.edit" | "boards.publish" | "imports.write";

function accessEnv() {
  const url = (process.env.APP_ACCESS_URL ?? "").trim();
  const clientId = (process.env.APP_ACCESS_CLIENT_ID ?? "").trim();
  const secret = (process.env.APP_ACCESS_SECRET ?? "").trim();
  if (!url || !clientId || !secret) {
    throw new HttpError(503, "Authorization service is not configured");
  }
  return { url, clientId, secret };
}

// A page load fires several queries at once; one verdict per email per few
// seconds is plenty fresh (revocation still lands within TTL_MS) without
// hammering the portal. Failures are never cached.
const TTL_MS = 10_000;
const cache = new Map<string, { at: number; access: AppAccess }>();

async function fetchAccess(email: string): Promise<AppAccess> {
  const cached = cache.get(email);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.access;

  const { url, clientId, secret } = accessEnv();
  const body = JSON.stringify({ email });
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret)
    .update(`${clientId}\n${timestamp}\n${body}`)
    .digest("hex");

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-access-client": clientId,
        "x-access-timestamp": timestamp,
        "x-access-signature": signature,
      },
      body,
    });
  } catch {
    // Outages must not resurrect stale permissions — fail closed.
    throw new HttpError(503, "Authorization service unavailable");
  }
  if (!res.ok) throw new HttpError(503, "Authorization service unavailable");

  const payload = (await res.json()) as {
    organizationId?: string;
    roles?: string[];
    permissions?: string[];
  };
  const access: AppAccess = {
    organizationId: String(payload.organizationId ?? ""),
    roles: Array.isArray(payload.roles) ? payload.roles.map(String) : [],
    permissions: Array.isArray(payload.permissions) ? payload.permissions.map(String) : [],
  };
  cache.set(email, { at: Date.now(), access });
  return access;
}

/** The signed-in user, or null. Never throws for "signed out". */
export async function currentSession(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) return null;
  return {
    id: String(session.user.id),
    email: String(session.user.email),
    name: String(session.user.name ?? session.user.email),
  };
}

/**
 * Session + portal permission, or the HttpError the route should answer with.
 * The one guard every /api/v1 route runs through (http.ts's `guarded`).
 */
export async function requireAccess(req: Request, permission: Permission): Promise<Viewer | null> {
  // SSO off = the app as it was before SSO existed: a local tool, no gate.
  if (!enterpriseSso.enabled) return null;

  const user = await currentSession(req);
  if (!user) throw new HttpError(401, "Sign in to use this dashboard");

  const access = await fetchAccess(user.email);
  if (!access.permissions.includes(permission)) {
    throw new HttpError(
      403,
      access.permissions.length
        ? `Your role does not allow this (${permission} required)`
        : "Your account has no access to the Education Dashboard — ask your organization admin in the portal",
    );
  }
  return { user, access };
}

/**
 * `handle` plus the access gate: the permission is checked before the route
 * body runs. Routes whose needed permission depends on the request (a PUT that
 * publishes when ?publish=true) pass a resolver instead of a literal.
 */
export function guarded<A extends [Request, ...unknown[]]>(
  permission: Permission | ((req: Request) => Permission),
  fn: (...args: A) => Promise<Response>,
) {
  return handle(async (...args: A) => {
    const req = args[0];
    await requireAccess(req, typeof permission === "function" ? permission(req) : permission);
    return fn(...args);
  });
}

/** boards.publish when the request asks to publish, boards.edit otherwise. */
export const editOrPublish = (req: Request): Permission =>
  new URL(req.url).searchParams.get("publish") === "true" ? "boards.publish" : "boards.edit";

/**
 * Imports: uploading and publishing a batch into a DRAFT version is
 * imports.write; `approve=true` mints an APPROVED version readers see, which is
 * the same act as publishing a board.
 */
export const importPerm = (req: Request): Permission =>
  new URL(req.url).searchParams.get("approve") === "true" ? "boards.publish" : "imports.write";

