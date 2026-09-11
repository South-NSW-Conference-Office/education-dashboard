/**
 * Better Auth server for this app. SSO-only: no email/password surface — the
 * one way in is the portal IdP (lib/sso.ts), and the generic-oauth callback
 * creates the local shadow user on first arrival. Access is NOT granted by
 * having a session: every /api/v1 route also asks the portal's app-access
 * authority (lib/access.ts), so a signed-in user with no grant still gets 403.
 */
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { MongoClient } from "mongodb";
import { appOrigin, enterpriseSsoPlugin } from "./sso";

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/snsw_dashboard";

// One driver client per process (Next dev reloads modules), separate from the
// Mongoose connection in db.ts — Better Auth's adapter wants a raw Db.
const g = globalThis as unknown as { __snswAuthMongo?: MongoClient };
const client = g.__snswAuthMongo ?? (g.__snswAuthMongo = new MongoClient(uri));

export const auth = betterAuth({
  database: mongodbAdapter(client.db()),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: appOrigin,
  basePath: "/api/auth",
  trustedOrigins: [appOrigin],

  // The portal IdP — null (no plugin) when AUTH_SSO_ENABLED is off.
  plugins: [enterpriseSsoPlugin()].filter((p) => p !== null),

  // Where a failed SSO authorization lands — most commonly the silent probe's
  // prompt=none answered error=login_required because nobody is signed in at
  // the portal. The generic-oauth callback bails on that error before any
  // per-request errorCallbackURL applies, so this instance-level URL is the
  // only one that does.
  onAPIError: { errorURL: `${appOrigin}/login` },

  advanced: {
    // Cookies are host-scoped, never port-scoped, and the portal IdP also
    // answers on "localhost" in local dev — on the default prefix this app and
    // the IdP would fight over one better-auth.session_token (and the OAuth
    // state cookies), which the SSO handshake cannot survive.
    cookiePrefix: "snsweducation",
  },
});
