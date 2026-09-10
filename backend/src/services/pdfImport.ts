/**
 * PdfImportService — a monthly operating-report PDF into an import payload.
 * Parses the file, works out which school and period it belongs to, and carries across the parts
 * of the board the report does not carry (commentary, loans, leases, family debtors).
 */
import { createHash } from "node:crypto";
import { FiscalPeriodModel, ImportBatchModel } from "@/models";
import type { BoardDocument, ObligationItem } from "@/domain/types";
import { badRequest } from "@/lib/http";
import { extractPdfText } from "@/lib/pdf";
import { toDollars } from "@/lib/money";
import { loadExtras } from "./financeQuery";
import { detectUnit, parseOperatingReport, toBoardDocument } from "./pdfReport";
import { findPeriodByLabel, getUnit, listUnits, parsePeriodLabel, type UnitDoc } from "./structure";
import { latestApproved, openDraft } from "./workflow";

export interface PdfImportPrepared {
  unit: UnitDoc;
  board: BoardDocument;
  detected: { unitName: string | null; unitCode: string | null; period: string | null };
  /** things to check before trusting the figures */
  warnings: string[];
  /** what happened, for the person reading the preview */
  notes: string[];
  /** what stops the figures being used */
  errors: string[];
  checksum: string;
}

/** Parse the PDF and resolve the unit; `unitCode` is where it was uploaded from and must agree with the report's title. */
export async function preparePdfImport(bytes: Uint8Array, opts: { unitCode?: string | null; fileName?: string | null } = {}): Promise<PdfImportPrepared> {
  const pages = await extractPdfText(bytes);
  const parsed = parseOperatingReport(pages);
  const { board, warnings: boardWarnings, notes: boardNotes } = toBoardDocument(parsed);
  const warnings = [...parsed.warnings, ...boardWarnings];
  const notes: string[] = [...boardNotes];
  const errors = [...parsed.errors];
  const title = parsed.unitName ?? parsed.headerLines[0] ?? "no title";

  const detected = detectUnit(parsed.headerLines, await listUnits());
  let unit: UnitDoc;
  if (opts.unitCode) {
    unit = await getUnit(opts.unitCode);
    if (detected && detected.code !== unit.code) throw badRequest(`This looks like the report for ${detected.name} ("${title}"), not ${unit.name}. Upload it from that school's finance board.`);
    if (!detected) warnings.push(`The report's title ("${title}") does not name a school; the figures will go to ${unit.name} because it was uploaded there`);
  } else if (detected) {
    unit = detected;
  } else {
    throw badRequest(`Could not tell which school this report is for ("${title}"). Upload it from that school's finance board.`);
  }
  if (board.meta.asAt) parsePeriodLabel(board.meta.asAt);
  board.meta.unit = unit.code;

  const checksum = createHash("sha256").update(bytes).digest("hex");
  const earlier = await ImportBatchModel.findOne({ checksum, status: { $ne: "FAILED" } }).sort({ createdAt: -1 }).lean();
  if (earlier) notes.push(`This same file was uploaded before (${earlier.createdAt?.toLocaleString("en-AU") ?? "earlier"}${earlier.status === "PUBLISHED" ? ", and published" : ""})`);

  if (!errors.length) await carryOver(unit, board, notes);
  return { unit, board, detected: { unitName: parsed.unitName, unitCode: detected?.code ?? null, period: parsed.periodLabel }, warnings, notes, errors, checksum };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What the report does not carry comes from the boards already held. Commentary and typed family
 * debtors come from the board for the same period (so re-uploading the final report keeps what was
 * typed). Loans and leases the report knows about are taken from the report; any others (typed by
 * hand, with their schedules) are kept from the same period's board, else the latest approved one.
 */
async function carryOver(unit: UnitDoc, board: BoardDocument, notes: string[]): Promise<void> {
  const period = board.meta.asAt ? await findPeriodByLabel(board.meta.asAt) : null;
  const same = period ? (await openDraft(unit, period)) ?? (await latestApproved(unit, period)) : null;
  const src = same ?? (await latestApproved(unit));
  if (!src) { notes.push("This school has no earlier board: add the commentary on the board after importing"); return; }

  const x = await loadExtras(src);
  const label = (await FiscalPeriodModel.findById(src.fiscalPeriodId).lean())?.label ?? "an earlier period";
  const obligations = (t: "LOAN" | "LEASE"): ObligationItem[] => x.obligations.filter((o) => o.obligationType === t).map((o) => ({ name: o.name, payment: toDollars(o.paymentMinor), frequency: o.paymentFrequency, ends: o.endsOn, notes: o.notes }));
  const extra = (mine: ObligationItem[], held: ObligationItem[]) => held.filter((h) => !mine.some((m) => sameName(m.name, h.name)));
  const extraLoans = extra(board.loans, obligations("LOAN")), extraLeases = extra(board.leases, obligations("LEASE"));
  board.loans = [...board.loans, ...extraLoans];
  board.leases = [...board.leases, ...extraLeases];
  const kept = [...extraLoans, ...extraLeases];
  if (kept.length) notes.push(`${kept.map((o) => `"${o.name}"`).join(", ")} kept from the ${label} board, as the report has no line for ${kept.length === 1 ? "it" : "them"}`);

  if (same) {
    const note = (t: string) => x.notes.find((n) => n.noteType === t)?.body ?? "";
    board.comments = { current: note("CURRENT_IMPACT"), upcoming: note("UPCOMING_IMPACT") };
    const typedDebtors = (x.receivables?.currentMinor ?? 0) !== 0 || (x.receivables?.priorYearMinor ?? 0) !== 0;
    if (typedDebtors) board.priorYear = { debtorsCurrent: toDollars(x.receivables?.currentMinor), debtorsPrior: toDollars(x.receivables?.priorYearMinor), note: note("STRATEGIC_NOTE") || board.priorYear.note };
    notes.push(`Commentary${typedDebtors ? " and family debtors" : ""} kept from the ${label} board already held (version ${src.versionNo})`);
  } else {
    notes.push("Commentary starts blank: write this month's on the board before publishing");
  }
}
