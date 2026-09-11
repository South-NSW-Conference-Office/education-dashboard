/**
 * Weekly education databoard. Judgement fields are typed; Finance and Overall lights, the operating
 * result and each school's budget and variance arrive already derived from the finance boards.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDataboard, useSaveDataboard } from "@/hooks/queries";
import { PageHeader, Pill } from "@/components/layout/PageHeader";
import { ProgressBar, Sparkline, enrolDelta } from "@/components/charts";
import { PeriodPicker } from "@/components/PeriodPicker";
import { Badge, Button, Card, Chip, Empty, ErrorState, Loading, NumberInput, SaveBar, SectionHead, TextInput, TrafficLight, nextLight, useToast } from "@/components/ui";
import { usePeriod } from "@/hooks/usePeriod";
import { useAccess } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { clone } from "@/lib/editing";
import { compact$, STATUS_LABEL, when } from "@/lib/format";
import { LATEST } from "@/lib/period";
import type { Databoard, Light, ListItem } from "@/lib/types";

const COLS = [
  { key: "overall", label: "Overall" }, { key: "finance", label: "Finance" }, { key: "enrolments", label: "Enrolments" },
  { key: "staffing", label: "Staffing" }, { key: "buildings", label: "Buildings" }, { key: "whs", label: "WHS & Risk" },
] as const;

export function DataboardPage() {
  const q = useDataboard();
  const save = useSaveDataboard();
  const toast = useToast();
  const { selection, setSelection, label } = usePeriod();
  const can = useAccess();
  const [editing, setEditing] = useState(false);
  const [statusOnly, setStatusOnly] = useState(false);
  const editingFields = editing && !statusOnly;
  const [showNotes, setShowNotes] = useState(false);
  const [presenting, setPresenting] = useState(false);
  useEffect(() => {
    document.body.classList.toggle("presenting", presenting);
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setPresenting(false); };
    window.addEventListener("keydown", escape);
    return () => { document.body.classList.remove("presenting"); window.removeEventListener("keydown", escape); };
  }, [presenting]);
  const [draft, setDraft] = useState<Databoard | null>(null);
  useEffect(() => { if (!editing) setDraft(null); }, [editing]);
  useEffect(() => { setEditing(false); }, [selection]);

  if (q.isPending) return <Loading what="weekly databoard" />;
  if (q.error instanceof ApiError && q.error.status === 404) return (
    <>
      <PageHeader eyebrow="Education · South New South Wales" title="Weekly education databoard" pills={<PeriodPicker label="Finance as at" />} />
      <Card accent="amber" className="noboard">
        <h2 className="h-amber">No databoard as at {label}</h2>
        <p className="intro">No weekly databoard had been written by the end of {selection.kind === "month" ? label : "that range"}. Choose a later month above, or go back to the latest week.</p>
        <div className="acts"><Button variant="primary" onClick={() => setSelection(LATEST)}>Show latest week</Button></div>
      </Card>
    </>
  );
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = editing && draft ? draft : q.data;
  const set = (fn: (x: Databoard) => void) => { const c = clone(d); fn(c); setDraft(c); };
  const cycleStatus = (ri: number, key: "enrolments" | "staffing" | "buildings" | "whs") => {
    if (save.isPending) return;
    const updated = clone(d);
    updated.matrix[ri].status[key] = nextLight[updated.matrix[ri].status[key]];
    // Preview the same worst-of-five rule used by the server when saving.
    const row = updated.matrix[ri];
    const states = [row.status.finance, row.status.enrolments, row.status.staffing, row.status.buildings, row.status.whs];
    row.status.overall = states.includes("red") ? "red" : states.includes("amber") ? "amber" : "green";
    const school = updated.schools.find((s) => s.unit === row.unit);
    if (school) school.overall = row.status.overall;
    if (!editing) setStatusOnly(true);
    setDraft(updated);
    setEditing(true);
  };

  const doSave = async (publish: boolean) => {
    if (!draft) return;
    try {
      await save.mutateAsync({ weekEnding: draft.weekEnding, doc: draft, publish });
      toast(publish ? "Databoard published." : "Databoard saved as a draft.");
      setEditing(false);
    } catch (e) { toast(e instanceof Error ? e.message : "Save failed", "warn"); }
  };

  return (
    <div className={`education-board${editingFields ? " is-editing" : ""}`}>
      <PageHeader eyebrow="South New South Wales · Education" title="Weekly overview"
        pills={<>
          <Pill label="Week ending">{editingFields && draft ? <input className="pill-input" value={draft.weekEnding} onChange={(e) => set((x) => { x.weekEnding = e.target.value; })} /> : d.weekEnding}<span className="board-publication" title={d.lastUpdated ? `Updated ${when(d.lastUpdated)}` : undefined}>· {d.status === "PUBLISHED" ? "Published" : "Draft"}</span></Pill>
          <PeriodPicker label="Finance as at" disabled={editing} note={selection.kind !== "month" ? financeAsAt(d) : undefined} />
        </>}
        actions={presenting ? <Button onClick={() => setPresenting(false)}>Exit presentation</Button> : !editing && <BoardActions
          onPresent={() => setPresenting(true)}
          onEdit={can("boards.edit") ? () => { setStatusOnly(false); setDraft(clone(q.data!)); setEditing(true); } : undefined}
          onPrint={() => window.print()} />} />

      {editing && <SaveBar label={statusOnly ? "Unsaved status changes" : "Editing board"} discardLabel="Discard" saving={save.isPending} onSaveDraft={() => void doSave(false)} onPublish={() => void doSave(true)} onDiscard={() => { if (!save.isPending) setEditing(false); }} />}

      <div className="board-pulse" aria-label="School health summary">
        <span className="pulse-label">Across {d.matrix.length} sites</span>
        {(["green", "amber", "red"] as const).map((status) => <span key={status} className={`pulse-count pulse-${status}`}><b>{d.matrix.filter((r) => r.status.overall === status).length}</b> {STATUS_LABEL[status]}</span>)}
      </div>

      {/* Cash position */}
      <section className="section cash-section">
        <SectionHead title="Financial position" hint="All schools" />
        <div className="grid4">
          {d.cash.map((c, i) => (
            <div key={i} className={`card cash-cell${c.feature ? " kpi-feature" : ""}`} title={c.derived ? "Sum of the YTD surplus on each school's finance board" : undefined}>
              <label>{editingFields && !c.derived ? <TextInput value={c.label} onChange={(v) => set((x) => { x.cash[i].label = v; })} /> : c.label}{c.derived && editingFields && <Badge tone="blue" title="Calculated from the finance boards">auto</Badge>}</label>
              <div className="fig">{editingFields && !c.derived ? <TextInput value={c.value} onChange={(v) => set((x) => { x.cash[i].value = v; })} /> : c.value}</div>
              <div className="delta">{editingFields && !c.derived ? <TextInput value={c.delta} onChange={(v) => set((x) => { x.cash[i].delta = v; })} /> : c.delta}</div>
            </div>
          ))}
        </div>
      </section>

      {/* At a glance */}
      <section className="section health-section">
        <SectionHead title="School health" hint={<button className="notes-toggle" type="button" aria-expanded={showNotes || editingFields} onClick={() => setShowNotes((v) => !v)} disabled={editingFields}>{showNotes ? "Hide notes" : "Show notes"}</button>} />
        <Card solid className="scroll-x">
          <table className="matrix">
            <thead><tr><th>School</th>{COLS.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>
              {d.matrix.map((r, ri) => {
                return (
                  <tr key={r.unit}>
                    <td className="school-name"><div>{editingFields ? r.school : <Link to={`/finance/${r.unit}`}>{r.school}</Link>}<small>{r.sub}</small></div></td>
                    {COLS.map((c) => {
                      const st = (r.status[c.key] ?? "green") as Light;
                      const derived = c.key === "overall" || (c.key === "finance" && r.derived.finance);
                      const note = r.notes[c.key] ?? "";
                      return (
                        <td key={c.key}>
                          {c.key === "finance" && !r.derived.finance
                            ? <span className="light-none" role="img" aria-label="No finance board for this period" title={`No approved finance board ${selection.kind === "month" ? `for ${label}` : "in this period"}`}>—</span>
                            : derived
                              ? <TrafficLight colour={st} title={`${r.school} · ${c.label}: ${STATUS_LABEL[st]} — ${c.key === "overall" ? "calculated from the five measures" : "calculated from the finance board"}`} />
                              : <TrafficLight colour={st} title={`${r.school} · ${c.label}: ${STATUS_LABEL[st]}${can("boards.edit") ? ` — next: ${STATUS_LABEL[nextLight[st]]}` : " — your account has read-only access"}`} onCycle={can("boards.edit") && c.key !== "finance" ? () => cycleStatus(ri, c.key) : undefined} disabled={save.isPending} />}
                          {derived && editingFields && <span className="auto-chip"><Badge tone="blue">auto</Badge></span>}
                          {c.key === "finance" && r.derived.financeVariance != null && (
                            <span className="auto-chip"><Chip colour={r.derived.financeVariance >= 0 ? "green" : "red"} title={`Finance board (${r.derived.asAt}): surplus ${compact$(r.derived.surplus ?? 0)}`}>{r.derived.financeVariance >= 0 ? "+" : "−"}{compact$(Math.abs(r.derived.financeVariance))} vs budget</Chip></span>
                          )}
                          {editingFields ? <input className="cell-note-input" value={note} placeholder="note" onChange={(e) => set((x) => { x.matrix[ri].notes[c.key] = e.target.value; })} />
                            : note && <span className={`cell-note${showNotes ? "" : " supporting-note"}`}>{note}</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="light-legend"><span><i className="light light-green mini" />On track</span><span><i className="light light-amber mini" />Watch</span><span><i className="light light-red mini" />Action needed</span><span className="legend-note">{can("boards.edit") ? "Click Enrolments, Staffing, Buildings or WHS to change status. " : "Read-only access. "}Overall &amp; Finance are calculated.</span></div>
        </Card>
      </section>

      {/* School snapshots */}
      <section className="section" id="school-snapshots">
        <SectionHead title="School snapshots" />
        <div className="schools-grid">
          {d.schools.map((s, i) => (
            <div className="card school-card" key={s.unit}>
              <div className="head">
                <div><h3>{s.name}</h3><div className="loc">{s.loc}</div></div>
                <TrafficLight colour={s.overall} size="ov" title={`Overall: ${STATUS_LABEL[s.overall]} (from the at-a-glance row)`} />
              </div>
              <div className="body">
                <Metric k="Budget" v={s.budget ? <span className="catcell"><TrafficLight colour={s.finance && s.finance.surplus >= 0 ? "green" : "red"} size="mini" />{s.budget}<Badge tone="blue">auto</Badge></span> : <span className="muted">no finance board</span>} />
                <Metric k="Variance" v={s.variance ? <><span className={`c-${s.finance && s.finance.variance >= 0 ? "green" : "red"}`}>{s.variance}</span><Badge tone="blue">auto</Badge></> : "—"} />
                <div className="metric-row col">
                  <div className="between"><span className="k">Building project</span><span className="v">{editingFields ? <TextInput value={s.project} onChange={(v) => set((x) => { x.schools[i].project = v; })} /> : s.project}</span></div>
                  <ProgressBar label={s.project} value={s.progress} />
                  <div className="between mt4"><span className="k">Progress</span><span className="v">{editingFields ? <NumberInput value={s.progress} min={0} max={100} onChange={(v) => set((x) => { x.schools[i].progress = v; })} /> : `${s.progress}%`}</span></div>
                </div>
                <Metric k="Loan balance" v={editingFields ? <TextInput value={s.loan} onChange={(v) => set((x) => { x.schools[i].loan = v; })} /> : s.loan} />
                <Metric k="Payments" v={editingFields ? <TextInput value={s.payments} onChange={(v) => set((x) => { x.schools[i].payments = v; })} /> : s.payments} />
                <Metric k="Staffing" v={editingFields ? <TextInput value={s.staffing} onChange={(v) => set((x) => { x.schools[i].staffing = v; })} /> : s.staffing} />
                <div className="enrol">
                  <div className="enrol-top"><span className="k">Enrolments</span><span className="enrol-now">{s.enrolTrend.length ? s.enrolTrend[s.enrolTrend.length - 1] : "—"} {enrolDelta(s.enrolTrend)}</span></div>
                  <Sparkline values={s.enrolTrend} label={s.enrolLabel} />
                  {editingFields ? <>
                    <TextInput className="mt6" value={s.enrolTrend.join(", ")} placeholder="e.g. 268, 279, 286, 300" onChange={(v) => set((x) => { x.schools[i].enrolTrend = v.split(",").map((t) => Number(t.trim())).filter((n) => !isNaN(n)); })} />
                    <TextInput className="mt6" value={s.enrolLabel} placeholder="trend label" onChange={(v) => set((x) => { x.schools[i].enrolLabel = v; })} />
                  </> : <div className="enrol-label">{s.enrolLabel}</div>}
                </div>
              </div>
              <div className="foot-row">
                <span className="k">From the finance board{s.finance ? ` · as at ${s.finance.asAt}` : ""}{s.finance?.placeholder && <> <Badge tone="amber">placeholder</Badge></>}</span>
                <Link className="btn btn-ghost btn-small" to={`/finance/${s.unit}`}>Open finance board →</Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Risks & WHS */}
      <section className="section">
        <SectionHead title="Risks & WHS" hint="Rating shows current exposure" />
        <div className="grid2">
          <ListPanel title="Risk register" meta="Owner and status for each open risk" items={d.risks} rated editing={editingFields} addLabel="+ Add risk" onChange={(items) => set((x) => { x.risks = items; })} />
          <ListPanel title="WHS items" meta="Work health & safety actions" items={d.whs} rated editing={editingFields} addLabel="+ Add WHS item" onChange={(items) => set((x) => { x.whs = items; })} />
        </div>
      </section>

      <section className="section">
        <SectionHead title="Connection & celebration" hint="The good news worth sharing" />
        <ListPanel title="Wins this week" meta="" items={d.celebrate} editing={editingFields} addLabel="+ Add a win" onChange={(items) => set((x) => { x.celebrate = items; })} />
      </section>
    </div>
  );
}

/** Secondary actions stay out of the reading path until requested. */
function BoardActions({ onPresent, onEdit, onPrint }: { onPresent: () => void; onEdit?: () => void; onPrint: () => void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  useEffect(() => {
    const dismiss = (e: MouseEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) menu.current.open = false; };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape" && menu.current?.open) { menu.current.open = false; trigger.current?.focus(); } };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", escape); };
  }, []);
  const run = (action: () => void) => { if (menu.current) menu.current.open = false; action(); };
  return <details className="board-actions" ref={menu}>
    <summary ref={trigger} aria-label="Board actions">Actions <span aria-hidden>···</span></summary>
    <div className="board-actions-pop">
      <button type="button" onClick={() => run(onPresent)}>Present</button>
      {onEdit && <button type="button" onClick={() => run(onEdit)}>Edit board</button>}
      <button type="button" onClick={() => run(onPrint)}>Print</button>
    </div>
  </details>;
}

/** The months the finance-derived figures come from. */
function financeAsAt(d: Databoard): string | undefined {
  const months = [...new Set(d.schools.map((s) => s.finance?.asAt).filter((x): x is string => !!x))];
  return months.length ? months.join(" / ") : undefined;
}

function Metric({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="metric-row"><span className="k">{k}</span><span className="v">{v}</span></div>;
}

function ListPanel({ title, meta, items, rated, editing, addLabel, onChange }: { title: string; meta: string; items: ListItem[]; rated?: boolean; editing: boolean; addLabel: string; onChange: (items: ListItem[]) => void }) {
  const upd = (i: number, patch: Partial<ListItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  return (
    <Card className="panel">
      <div className="panel-head"><div className="main">{title}</div>{meta && <div className="meta">{meta}</div>}</div>
      {!items.length && !editing && <Empty>Nothing recorded.</Empty>}
      {items.map((it, i) => {
        const r = (it.rating ?? "amber") as Light;
        return (
          <div className="item" key={i}>
            {rated ? (editing ? <button type="button" className={`rating rating-${r}`} onClick={() => upd(i, { rating: nextLight[r] })} title="Click to change">{STATUS_LABEL[r]}</button> : <span className={`rating rating-${r}`}>{STATUS_LABEL[r]}</span>) : <span className="star">★</span>}
            <div className="txt">
              <div className="main">{editing ? <TextInput value={it.main} onChange={(v) => upd(i, { main: v })} /> : it.main}</div>
              <div className="meta">{editing ? <TextInput value={it.meta} onChange={(v) => upd(i, { meta: v })} placeholder="Owner / due / detail" /> : it.meta}</div>
            </div>
            {editing && <button type="button" className="btn-del" title="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>}
          </div>
        );
      })}
      {editing && <div className="add-row"><Button size="small" variant="dashed" onClick={() => onChange([...items, rated ? { rating: "amber", main: "New item", meta: "" } : { main: "New highlight", meta: "" }])}>{addLabel}</Button></div>}
    </Card>
  );
}
