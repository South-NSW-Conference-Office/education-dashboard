/**
 * FinanceQueryService — load one unit's board (or every unit's) and run the maths.
 * This is the single read path used by the board, overview, summary and databoard presenters.
 */
import {
  CommentaryNoteModel, FinancialFactModel, FinancialObligationModel, FiscalPeriodModel, ReceivablesSnapshotModel,
  ReconciliationCheckModel, ReportedTotalModel,
} from "@/models";
import type { FinanceInput, PeriodBasis, ReconciliationItem, RollupResult, Scenario } from "@/domain/types";
import { notFound } from "@/lib/http";
import { rollup } from "./rollup";
import { reconcile } from "./reconciliation";
import { consolidate, type Consolidated, type UnitResult } from "./consolidation";
import { findPeriodByLabel, getUnit, listUnits, loadStructure, type PeriodDoc, type Structure, type UnitDoc } from "./structure";
import { latestApproved, openDraft, type VersionDoc } from "./workflow";

export type VersionMode = "LATEST_APPROVED" | "DRAFT";
export interface ReadOptions { periodLabel?: string | null; versionMode?: VersionMode }

export interface ObligationDoc { _id: unknown; obligationType: "LOAN" | "LEASE"; name: string; paymentMinor: number; paymentFrequency: string; endsOn: string; notes: string; displayOrder: number }
export interface Extras {
  receivables: { currentMinor: number; priorYearMinor: number } | null;
  obligations: ObligationDoc[];
  notes: Array<{ noteType: string; body: string; severity: string; status: string }>;
  storedChecks: Array<{ _id: unknown; checkCode: string; label: string; column: string; expectedMinor: number; actualMinor: number; differenceMinor: number; status: string; explanation: string | null }>;
}
export interface UnitBoard {
  unit: UnitDoc; period: PeriodDoc; version: VersionDoc; structure: Structure;
  input: FinanceInput; rollup: RollupResult; reconciliation: ReconciliationItem[]; extras: Extras;
}

/** Which version a reader or editor should see. DRAFT mode falls back to the approved one if no draft is open. */
export async function resolveVersion(unit: UnitDoc, opts: ReadOptions): Promise<VersionDoc | null> {
  const period = opts.periodLabel ? await findPeriodByLabel(opts.periodLabel) : undefined;
  if (opts.periodLabel && !period) return null;
  const p = period ?? undefined;
  if (opts.versionMode === "DRAFT") return (await openDraft(unit, p)) ?? (await latestApproved(unit, p));
  return latestApproved(unit, p);
}

export async function loadFinanceInput(unit: UnitDoc, period: PeriodDoc, version: VersionDoc, structure?: Structure): Promise<{ input: FinanceInput; structure: Structure }> {
  const st = structure ?? (await loadStructure(period.endsOn));
  const [facts, totals] = await Promise.all([
    FinancialFactModel.find({ reportVersionId: version._id }).lean(),
    ReportedTotalModel.find({ reportVersionId: version._id }).lean(),
  ]);
  return {
    structure: st,
    input: {
      unitCode: unit.code, periodLabel: period.label,
      facts: facts.map((f) => ({ accountCode: f.accountCode, scenario: f.scenario as Scenario, basis: f.periodBasis as PeriodBasis, amountMinor: f.amountMinor })),
      accounts: st.accounts, groups: st.groups, mappings: st.mappings, metrics: st.metrics,
      reportedTotals: totals.map((t) => ({ metricCode: t.metricCode as "GROUP_TOTAL", groupCode: t.reportingGroupCode ?? undefined, scenario: t.scenario as Scenario, basis: t.periodBasis as PeriodBasis, amountMinor: t.amountMinor })),
    },
  };
}

export async function loadExtras(version: VersionDoc): Promise<Extras> {
  const [recv, obl, notes, checks] = await Promise.all([
    ReceivablesSnapshotModel.findOne({ reportVersionId: version._id, receivableType: "FAMILY_DEBTORS" }).lean(),
    FinancialObligationModel.find({ reportVersionId: version._id }).sort({ obligationType: 1, displayOrder: 1 }).lean(),
    CommentaryNoteModel.find({ reportVersionId: version._id }).lean(),
    ReconciliationCheckModel.find({ reportVersionId: version._id }).lean(),
  ]);
  return {
    receivables: recv ? { currentMinor: recv.currentMinor, priorYearMinor: recv.priorYearMinor } : null,
    obligations: obl as unknown as ObligationDoc[],
    notes: notes.map((n) => ({ noteType: n.noteType, body: n.body, severity: n.severity, status: n.status })),
    storedChecks: checks as unknown as Extras["storedChecks"],
  };
}

/** Load one unit's board end to end. */
export async function loadUnitBoard(unitCode: string, opts: ReadOptions = {}): Promise<UnitBoard> {
  const unit = await getUnit(unitCode);
  const version = await resolveVersion(unit, opts);
  if (!version) throw notFound(`A ${opts.versionMode === "DRAFT" ? "draft or approved" : "approved"} finance board for ${unit.name}${opts.periodLabel ? ` (${opts.periodLabel})` : ""}`);
  const period = (await FiscalPeriodModel.findById(version.fiscalPeriodId).lean()) as unknown as PeriodDoc;
  const { input, structure } = await loadFinanceInput(unit, period, version);
  const ru = rollup(input);
  return { unit, period, version, structure, input, rollup: ru, reconciliation: reconcile(ru), extras: await loadExtras(version) };
}

/** Every reporting unit that has a board in the requested mode. */
export async function loadAllBoards(opts: ReadOptions = {}): Promise<UnitBoard[]> {
  const units = await listUnits();
  const out: UnitBoard[] = [];
  for (const u of units) {
    try { out.push(await loadUnitBoard(u.code, opts)); } catch (e) { if (!(e instanceof Error && /not found/i.test(e.message))) throw e; }
  }
  return out;
}

export function consolidateBoards(boards: UnitBoard[]): Consolidated {
  const units: UnitResult[] = boards.map((b) => ({
    unitCode: b.unit.code, unitName: b.unit.name, shortName: b.unit.shortName, periodLabel: b.period.label,
    isPlaceholder: b.version.isPlaceholder, rollup: b.rollup,
  }));
  const amber = boards[0]?.structure.metrics.amberWithinPct ?? 5;
  return consolidate(units, amber);
}
