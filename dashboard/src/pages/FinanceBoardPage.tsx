/**
 * One school's finance board. Overview is read-only and computed by the server; Details is where
 * figures are entered. Edit mode works on a copy of the board document and saves through PUT /board.
 */
import { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { useBoard, useOverview, useSaveBoard, useUnits, useVersions } from "@/hooks/queries";
import { PageHeader, Pill } from "@/components/layout/PageHeader";
import { Badge, Banner, Button, ErrorState, Loading, useToast } from "@/components/ui";
import { OverviewTab } from "@/features/finance/OverviewTab";
import { DetailsTab } from "@/features/finance/DetailsTab";
import { clone } from "@/lib/editing";
import type { Board } from "@/lib/types";
import { when } from "@/lib/format";

export function FinanceBoardPage({ tab }: { tab: "overview" | "details" }) {
  const { unit = "" } = useParams();
  const units = useUnits();
  const school = units.data?.find((u) => u.code === unit);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Board | null>(null);
  const [hideZeros, setHideZeros] = useState(true);

  // Readers see the latest approved version; an editor opens (or continues) the draft.
  const approved = useBoard(unit, "LATEST_APPROVED");
  const draftBoard = useBoard(unit, "DRAFT", editing);
  const overview = useOverview(unit, "LATEST_APPROVED");
  const versions = useVersions(unit);
  const save = useSaveBoard(unit);
  const toast = useToast();

  useEffect(() => { setEditing(false); setDraft(null); }, [unit]);
  useEffect(() => { if (editing && draftBoard.data && !draft) setDraft(clone(draftBoard.data)); }, [editing, draftBoard.data, draft]);

  if (approved.isLoading || units.isLoading) return <Loading what="finance board" />;
  if (approved.error || !approved.data) return <ErrorState error={approved.error} retry={() => approved.refetch()} />;

  const board = editing && draft ? draft : approved.data;
  const openDraft = versions.data?.find((v) => v.status === "DRAFT" || v.status === "IN_REVIEW");

  const doSave = async (publish: boolean) => {
    if (!draft) return;
    try {
      const res = await save.mutateAsync({ board: draft, publish });
      toast(publish ? `Published as version ${res.saved?.versionNo ?? ""}. Every board now uses these figures.` : `Draft saved (version ${res.saved?.versionNo ?? ""}). Readers still see the approved figures.`);
      if (res.warnings?.length) toast(res.warnings.join(" · "), "warn");
      setEditing(false); setDraft(null);
    } catch (e) { toast(e instanceof Error ? e.message : "Save failed", "warn"); }
  };

  const status = board.meta.status;
  return (
    <>
      <PageHeader
        eyebrow={`Finance · ${school?.type === "EARLY_LEARNING_CENTRE" ? "Early learning centre" : "School"} · ${school?.location ?? ""}`}
        title={board.meta.unitName}
        pills={<>
          <Pill label="As at">{editing && draft ? <input className="pill-input" value={draft.meta.asAt} onChange={(e) => setDraft({ ...draft, meta: { ...draft.meta, asAt: e.target.value } })} /> : board.meta.asAt}</Pill>
          <Pill label="Version" title={board.meta.approvedAt ? `Approved ${when(board.meta.approvedAt)}` : `Last saved ${when(board.meta.lastSaved)}`}>
            v{board.meta.version} · {status === "APPROVED" ? "approved" : status.toLowerCase().replace("_", " ")}
            {!editing && openDraft && <> <Badge tone="amber" title="A draft is open; choose Edit to continue it">draft v{openDraft.versionNo} open</Badge></>}
          </Pill>
        </>}
        actions={editing ? <>
          <Button variant="primary" onClick={() => doSave(true)} disabled={save.isPending}>Save &amp; publish</Button>
          <Button onClick={() => doSave(false)} disabled={save.isPending}>Save draft</Button>
          <Button onClick={() => { setEditing(false); setDraft(null); }}>Cancel</Button>
        </> : <>
          <Button variant="primary" onClick={() => setEditing(true)}>✎ Edit board</Button>
          <Button onClick={() => window.print()}>Print</Button>
        </>}
        tabs={<>
          <div className="tabs">
            <NavLink end to={`/finance/${unit}`} className="tab">Overview</NavLink>
            <NavLink to={`/finance/${unit}/details`} className="tab">Details <small>every line item</small></NavLink>
          </div>
          {tab === "details" && !editing && <div className="tab-tools"><button type="button" className={`toggle${hideZeros ? "" : " on"}`} onClick={() => setHideZeros((h) => !h)}>{hideZeros ? "Show empty lines" : "Hide empty lines"}</button></div>}
        </>}
      />

      {board.meta.placeholder && <Banner tone="amber"><b>Placeholder figures.</b> This board's numbers are for layout only and were not taken from an operating report. Replace them before sharing.</Banner>}
      {editing && (tab === "overview"
        ? <Banner tone="green"><b>Edit mode.</b> Every figure on this tab is calculated from the Details tab. Only the period, loans, leases, family debtors and notes are typed here.</Banner>
        : <Banner tone="green"><b>Edit mode.</b> Type into any line, or add and remove lines. Group subtotals update as you go; the Overview, the summary and the databoard update when you save.</Banner>)}
      {editing && draftBoard.isLoading && <Loading what="draft" />}

      {tab === "overview"
        ? <OverviewTab unit={unit} board={board} overview={overview.data} editing={editing} onChange={(b) => setDraft(b)} />
        : <DetailsTab board={board} editing={editing} hideZeros={hideZeros} onChange={(b) => setDraft(b)} />}

      <div className="foot">Adventist Education South New South Wales · Figures are indicative — the operating statement remains the authoritative record.</div>
    </>
  );
}
