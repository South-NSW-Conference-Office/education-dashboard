/**
 * The screens outside the shell: sign-in (via the Adventist Portal) and the
 * signed-in-but-not-granted refusal. Both wear the same design system as the
 * app; neither renders any board data.
 */
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <img src="/logo-adventist-education.png" alt="" className="auth-logo" />
        {children}
      </div>
      <p className="auth-foot">Adventist Education · South New South Wales</p>
    </div>
  );
}

export function LoginScreen() {
  const loc = useLocation();
  const params = new URLSearchParams(loc.search);
  const error = params.get("error");
  // Land back where the person was headed, never on /login itself.
  const dest = loc.pathname === "/login" ? "/" : loc.pathname;
  const signIn = () => {
    window.location.assign(`/api/sso/probe?silent=0&callbackUrl=${encodeURIComponent(dest)}`);
  };
  return (
    <Frame>
      <div className="auth-eyebrow">SNSW Dashboards</div>
      <h1>Education Dashboard</h1>
      <p className="intro">
        School finance boards and the weekly education databoard. Sign-in and
        access are managed in the Adventist Portal by your organization.
      </p>
      {error && (
        <p className="auth-error" role="alert">
          Sign-in did not complete{error === "login_required" ? "" : ` (${error})`}. Try again, or sign in at the portal first.
        </p>
      )}
      <Button variant="primary" onClick={signIn}>Sign in with Adventist Portal</Button>
    </Frame>
  );
}

export function NoAccessScreen() {
  const { me, refusal, signOut } = useAuth();
  const portalUrl = me?.sso.portalUrl ?? "https://portal.adventist.bot";
  return (
    <Frame>
      <div className="auth-eyebrow">SNSW Dashboards</div>
      <h1>No access yet</h1>
      <p className="intro">
        {refusal ?? "Your account has no access to the Education Dashboard."}{" "}
        An administrator of your organization can grant you a role from the portal.
      </p>
      <div className="auth-acts">
        <a className="btn btn-primary" href={`${portalUrl}/apps`}>Open the portal</a>
        <Button onClick={() => void signOut()}>Sign out</Button>
      </div>
    </Frame>
  );
}

export function AuthLoading() {
  return <div className="auth-screen"><div className="loading" role="status">Checking your session…</div></div>;
}

export function AuthError() {
  const { retry } = useAuth();
  return (
    <Frame>
      <h1>Could not reach the dashboard</h1>
      <p className="intro">The backend did not answer. Is it running?</p>
      <Button variant="primary" onClick={retry}>Try again</Button>
    </Frame>
  );
}
