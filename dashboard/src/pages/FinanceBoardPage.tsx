/**
 * One school's finance board. Overview is read-only and computed by the server; Details is where
 * figures are entered. Editing works on a copy of the board document and saves through PUT /board:
 * on Details a line's pencil opens that copy silently, on Overview the Edit board button does.
 */
import { useEffect, useRef, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { useBoard, useOverview, useSaveBoard, useUnits, useVersions } from "@/hooks/queries";
import { PageHeader, Pill } from "@/components/layout/PageHeader";
import { PeriodPicker } from "@/components/PeriodPicker";
import { Badge, Banner, Button, Card, ErrorState, Loading, SaveBar, useToast } from "@/components/ui";
import { OverviewTab } from "@/features/finance/OverviewTab";
import { DetailsTab } from "@/features/finance/DetailsTab";
import { ImportPdfDialog } from "@/features/finance/ImportPdfDialog";
import { TimelineCard } from "@/features/finance/TimelineCard";
import { usePeriod } from "@/hooks/usePeriod";
import { useAccess } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { clone, countChangedRows } from "@/lib/editing";
import { LATEST } from "@/lib/period";
import type { Board, VersionInfo } from "@/lib/types";
import { when } from "@/lib/format";
import { BoardMenu, usePresentation } from "@/components/BoardMenu";

export function FinanceBoardPage({ tab }: { tab: "overview" | "details" }) {
  const { presenting, setPresenting } = usePresentation();
  const { unit = "" } = useParams();
  const units = useUnits();
  // The shared reporting period. Every read below follows it; editing pins it until the session ends.
  const { selection, setSelection, label: periodLabel } = usePeriod();
  const school = units.data?.find((u) => u.code === unit);
  const can = useAccess();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Board | null>(null);
  const [baseline, setBaseline] = useState<Board | null>(null);
  const [hideZeros, setHideZeros] = useState(true);
  // The period's pre-edit value, held so its own cancel can put it back. null = not being edited.
  const [periodEdit, setPeriodEdit] = useState<string | null>(null);
  // An operating-report PDF chosen for upload; the dialog reads it and offers draft or publish.
  const [pdf, setPdf] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // When editing began: only a draft fetched after that is taken, never a stale cached copy.
  const [openedAt, setOpenedAt] = useState(0);

  // Readers see the latest approved version; an editor opens (or continues) the draft.
  const approved = useBoard(unit, "LATEST_APPROVED");
  const draftBoard = useBoard(unit, "DRAFT", editing);
  // The KPIs follow whatever board is on screen: the draft while editing (falls back to approved if none), else approved.
  const overview = useOverview(unit, editing ? "DRAFT" : "LATEST_APPROVED");
  const versions = useVersions(unit);
  const save = useSaveBoard(unit);
  const toast = useToast();

  useEffect(() => { setEditing(false); setDraft(null); setBaseline(null); setPeriodEdit(null); setPdf(null); }, [unit, selection]);
  useEffect(() => {
    if (editing && draftBoard.data && !draft && draftBoard.dataUpdatedAt >= openedAt) { setDraft(clone(draftBoard.data)); setBaseline(clone(draftBoard.data)); }
  }, [editing, draftBoard.data, draftBoard.dataUpdatedAt, draft, openedAt]);

  // Line edits get a count; everything else typed on the Overview just reads as unsaved.
  const changedLines = draft && baseline ? countChangedRows(baseline, draft) : 0;
  const dirty = !!draft && !!baseline && JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const onBeginEdit = () => { setOpenedAt(Date.now()); setEditing(true); };
  const endSession = () => { setEditing(false); setDraft(null); setBaseline(null); setPeriodEdit(null); };

  // No approved board in the selected period is an ordinary state, not a failure: the month may
  // only hold a draft, or nothing yet. A draft session may still open it, so this is not a return yet.
  const missing = approved.error instanceof ApiError && approved.error.status === 404;
  // Under a single month only that month's draft counts; otherwise any open draft may be picked up.
  const openDraft = versions.data?.find((v) => (v.status === "DRAFT" || v.status === "IN_REVIEW") && (selection.kind !== "month" || v.period === selection.label));

  // isPending, not isLoading: a retry paused while the tab is in the background has no data yet either.
  if (approved.isPending || units.isPending) return <Loading what="finance board" />;
  if (approved.error && !missing) return <ErrorState error={approved.error} retry={() => approved.refetch()} />;
  if (missing && (!editing || draftBoard.error)) return (
    <NoBoard name={school?.name ?? unit} eyebrow={eyebrowFor(school)} period={periodLabel} single={selection.kind === "month"}
      draft={can("boards.edit") ? openDraft : undefined}
      onOpenDraft={onBeginEdit} onLatest={() => setSelection(LATEST)} />
  );
  if (missing && !draft) return <Loading what="draft" />;

  const board = (editing && draft ? draft : approved.data)!;
  const editable = editing && !!draft;

  const doSave = async (publish: boolean) => {
    if (!draft) return;
    try {
      const res = await save.mutateAsync({ board: draft, publish });
      toast(publish ? `Published as version ${res.saved?.versionNo ?? ""}. Every board now uses these figures.` : `Draft saved (version ${res.saved?.versionNo ?? ""}). Readers still see the approved figures.`);
      if (res.warnings?.length) toast(res.warnings.join(" · "), "warn");
      endSession();
    } catch (e) { toast(e instanceof Error ? e.message : "Save failed", "warn"); }
  };

  const discard = () => {
    if (dirty && !confirm("Discard the unsaved changes and go back to the approved figures?")) return;
    endSession();
  };

  const status = board.meta.status;
  return (
    <>
      <PageHeader
        eyebrow={eyebrowFor(school)}
        title={board.meta.unitName}
        pills={<>
          {/* Reading: the shared period picker, noting the month the board actually is as at. Editing: the
              draft's own period, which the pencil lets you retype (that is the month the draft saves under). */}
          {editing ? (
            <Pill label="Draft as at">
              {periodEdit !== null && editable && draft ? <>
                <input className="pill-input" value={draft.meta.asAt} aria-label="Reporting period" autoFocus
                  onChange={(e) => setDraft({ ...draft, meta: { ...draft.meta, asAt: e.target.value } })} />
                <span className="rowacts">
                  <button type="button" className="rowbtn ok" title="Keep this period" aria-label="Keep this period" onClick={() => setPeriodEdit(null)}>✓</button>
                  <button type="button" className="rowbtn no" title="Cancel" aria-label="Cancel editing the period" onClick={() => { setDraft({ ...draft, meta: { ...draft.meta, asAt: periodEdit } }); setPeriodEdit(null); }}>✕</button>
                </span>
              </> : <>
                {board.meta.asAt}
                <button type="button" className="rowbtn pencil pill-pencil" title="Edit the reporting period" aria-label="Edit the reporting period"
                  onClick={() => setPeriodEdit(board.meta.asAt)}>✎</button>
              </>}
            </Pill>
          ) : (
            <PeriodPicker note={selection.kind !== "month" ? board.meta.asAt : undefined}
              extra={can("boards.edit") ? <button type="button" className="rowbtn pencil pill-pencil" title="Open a draft and change its reporting period" aria-label="Open a draft and change its reporting period"
                onClick={() => { onBeginEdit(); setPeriodEdit(board.meta.asAt); }}>✎</button> : undefined} />
          )}
          <Pill label="Version" title={board.meta.approvedAt ? `Approved ${when(board.meta.approvedAt)}` : `Last saved ${when(board.meta.lastSaved)}`}>
            v{board.meta.version} · {status === "APPROVED" ? "approved" : status.toLowerCase().replace("_", " ")}
            {!editing && openDraft && can("boards.edit") && <> <Badge tone="amber" title={`Open draft v${openDraft.versionNo}${openDraft.period ? ` (${openDraft.period})` : ""} to review, edit and publish it`} onClick={onBeginEdit}>draft v{openDraft.versionNo}{openDraft.period ? ` · ${openDraft.period}` : ""} · open ›</Badge></>}
            {dirty && <> <Badge tone="amber" title="Edited but not saved">unsaved</Badge></>}
          </Pill>
        </>}
        actions={<>
          {presenting ? <Button onClick={() => setPresenting(false)}>Exit presentation</Button> : <BoardMenu items={[
            { label: "Present", action: () => setPresenting(true) },
            ...(can("imports.write") ? [{ label: "Upload report PDF", action: () => fileInput.current?.click(), disabled: editing }] : []),
            { label: "Print", action: () => window.print() },
          ]} />}
          {can("imports.write") && <>
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-hidden="true"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setPdf(f); e.target.value = ""; }} />
          </>}
        </>}
        tabs={<>
          <div className="tabs">
            <NavLink end to={`/finance/${unit}`} className="tab">Overview</NavLink>
            <NavLink to={`/finance/${unit}/details`} className="tab">Line items</NavLink>
          </div>
        </>}
      />

      {board.meta.placeholder && <Banner tone="amber"><b>Placeholder figures.</b> This board's numbers are for layout only and were not taken from an operating report. Replace them before sharing.</Banner>}
      {editable && status !== "APPROVED" && <Banner tone="amber"><b>You are editing draft v{board.meta.version}.</b> It was opened earlier and readers still see the approved figures until it is published.</Banner>}
      {editing && draftBoard.isLoading && <Loading what="draft" />}

      {tab === "overview"
        ? <OverviewTab unit={unit} board={board} overview={overview.data} editable={editable} onChange={(b) => setDraft(b)} onBeginEdit={onBeginEdit} />
        : <DetailsTab board={board} editable={editable} hideZeros={hideZeros} onToggleZeros={() => setHideZeros((h) => !h)} onChange={(b) => setDraft(b)} onBeginEdit={onBeginEdit} />}
      {tab === "overview" && !editing && <TimelineCard unit={unit} />}

      {/* Also shown for an unchanged open draft, which still needs a way to be published. */}
      {editable && (dirty || status !== "APPROVED") && (
        <SaveBar
          label={dirty ? (changedLines > 0 ? `${changedLines} line${changedLines === 1 ? "" : "s"} edited` : "Unsaved changes") : `Draft v${board.meta.version} saved, not published`}
          discardLabel={dirty ? "Discard" : "Close"}
          saving={save.isPending} onSaveDraft={() => doSave(false)} onPublish={() => doSave(true)} onDiscard={discard} />
      )}

      {pdf && (
        <ImportPdfDialog unit={unit} file={pdf} current={approved.data ?? board} versions={versions.data} onClose={() => setPdf(null)}
          onDone={(message, warning, openDraft) => { toast(message); if (warning) toast(warning, "warn"); setPdf(null); endSession(); if (openDraft) onBeginEdit(); }} />
      )}

      <div className="foot">Adventist Education South New South Wales · Figures are indicative — the operating statement remains the authoritative record.</div>
    </>
  );
}

const eyebrowFor = (school?: { type: string; location: string }) =>
  `Finance · ${school?.type === "EARLY_LEARNING_CENTRE" ? "Early learning centre" : "School"} · ${school?.location ?? ""}`;

/** The page when the selected period holds no approved board for this school. */
function NoBoard({ name, eyebrow, period, single, draft, onOpenDraft, onLatest }: {
  name: string; eyebrow: string; period: string; single: boolean; draft?: VersionInfo; onOpenDraft: () => void; onLatest: () => void;
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={name} pills={<PeriodPicker />} />
      <Card accent="amber" className="noboard">
        <h2 className="h-amber">No approved board {single ? `for ${period}` : `inside ${period}`}</h2>
        <p className="intro">
          {draft
            ? <>{name} has draft v{draft.versionNo}{draft.period ? ` for ${draft.period}` : ""} but nothing published {single ? "for this month" : "in this range"}. Open the draft to review and publish it, or choose another period above.</>
            : <>{name} has not reported {single ? `for ${period}` : `between ${period}`} yet. Choose another period above, upload that month's operating report, or go back to the latest board.</>}
        </p>
        <div className="acts">
          {draft && <Button variant="primary" onClick={onOpenDraft}>Open draft v{draft.versionNo}</Button>}
          <Button variant={draft ? "ghost" : "primary"} onClick={onLatest}>Show latest board</Button>
        </div>
      </Card>
    </>
  );
}
