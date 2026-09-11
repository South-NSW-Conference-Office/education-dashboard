/** Charts drawn to the brand: ink for the primary series (actual), gold for the comparison (budget). */
import { fmt$, signed$ } from "@/lib/format";
import type { Light } from "@/lib/types";
import { Chip } from "./ui";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

/** Reveal once when a chart enters the viewport; content stays visible without observer support. */
function useChartReveal<T extends Element>(hasData = true) {
  const ref = useRef<T>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!ref.current || !hasData || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setRevealed(true); observer.disconnect(); }
    }, { threshold: 0.15 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [hasData]);
  return { ref, revealed };
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const { ref, revealed } = useChartReveal<HTMLDivElement>();
  const percent = Math.max(0, Math.min(100, value));
  return <div ref={ref} className={`progress${revealed ? " chart-revealed" : ""}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} title={`${label}: ${percent}% complete`}><i style={{ width: `${percent}%` }} /></div>;
}

export interface BarRow { label: string; budget: number; actual: number; href?: string }

/** Paired horizontal bars, one row per category, values and variance labelled on every row. */
export function PairedBars({ rows, isIncome }: { rows: BarRow[]; isIncome: boolean }) {
  const { ref, revealed } = useChartReveal<HTMLDivElement>(rows.length > 0);
  const shown = rows.filter((r) => r.budget || r.actual);
  const values = shown.flatMap((r) => [r.budget, r.actual]);
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  const span = high - low || 1, zero = -low / span * 100;
  const mark = (value: number) => ({ width: `${Math.abs(value) / span * 100}%`, left: `${zero + Math.min(0, value) / span * 100}%` });
  return (
    <div ref={ref} className={`bars${revealed ? " chart-revealed" : ""}`}>
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
            <div className="bar-track signed-track">
              {low < 0 && <span className="bar-zero" style={{ left: `${zero}%` }} title="Zero" aria-hidden="true" />}
              <div className="bar-lane"><div className={`bar bar-actual${r.actual < 0 ? " bar-negative" : ""}`} style={mark(r.actual)} /></div>
              <div className="bar-lane"><div className={`bar bar-budget${r.budget < 0 ? " bar-negative" : ""}`} style={mark(r.budget)} /></div>
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
  const t = values.filter(Number.isFinite);
  const { ref, revealed } = useChartReveal<SVGSVGElement>(t.length >= 2);
  if (t.length < 2) return <div className="enrol-label">Add 2+ points to show a trend</div>;
  const w = 180, h = 38, pad = 4;
  const min = Math.min(...t), max = Math.max(...t), span = max - min || 1, step = (w - pad * 2) / (t.length - 1);
  const pts = t.map((v, i) => [pad + i * step, h - pad - ((v - min) / span) * (h - pad * 2)] as const);
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`;
  const last = pts[pts.length - 1];
  return (
    <svg ref={ref} className={`spark${revealed ? " chart-revealed" : ""}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height="56" role="img" aria-label={`${label ?? "Trend"}: ${t.join(", ")}`}>
      <polygon className="spark-area" points={area} fill="var(--ink)" opacity=".06" />
      <polyline className="spark-line" pathLength="100" points={line} fill="none" stroke="var(--ink)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle className="spark-end" cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="3" fill="var(--gold)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

export function enrolDelta(t: number[]) {
  if (t.length < 2) return null;
  const d = t[t.length - 1] - t[t.length - 2];
  return d > 0 ? <span className="c-green">▲ +{d}</span> : d < 0 ? <span className="c-red">▼ {d}</span> : <span className="muted">— no change</span>;
}
