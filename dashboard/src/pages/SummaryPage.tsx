import { Link, useNavigate } from "react-router-dom";
import { useSummary, useUnits } from "@/hooks/queries";
import { PageHeader, Pill } from "@/components/layout/PageHeader";
import { PairedBars } from "@/components/charts";
import { PeriodPicker } from "@/components/PeriodPicker";
import { Badge, Button, Card, Chip, Dot, ErrorState, Kpi, Loading } from "@/components/ui";
import { TimelineCard } from "@/features/finance/TimelineCard";
import { usePeriod } from "@/hooks/usePeriod";
import { compact$, fmt, fmt$, pct } from "@/lib/format";
import { LATEST } from "@/lib/period";
import type { Light } from "@/lib/types";

const varColour = (v: number, base: number): Light => (v >= 0 ? "green" : v > -0.05 * Math.abs(base || 1) ? "amber" : "red");

export function SummaryPage() {
  const s = useSummary();
  const units = useUnits();
  const nav = useNavigate();
  const { selection, setSelection, label } = usePeriod();
  if (s.isPending) return <Loading what="finance summary" />;
  if (s.error || !s.data) return <ErrorState error={s.error} retry={() => s.refetch()} />;
  const d = s.data, t = d.totals;
  const colour = new Map((units.data ?? []).map((u) => [u.code, u.colour]));
  // Under Latest, All time or a range the boards may sit at different months: say which.
  const resolved = d.context.periods.join(" / ");
  const header = (
    <PageHeader eyebrow="Finance · All schools" title="Finance summary"
      pills={<><PeriodPicker label="Boards as at" note={selection.kind !== "month" && resolved ? resolved : undefined} /><Pill label="Boards">{d.context.boards} of {units.data?.length ?? d.context.boards}</Pill></>} />
  );
  if (!d.context.boards) return (
    <>
      {header}
      <Card accent="amber" className="noboard">
        <h2 className="h-amber">Nothing reported for {label}</h2>
        <p className="intro">No school has an approved finance board {selection.kind === "month" ? `for ${label}` : `inside ${label}`}. Choose another month above, or go back to the latest boards.</p>
        <div className="acts"><Button variant="primary" onClick={() => setSelection(LATEST)}>Show latest boards</Button></div>
      </Card>
    </>
  );
  return (
    <>
      {header}

      {d.context.mixedPeriods && <div className="banner banner-blue">Boards are as at different months, so the combined figures mix periods until every school reports the same month.</div>}
      {selection.kind === "month" && d.context.boards < (units.data?.length ?? 0) && <div className="banner banner-blue">Only {d.context.boards} of {units.data?.length} schools have an approved board for {label}; the combined figures cover those.</div>}

      <div className="grid4">
        <Kpi feature label="Combined surplus (YTD)" value={compact$(t.surplus.actual)} sub={`Budget ${compact$(t.surplus.budget)}`} delta={`${fmt$(Math.abs(t.surVar))} ${t.surVar >= 0 ? "ahead" : "behind"}`} />
        <Kpi label="Combined income (YTD)" value={compact$(t.income.actual)} sub={`Budget ${compact$(t.income.budget)}`} colour={varColour(t.incVar, t.income.budget)} delta={`${fmt$(Math.abs(t.incVar))} ${t.incVar >= 0 ? "ahead of budget" : "behind budget"}`} />
        <Kpi label="Combined spending (YTD)" value={compact$(t.expenditure.actual)} sub={`Budget ${compact$(t.expenditure.budget)}`} colour={varColour(-t.expVar, t.expenditure.budget)} delta={`${fmt$(Math.abs(t.expVar))} ${t.expVar <= 0 ? "under budget" : "over budget"}`} />
        <Kpi label="Schools needing attention" value={<>{d.schools.filter((x) => x.finance !== "green").length} <span className="kpi-of">of {d.schools.length}</span></>} sub={d.schools.filter((x) => x.finance !== "green").map((x) => x.short).join(", ") || "All schools at or ahead of budget"} />
      </div>

      <Card solid title="School by school" tools={<span className="hint">Click a school to open its board</span>} className="scroll-x">
        <table className="ftable stable">
          <thead><tr><th>School</th><th>Income YTD</th><th>vs budget</th><th>Spending YTD</th><th>vs budget</th><th>Surplus / (deficit)</th><th>vs budget</th><th>Margin</th><th>Status</th></tr></thead>
          <tbody>
            {d.schools.map((x) => {
              const iv = x.income.actual - x.income.budget, ev = x.spending.budget - x.spending.actual;
              return (
                <tr key={x.unit} className="rowlink" onClick={() => nav(`/finance/${x.unit}`)}>
                  <td><Link className="school-link" to={`/finance/${x.unit}`} onClick={(e) => e.stopPropagation()}><i className="swatch" style={{ background: colour.get(x.unit) ?? "var(--accent)" }} /><span><b>{x.name}</b><small>As at {x.asAt}{x.placeholder && <> · <Badge tone="amber">placeholder</Badge></>}</small></span></Link></td>
                  <td>{fmt$(x.income.actual)}</td><td className={`c-${varColour(iv, x.income.budget)} strong`}>{fmt(iv)}</td>
                  <td>{fmt$(x.spending.actual)}</td><td className={`c-${varColour(ev, x.spending.budget)} strong`}>{fmt(ev)}</td>
                  <td>{fmt$(x.surplus.actual)}</td><td className={`c-${x.finance} strong`}>{fmt(x.surVar)}</td>
                  <td>{pct(x.marginPct)}</td>
                  <td><Chip colour={x.finance}>{x.finance === "green" ? "On track" : x.finance === "amber" ? "Watch" : "At risk"}</Chip></td>
                </tr>
              );
            })}
            <tr className="total"><td>All schools</td><td>{fmt$(t.income.actual)}</td><td className={`c-${t.incVar >= 0 ? "green" : "red"}`}>{fmt(t.incVar)}</td><td>{fmt$(t.expenditure.actual)}</td><td className={`c-${t.expVar <= 0 ? "green" : "red"}`}>{fmt(-t.expVar)}</td><td>{fmt$(t.surplus.actual)}</td><td className={`c-${t.surVar >= 0 ? "green" : "red"}`}>{fmt(t.surVar)}</td><td>{pct(t.marginPct)}</td><td /></tr>
          </tbody>
        </table>
        <p className="fine">Variance is favourable when positive. Combined margin is surplus over income; schools show their EBIDA margin.</p>
      </Card>

      <div className="grid2 wide">
        <Card title="Surplus / (deficit) by school — actual vs budget (YTD)">
          <PairedBars isIncome rows={d.schools.map((x) => ({ label: x.name, budget: x.surplus.budget, actual: x.surplus.actual, href: `/finance/${x.unit}` }))} />
        </Card>
        <Card title={<span className="h-red">Needs attention across schools</span>}>
          <ul className="health">
            {d.needsAttention.length ? d.needsAttention.map((f, i) => (
              <li key={i}><span className="catcell"><Dot colour={f.colour} /><Link className="tag" to={`/finance/${f.unit}`}>{f.short}</Link>{f.label}</span><span className={`amt c-${f.colour}`}>{fmt$(f.unfavourable)} unfavourable</span></li>
            )) : <li className="muted">Nothing flagged across any school.</li>}
          </ul>
          <p className="fine">The largest unfavourable variances across all boards, by category.</p>
        </Card>
      </div>

      <TimelineCard />
    </>
  );
}
