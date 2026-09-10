/** Every line of the operating statement — the one place figures are typed. */
import type { ReactElement } from "react";
import { Button, Card, Chip, NumberInput, TextInput, useSearch } from "@/components/ui";
import { fmt, fmt$ } from "@/lib/format";
import { addRow, KEYS, matches, removeRow, rowEmpty, sumGroups, sumRows, updateRow } from "@/lib/editing";
import type { Board, DetailGroup, LineItem } from "@/lib/types";

type Sec = "income" | "expenditure";

export function DetailsTab({ board, editing, hideZeros, onChange }: { board: Board; editing: boolean; hideZeros: boolean; onChange: (b: Board) => void }) {
  const { query } = useSearch();
  const q = query.trim().toLowerCase();
  const incT = sumGroups(board.details.income), expT = sumGroups(board.details.expenditure);
  const anyLines = board.details.income.some((g) => g.rows.length) || board.details.expenditure.some((g) => g.rows.length);
  return (
    <>
      <Card className="intro-card">
        <h2 className="h-blue">Full line-item detail</h2>
        <p className="intro">
          {anyLines
            ? <>This is where the figures are entered. Each line carries its account code from the operating statement; group subtotals, the Overview, the all-schools summary and the weekly databoard are calculated from these lines.{editing && <> <b>All lines are shown while editing.</b> Use “+ Add line” to add an account.</>}</>
            : <>Nothing has been entered yet. Choose Edit board and add the lines from the operating report.</>}
        </p>
      </Card>
      <Section board={board} sec="income" title="Income — line by line" isIncome editing={editing} hideZeros={hideZeros} q={q} onChange={onChange} />
      <Section board={board} sec="expenditure" title="Expenditure — line by line" isIncome={false} editing={editing} hideZeros={hideZeros} q={q} onChange={onChange} />
      {anyLines && (
        <Card accent="blue" title="Surplus / (deficit) from the line items">
          <ul className="health">
            <li><span>YTD budget</span><span className="amt">{fmt$(incT.budget - expT.budget)}</span></li>
            <li><span>YTD actual</span><span className={`amt c-${incT.actual - expT.actual >= 0 ? "green" : "red"}`}>{fmt$(incT.actual - expT.actual)}</span></li>
            <li><span>Variance</span><span className={`amt c-${(incT.actual - expT.actual) - (incT.budget - expT.budget) >= 0 ? "green" : "red"}`}>{fmt$((incT.actual - expT.actual) - (incT.budget - expT.budget))}</span></li>
          </ul>
          <p className="fine">For income, a positive variance means ahead of budget. For expenditure, a positive variance means spending is under budget.</p>
        </Card>
      )}
    </>
  );
}

function Section({ board, sec, title, isIncome, editing, hideZeros, q, onChange }: { board: Board; sec: Sec; title: string; isIncome: boolean; editing: boolean; hideZeros: boolean; q: string; onChange: (b: Board) => void }) {
  const groups = board.details[sec];
  const cols = editing ? 8 : 7;
  let hidden = 0, shown = 0;
  const total = sumGroups(groups);
  const varOf = (b: number, a: number) => (isIncome ? a - b : b - a);
  const VarCell = ({ v }: { v: number }) => <td className={`strong c-${v > 0 ? "green" : v < 0 ? "red" : "muted"}`}>{fmt(v)}</td>;

  return (
    <Card solid title={title} className="scroll-x">
      <table className="ftable dtable">
        <thead><tr><th>Code</th><th>Line item</th><th>YTD budget</th><th>YTD actual</th><th>Variance</th><th>Annual budget</th><th>Est. end of year</th>{editing && <th />}</tr></thead>
        <tbody>
          {groups.map((g: DetailGroup, gi) => {
            const rows = g.rows.map((r, ri) => ({ r, ri })).filter(({ r }) => {
              if (q && !matches(r, q)) return false;
              if (!q && !editing && hideZeros && rowEmpty(r)) { hidden++; return false; }
              shown++; return true;
            });
            if (q && !rows.length) return null;
            const gt = sumRows(g.rows);
            return (
              <GroupRows key={g.group} g={g} gi={gi} rows={rows} gt={gt} cols={cols} editing={editing} isIncome={isIncome} sec={sec} board={board} onChange={onChange} varOf={varOf} VarCell={VarCell} />
            );
          })}
          {q && !shown && <tr><td colSpan={cols} className="muted center">No line items match “{q}”.</td></tr>}
          <tr className="granded"><td /><td>Total {isIncome ? "income" : "expenditure"}</td><td>{fmt(total.budget)}</td><td>{fmt(total.actual)}</td><td>{fmt(varOf(total.budget, total.actual))}</td><td>{fmt(total.annualBudget)}</td><td>{fmt(total.eoyEstimate)}</td>{editing && <td />}</tr>
        </tbody>
      </table>
      <div className="ties"><div className="tie c-green">✓ The Overview categories, KPIs and all-schools summary are calculated from these lines</div>
        {board.reconciliation.some((r) => groups.some((g) => g.group === r.label)) && <div className="tie c-amber">⚖ Figures typed from page 1 of the operating report differ from these lines — see Reconciliation on the Overview tab</div>}</div>
      {hidden > 0 && <p className="fine">{hidden} line(s) with no budget or actual are hidden. Use “Show empty lines” to see them.</p>}
    </Card>
  );
}

function GroupRows({ g, gi, rows, gt, cols, editing, isIncome, sec, board, onChange, varOf, VarCell }: {
  g: DetailGroup; gi: number; rows: Array<{ r: LineItem; ri: number }>; gt: LineItem | ReturnType<typeof sumRows>; cols: number; editing: boolean; isIncome: boolean; sec: Sec; board: Board;
  onChange: (b: Board) => void; varOf: (b: number, a: number) => number; VarCell: (p: { v: number }) => ReactElement;
}) {
  return (
    <>
      <tr className="grouphead"><td colSpan={cols}><span className="flexrow between">{g.group}{editing && <Button size="small" variant="dashed" onClick={() => onChange(addRow(board, sec, gi))}>+ Add line</Button>}</span></td></tr>
      {rows.map(({ r, ri }) => (
        <tr key={ri}>
          {editing ? <>
            <td className="code"><TextInput className="code" value={r.code} onChange={(v) => onChange(updateRow(board, sec, gi, ri, { code: v }))} placeholder="code" ariaLabel="Account code" /></td>
            <td><TextInput className="label" value={r.label} onChange={(v) => onChange(updateRow(board, sec, gi, ri, { label: v }))} placeholder="Line item" ariaLabel="Line item" /></td>
          </> : <>
            <td className="code">{r.code}</td><td>{r.label}</td>
          </>}
          {KEYS.slice(0, 2).map((k) => <td key={k}>{editing ? <NumberInput value={r[k]} onChange={(v) => onChange(updateRow(board, sec, gi, ri, { [k]: v }))} ariaLabel={k} /> : fmt(r[k])}</td>)}
          <VarCell v={varOf(r.budget, r.actual)} />
          {KEYS.slice(2).map((k) => <td key={k}>{editing ? <NumberInput value={r[k]} onChange={(v) => onChange(updateRow(board, sec, gi, ri, { [k]: v }))} ariaLabel={k} /> : fmt(r[k])}</td>)}
          {editing && <td><button type="button" className="btn-del" title="Remove this line" onClick={() => { if (confirm(`Remove “${r.label || "this line"}” from the statement?`)) onChange(removeRow(board, sec, gi, ri)); }}>✕</button></td>}
        </tr>
      ))}
      <tr className="grouptot"><td /><td>Total {g.group.toLowerCase()}</td><td>{fmt(gt.budget)}</td><td>{fmt(gt.actual)}</td><VarCell v={varOf(gt.budget, gt.actual)} /><td>{fmt(gt.annualBudget)}</td><td>{fmt(gt.eoyEstimate)}</td>{editing && <td />}</tr>
    </>
  );
}

export { Chip };
