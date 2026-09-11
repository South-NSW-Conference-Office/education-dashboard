/**
 * Session + portal permissions for the whole app, from one GET /api/v1/me:
 * 401 = signed out (show the login screen), 403 = signed in but not granted the
 * app in the portal, otherwise ready with the viewer's roles and permissions.
 * `can()` only decides which affordances render — the API enforces regardless.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, type Me } from "@/lib/api";

export type AuthStatus = "loading" | "signedOut" | "noAccess" | "error" | "ready";

interface AuthState {
  status: AuthStatus;
  me: Me | null;
  /** The 403's message — why access was refused, in the portal's words. */
  refusal: string | null;
  can: (permission: string) => boolean;
  signOut: () => Promise<void>;
  retry: () => void;
}

const AuthCtx = createContext<AuthState>({
  status: "loading", me: null, refusal: null, can: () => false, signOut: async () => {}, retry: () => {},
});

export const useAuth = () => useContext(AuthCtx);
/** Sugar for components that only ask permission questions. */
export const useAccess = () => useAuth().can;

export function AuthProvider({ children }: { children: ReactNode }) {
  const q = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    retry: (count, err) => !(err instanceof ApiError && (err.status === 401 || err.status === 403)) && count < 2,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const value = useMemo<AuthState>(() => {
    const err = q.error instanceof ApiError ? q.error : null;
    const status: AuthStatus = q.isPending ? "loading"
      : err?.status === 401 ? "signedOut"
      : err?.status === 403 ? "noAccess"
      : q.error ? "error"
      : "ready";
    const permissions = new Set(q.data?.permissions ?? []);
    return {
      status,
      me: q.data ?? null,
      refusal: err?.status === 403 ? err.message : null,
      can: (permission: string) => permissions.has(permission),
      signOut: async () => {
        try { await api.signOut(); } catch { /* the reload lands on /login either way */ }
        window.location.assign("/login");
      },
      retry: () => { void q.refetch(); },
    };
  }, [q]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
