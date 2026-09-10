/**
 * Weekly education databoard. Judgement fields are typed; Finance and Overall lights, the operating
 * result and each school's budget and variance arrive already derived from the finance boards.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDataboard, useSaveDataboard } from "@/hooks/queries";
import { PageHeader, Pill } from "@/components/layout/PageHeader";
import { Sparkline, enrolDelta } from "@/components/charts";
import { Badge, Banner, Button, Card, Chip, Empty, ErrorState, Loading, NumberInput, SectionHead, TextInput, TrafficLight, nextLight, useToast } from "@/components/ui";
import { clone } from "@/lib/editing";
import { compact$, STATUS_LABEL, when } from "@/lib/format";
import type { Databoard, Light, ListItem } from "@/lib/types";

const COLS = [
  { key: "overall", label: "Overall" }, { key: "finance", label: "Finance" }, { key: "enrolments", label: "Enrolments" },
  { key: "staffing", label: "Staffing" }, { key: "buildings", label: "Buildings" }, { key: "whs", label: "WHS & Risk" },
] as const;

export function DataboardPage() {
  const q = useDataboard();
  const save = useSaveDataboard();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Databoard | null>(null);
  useEffect(() => { if (!editing) setDraft(null); }, [editing]);

  if (q.isLoading) return <Loading what="weekly databoard" />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = editing && draft ? draft : q.data;
  const set = (fn: (x: Databoard) => void) => { const c = clone(d); fn(c); setDraft(c); };

  const doSave = async (publish: boolean) => {
    if (!draft) return;
    try {
      await save.mutateAsync({ weekEnding: draft.weekEnding, doc: draft, publish });
      toast(publish ? "Databoard published." : "Databoard saved as a draft.");
      setEditing(false);
    } catch (e) { toast(e instanceof Error ? e.message : "Save failed", "warn"); }
  };

  return (
    <>
      <PageHeader eyebrow="Education · South New South Wales" title="Weekly education databoard"
        pills={<>
          <Pill label="Week ending">{editing && draft ? <input className="pill-input" value={draft.weekEnding} onChange={(e) => set((x) => { x.weekEnding = e.target.value; })} /> : d.weekEnding}</Pill>
          <Pill label="Status" title={d.lastUpdated ? `Updated ${when(d.lastUpdated)}` : undefined}>{d.status === "PUBLISHED" ? "Published" : "Draft"}</Pill>
        </>}
        actions={editing ? <>
          <Button variant="primary" onClick={() => doSave(true)} disabled={save.isPending}>Save &amp; publish</Button>
          <Button onClick={() => doSave(false)} disabled={save.isPending}>Save draft</Button>
          <Button onClick={() => setEditing(false)}>Cancel</Button>
        </> : <>
          <Button variant="primary" onClick={() => { setDraft(clone(q.data!)); setEditing(true); }}>✎ Edit board</Button>
          <Button onClick={() => window.print()}>Print</Button>
        </>} />

      {editing && <Banner tone="green"><b>Edit mode.</b> Type into any figure or note and click the Enrolments, Staffing, Buildings and WHS lights to cycle them. The Overall and Finance lights, the operating result and each school's budget and variance are calculated and cannot be changed here.</Banner>}

      {/* At a glance */}
      <section className="section">
        <SectionHead title="At a glance" hint={`${d.matrix.length} sites · six health measures · ${editing ? "click a light to change it" : "click a school to open its finance board"}`} />
        <Card solid className="scroll-x">
          <table className="matrix">
            <thead><tr><th>School</th>{COLS.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>
              {d.matrix.map((r, ri) => {
                const school = d.schools.find((s) => s.unit === r.unit);
                return (
                  <tr key={r.unit}>
                    <td className="school-name"><i className="swatch" style={{ background: school?.colour ?? "var(--accent)" }} /><div>{editing ? r.school : <Link to={`/finance/${r.unit}`}>{r.school}</Link>}<small>{r.sub}</small></div></td>
                    {COLS.map((c) => {
                      const st = (r.status[c.key] ?? "green") as Light;
                      const derived = c.key === "overall" || (c.key === "finance" && r.derived.finance);
                      const note = r.notes[c.key] ?? "";
                      return (
                        <td key={c.key}>
                          {derived
                            ? <TrafficLight colour={st} title={`${STATUS_LABEL[st]} — ${c.key === "overall" ? "worst of the five measures" : "from the finance board"}`} />
                            : <TrafficLight colour={st} onCycle={editing ? () => set((x) => { (x.matrix[ri].status as Record<string, Light>)[c.key] = nextLight[st]; }) : undefined} />}
                          {derived && editing && <span className="auto-chip"><Badge tone="blue">auto</Badge></span>}
                          {c.key === "finance" && r.derived.financeVariance != null && (
                            <span className="auto-chip"><Chip colour={r.derived.financeVariance >= 0 ? "green" : "red"} title={`Finance board (${r.derived.asAt}): surplus ${compact$(r.derived.surplus ?? 0)}`}>{r.derived.financeVariance >= 0 ? "+" : "−"}{compact$(Math.abs(r.derived.financeVariance))} vs budget</Chip></span>
                          )}
                          {editing ? <input className="cell-note-input" value={note} placeholder="note" onChange={(e) => set((x) => { x.matrix[ri].notes[c.key] = e.target.value; })} />
                            : note && <span className="cell-note">{note}</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="light-legend"><span><i className="light light-green mini" />On track</span><span><i className="light light-amber mini" />Watch</span><span><i className="light light-red mini" />Action needed</span><span className="legend-note">Overall = worst of the five measures · Finance = from the school's finance board</span></div>
        </Card>
      </section>

      {/* Cash position */}
      <section className="section">
        <SectionHead title="SNSW cash position" hint="Consolidated across all schools" />
        <div className="grid4">
          {d.cash.map((c, i) => (
            <div key={i} className={`card cash-cell${c.feature ? " kpi-feature" : ""}`} title={c.derived ? "Sum of the YTD surplus on each school's finance board" : undefined}>
              <label>{editing && !c.derived ? <TextInput value={c.label} onChange={(v) => set((x) => { x.cash[i].label = v; })} /> : c.label}{c.derived && <Badge tone="blue" title="Calculated from the finance boards">auto</Badge>}</label>
              <div className="fig">{editing && !c.derived ? <TextInput value={c.value} onChange={(v) => set((x) => { x.cash[i].value = v; })} /> : c.value}</div>
              <div className="delta">{editing && !c.derived ? <TextInput value={c.delta} onChange={(v) => set((x) => { x.cash[i].delta = v; })} /> : c.delta}</div>
            </div>
          ))}
        </div>
      </section>

      {/* School snapshots */}
      <section className="section">
        <SectionHead title="School snapshots" hint="Budget · buildings · staffing · enrolments" />
        <div className="schools-grid">
          {d.schools.map((s, i) => (
            <div className="card school-card" key={s.unit}>
              <div className="head" style={{ background: `linear-gradient(120deg, ${s.colour ?? "var(--accent)"}, color-mix(in srgb, ${s.colour ?? "var(--accent)"} 75%, black))` }}>
                <div><h3>{s.name}</h3><div className="loc">{s.loc}</div></div>
                <TrafficLight colour={s.overall} size="ov" title={`Overall: ${STATUS_LABEL[s.overall]} (from the at-a-glance row)`} />
              </div>
              <div className="body">
                <Metric k="Budget" v={s.budget ? <span className="catcell"><TrafficLight colour={s.finance && s.finance.surplus >= 0 ? "green" : "red"} size="mini" />{s.budget}<Badge tone="blue">auto</Badge></span> : <span className="muted">no finance board</span>} />
                <Metric k="Variance" v={s.variance ? <><span className={`c-${s.finance && s.finance.variance >= 0 ? "green" : "red"}`}>{s.variance}</span><Badge tone="blue">auto</Badge></> : "—"} />
                <div className="metric-row col">
                  <div className="between"><span className="k">Building project</span><span className="v">{editing ? <TextInput value={s.project} onChange={(v) => set((x) => { x.schools[i].project = v; })} /> : s.project}</span></div>
                  <div className="progress" title={`${s.project}: ${s.progress}% complete`}><i style={{ width: `${Math.max(0, Math.min(100, s.progress))}%` }} /></div>
                  <div className="between mt4"><span className="k">Progress</span><span className="v">{editing ? <NumberInput value={s.progress} min={0} max={100} onChange={(v) => set((x) => { x.schools[i].progress = v; })} /> : `${s.progress}%`}</span></div>
                </div>
                <Metric k="Loan balance" v={editing ? <TextInput value={s.loan} onChange={(v) => set((x) => { x.schools[i].loan = v; })} /> : s.loan} />
                <Metric k="Payments" v={editing ? <TextInput value={s.payments} onChange={(v) => set((x) => { x.schools[i].payments = v; })} /> : s.payments} />
                <Metric k="Staffing" v={editing ? <TextInput value={s.staffing} onChange={(v) => set((x) => { x.schools[i].staffing = v; })} /> : s.staffing} />
                <div className="enrol">
                  <div className="enrol-top"><span className="k">Enrolments</span><span className="enrol-now">{s.enrolTrend.length ? s.enrolTrend[s.enrolTrend.length - 1] : "—"} {enrolDelta(s.enrolTrend)}</span></div>
                  <Sparkline values={s.enrolTrend} label={s.enrolLabel} />
                  {editing ? <>
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
          <ListPanel title="Risk register" meta="Owner and status for each open risk" items={d.risks} rated editing={editing} addLabel="+ Add risk" onChange={(items) => set((x) => { x.risks = items; })} />
          <ListPanel title="WHS items" meta="Work health & safety actions" items={d.whs} rated editing={editing} addLabel="+ Add WHS item" onChange={(items) => set((x) => { x.whs = items; })} />
        </div>
      </section>

      <section className="section">
        <SectionHead title="Connection & celebration" hint="The good news worth sharing" />
        <ListPanel title="Wins this week" meta="" items={d.celebrate} editing={editing} addLabel="+ Add a win" onChange={(items) => set((x) => { x.celebrate = items; })} />
      </section>
    </>
  );
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
