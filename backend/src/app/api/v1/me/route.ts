/**
 * Who is signed in and what the portal lets them do here. The SPA drives its
 * whole auth state off this one call: 401 = show the login screen; roles and
 * permissions decide which editing affordances render (the API enforces them
 * again regardless).
 */
import { handle, HttpError, ok } from "@/lib/http";
import { currentSession, requireAccess } from "@/lib/access";
import { enterpriseSso } from "@/lib/sso";

export const GET = handle(async (req: Request) => {
  if (!enterpriseSso.enabled) {
    // SSO off: the app is an open local tool; report a guest with every permission.
    return ok({
      user: { name: "Guest", email: "" },
      roles: [],
      permissions: ["boards.read", "boards.edit", "boards.publish", "imports.write"],
      sso: { enabled: false, displayName: enterpriseSso.displayName, portalUrl: enterpriseSso.portalUrl },
    });
  }
  const user = await currentSession(req);
  if (!user) throw new HttpError(401, "Not signed in");
  // boards.read is held by every role; someone with no grant at all gets the 403.
  const viewer = await requireAccess(req, "boards.read");
  return ok({
    user: { name: user.name, email: user.email },
    roles: viewer?.access.roles ?? [],
    permissions: viewer?.access.permissions ?? [],
    sso: { enabled: true, displayName: enterpriseSso.displayName, portalUrl: enterpriseSso.portalUrl },
  });
});
