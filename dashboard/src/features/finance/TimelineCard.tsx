/**
 * Month by month for a range or all time: every month that holds an approved board, oldest first,
 * as a table of YTD totals plus a surplus-vs-budget bar chart. For one school when `unit` is given,
 * otherwise combined across schools. Nothing renders while a single month or Latest is selected.
 */
import { Link } from "react-router-dom";
import { PairedBars } from "@/components/charts";
import { Card, Dot, Empty, ErrorState, Loading } from "@/components/ui";
import { useTimeline } from "@/hooks/queries";
import { usePeriod } from "@/hooks/usePeriod";
import { isSpan, short } from "@/lib/period";
import { fmt, fmt$, pct } from "@/lib/format";

export function TimelineCard({ unit }: { unit?: string }) {
  const { selection, label } = usePeriod();
  const t = useTimeline(unit);
  if (!isSpan(selection)) return null;
  const title = `Month by month · ${label}`;
  if (t.isPending) return <Card title={title}><Loading what="timeline" /></Card>;
  if (t.error || !t.data) return <ErrorState error={t.error} retry={() => t.refetch()} />;
  const rows = t.data.periods;
  if (!rows.length) return <Card title={title}><Empty>No approved board falls inside {label}.</Empty></Card>;
  return (
    <Card title={title} className="scroll-x" tools={<span className="hint">Figures are year to date as at each month</span>}>
      <table className="ftable stable timeline">
        <thead><tr><th>Month</th>{!unit && <th>Boards</th>}<th>Income YTD</th><th>Spending YTD</th><th>Surplus / (deficit)</th><th>vs budget</th><th>Margin</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td><b>{r.label}</b></td>
              {!unit && <td><span className="tl-units">{r.units.map((u) => <Link key={u.unit} className="tag" to={`/finance/${u.unit}`} title={`${u.name}: surplus ${fmt$(u.surplus.actual)} (${fmt(u.surVar)} vs budget)`}><Dot colour={u.finance} />{u.short}</Link>)}</span></td>}
              <td>{fmt$(r.totals.income.actual)}</td>
              <td>{fmt$(r.totals.expenditure.actual)}</td>
              <td>{fmt$(r.totals.surplus.actual)}</td>
              <td className={`strong c-${r.totals.surVar >= 0 ? "green" : "red"}`}>{fmt(r.totals.surVar)}</td>
              <td>{pct(r.totals.marginPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="tl-sub">Surplus / (deficit) by month — actual vs budget</h3>
      <PairedBars isIncome rows={rows.map((r) => ({ label: short(r.label), budget: r.totals.surplus.budget, actual: r.totals.surplus.actual }))} />
      {!unit && <p className="fine">A month only counts the schools that reported it, so months with fewer boards are not like for like.</p>}
    </Card>
  );
}
