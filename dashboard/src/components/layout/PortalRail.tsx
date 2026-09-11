/**
 * The Adventist Portal's global icon rail, reused here so this app reads as one
 * of the portal's own surfaces — and, on desktop, carrying this app's own board
 * menu too. Markup, sizing and the CSS-only tooltip bubble are ported from
 * login-adventistbot's app/Rail.tsx + org.css (.rail/.railBtn/.railTip),
 * recoloured through this app's tokens.
 *
 * Top group: this app's boards (weekly overview, all schools, each school —
 * short codes in the button, full names in the tooltip, the databoard health
 * dot in the corner). Bottom group: the portal's own destinations and controls,
 * in the portal's order — Organizations, Apps, theme, Settings, Log out last.
 *
 * Rendered only under SSO, and only on desktop: on mobile the drawer sidebar
 * still carries the full menu, names included.
 */
import { NavLink, useLocation } from "react-router-dom";
import { useDataboard, useUnits } from "@/hooks/queries";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { STATUS_LABEL } from "@/lib/format";
import type { Light } from "@/lib/types";

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82V15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /><path d="M15 21V9" />
    </svg>
  );
}

function SigmaIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 5H6l6 7-6 7h12" />
    </svg>
  );
}

function CapIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z" />
      <path d="M22 10v6" />
      <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function SchoolhouseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 22v-4a2 2 0 1 0-4 0v4" />
      <path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2" />
      <path d="M18 5v17" />
      <path d="m4 6 8-4 8 4" />
      <path d="M6 5v17" />
      <circle cx="12" cy="9" r="1.5" />
    </svg>
  );
}

/** The early learning centre wears play blocks. */
function BlocksIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3" />
    </svg>
  );
}

/** Every school gets its own shape, in the rail's neutral colours like the
 *  portal's own icons: the pool cycles by each school's position, ELCs always
 *  take the blocks. */
const SCHOOL_ICONS = [CapIcon, BookIcon, SchoolhouseIcon];

/** The portal's tooltip bubble beside a rail control. */
const Tip = ({ label }: { label: string }) => <span className="railTip" aria-hidden="true">{label}</span>;

/** A rail destination inside this app: NavLink so the active one lights up. */
function RailNavLink({ to, end, label, active, children }: {
  to: string; end?: boolean; label: string; active?: boolean; children: React.ReactNode;
}) {
  return (
    <NavLink to={to} end={end} aria-label={label}
      className={({ isActive }) => `railBtn${isActive || active ? " active" : ""}`}>
      {children}
      <Tip label={label} />
    </NavLink>
  );
}

export function PortalRail() {
  const { me, signOut } = useAuth();
  const { isDark, toggle } = useTheme();
  const location = useLocation();
  const units = useUnits();
  const board = useDataboard();
  if (!me?.sso.enabled) return null;
  const portal = me.sso.portalUrl;
  const overall = new Map((board.data?.matrix ?? []).map((m) => [m.unit, m.status.overall]));
  return (
    <aside className="portal-rail" aria-label="Boards and the Adventist Portal">
      {/* This app's boards — the sidebar menu, names in the tooltips. */}
      <nav className="railNav" aria-label="Boards">
        <RailNavLink to="/dashboard" label="Weekly overview" active={location.pathname === "/databoard"}><BoardIcon /></RailNavLink>
        <RailNavLink to="/finance" end label="All schools — consolidated summary"><SigmaIcon /></RailNavLink>
        <span className="railSep" aria-hidden />
        {(() => {
          const schools = (units.data ?? []).filter((u) => u.type !== "EARLY_LEARNING_CENTRE");
          return (units.data ?? []).map((u) => {
            const st = overall.get(u.code) as Light | undefined;
            const Icon = u.type === "EARLY_LEARNING_CENTRE"
              ? BlocksIcon
              : SCHOOL_ICONS[schools.indexOf(u) % SCHOOL_ICONS.length]!;
            return (
              <RailNavLink key={u.code} to={`/finance/${u.code}`} label={st ? `${u.name} · ${STATUS_LABEL[st]}` : u.name}>
                <Icon />
                {st && <span className={`railStatus dot-${st}`} />}
              </RailNavLink>
            );
          });
        })()}
      </nav>
      {/* The portal's own destinations and controls, in the portal's order. */}
      <div className="railBottom">
        <a className="railBtn" href={`${portal}/org`} aria-label="Your organizations">
          <img src="/portal-orgs-icon.png" alt="" width={18} height={18} />
          <Tip label="Your organizations" />
        </a>
        <a className="railBtn" href={`${portal}/apps`} aria-label="Your apps"><GridIcon /><Tip label="Your apps" /></a>
        {/* Shows the theme you would be switching TO, matching the portal's toggle. */}
        <button type="button" className="railBtn" onClick={toggle} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}>
          {isDark ? <SunIcon /> : <MoonIcon />}
          <Tip label={isDark ? "Light mode" : "Dark mode"} />
        </button>
        <a className="railBtn" href={`${portal}/settings`} aria-label="Portal settings"><GearIcon /><Tip label="Portal settings" /></a>
        <button type="button" className="railBtn" onClick={() => void signOut()} aria-label="Log out">
          <LogoutIcon />
          <Tip label="Log out" />
        </button>
      </div>
    </aside>
  );
}
