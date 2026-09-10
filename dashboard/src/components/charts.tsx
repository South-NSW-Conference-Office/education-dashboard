/** Charts drawn to the brand: accent for the primary series (actual), gold for the comparison (budget). */
import { fmt$, signed$ } from "@/lib/format";
import type { Light } from "@/lib/types";
import { Chip } from "./ui";
import { Link } from "react-router-dom";

export interface BarRow { label: string; budget: number; actual: number; href?: string }

/** Paired horizontal bars, one row per category, values and variance labelled on every row. */
export function PairedBars({ rows, isIncome }: { rows: BarRow[]; isIncome: boolean }) {
  const shown = rows.filter((r) => r.budget || r.actual);
  const max = Math.max(1, ...shown.flatMap((r) => [Math.abs(r.budget), Math.abs(r.actual)]));
  return (
    <div className="bars">
      <div className="legend">
        <span><i className="swatch sw-actual" />Actual</span>
        <span><i className="swatch sw-budget" />Budget</span>
        <span className="legend-note">{isIncome ? "Actual longer than budget = ahead" : "Actual shorter than budget = under budget"}</span>
      </div>
      {shown.map((r) => {
        const v = isIncome ? r.actual - r.budget : r.budget - r.actual;
        const pct = r.budget ? (v / Math.abs(r.budget)) * 100 : v < 0 ? -100 : 0;
        const colour: Light = v >= 0 ? "green" : pct > -5 ? "amber" : "red";
        const tip = `${r.label} — actual ${fmt$(r.actual)}, budget ${fmt$(r.budget)} (${signed$(v)} ${v >= 0 ? "favourable" : "unfavourable"})`;
        return (
          <div className="bar-row" key={r.label} title={tip}>
            <div className="bar-label">{r.href ? <Link to={r.href}>{r.label}</Link> : r.label}</div>
            <div className="bar-track">
              <div className="bar bar-actual" style={{ width: `${Math.max(1, (Math.abs(r.actual) / max) * 100)}%` }} />
              <div className="bar bar-budget" style={{ width: `${Math.max(1, (Math.abs(r.budget) / max) * 100)}%` }} />
            </div>
            <div className="bar-val"><span>{fmt$(r.actual)}</span><span>{fmt$(r.budget)}</span></div>
            <div className="bar-var"><Chip colour={colour}>{signed$(v)}</Chip></div>
          </div>
        );
      })}
      {!shown.length && <div className="empty">Nothing to chart yet.</div>}
    </div>
  );
}

/** Enrolment sparkline: area wash, 2px line, emphasised endpoint. */
export function Sparkline({ values, label }: { values: number[]; label?: string }) {
  const t = values.filter((n) => !isNaN(n));
  if (t.length < 2) return <div className="enrol-label">Add 2+ points to show a trend</div>;
  const w = 180, h = 38, pad = 4;
  const min = Math.min(...t), max = Math.max(...t), span = max - min || 1, step = (w - pad * 2) / (t.length - 1);
  const pts = t.map((v, i) => [pad + i * step, h - pad - ((v - min) / span) * (h - pad * 2)] as const);
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`;
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height="40" role="img" aria-label={`${label ?? "Trend"}: ${t.join(", ")}`}>
      <polygon points={area} fill="var(--accent)" opacity=".12" />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

export function enrolDelta(t: number[]) {
  if (t.length < 2) return null;
  const d = t[t.length - 1] - t[t.length - 2];
  return d > 0 ? <span className="c-green">▲ +{d}</span> : d < 0 ? <span className="c-red">▼ {d}</span> : <span className="muted">— no change</span>;
}
