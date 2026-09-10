/** App shell: near-black glass sidebar (both themes), light glass top bar with search, content column. */
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useDataboard, useUnits } from "@/hooks/queries";
import { useTheme } from "@/hooks/useTheme";
import { Dot, SearchProvider, ToastProvider, useSearch } from "../ui";
import { STATUS_LABEL } from "@/lib/format";

export function Shell() {
  return (
    <ToastProvider>
      <SearchProvider>
        <ShellInner />
      </SearchProvider>
    </ToastProvider>
  );
}

function ShellInner() {
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  useEffect(() => { setDrawer(false); }, [loc.pathname]);
  useEffect(() => { document.body.classList.toggle("drawer-open", drawer); }, [drawer]);
  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <Topbar onMenu={() => setDrawer((d) => !d)} />
        <main className="content"><Outlet /></main>
      </div>
      <div className="scrim" onClick={() => setDrawer(false)} />
    </div>
  );
}

function Sidebar() {
  const units = useUnits();
  const board = useDataboard();
  const { isDark, toggle } = useTheme();
  const { query } = useSearch();
  const q = query.trim().toLowerCase();
  const overall = new Map((board.data?.matrix ?? []).map((m) => [m.unit, m.status.overall]));
  const match = (s: string) => !q || s.toLowerCase().includes(q);
  return (
    <aside className="sidebar" aria-label="Boards">
      <div className="brand">
        <img src="/logo-snsw.jpg" alt="SNSW" className="brand-snsw" />
        <span className="brand-rule" />
        <img src="/logo-adventist-education.png" alt="Adventist Education" className="brand-ae" />
      </div>
      <nav>
        <div className="nav-group">Education</div>
        {match("weekly databoard") && (
          <NavLink to="/databoard" className="nav-item"><span className="nav-ico" aria-hidden>▦</span><span className="nav-text">Weekly databoard<small>All sites · one page</small></span></NavLink>
        )}
        <div className="nav-group">Finance</div>
        {match("all schools finance summary") && (
          <NavLink to="/finance" end className="nav-item"><span className="nav-ico" aria-hidden>Σ</span><span className="nav-text">All schools<small>Consolidated summary</small></span></NavLink>
        )}
        {(units.data ?? []).filter((u) => match(`${u.name} ${u.short} ${u.location}`)).map((u) => {
          const st = overall.get(u.code);
          return (
            <NavLink key={u.code} to={`/finance/${u.code}`} className="nav-item">
              <span className="nav-swatch" style={{ background: u.colour ?? "var(--accent)" }} />
              <span className="nav-text">{u.name}<small>{u.location}</small></span>
              {st && <Dot colour={st} title={`Overall on the weekly databoard: ${STATUS_LABEL[st]}`} />}
            </NavLink>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <button type="button" className="theme-btn" onClick={toggle}>{isDark ? "☀ Light mode" : "☾ Dark mode"}</button>
        <p>Figures come from the finance API. Live MYOB, Synergetic and Hubworks feeds are planned next.</p>
      </div>
    </aside>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { query, setQuery } = useSearch();
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
        <span className="who" title="Sign-in arrives after the app ships">Guest · no sign-in yet</span>
        <span className="avatar" aria-hidden>S</span>
      </div>
    </header>
  );
}
