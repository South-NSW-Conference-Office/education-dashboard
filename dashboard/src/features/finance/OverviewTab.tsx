import { useState } from "react";
import { Link } from "react-router-dom";
import { PairedBars } from "@/components/charts";
import { Button, Card, Chip, Dot, EditTools, Empty, Kpi, NumberInput, TextArea, TextInput } from "@/components/ui";
import { fmt, fmt$, pct } from "@/lib/format";
import { clone, getPath, setPath } from "@/lib/editing";
import type { Board, Overview, Obligation } from "@/lib/types";

/** Each card that holds typed figures owns its own pencil; these are the paths it may write to. */
type CardKey = "loans" | "leases" | "lookingBack" | "current" | "upcoming";
const CARD_PATHS: Record<CardKey, string[]> = {
  loans: ["loans"],
  leases: ["leases"],
  lookingBack: ["priorYear"],
  current: ["comments.current"],
  upcoming: ["comments.upcoming"],
};

export function OverviewTab({ unit, board, overview, editable, onChange, onBeginEdit }: {
  unit: string; board: Board; overview?: Overview; editable: boolean; onChange: (b: Board) => void; onBeginEdit: () => void;
}) {
  const k = overview?.kpis;
  const cats = overview?.categories ?? { income: board.income, expenditure: board.expenditure };
  const totals = overview?.totals;

  const [openCard, setOpenCard] = useState<CardKey | null>(null);
  // Taken on the first change, not on opening, because the draft may still be loading at that point.
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const isOpen = (key: CardKey) => editable && openCard === key;

  const set = (path: string, v: unknown) => {
    if (openCard && !snapshot) {
      setSnapshot(Object.fromEntries(CARD_PATHS[openCard].map((p) => [p, clone(getPath(board, p))])));
    }
    onChange(setPath(board, path, v));
  };
  const tools = (key: CardKey, label: string) => ({
    open: isOpen(key),
    label,
    onEdit: () => { if (!editable) onBeginEdit(); setOpenCard(key); setSnapshot(null); },
    onKeep: () => { setOpenCard(null); setSnapshot(null); },
    onCancel: () => {
      if (snapshot) {
        let b = board;
        for (const [p, v] of Object.entries(snapshot)) b = setPath(b, p, clone(v));
        onChange(b);
      }
      setOpenCard(null); setSnapshot(null);
    },
  });

  return (
    <>
      {k && (
        <div className="grid4">
          <Kpi feature label="Surplus / (deficit) YTD" value={fmt$(k.surplus.actual)} sub={`Budget ${fmt$(k.surplus.budget)}`} colour={k.surplus.variance >= 0 ? "green" : "red"} delta={`${fmt$(Math.abs(k.surplus.variance))} ${k.surplus.variance >= 0 ? "ahead" : "behind"}`} />
          <Kpi label="Income (YTD)" value={fmt$(k.income.actual)} sub={`Budget ${fmt$(k.income.budget)}`} colour={k.income.colour} delta={`${fmt$(Math.abs(k.income.variance))} ${k.income.variance >= 0 ? "ahead of budget" : "behind budget"}`} />
          <Kpi label="Spending (YTD)" value={fmt$(k.spending.actual)} sub={`Budget ${fmt$(k.spending.budget)}`} colour={k.spending.colour} delta={`${fmt$(Math.abs(k.spending.variance))} ${k.spending.variance >= 0 ? "under budget" : "over budget"}`} />
          <Kpi label="Operating margin" value={pct(k.margin.actual)} sub={`EBIDA basis · budget ${pct(k.margin.budget)}`} colour={k.margin.colour} delta={`${k.margin.actual - k.margin.budget >= 0 ? "+" : "−"}${Math.abs(k.margin.actual - k.margin.budget).toFixed(1)} pts vs budget`} />
        </div>
      )}

      {overview && (
        <div className="grid2">
          <Card title="Going well">
            <ul className="health">
              {overview.goingWell.length ? overview.goingWell.map((r) => <li key={r.label}><span className="catcell"><Dot colour="green" />{r.label}</span><span className="amt c-green">{fmt$(r.variance)} favourable</span></li>)
                : <li className="muted">Enter this period's figures to see highlights.</li>}
            </ul>
          </Card>
          <Card title={<span className="h-red">Needs attention</span>}>
            <ul className="health">
              {overview.needsAttention.length ? overview.needsAttention.map((r) => <li key={r.label}><span className="catcell"><Dot colour={r.colour} />{r.label}</span><span className={`amt c-${r.colour}`}>{fmt$(Math.abs(r.variance))} unfavourable</span></li>)
                : <li className="muted">Nothing flagged — all categories on or better than budget.</li>}
            </ul>
          </Card>
        </div>
      )}

      <div className="grid2 wide">
        <Card title="Income by category" tools={<span className="hint">Year to date</span>}><PairedBars isIncome rows={cats.income} /></Card>
        <Card title="Spending by category" tools={<span className="hint">Year to date</span>}><PairedBars isIncome={false} rows={cats.expenditure} /></Card>
      </div>

      <Card solid title="Financial statement" tools={<Link className="hint" to={`/finance/${unit}/details`}>View line items →</Link>} className="scroll-x">
        <table className="ftable">
          <thead><tr><th>Category</th><th>YTD budget</th><th>YTD actual</th><th>Variance</th><th>Annual budget</th><th>Est. end of year</th></tr></thead>
          <tbody>
            <tr className="section-label"><td colSpan={6}>Income</td></tr>
            {cats.income.map((c) => <CatRow key={c.label} c={c} isIncome />)}
            {totals && <TotalRow label="Total income" a={totals.income} varAmt={totals.income.actual - totals.income.budget} />}
            <tr className="section-label"><td colSpan={6}>Expenditure</td></tr>
            {cats.expenditure.map((c) => <CatRow key={c.label} c={c} isIncome={false} />)}
            {totals && <TotalRow label="Total expenditure" a={totals.expenditure} varAmt={totals.expenditure.budget - totals.expenditure.actual} />}
            {totals && <tr className="surplus"><td>Surplus / (deficit)</td><td>{fmt(totals.surplus.budget)}</td><td>{fmt(totals.surplus.actual)}</td><td>{fmt(totals.surplus.actual - totals.surplus.budget)}</td><td>{fmt(totals.surplus.annualBudget)}</td><td>{fmt(totals.surplus.eoyEstimate)}</td></tr>}
            {overview && <tr className="ebida"><td>EBIDA (surplus + interest, depreciation &amp; amortisation)</td><td>{fmt(overview.ebida.budget)}</td><td>{fmt(overview.ebida.actual)}</td>
              <td colSpan={3} className="left"><span className="hint">Add-back {fmt$(overview.ebida.addback.budget)} / {fmt$(overview.ebida.addback.actual)}{overview.ebida.addback.computed ? ` from ${overview.ebida.addback.lines} interest, depreciation & amortisation line${overview.ebida.addback.lines === 1 ? "" : "s"}` : " (carried figure — no such lines yet)"}</span></td></tr>}
          </tbody>
        </table>
        <p className="fine">Sub-lines ("of which") sit inside their category total. Variance is favourable when positive: income ahead of budget, or spending under budget.</p>
      </Card>

      {board.reconciliation.length > 0 && (
        <Card accent="amber" title={<span className="h-amber">Reconciliation with the operating report</span>}>
          <p className="intro">The dashboard follows the line items. These figures were typed from page 1 of the operating report and do not add up to the detail pages — worth a check with the accountant.</p>
          <ul className="recon">
            {board.reconciliation.map((r, i) => <li key={i}><b>{r.label}</b> · {r.field}: line items {fmt$(r.lineItems)}, page 1 {fmt$(r.page1)} <Chip colour="amber">{r.note}</Chip></li>)}
          </ul>
        </Card>
      )}

      <div className="grid2">
        <Obligations title="Loan repayments" kind="loans" items={board.loans} tools={tools("loans", "loan repayments")} onChange={(items) => set("loans", items)} />
        <Obligations title="Lease payments" kind="leases" items={board.leases} tools={tools("leases", "lease payments")} onChange={(items) => set("leases", items)} />
      </div>

      <Card title="Year-on-year comparison" tools={<EditTools {...tools("lookingBack", "this year's comparison")} />}>
        <div className="looking">
          <div>
            <div className="mini-label">Family debtors</div>
            <Debtors current={board.priorYear.debtorsCurrent} prior={board.priorYear.debtorsPrior} editing={isOpen("lookingBack")} onChange={(c, p) => set("priorYear", { ...board.priorYear, debtorsCurrent: c, debtorsPrior: p })} />
          </div>
          <div>
            <div className="mini-label">Strategic note vs last year</div>
            {isOpen("lookingBack") ? <TextArea value={board.priorYear.note} onChange={(v) => set("priorYear.note", v)} placeholder="e.g. Enrolment growth vs last year, debtor trends, one-off items…" />
              : <p className="comment-text">{board.priorYear.note || <span className="muted">No note yet — click the pencil to add one.</span>}</p>}
          </div>
        </div>
      </Card>

      <div className="grid2">
        <Card accent="blue" title="Current impacts" tools={<EditTools {...tools("current", "current impacts")} />}>
          {isOpen("current") ? <TextArea value={board.comments.current} onChange={(v) => set("comments.current", v)} placeholder="What's affecting the numbers right now…" />
            : <p className="comment-text">{board.comments.current || <span className="muted">Nothing noted for this period.</span>}</p>}
        </Card>
        <Card accent="gold" title="Planned & upcoming impacts" tools={<EditTools {...tools("upcoming", "planned impacts")} />}>
          {isOpen("upcoming") ? <TextArea value={board.comments.upcoming} onChange={(v) => set("comments.upcoming", v)} placeholder="What's coming — capital works, new hires, fee changes, grant timing…" />
            : <p className="comment-text">{board.comments.upcoming || <span className="muted">Nothing planned has been noted yet.</span>}</p>}
        </Card>
      </div>
    </>
  );
}

function CatRow({ c, isIncome }: { c: Board["income"][number]; isIncome: boolean }) {
  const v = isIncome ? c.actual - c.budget : c.budget - c.actual;
  const p = c.budget ? (v / Math.abs(c.budget)) * 100 : v < 0 ? -100 : 0;
  const colour = v >= 0 ? "green" : p > -5 ? "amber" : "red";
  return (
    <>
      <tr>
        <td><span className="catcell"><Dot colour={colour} />{c.label}{c.computed !== false && <span className="calc-mark" title="Calculated from line items on the Details tab">▣</span>}</span></td>
        <td className="calc">{fmt(c.budget)}</td><td className="calc">{fmt(c.actual)}</td><td className={`c-${colour} strong`}>{fmt(v)}</td><td className="calc">{fmt(c.annualBudget)}</td><td className="calc">{fmt(c.eoyEstimate)}</td>
      </tr>
      {(c.sub ?? []).map((s) => {
        const sv = s.budget - s.actual;
        return <tr className="subrow" key={s.label}><td>↳ of which: {s.label}{s.computed && <span className="calc-mark" title={`Sum of ${s.lines} salary, casual and fringe-benefit lines`}>▣</span>}</td><td>{fmt(s.budget)}</td><td>{fmt(s.actual)}</td><td className={`c-${sv >= 0 ? "green" : "red"} strong`}>{fmt(sv)}</td><td>{fmt(s.annualBudget)}</td><td>{fmt(s.eoyEstimate)}</td></tr>;
      })}
    </>
  );
}
function TotalRow({ label, a, varAmt }: { label: string; a: Board["income"][number] | { budget: number; actual: number; annualBudget: number; eoyEstimate: number }; varAmt: number }) {
  return <tr className="total"><td>{label}</td><td>{fmt(a.budget)}</td><td>{fmt(a.actual)}</td><td className={`c-${varAmt >= 0 ? "green" : "red"}`}>{fmt(varAmt)}</td><td>{fmt(a.annualBudget)}</td><td>{fmt(a.eoyEstimate)}</td></tr>;
}

function Obligations({ title, kind, items, tools, onChange }: {
  title: string; kind: "loans" | "leases"; items: Obligation[]; tools: Parameters<typeof EditTools>[0]; onChange: (items: Obligation[]) => void;
}) {
  const editing = tools.open;
  const upd = (i: number, patch: Partial<Obligation>) => onChange(items.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <Card title={title} tools={<>
      {editing && <Button size="small" variant="gold" onClick={() => onChange([...items, { name: "", payment: 0, frequency: "Monthly", ends: "", notes: "" }])}>+ Add</Button>}
      <EditTools {...tools} />
    </>}>
      {!items.length && <Empty>No current {kind} recorded.{editing && " Use + Add to record one."}</Empty>}
      {items.map((o, i) => editing ? (
        <div className="item-card" key={i}>
          <TextInput value={o.name} onChange={(v) => upd(i, { name: v })} placeholder="Name (e.g. Building loan – Bank)" />
          <div className="flexrow">
            <NumberInput value={o.payment} onChange={(v) => upd(i, { payment: v })} ariaLabel="Payment" />
            <TextInput className="w-110" value={o.frequency} onChange={(v) => upd(i, { frequency: v })} placeholder="Frequency" />
            <TextInput className="grow" value={o.ends} onChange={(v) => upd(i, { ends: v })} placeholder="Ends / matures" />
            <button type="button" className="btn-del" title="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
          </div>
          <TextInput value={o.notes} onChange={(v) => upd(i, { notes: v })} placeholder="Notes" />
        </div>
      ) : (
        <div className="item-card" key={i}>
          <div className="row"><div><b>{o.name || "Untitled"}</b>{o.notes && <div className="notes">{o.notes}</div>}{o.ends && <div className="notes">Ends: {o.ends}</div>}</div>
            <div className="pay-col"><div className="pay">{fmt$(o.payment)}</div><div className="freq">{o.frequency}</div></div></div>
        </div>
      ))}
    </Card>
  );
}

function Debtors({ current, prior, editing, onChange }: { current: number; prior: number; editing: boolean; onChange: (c: number, p: number) => void }) {
  const max = Math.max(current, prior, 1);
  if (!current && !prior && !editing) return <Empty>Not yet entered — click the pencil to add this period's and last year's family debtors.</Empty>;
  return (
    <>
      <div className="bar-row simple"><div className="bar-label">This year</div><div className="bar-track"><div className="bar bar-actual" style={{ width: `${Math.max(1, (current / max) * 100)}%` }} /></div><div className="bar-val"><span>{fmt$(current)}</span></div></div>
      <div className="bar-row simple"><div className="bar-label">Last year</div><div className="bar-track"><div className="bar bar-budget" style={{ width: `${Math.max(1, (prior / max) * 100)}%` }} /></div><div className="bar-val"><span>{fmt$(prior)}</span></div></div>
      {editing && <div className="flexrow small">This year <NumberInput value={current} onChange={(v) => onChange(v, prior)} /> Last year <NumberInput value={prior} onChange={(v) => onChange(current, v)} /></div>}
    </>
  );
}
