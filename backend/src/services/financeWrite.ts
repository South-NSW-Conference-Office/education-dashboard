/**
 * FinanceWriteService — the only way finance figures change.
 * Every write lands on the unit's DRAFT version for the period. Approved versions are never touched.
 */
import { CommentaryNoteModel, FinancialFactModel, FinancialObligationModel, ReceivablesSnapshotModel, ReportedTotalModel } from "@/models";
import { COLUMN_KEYS, COLUMNS, type BoardDocument, type ObligationItem, type RollupResult, type Section } from "@/domain/types";
import { ReportedTotalModel as RT } from "@/models";
import { toMinor } from "@/lib/money";
import { badRequest, conflict } from "@/lib/http";
import { accountCodeFor, extractBoard, groupCodeFor, type Extracted } from "./boardDocument";
import { ensurePeriodByLabel, ensureStructure, getUnit, type Id, type PeriodDoc, type UnitDoc } from "./structure";
import { approve, assertEditable, audit, ensureDraft, type VersionDoc } from "./workflow";
import { loadFinanceInput } from "./financeQuery";
import { rollup } from "./rollup";
import { reconcile } from "./reconciliation";

const NOTE_TYPES = { current: "CURRENT_IMPACT", upcoming: "UPCOMING_IMPACT", strategic: "STRATEGIC_NOTE" } as const;

/** Replace a draft's facts with the lines of an extracted board (exact set: missing lines are removed). */
async function writeFacts(unit: UnitDoc, period: PeriodDoc, version: VersionDoc, ex: Extracted, accountIds: Map<string, Id>): Promise<void> {
  assertEditable(version);
  await FinancialFactModel.deleteMany({ reportVersionId: version._id });
  const docs = [];
  for (const l of ex.lines) {
    for (const k of COLUMN_KEYS) {
      docs.push({
        reportVersionId: version._id, operatingUnitId: unit._id, fiscalPeriodId: period._id,
        accountId: accountIds.get(l.accountCode), accountCode: l.accountCode,
        scenario: COLUMNS[k].scenario, periodBasis: COLUMNS[k].basis, amountMinor: l.amountsMinor[k],
        sourceRowCode: l.sourceCode || null, sourceRowLabel: l.label, sourceGroupCode: l.groupCode,
      });
    }
  }
  if (docs.length) await FinancialFactModel.insertMany(docs);
}

async function writeReportedTotals(version: VersionDoc, ex: Extracted): Promise<void> {
  await ReportedTotalModel.deleteMany({ reportVersionId: version._id });
  if (ex.reportedTotals.length) await ReportedTotalModel.insertMany(ex.reportedTotals.map((t) => ({
    reportVersionId: version._id, metricCode: t.metricCode, reportingGroupCode: t.groupCode ?? null, scenario: t.scenario, periodBasis: t.basis, amountMinor: t.amountMinor,
  })));
}

/**
 * Keep the page-1 figures that came with the report, but where an editor changed a group's
 * lines, accept the new line total as that group's figure. Only the discrepancies that arrived
 * with the source data stay flagged (same rule as the frontend's alignChanged).
 */
async function alignChangedTotals(version: VersionDoc, before: RollupResult, after: RollupResult): Promise<void> {
  const groupsBefore = new Map([...before.income, ...before.expenditure].map((g) => [g.code, g]));
  for (const g of [...after.income, ...after.expenditure]) {
    const b = groupsBefore.get(g.code);
    for (const k of COLUMN_KEYS) {
      if (b && b[k] === g[k]) continue;
      await RT.updateOne(
        { reportVersionId: version._id, metricCode: "GROUP_TOTAL", reportingGroupCode: g.code, scenario: COLUMNS[k].scenario, periodBasis: COLUMNS[k].basis },
        { $set: { amountMinor: g[k] } },
      );
    }
  }
  const pairs: Array<[string, "budget" | "actual", number, number]> = [
    ["EBIDA_ADDBACK", "budget", before.addback.ytdBudget, after.addback.ytdBudget], ["EBIDA_ADDBACK", "actual", before.addback.ytdActual, after.addback.ytdActual],
  ];
  if (after.salarySubline?.computed) for (const k of COLUMN_KEYS) pairs.push(["SALARY_SUBLINE", k as "budget", before.salarySubline?.[k] ?? NaN, after.salarySubline[k]]);
  for (const [metric, k, bv, av] of pairs) {
    if (bv === av) continue;
    await RT.updateOne({ reportVersionId: version._id, metricCode: metric, scenario: COLUMNS[k].scenario, periodBasis: COLUMNS[k].basis }, { $set: { amountMinor: av } });
  }
}

async function writeExtras(unit: UnitDoc, version: VersionDoc, doc: BoardDocument): Promise<void> {
  await ReceivablesSnapshotModel.updateOne(
    { reportVersionId: version._id, receivableType: "FAMILY_DEBTORS" },
    { $set: { operatingUnitId: unit._id, currentMinor: toMinor(doc.priorYear?.debtorsCurrent), priorYearMinor: toMinor(doc.priorYear?.debtorsPrior) } },
    { upsert: true },
  );
  await FinancialObligationModel.deleteMany({ reportVersionId: version._id });
  const obligation = (type: "LOAN" | "LEASE", o: ObligationItem, i: number) => ({
    reportVersionId: version._id, operatingUnitId: unit._id, obligationType: type, name: o.name ?? "", paymentMinor: toMinor(o.payment),
    paymentFrequency: o.frequency ?? "", endsOn: o.ends ?? "", notes: o.notes ?? "", displayOrder: i,
  });
  const obls = [...(doc.loans ?? []).map((o, i) => obligation("LOAN", o, i)), ...(doc.leases ?? []).map((o, i) => obligation("LEASE", o, i))];
  if (obls.length) await FinancialObligationModel.insertMany(obls);

  const notes: Array<[string, string]> = [
    [NOTE_TYPES.current, doc.comments?.current ?? ""], [NOTE_TYPES.upcoming, doc.comments?.upcoming ?? ""], [NOTE_TYPES.strategic, doc.priorYear?.note ?? ""],
  ];
  for (const [noteType, body] of notes) {
    await CommentaryNoteModel.updateOne({ reportVersionId: version._id, noteType }, { $set: { operatingUnitId: unit._id, body } }, { upsert: true });
  }
}

/**
 * Save a whole board document (what the frontend's Save sends). Writes the raw parts to the
 * draft for doc.meta.asAt; with `publish` the draft is approved in the same call.
 */
export async function saveBoardDocument(unitCode: string, doc: BoardDocument, opts: { publish?: boolean; importBatchId?: Id; isPlaceholder?: boolean; copyFrom?: "approved" | "none"; actor?: string; reportedTotals?: "replace" | "align-changed" } = {}) {
  if (!doc?.meta?.asAt) throw badRequest("meta.asAt (e.g. \"June 2026\") is required");
  const unit = await getUnit(unitCode);
  const period = await ensurePeriodByLabel(doc.meta.asAt);
  const ex = extractBoard(doc);
  if (!ex.lines.length && !opts.isPlaceholder) throw badRequest("The board has no line items; nothing to save");
  const { warnings, accountIds } = await ensureStructure(ex);
  const version = await ensureDraft(unit, period, { importBatchId: opts.importBatchId, isPlaceholder: opts.isPlaceholder ?? !!doc.meta.draft, copyFrom: opts.copyFrom });
  const mode = opts.reportedTotals ?? "align-changed";
  const hadTotals = mode === "align-changed" && (await RT.countDocuments({ reportVersionId: version._id })) > 0;
  const before = hadTotals ? rollup((await loadFinanceInput(unit, period, version)).input) : null;
  // Two saves landing on the same draft at once interleave their delete-and-insert passes
  // and collide on the fact indexes. Re-run the whole replace (last writer wins); a save
  // that keeps colliding answers 409 rather than a bare duplicate-key 500.
  for (let attempt = 0; ; attempt++) {
    try {
      await writeFacts(unit, period, version, ex, accountIds);
      if (before) await alignChangedTotals(version, before, rollup((await loadFinanceInput(unit, period, version)).input));
      else await writeReportedTotals(version, ex); // first figures for this period, or an import: the payload's page-1 totals stand
      await writeExtras(unit, version, doc);
      break;
    } catch (err) {
      const code = (err as { code?: number; cause?: { code?: number } }).code ?? (err as { cause?: { code?: number } }).cause?.code;
      if (code !== 11000) throw err;
      if (attempt >= 3) throw conflict("Another save landed on this draft at the same moment; try again");
    }
  }
  await audit("report_version", version._id, "SAVE_BOARD", { actor: opts.actor, after: { lines: ex.lines.length, warnings } });
  let final = version;
  if (opts.publish) final = await approveVersion(unit, period, version, opts.actor);
  return { unit, period, version: final, warnings };
}

export async function approveVersion(unit: UnitDoc, period: PeriodDoc, version: VersionDoc, actor?: string): Promise<VersionDoc> {
  const { input } = await loadFinanceInput(unit, period, version);
  return approve(version, reconcile(rollup(input)), actor);
}

export interface LineItemPatch {
  periodLabel?: string;
  upserts?: Array<{ section: Section; group: string; code?: string; label: string; budget?: number; actual?: number; annualBudget?: number; eoyEstimate?: number }>;
  deletes?: Array<{ code?: string; label?: string }>;
}

/** Granular edit: upsert or delete individual lines on the draft. */
export async function patchLineItems(unitCode: string, patch: LineItemPatch, currentDoc: BoardDocument, actor?: string) {
  const unit = await getUnit(unitCode);
  const doc: BoardDocument = JSON.parse(JSON.stringify(currentDoc));
  if (patch.periodLabel) doc.meta.asAt = patch.periodLabel;
  for (const d of patch.deletes ?? []) {
    const code = d.code ? accountCodeFor({ code: d.code, label: d.label ?? "" }) : null;
    for (const sec of ["income", "expenditure"] as const) for (const g of doc.details[sec]) {
      g.rows = g.rows.filter((r) => !(code ? accountCodeFor(r) === code : r.label === d.label));
    }
  }
  for (const u of patch.upserts ?? []) {
    const sec = u.section === "INCOME" ? "income" : "expenditure";
    const wantGroup = groupCodeFor(u.group);
    let g = doc.details[sec].find((x) => groupCodeFor(x.group) === wantGroup);
    if (!g) { g = { group: u.group, rows: [] }; doc.details[sec].push(g); }
    const code = accountCodeFor({ code: u.code, label: u.label });
    let row = g.rows.find((r) => accountCodeFor(r) === code);
    if (!row) { row = { code: u.code ?? "", label: u.label, budget: 0, actual: 0, annualBudget: 0, eoyEstimate: 0 }; g.rows.push(row); }
    row.label = u.label;
    for (const k of COLUMN_KEYS) if (u[k] !== undefined) row[k] = Number(u[k]) || 0;
  }
  return saveBoardDocument(unit.code, doc, { actor });
}
