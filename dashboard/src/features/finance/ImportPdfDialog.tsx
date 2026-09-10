/**
 * Upload a monthly operating-report PDF and read its figures into the board.
 * The server parses the file into an import batch and sends back what it found; nothing reaches a
 * version until the person has seen the preview and chosen draft or publish.
 */
import { useEffect, useMemo, useState } from "react";
import { usePublishImport, useUploadReportPdf } from "@/hooks/queries";
import { Badge, Banner, Button, Loading, Modal } from "@/components/ui";
import { fmt, signed$ } from "@/lib/format";
import type { Amounts, Board, Category, PdfImport, VersionInfo } from "@/lib/types";

const sum =(cats: Category[]): Amounts => cats.reduce((t, c) => ({ budget: t.budget + c.budget, actual: t.actual + c.actual, annualBudget: t.annualBudget + c.annualBudget, eoyEstimate: t.eoyEstimate + c.eoyEstimate }), { budget: 0, actual: 0, annualBudget: 0, eoyEstimate: 0 });
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/s$/, "");

/** What the upload will do to this school's versions, from what already exists for the period. */
function versionNote(period: string | null, versions: VersionInfo[] | undefined): string {
  if (!period) return "";
  const same = (versions ?? []).filter((v) => v.period === period);
  const draft = same.find((v) => v.status === "DRAFT" || v.status === "IN_REVIEW");
  const approved = same.find((v) => v.status === "APPROVED");
  if (draft) return `Replaces the figures on draft v${draft.versionNo} for ${period}.`;
  if (approved) return `Opens a new version for ${period}; approved v${approved.versionNo} stays in place until you publish.`;
  return `Opens ${period} as a new reporting period for this school.`;
}

export function ImportPdfDialog({ unit, file, current, versions, onClose, onDone }: {
  unit: string; file: File; current: Board | undefined; versions: VersionInfo[] | undefined;
  /** `openDraft` asks the board to open the draft just saved, so it is in front of the person straight away. */
  onClose: () => void; onDone: (message: string, warning: string | undefined, openDraft: boolean) => void;
}) {
  const uploadM = useUploadReportPdf(unit);
  const publishM = usePublishImport(unit);
  const [result, setResult] = useState<PdfImport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    uploadM.mutateAsync(file).then((r) => { if (live) setResult(r); }).catch((e) => { if (live) setError(e instanceof Error ? e.message : "Upload failed"); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const rows = useMemo(() => {
    if (!result) return [];
    const was = (label: string, cats: Category[]) => cats.find((c) => norm(c.label) === norm(label));
    const build = (section: "Income" | "Spending", cats: Category[], currentCats: Category[]) =>
      cats.map((c) => ({ section, ...c, wasActual: was(c.label, currentCats)?.actual ?? null }));
    return [...build("Income", result.board.income, current?.income ?? []), ...build("Spending", result.board.expenditure, current?.expenditure ?? [])];
  }, [result, current]);

  const publish = async (approve: boolean) => {
    if (!result) return;
    try {
      const res = await publishM.mutateAsync({ id: result.import.id, approve });
      const period = result.board.meta.asAt;
      onDone(
        approve ? `Published ${period} as version ${res.version.versionNo}. Every board now uses these figures.` : `Saved ${period} as draft version ${res.version.versionNo}. It is open below: add the commentary, then publish from the bar at the bottom.`,
        res.warnings?.length ? res.warnings.join(" · ") : undefined,
        !approve,
      );
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the import"); }
  };

  const title = `Import ${file.name}`;
  if (error && !result) {
    return (
      <Modal title={title} onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
        <Banner tone="red"><b>Could not read this report.</b> {error}</Banner>
        <p className="hint">The upload expects the monthly Financial Performance report as exported from Excel: the summary on page 1, then the detail pages with account codes.</p>
      </Modal>
    );
  }
  if (!result) {
    return <Modal title={title} onClose={onClose}><Loading what={`figures from ${file.name}`} /></Modal>;
  }

  const blocked = result.errors.length > 0;
  const income = sum(result.board.income), spending = sum(result.board.expenditure);
  const surplus = { actual: income.actual - spending.actual, budget: income.budget - spending.budget };
  const period = result.board.meta.asAt;
  const busy = publishM.isPending;

  return (
    <Modal title={title} onClose={onClose} wide footer={<>
      <span className="hint">A draft leaves the approved figures untouched. Publishing makes these the figures every board shows.</span>
      <Button onClick={onClose} disabled={busy}>Cancel</Button>
      <Button onClick={() => publish(false)} disabled={busy || blocked}>Save as draft</Button>
      <Button variant="primary" onClick={() => publish(true)} disabled={busy || blocked}>{busy ? "Saving…" : "Publish"}</Button>
    </>}>
      <div className="import-meta">
        <span className="pill"><label>Report for</label><b>{result.detected.unitName ?? "not named"}</b></span>
        <span className="pill"><label>As at</label><b>{period || "unknown"}</b></span>
        <span className="pill"><label>Read</label><b>{result.lines} account lines</b></span>
        {current && <span className="pill"><label>Board today</label><b>{current.meta.asAt} · v{current.meta.version}</b></span>}
      </div>
      <p className="hint">{versionNote(period, versions)}</p>

      {result.errors.length > 0 && <Banner tone="red"><b>These figures cannot be used yet.</b><ul>{result.errors.map((e) => <li key={e}>{e}</li>)}</ul></Banner>}
      {result.warnings.length > 0 && <Banner tone="amber"><b>Worth checking before you publish.</b><ul>{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Banner>}
      {error && <Banner tone="red">{error}</Banner>}

      <div className="table-scroll">
        <table className="ftable">
          <thead><tr><th>Category</th><th>YTD budget</th><th>YTD actual</th><th>Change{current ? ` since ${current.meta.asAt}` : ""}</th><th>Annual budget</th><th>EOY estimate</th></tr></thead>
          <tbody>
            {(["Income", "Spending"] as const).map((section) => (
              <SectionRows key={section} section={section} rows={rows.filter((r) => r.section === section)} total={section === "Income" ? income : spending} />
            ))}
            <tr className="surplus"><td>Surplus / (deficit)</td><td>{fmt(surplus.budget)}</td><td>{fmt(surplus.actual)}</td><td /><td>{fmt(income.annualBudget - spending.annualBudget)}</td><td>{fmt(income.eoyEstimate - spending.eoyEstimate)}</td></tr>
            <tr className="ebida"><td colSpan={6}>EBIDA add-back read from page 1: budget {fmt(result.board.addback.ytdBudget)} · actual {fmt(result.board.addback.ytdActual)}</td></tr>
          </tbody>
        </table>
      </div>

      {result.notes.length > 0 && <ul className="notes">{result.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </Modal>
  );
}

function SectionRows({ section, rows, total }: { section: string; rows: Array<Amounts & { label: string; wasActual: number | null }>; total: Amounts }) {
  return (
    <>
      <tr className="section-label"><td colSpan={6}>{section}</td></tr>
      {rows.map((r) => {
        const delta = r.wasActual === null ? null : r.actual - r.wasActual;
        return (
          <tr key={r.label}>
            <td>{r.label}{r.wasActual === null && <Badge tone="muted" title="This category is not on the current board">new</Badge>}</td>
            <td>{fmt(r.budget)}</td>
            <td>{fmt(r.actual)}</td>
            <td className={delta === null ? "" : delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : ""}>{delta === null ? "–" : signed$(delta)}</td>
            <td>{fmt(r.annualBudget)}</td>
            <td>{fmt(r.eoyEstimate)}</td>
          </tr>
        );
      })}
      <tr className="total"><td>Total {section.toLowerCase()}</td><td>{fmt(total.budget)}</td><td>{fmt(total.actual)}</td><td /><td>{fmt(total.annualBudget)}</td><td>{fmt(total.eoyEstimate)}</td></tr>
    </>
  );
}
