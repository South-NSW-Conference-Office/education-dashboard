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
import { BoardMenu, usePresentation } from "@/components/BoardMenu";

const varColour = (v: number, base: number): Light => (v >= 0 ? "green" : v > -0.05 * Math.abs(base || 1) ? "amber" : "red");

export function SummaryPage() {
  const { presenting, setPresenting } = usePresentation();
  const s = useSummary();
  const units = useUnits();
  const nav = useNavigate();
  const { selection, setSelection, label } = usePeriod();
  if (s.isPending) return <Loading what="finance summary" />;
  if (s.error || !s.data) return <ErrorState error={s.error} retry={() => s.refetch()} />;
  const d = s.data, t = d.totals;
  // Under Latest, All time or a range the boards may sit at different months: say which.
  const resolved = d.context.periods.join(" / ");
  const header = (
    <PageHeader eyebrow="Finance · All schools" title="Finance summary"
      pills={<><PeriodPicker label="Boards as at" note={selection.kind !== "month" && resolved ? resolved : undefined} /><Pill label="Schools reporting">{d.context.boards} of {units.data?.length ?? d.context.boards}</Pill></>}
      actions={presenting ? <Button onClick={() => setPresenting(false)}>Exit presentation</Button> : <BoardMenu items={[{ label: "Present", action: () => setPresenting(true) }, { label: "Print", action: () => window.print() }]} />} />
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
        <Kpi feature label="Combined surplus (YTD)" value={compact$(t.surplus.actual)} sub={`Budget ${compact$(t.surplus.budget)}`} colour={t.surVar >= 0 ? "green" : "red"} delta={`${fmt$(Math.abs(t.surVar))} ${t.surVar >= 0 ? "ahead" : "behind"}`} />
        <Kpi label="Combined income (YTD)" value={compact$(t.income.actual)} sub={`Budget ${compact$(t.income.budget)}`} colour={varColour(t.incVar, t.income.budget)} delta={`${fmt$(Math.abs(t.incVar))} ${t.incVar >= 0 ? "ahead of budget" : "behind budget"}`} />
        <Kpi label="Combined spending (YTD)" value={compact$(t.expenditure.actual)} sub={`Budget ${compact$(t.expenditure.budget)}`} colour={varColour(-t.expVar, t.expenditure.budget)} delta={`${fmt$(Math.abs(t.expVar))} ${t.expVar <= 0 ? "under budget" : "over budget"}`} />
        <Kpi label="Schools needing attention" value={<>{d.schools.filter((x) => x.finance !== "green").length} <span className="kpi-of">of {d.schools.length}</span></>} sub={d.schools.filter((x) => x.finance !== "green").map((x) => x.short).join(", ") || "All schools at or ahead of budget"} />
      </div>

      <Card solid title="School by school" tools={<span className="hint">Click a school to open its board</span>} className="scroll-x">
        <table className="ftable stable">
          <thead><tr><th>School</th><th>Income YTD</th><th>Spending YTD</th><th>Surplus / (deficit)</th><th>Margin</th><th>Status</th></tr></thead>
          <tbody>
            {d.schools.map((x) => {
              const iv = x.income.actual - x.income.budget, ev = x.spending.budget - x.spending.actual;
              return (
                <tr key={x.unit} className="rowlink" onClick={() => nav(`/finance/${x.unit}`)}>
                  <td><Link className="school-link" to={`/finance/${x.unit}`} onClick={(e) => e.stopPropagation()}><span><b>{x.name}</b><small>As at {x.asAt}{x.placeholder && <> · <Badge tone="amber">placeholder</Badge></>}</small></span></Link></td>
                  <td><SummaryAmount amount={x.income.actual} variance={iv} /></td>
                  <td><SummaryAmount amount={x.spending.actual} variance={ev} /></td>
                  <td><SummaryAmount amount={x.surplus.actual} variance={x.surVar} /></td>
                  <td>{pct(x.marginPct)}</td>
                  <td><Chip colour={x.finance}>{x.finance === "green" ? "On track" : x.finance === "amber" ? "Watch" : "At risk"}</Chip></td>
                </tr>
              );
            })}
            <tr className="total"><td>All schools</td><td><SummaryAmount amount={t.income.actual} variance={t.incVar} /></td><td><SummaryAmount amount={t.expenditure.actual} variance={-t.expVar} /></td><td><SummaryAmount amount={t.surplus.actual} variance={t.surVar} /></td><td>{pct(t.marginPct)}</td><td /></tr>
          </tbody>
        </table>
        <p className="fine">Variance is favourable when positive. Combined margin is surplus over income; schools show their EBIDA margin.</p>
      </Card>

      <div className="grid2 wide">
        <Card title="Surplus by school" tools={<span className="hint">Year to date</span>}>
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

function SummaryAmount({ amount, variance }: { amount: number; variance: number }) {
  return <span className="summary-amount">{fmt$(amount)}<small className={variance < 0 ? "c-red" : "muted"}>{variance > 0 ? "+" : ""}{fmt(variance)} vs budget</small></span>;
}
