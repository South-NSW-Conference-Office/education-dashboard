/**
 * Enterprise SSO against login-adventistbot — the conference portal's IdP.
 * Same generic-oauth consumer pattern the other portal apps use; Kolaboreyt's
 * backend/src/lib/sso.ts is the closest sibling.
 *
 * Additive by construction: with AUTH_SSO_ENABLED off nothing is registered and
 * every API guard passes through (the app behaves as before SSO existed). With
 * it on, sign-in happens only through the portal and every /api/v1 route is
 * gated on a session plus the portal's app-access verdict (lib/access.ts).
 */
import { genericOAuth } from "better-auth/plugins/generic-oauth";

export function boolEnv(name: string): boolean {
  return ["1", "true", "yes", "on"].includes(String(process.env[name] ?? "").toLowerCase());
}

function requiredEnv(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required when AUTH_SSO_ENABLED is on.`);
  return value;
}

export const enterpriseSso = {
  enabled: boolEnv("AUTH_SSO_ENABLED"),
  // "enterprise-sso" is the fleet-wide convention: the IdP seeds every app's
  // redirect URI as <origin>/api/auth/oauth2/callback/enterprise-sso, so a
  // different id here means a callback the IdP will refuse.
  providerId: (process.env.AUTH_SSO_PROVIDER_ID ?? "").trim() || "enterprise-sso",
  displayName: (process.env.AUTH_SSO_DISPLAY_NAME ?? "").trim() || "Adventist Portal",
  /** The portal's browser-facing origin — the "Portal" link in the sidebar and the /apps launcher. */
  portalUrl: (process.env.PORTAL_URL ?? "").trim() || "https://portal.adventist.bot",
};

/**
 * The one origin the browser sees. The Vite dev server (and the production
 * static host) proxies /api to this backend, so the SPA, the OAuth callback and
 * the probe all share it — same-origin cookies, no CORS.
 */
export const appOrigin =
  (process.env.BETTER_AUTH_URL ?? "").trim() || "http://localhost:5173";

export function enterpriseSsoPlugin() {
  if (!enterpriseSso.enabled) return null;
  return genericOAuth({
    config: [
      {
        providerId: enterpriseSso.providerId,
        clientId: requiredEnv("AUTH_SSO_CLIENT_ID"),
        clientSecret: requiredEnv("AUTH_SSO_CLIENT_SECRET"),
        discoveryUrl: requiredEnv("AUTH_SSO_DISCOVERY_URL"),
        scopes: ["openid", "email", "profile"],
        pkce: true,
        overrideUserInfo: true,
        // The IdP asserts email_verified: false for every account (it never
        // required confirmation). The IdP owns these identities; its word on
        // the address is the verification.
        mapProfileToUser: () => ({ emailVerified: true }),
      },
    ],
  });
}
