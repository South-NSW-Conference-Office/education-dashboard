/** App shell: warm neutral sidebar, translucent paper top bar with search, content column (the CFO Command Centre chrome). */
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useDataboard, useUnits } from "@/hooks/queries";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { PeriodProvider } from "@/hooks/usePeriod";
import { Dot, SearchProvider, ToastProvider, useSearch } from "../ui";
import { STATUS_LABEL } from "@/lib/format";
import { PortalRail } from "./PortalRail";

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => (w[0] ?? "").toUpperCase()).join("") || "?";

/** The signed-in viewer's role, worded for the sidebar. */
const roleLabel = (roles: string[]) =>
  roles.includes("admin") ? "Administrator" : roles.includes("editor") ? "Editor" : roles.includes("viewer") ? "Viewer" : roles[0] ?? "Member";

export function Shell() {
  return (
    <ToastProvider>
      <SearchProvider>
        <PeriodProvider>
          <ShellInner />
        </PeriodProvider>
      </SearchProvider>
    </ToastProvider>
  );
}

function ShellInner() {
  const [drawer, setDrawer] = useState(false);
  const { me } = useAuth();
  const loc = useLocation();
  useEffect(() => { setDrawer(false); }, [loc.pathname]);
  useEffect(() => { document.body.classList.toggle("drawer-open", drawer); }, [drawer]);
  return (
    <div className={`shell${me?.sso.enabled ? " has-rail" : ""}`}>
      <PortalRail />
      <Sidebar />
      <div className="main">
        <Topbar onMenu={() => setDrawer((d) => !d)} />
        <main className={`content${loc.pathname.startsWith("/finance") ? " finance-workspace" : ""}`}><Outlet /></main>
      </div>
      <div className="scrim" onClick={() => setDrawer(false)} />
    </div>
  );
}

/** Collapsed = a slim icon rail. Desktop only: the mobile drawer always opens in full. */
const COLLAPSE_KEY = "snsw-dashboard-sidebar-collapsed";

function Sidebar() {
  const location = useLocation();
  const units = useUnits();
  const board = useDataboard();
  const { isDark, toggle } = useTheme();
  const { query } = useSearch();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed((c) => {
    try { if (c) localStorage.removeItem(COLLAPSE_KEY); else localStorage.setItem(COLLAPSE_KEY, "1"); } catch { /* private mode */ }
    return !c;
  });
  const q = query.trim().toLowerCase();
  const overall = new Map((board.data?.matrix ?? []).map((m) => [m.unit, m.status.overall]));
  const match = (s: string) => !q || s.toLowerCase().includes(q);
  // Tooltips carry the hidden labels while the rail is slim.
  const tip = (label: string) => (collapsed ? label : undefined);
  return (
    <aside className={collapsed ? "sidebar collapsed" : "sidebar"} aria-label="Boards">
      <div className="brand">
        <img src="/logo-adventist-education.png" alt="Adventist Education" className="brand-ae" />
        <div className="brand-text"><b>SNSW</b><span>Dashboards</span></div>
        <button type="button" className="collapse-btn" onClick={toggleCollapsed} aria-expanded={!collapsed}
          title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"} aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {collapsed
              ? <><polyline points="9 5 16 12 9 19" /></>
              : <><polyline points="15 5 8 12 15 19" /></>}
          </svg>
        </button>
      </div>
      <nav>
        <div className="nav-group">Education</div>
        {match("weekly databoard") && (
          <NavLink to="/dashboard" title={tip("Weekly overview")} className={({ isActive }) => `nav-item${isActive || location.pathname === "/databoard" ? " active" : ""}`}><span className="nav-ico" aria-hidden>▦</span><span className="nav-text">Weekly overview</span></NavLink>
        )}
        <div className="nav-group">Finance</div>
        {match("all schools finance summary") && (
          <NavLink to="/finance" end className="nav-item" title={tip("All schools — consolidated summary")}><span className="nav-ico" aria-hidden>Σ</span><span className="nav-text">All schools<small>Consolidated summary</small></span></NavLink>
        )}
        {(units.data ?? []).filter((u) => match(`${u.name} ${u.short} ${u.location}`)).map((u) => {
          const st = overall.get(u.code);
          return (
            <NavLink key={u.code} to={`/finance/${u.code}`} className="nav-item" title={tip(u.name)}>
              <span className="nav-swatch" />
              <span className="nav-abbr" aria-hidden>{u.short}</span>
              <span className="nav-text">{u.name}<small>{u.location}</small></span>
              {st && <Dot colour={st} title={`Overall on the weekly databoard: ${STATUS_LABEL[st]}`} />}
            </NavLink>
          );
        })}
      </nav>
      <SidebarFoot isDark={isDark} onToggleTheme={toggle} collapsed={collapsed} />
    </aside>
  );
}

/** Portal chrome: who is signed in, the way back to the portal, sign out — plus the theme toggle.
 *  Collapsed, the same controls shrink to a stacked column of icons (labels move into tooltips). */
function SidebarFoot({ isDark, onToggleTheme, collapsed }: { isDark: boolean; onToggleTheme: () => void; collapsed: boolean }) {
  const { me, signOut } = useAuth();
  const sso = me?.sso.enabled ?? false;
  const signOutIcon = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
  const portalIcon = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
  if (collapsed) {
    return (
      <div className="sidebar-foot foot-rail">
        {sso && me && <span className="avatar" title={`${me.user.name} · ${roleLabel(me.roles)}`}>{initialsOf(me.user.name)}</span>}
        {sso && me && <a className="foot-icon" href={`${me.sso.portalUrl}/apps`} title="All portal apps" aria-label="All portal apps">{portalIcon}</a>}
        <button type="button" className="foot-icon" onClick={onToggleTheme} title={isDark ? "Light mode" : "Dark mode"} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}>{isDark ? "☀" : "☾"}</button>
        {sso && me && <button type="button" className="foot-icon" title="Sign out" aria-label="Sign out" onClick={() => void signOut()}>{signOutIcon}</button>}
      </div>
    );
  }
  return (
    <div className="sidebar-foot">
      {sso && me && (
        <div className="side-user">
          <span className="avatar" aria-hidden>{initialsOf(me.user.name)}</span>
          <span className="side-user-text">
            <b>{me.user.name}</b>
            <small>{roleLabel(me.roles)}</small>
          </span>
          <button type="button" className="side-signout" title="Sign out" aria-label="Sign out" onClick={() => void signOut()}>
            {signOutIcon}
          </button>
        </div>
      )}
      {sso && me && (
        <a className="side-portal" href={`${me.sso.portalUrl}/apps`}>
          {portalIcon}
          All portal apps
        </a>
      )}
      <button type="button" className="theme-btn" onClick={onToggleTheme}>{isDark ? "☀ Light mode" : "☾ Dark mode"}</button>
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { query, setQuery } = useSearch();
  const { me } = useAuth();
  const units = useUnits();
  const nav = useNavigate();
  const loc = useLocation();
  const onDetails = /\/details$/.test(loc.pathname);
  // Enter jumps to the first matching school; on the Details tab the query filters line items instead.
  const submit = () => {
    if (onDetails) return;
    const q = query.trim().toLowerCase();
    const u = (units.data ?? []).find((x) => `${x.name} ${x.short}`.toLowerCase().includes(q));
    if (q && u) { nav(`/finance/${u.code}`); setQuery(""); }
  };
  return (
    <header className="topbar">
      <button type="button" className="icon-btn nav-toggle" onClick={onMenu} aria-label="Menu">☰</button>
      <form className="search-wrap" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={onDetails ? "Filter line items — code or name" : "Search schools, line items…"} aria-label="Search" />
      </form>
      <div className="topbar-right">
        {me?.sso.enabled ? (
          <>
            <span className="who">{me.user.name}</span>
            <span className="avatar" aria-hidden>{initialsOf(me.user.name)}</span>
          </>
        ) : (
          <>
            <span className="who" title="Running without the portal — local mode">Local mode · no sign-in</span>
            <span className="avatar" aria-hidden>S</span>
          </>
        )}
      </div>
    </header>
  );
}
