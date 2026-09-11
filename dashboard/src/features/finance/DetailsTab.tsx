/** Every line of the operating statement — the one place figures are typed, one line at a time. */
import { useEffect, useState, type ReactElement } from "react";
import { Button, Card, Chip, NumberInput, TextInput, useSearch } from "@/components/ui";
import { useAccess } from "@/hooks/useAuth";
import { fmt, fmt$ } from "@/lib/format";
import { addRow, clone, KEYS, matches, removeRow, rowEmpty, sumGroups, sumRows, updateRow } from "@/lib/editing";
import type { Board, DetailGroup, LineItem } from "@/lib/types";

type Sec = "income" | "expenditure";

/**
 * The open line is held by identity as well as position, because the board can change underneath
 * it: the first pencil click swaps the approved board for the draft, and adding or removing a line
 * shifts every index below it. `code` and `label` are kept in step as they are typed.
 */
type OpenRow = { sec: Sec; gi: number; ri: number; group: string; code: string; label: string; before: LineItem | null; added: boolean };

function locate(board: Board, open: OpenRow | null, sec: Sec): { gi: number; ri: number } | null {
  if (!open || open.sec !== sec) return null;
  const groups = board.details[sec];
  const at = groups[open.gi]?.rows[open.ri];
  if (at && at.code === open.code && at.label === open.label) return { gi: open.gi, ri: open.ri };
  const gi = groups.findIndex((g) => g.group === open.group);
  if (gi < 0) return null;
  const ri = groups[gi].rows.findIndex((r) => r.code === open.code && r.label === open.label);
  return ri < 0 ? null : { gi, ri };
}

export function DetailsTab({ board, editable, hideZeros, onToggleZeros, onChange, onBeginEdit }: {
  board: Board; editable: boolean; hideZeros: boolean; onToggleZeros: () => void; onChange: (b: Board) => void; onBeginEdit: () => void;
}) {
  const { query, setQuery } = useSearch();
  const can = useAccess();
  const canEdit = can("boards.edit");
  const q = query.trim().toLowerCase();
  const [open, setOpen] = useState<OpenRow | null>(null);
  // A pencil or “+ Add line” pressed before the draft has loaded is replayed once it arrives.
  const [pendingAdd, setPendingAdd] = useState<{ sec: Sec; gi: number } | null>(null);

  useEffect(() => {
    if (!editable || !pendingAdd) return;
    const { sec, gi } = pendingAdd;
    const group = board.details[sec][gi];
    setPendingAdd(null);
    onChange(addRow(board, sec, gi));
    setOpen({ sec, gi, ri: group.rows.length, group: group.group, code: "", label: "New line", before: null, added: true });
  }, [editable, pendingAdd, board, onChange]);

  const api: RowApi = {
    editable,
    canEdit,
    open,
    beginRow(sec, gi, g, ri, r) {
      if (!editable) onBeginEdit();
      setOpen({ sec, gi, ri, group: g.group, code: r.code, label: r.label, before: null, added: false });
    },
    beginAdd(sec, gi) {
      if (!editable) { onBeginEdit(); setPendingAdd({ sec, gi }); return; }
      const group = board.details[sec][gi];
      onChange(addRow(board, sec, gi));
      setOpen({ sec, gi, ri: group.rows.length, group: group.group, code: "", label: "New line", before: null, added: true });
    },
    patch(sec, gi, ri, r, p) {
      const next = { ...r, ...p };
      onChange(updateRow(board, sec, gi, ri, p));
      setOpen((o) => o && { ...o, gi, ri, code: next.code, label: next.label, before: o.before ?? (o.added ? null : clone(r)) });
    },
    commit() { setOpen(null); },
    cancel(sec, gi, ri) {
      if (open?.added) onChange(removeRow(board, sec, gi, ri));
      else if (open?.before) onChange(updateRow(board, sec, gi, ri, open.before));
      setOpen(null);
    },
    remove(sec, gi, ri, r) {
      if (!confirm(`Remove “${r.label || "this line"}” from the statement?`)) return;
      onChange(removeRow(board, sec, gi, ri));
      setOpen(null);
    },
  };

  const incT = sumGroups(board.details.income), expT = sumGroups(board.details.expenditure);
  const anyLines = board.details.income.some((g) => g.rows.length) || board.details.expenditure.some((g) => g.rows.length);
  return (
    <>
      <div className="statement-toolbar">
        <input type="search" className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an account or line item…" aria-label="Filter statement line items" />
        <label className="statement-option"><input type="checkbox" checked={!hideZeros} onChange={onToggleZeros} /> Show empty lines</label>
        <details className="statement-help"><summary>How to edit</summary>
        <p className="intro">
          {!canEdit
            ? <>Every line of the operating statement, exactly as entered. Your role is read-only here — figures are edited by the finance team.</>
            : anyLines
              ? <>Enter or update account figures here. Totals and summaries update automatically. <b>Hover and click the pencil to edit</b>, or “+ Add line” to add an account. Changes apply when you save.</>
              : <>Nothing has been entered yet. Use “+ Add line” under a group to enter the lines from the operating report.</>}
        </p></details>
      </div>
      <Section board={board} sec="income" title="Income" isIncome hideZeros={hideZeros} q={q} api={api} />
      <Section board={board} sec="expenditure" title="Expenditure" isIncome={false} hideZeros={hideZeros} q={q} api={api} />
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

type RowApi = {
  editable: boolean;
  /** Whether the portal lets this viewer edit at all — no pencils or “+ Add line” without it. */
  canEdit: boolean;
  open: OpenRow | null;
  beginRow: (sec: Sec, gi: number, g: DetailGroup, ri: number, r: LineItem) => void;
  beginAdd: (sec: Sec, gi: number) => void;
  patch: (sec: Sec, gi: number, ri: number, r: LineItem, p: Partial<LineItem>) => void;
  commit: () => void;
  cancel: (sec: Sec, gi: number, ri: number) => void;
  remove: (sec: Sec, gi: number, ri: number, r: LineItem) => void;
};

function Section({ board, sec, title, isIncome, hideZeros, q, api }: {
  board: Board; sec: Sec; title: string; isIncome: boolean; hideZeros: boolean; q: string; api: RowApi;
}) {
  const groups = board.details[sec];
  const at = api.editable ? locate(board, api.open, sec) : null;
  let hidden = 0, shown = 0;
  const total = sumGroups(groups);
  const varOf = (b: number, a: number) => (isIncome ? a - b : b - a);
  const VarCell = ({ v }: { v: number }) => <td className={`strong c-${v > 0 ? "green" : v < 0 ? "red" : "muted"}`}>{fmt(v)}</td>;

  return (
    <Card solid title={title} className="scroll-x">
      <table className="ftable dtable">
        <thead><tr><th>Code</th><th>Line item</th><th>YTD budget</th><th>YTD actual</th><th>Variance</th><th>Annual budget</th><th>Est. end of year</th><th><span className="sr-only">Edit</span></th></tr></thead>
        <tbody>
          {groups.map((g: DetailGroup, gi) => {
            const rows = g.rows.map((r, ri) => ({ r, ri })).filter(({ r, ri }) => {
              // The open line always stays put, even if a filter or the empty-line rule would drop it.
              if (at && at.gi === gi && at.ri === ri) { shown++; return true; }
              if (q && !matches(r, q)) return false;
              if (!q && hideZeros && rowEmpty(r)) { hidden++; return false; }
              shown++; return true;
            });
            if (q && !rows.length) return null;
            const gt = sumRows(g.rows);
            return (
              <GroupRows key={g.group} g={g} gi={gi} rows={rows} gt={gt} openAt={at} isIncome={isIncome} sec={sec} api={api} varOf={varOf} VarCell={VarCell} />
            );
          })}
          {q && !shown && <tr><td colSpan={8} className="muted center">No line items match “{q}”.</td></tr>}
          <tr className="granded"><td /><td>Total {isIncome ? "income" : "expenditure"}</td><td>{fmt(total.budget)}</td><td>{fmt(total.actual)}</td><td>{fmt(varOf(total.budget, total.actual))}</td><td>{fmt(total.annualBudget)}</td><td>{fmt(total.eoyEstimate)}</td><td /></tr>
        </tbody>
      </table>
      <div className="ties"><div className="tie muted">Totals include all accounts, including filtered and hidden lines.</div>
        {board.reconciliation.some((r) => groups.some((g) => g.group === r.label)) && <div className="tie c-amber">⚖ Figures typed from page 1 of the operating report differ from these lines — see Reconciliation on the Overview tab</div>}</div>
      {hidden > 0 && <p className="fine">{hidden} line(s) with no budget or actual are hidden. Use “Show empty lines” to see them.</p>}
    </Card>
  );
}

function GroupRows({ g, gi, rows, gt, openAt, isIncome, sec, api, varOf, VarCell }: {
  g: DetailGroup; gi: number; rows: Array<{ r: LineItem; ri: number }>; gt: ReturnType<typeof sumRows>; openAt: { gi: number; ri: number } | null;
  isIncome: boolean; sec: Sec; api: RowApi; varOf: (b: number, a: number) => number; VarCell: (p: { v: number }) => ReactElement;
}) {
  return (
    <>
      <tr className="grouphead"><td colSpan={8}><span className="flexrow between">{g.group}{api.canEdit && <Button size="small" variant="dashed" onClick={() => api.beginAdd(sec, gi)}>+ Add line</Button>}</span></td></tr>
      {rows.map(({ r, ri }) => {
        const isOpen = !!openAt && openAt.gi === gi && openAt.ri === ri;
        const patch = (p: Partial<LineItem>) => api.patch(sec, gi, ri, r, p);
        return (
          <tr key={`${gi}:${ri}`} className={isOpen ? "line open" : "line"}
            onKeyDown={isOpen ? (e) => {
              if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLElement).blur(); api.commit(); }
              if (e.key === "Escape") { e.preventDefault(); api.cancel(sec, gi, ri); }
            } : undefined}>
            {isOpen ? <>
              <td className="code"><TextInput className="code" value={r.code} onChange={(v) => patch({ code: v })} placeholder="code" ariaLabel="Account code" /></td>
              <td><TextInput className="label" value={r.label} onChange={(v) => patch({ label: v })} placeholder="Line item" ariaLabel="Line item" /></td>
            </> : <>
              <td className="code">{r.code}</td><td>{r.label}</td>
            </>}
            {KEYS.slice(0, 2).map((k) => <td key={k}>{isOpen ? <NumberInput value={r[k]} onChange={(v) => patch({ [k]: v })} ariaLabel={k} /> : fmt(r[k])}</td>)}
            <VarCell v={varOf(r.budget, r.actual)} />
            {KEYS.slice(2).map((k) => <td key={k}>{isOpen ? <NumberInput value={r[k]} onChange={(v) => patch({ [k]: v })} ariaLabel={k} /> : fmt(r[k])}</td>)}
            <td>
              <span className="rowacts">
                {isOpen ? <>
                  <button type="button" className="rowbtn ok" title="Keep this line (Enter)" aria-label="Keep this line" onClick={() => api.commit()}>✓</button>
                  <button type="button" className="rowbtn no" title="Cancel (Esc)" aria-label="Cancel editing this line" onClick={() => api.cancel(sec, gi, ri)}>✕</button>
                  <button type="button" className="rowbtn del" title="Remove this line" aria-label="Remove this line" onClick={() => api.remove(sec, gi, ri, r)}>🗑</button>
                </> : api.canEdit ? (
                  <button type="button" className="rowbtn pencil" title="Edit this line" aria-label={`Edit ${r.label || "this line"}`} onClick={() => api.beginRow(sec, gi, g, ri, r)}>✎</button>
                ) : null}
              </span>
            </td>
          </tr>
        );
      })}
      <tr className="grouptot"><td /><td>Total {g.group.toLowerCase()}</td><td>{fmt(gt.budget)}</td><td>{fmt(gt.actual)}</td><VarCell v={varOf(gt.budget, gt.actual)} /><td>{fmt(gt.annualBudget)}</td><td>{fmt(gt.eoyEstimate)}</td><td /></tr>
    </>
  );
}

export { Chip };
