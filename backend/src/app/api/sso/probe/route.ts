/**
 * The portal → app handoff for enterprise SSO (Kolaboreyt's probe, ported to a
 * Next route handler).
 *
 * The portal launcher's Education Dashboard tile points here, on the same
 * browser origin that serves the OAuth callback (the SPA host proxies /api to
 * this backend), so the state/PKCE cookies this route sets are the ones the
 * callback reads back. A silent probe asks the IdP "is this person already
 * signed in?" with prompt=none: signed in means the code round-trips with no UI
 * and they land in the app without a login screen; not signed in means the IdP
 * answers error=login_required, which the callback turns into a redirect to
 * onAPIError.errorURL (lib/auth.ts) — the app's own /login page. Nobody who
 * types the app's URL directly ever comes through here.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { appOrigin, enterpriseSso } from "@/lib/sso";

/**
 * Breaks a redirect loop rather than caching a verdict: if a silent probe ever
 * completes without a session, the visitor lands on /login — but anything that
 * bounces them back here would retry forever. One 60s marker means the second
 * attempt falls through to /login.
 */
const PROBE_GUARD_COOKIE = "snsweducation.sso.probed";
const PROBE_GUARD_MAX_AGE = 60;

function hasProbeGuardCookie(req: Request): boolean {
  const header = req.headers.get("cookie") ?? "";
  return header.split(";").some((part) => part.trim().startsWith(`${PROBE_GUARD_COOKIE}=`));
}

// Only ever an in-app path — never an absolute/protocol-relative URL, which
// would send someone off this origin via an SSO redirect they didn't ask for.
function safeCallbackPath(raw: string | null): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

// GET /api/sso/probe?callbackUrl=/some/path[&silent=0]
//
// silent (default on): prompt=none — never shows anyone a login page.
// silent=0: an explicit "sign in with the portal" click; the IdP may show its
// own login, and the probe-guard cookie doesn't apply since a click is a real
// ask rather than a loop.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const callbackPath = safeCallbackPath(params.get("callbackUrl"));
  const silent = params.get("silent") !== "0";

  const toLogin = () => NextResponse.redirect(`${appOrigin}/login`, 302);

  if (!enterpriseSso.enabled) return toLogin();
  if (silent && hasProbeGuardCookie(req)) return toLogin();

  // The generic-oauth plugin is registered conditionally (lib/sso.ts), so this
  // method only exists on auth.api at runtime when SSO is enabled — guarded above.
  const signInWithOAuth2 = (auth.api as { signInWithOAuth2?: (args: unknown) => Promise<Response> }).signInWithOAuth2;
  if (!signInWithOAuth2) return toLogin();

  let authResponse: Response;
  try {
    authResponse = await signInWithOAuth2({
      body: { providerId: enterpriseSso.providerId, callbackURL: `${appOrigin}${callbackPath}` },
      headers: req.headers,
      asResponse: true,
    });
  } catch {
    return toLogin();
  }

  const payload = (await authResponse.json().catch(() => null)) as { url?: string } | null;
  if (!payload?.url) return toLogin();

  const authorizeUrl = new URL(payload.url);
  if (silent) authorizeUrl.searchParams.set("prompt", "none");

  const res = NextResponse.redirect(authorizeUrl.toString(), 302);
  // Set-Cookie carries the PKCE verifier and state — without it the callback
  // has nothing to verify the response against and the handshake fails.
  for (const cookie of authResponse.headers.getSetCookie()) {
    res.headers.append("Set-Cookie", cookie);
  }
  if (silent) {
    res.headers.append(
      "Set-Cookie",
      `${PROBE_GUARD_COOKIE}=1; Path=/; Max-Age=${PROBE_GUARD_MAX_AGE}; HttpOnly; SameSite=Lax`,
    );
  }
  return res;
}
