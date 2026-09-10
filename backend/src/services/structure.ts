/**
 * StructureService — organisation, units, calendar, chart of accounts, groups,
 * mappings and metric definitions. Read by every finance request; written by
 * the seed and the import pipeline when a board brings new accounts.
 */
import { Types } from "mongoose";
import {
  AccountGroupMappingModel, AccountModel, FiscalPeriodModel, FiscalYearModel, MetricDefinitionModel,
  OperatingUnitModel, OrganisationModel, ReportingGroupModel,
} from "@/models";
import type { AccountLite, GroupLite, MappingLite, MetricConfig, Section } from "@/domain/types";
import { notFound, badRequest } from "@/lib/http";
import { accountClassFor, isAddbackLine, isSalaryHostGroup, isSalaryLine, type Extracted } from "./boardDocument";

export type Id = Types.ObjectId;
export interface UnitDoc { _id: Id; code: string; name: string; shortName: string; unitType: string; location: string; colourHex: string | null; databoardKey: string | null; displayOrder: number }
export interface PeriodDoc { _id: Id; fiscalYearId: Id; periodNo: number; label: string; startsOn: Date; endsOn: Date; status: string }

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const FISCAL_START = new Date(Date.UTC(2026, 0, 1)); // mappings are effective from the first fiscal year we hold

export async function getOrg(): Promise<{ _id: Id; code: string; name: string }> {
  const org = await OrganisationModel.findOneAndUpdate(
    { code: "SNSW" },
    { $setOnInsert: { code: "SNSW", name: "Adventist Education South New South Wales" } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  return org as { _id: Id; code: string; name: string };
}

export async function listUnits(): Promise<UnitDoc[]> {
  return (await OperatingUnitModel.find({ isActive: true, reportingEnabled: true }).sort({ displayOrder: 1 }).lean()) as unknown as UnitDoc[];
}
export async function getUnit(code: string): Promise<UnitDoc> {
  const u = (await OperatingUnitModel.findOne({ code }).lean()) as unknown as UnitDoc | null;
  if (!u) throw notFound(`Unit "${code}"`);
  return u;
}

/** "June 2026" → { year: 2026, month: 6 }. */
export function parsePeriodLabel(label: string): { year: number; month: number } {
  const m = /^\s*([A-Za-z]+)\s+(\d{4})\s*$/.exec(label ?? "");
  const month = m ? MONTHS.indexOf(m[1].toLowerCase()) + 1 : 0;
  if (!m || !month) throw badRequest(`Period label "${label}" must look like "June 2026"`);
  return { year: Number(m[2]), month };
}

/** Calendar fiscal year with twelve periods, created on first use. */
export async function ensurePeriodByLabel(label: string): Promise<PeriodDoc> {
  const { year, month } = parsePeriodLabel(label);
  const org = await getOrg();
  const fy = await FiscalYearModel.findOneAndUpdate(
    { organisationId: org._id, code: `FY${year}` },
    { $setOnInsert: { organisationId: org._id, code: `FY${year}`, startsOn: new Date(Date.UTC(year, 0, 1)), endsOn: new Date(Date.UTC(year, 11, 31)) } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  const count = await FiscalPeriodModel.countDocuments({ fiscalYearId: fy!._id });
  if (count < 12) {
    for (let p = 1; p <= 12; p++) {
      const lbl = `${MONTHS[p - 1][0].toUpperCase()}${MONTHS[p - 1].slice(1)} ${year}`;
      await FiscalPeriodModel.updateOne(
        { fiscalYearId: fy!._id, periodNo: p },
        { $setOnInsert: { fiscalYearId: fy!._id, periodNo: p, label: lbl, startsOn: new Date(Date.UTC(year, p - 1, 1)), endsOn: new Date(Date.UTC(year, p, 0)) } },
        { upsert: true },
      );
    }
  }
  return (await FiscalPeriodModel.findOne({ fiscalYearId: fy!._id, periodNo: month }).lean()) as unknown as PeriodDoc;
}
export async function findPeriodByLabel(label: string): Promise<PeriodDoc | null> {
  return (await FiscalPeriodModel.findOne({ label }).lean()) as unknown as PeriodDoc | null;
}
export async function listPeriods(): Promise<PeriodDoc[]> {
  return (await FiscalPeriodModel.find().sort({ startsOn: 1 }).lean()) as unknown as PeriodDoc[];
}
/**
 * The periods between two labels (inclusive), oldest first. Either end may be missing.
 * A label is validated even when its year has no periods yet, so a typo is a 400 not an empty list.
 */
export async function periodsBetween(from?: string | null, to?: string | null): Promise<PeriodDoc[]> {
  const lo = from ? parsePeriodLabel(from) : null;
  const hi = to ? parsePeriodLabel(to) : null;
  const start = lo ? Date.UTC(lo.year, lo.month - 1, 1) : -Infinity;
  const end = hi ? Date.UTC(hi.year, hi.month, 0) : Infinity;
  if (start > end) throw badRequest(`The range runs backwards: "${from}" is after "${to}"`);
  return (await listPeriods()).filter((p) => p.startsOn.getTime() >= start && p.endsOn.getTime() <= end);
}

export interface Structure { accounts: AccountLite[]; groups: GroupLite[]; mappings: MappingLite[]; metrics: MetricConfig; accountIds: Map<string, Id> }

/** Everything the roll-up needs besides the facts. Mappings and metrics effective at `asOf`. */
export async function loadStructure(asOf: Date = new Date()): Promise<Structure> {
  const org = await getOrg();
  const [accounts, groups, mappings, metrics] = await Promise.all([
    AccountModel.find({ organisationId: org._id }).lean(),
    ReportingGroupModel.find({ organisationId: org._id, isActive: true }).lean(),
    AccountGroupMappingModel.find({ validFrom: { $lte: asOf }, $or: [{ validTo: null }, { validTo: { $gte: asOf } }] }).lean(),
    MetricDefinitionModel.find({ organisationId: org._id, effectiveFrom: { $lte: asOf }, $or: [{ effectiveTo: null }, { effectiveTo: { $gte: asOf } }] }).sort({ effectiveFrom: -1 }).lean(),
  ]);
  const idToCode = new Map(accounts.map((a) => [String(a._id), a.code]));
  const groupIdToCode = new Map(groups.map((g) => [String(g._id), g.code]));
  const metric = (code: string) => metrics.find((m) => m.code === code)?.definition as Record<string, unknown> | undefined;
  return {
    accounts: accounts.map((a) => ({ code: a.code, name: a.name })),
    groups: groups.map((g) => ({ code: g.code, name: g.name, section: g.section as Section, displayOrder: g.displayOrder })),
    mappings: mappings
      .map((m) => ({ accountCode: idToCode.get(String(m.accountId)) ?? "", groupCode: groupIdToCode.get(String(m.reportingGroupId)) ?? "" }))
      .filter((m) => m.accountCode && m.groupCode),
    metrics: {
      ebidaAddbackCodes: (metric("EBIDA_ADDBACK")?.accountCodes as string[]) ?? [],
      salarySublineCodes: (metric("SALARY_SUBLINE")?.accountCodes as string[]) ?? [],
      salarySublineGroupCodes: (metric("SALARY_SUBLINE")?.groupCodes as string[]) ?? [],
      salarySublineLabel: (metric("SALARY_SUBLINE")?.label as string) ?? "Salaries & wages",
      amberWithinPct: Number(metric("FINANCE_LIGHT")?.amberWithinPct ?? 5),
    },
    accountIds: new Map(accounts.map((a) => [a.code, a._id as Id])),
  };
}

/**
 * Make sure every group, account and mapping a board refers to exists, and keep the
 * two formula metrics' account lists up to date. Returns warnings for a human to read.
 */
export async function ensureStructure(ex: Extracted): Promise<{ warnings: string[]; accountIds: Map<string, Id> }> {
  const org = await getOrg();
  const warnings = [...ex.warnings, ...ex.duplicates];

  const groupIds = new Map<string, Id>();
  for (const g of ex.groups) {
    const doc = await ReportingGroupModel.findOneAndUpdate(
      { organisationId: org._id, code: g.code },
      { $setOnInsert: { organisationId: org._id, code: g.code, section: g.section, displayOrder: g.displayOrder }, $set: { name: g.name }, $addToSet: { aliases: g.name } },
      { upsert: true, returnDocument: "after" },
    ).lean();
    groupIds.set(g.code, doc!._id as Id);
  }

  const accountIds = new Map<string, Id>();
  const addback = new Set<string>(), salary = new Set<string>(), salaryGroups = new Set<string>();
  for (const l of ex.lines) {
    const doc = await AccountModel.findOneAndUpdate(
      { organisationId: org._id, code: l.accountCode },
      { $setOnInsert: { organisationId: org._id, code: l.accountCode, name: l.label, accountClass: accountClassFor(l.section, l.groupCode), normalBalance: l.section === "INCOME" ? "CREDIT" : "DEBIT", isIntercompany: /internal management/i.test(l.label) } },
      { upsert: true, returnDocument: "after" },
    ).lean();
    accountIds.set(l.accountCode, doc!._id as Id);
    const existing = await AccountGroupMappingModel.findOne({ accountId: doc!._id, validTo: null }).lean();
    const wantGroup = groupIds.get(l.groupCode)!;
    if (!existing) await AccountGroupMappingModel.create({ accountId: doc!._id, reportingGroupId: wantGroup, validFrom: FISCAL_START, validTo: null });
    else if (String(existing.reportingGroupId) !== String(wantGroup)) warnings.push(`Account ${l.accountCode} (${l.label}) is mapped to another group; the board lists it under ${l.groupName}. Mapping left unchanged.`);
    if (l.section === "EXPENDITURE" && isAddbackLine(l.label)) addback.add(l.accountCode);
    if (l.section === "EXPENDITURE" && isSalaryLine(l.label) && isSalaryHostGroup(l.groupCode)) { salary.add(l.accountCode); salaryGroups.add(l.groupCode); }
  }

  const upsertMetric = async (code: string, name: string, formulaType: string, patch: (d: Record<string, unknown>) => Record<string, unknown>) => {
    const cur = await MetricDefinitionModel.findOne({ organisationId: org._id, code, effectiveTo: null }).lean();
    const def = patch((cur?.definition as Record<string, unknown>) ?? {});
    await MetricDefinitionModel.updateOne(
      { organisationId: org._id, code, effectiveFrom: FISCAL_START },
      { $set: { name, formulaType, definition: def }, $setOnInsert: { organisationId: org._id, code, effectiveFrom: FISCAL_START } },
      { upsert: true },
    );
  };
  const union = (a: unknown, b: Set<string>) => [...new Set([...((a as string[]) ?? []), ...b])].sort();
  await upsertMetric("EBIDA_ADDBACK", "EBIDA add-back: interest, depreciation and amortisation accounts", "ACCOUNT_SUM", (d) => ({ ...d, accountCodes: union(d.accountCodes, addback) }));
  await upsertMetric("SALARY_SUBLINE", "“Of which: salaries” accounts", "ACCOUNT_SUM", (d) => ({ ...d, accountCodes: union(d.accountCodes, salary), groupCodes: union(d.groupCodes, salaryGroups), label: (d.label as string) ?? ex.salaryLabel ?? "Salaries & wages" }));
  await upsertMetric("FINANCE_LIGHT", "Finance traffic light thresholds", "THRESHOLD", (d) => ({ amberWithinPct: 5, ...d }));

  return { warnings, accountIds };
}
