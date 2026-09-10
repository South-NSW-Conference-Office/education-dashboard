/**
 * Finance presenters (the V in MVC) — shape service results into JSON.
 *   presentBoard    : the document shape the existing frontend reads (whole dollars)
 *   presentOverview : computed KPIs, categories, charts, reconciliation
 *   presentSummary  : all schools
 * Minor units in, dollars out. Nothing here calculates; it only formats.
 */
import { COLUMN_KEYS, type Amounts, type BoardDocument, type Category, type DetailGroup, type ReconciliationItem, type RollupResult } from "@/domain/types";
import { toDollars } from "@/lib/money";
import { health } from "@/services/rollup";
import { columnLabel } from "@/services/reconciliation";
import { financeStatus, toLower } from "@/services/status";
import { consolidate, type Consolidated } from "@/services/consolidation";
import type { UnitBoard } from "@/services/financeQuery";
import type { PeriodDoc } from "@/services/structure";

const dollars = (a: Amounts): Amounts => ({ budget: toDollars(a.budget), actual: toDollars(a.actual), annualBudget: toDollars(a.annualBudget), eoyEstimate: toDollars(a.eoyEstimate) });
const displayCode = (code: string) => (code.startsWith("X-") ? "" : code);

function context(b: UnitBoard) {
  return {
    unit: b.unit.code, unitName: b.unit.name, shortName: b.unit.shortName, asAt: b.period.label,
    version: b.version.versionNo, versionId: String(b.version._id), status: b.version.status,
    placeholder: b.version.isPlaceholder, lastSaved: b.version.updatedAt?.toISOString() ?? null, approvedAt: b.version.approvedAt?.toISOString() ?? null,
    generatedAt: new Date().toISOString(),
  };
}

function categories(ru: RollupResult): { income: Category[]; expenditure: Category[] } {
  const cat = (g: RollupResult["income"][number]): Category => ({ label: g.name, ...dollars(g), computed: g.hasData, groups: [g.name] });
  const income = ru.income.map(cat);
  const expenditure = ru.expenditure.map(cat);
  if (ru.salarySubline) {
    // attach "of which: salaries" to the expenditure group that holds the salary lines
    const codes = new Set(ru.salarySubline.lineCount ? ru.expenditure.flatMap((g) => g.lines.map((l) => l.code)) : []);
    const host = ru.expenditure.find((g) => g.lines.some((l) => /salar|casual|fringe/i.test(l.label) && codes.has(l.code))) ?? ru.expenditure[0];
    const idx = ru.expenditure.indexOf(host);
    if (idx >= 0) expenditure[idx].sub = [{ label: ru.salarySubline.label, ...dollars(ru.salarySubline), computed: ru.salarySubline.computed, lines: ru.salarySubline.lineCount }];
  }
  return { income, expenditure };
}

function details(ru: RollupResult): { income: DetailGroup[]; expenditure: DetailGroup[] } {
  const grp = (g: RollupResult["income"][number]): DetailGroup => ({ group: g.name, rows: g.lines.map((l) => ({ code: displayCode(l.code), label: l.label, ...dollars(l) })) });
  return { income: ru.income.map(grp), expenditure: ru.expenditure.map(grp) };
}

/** The board document the frontend's store expects, with computed categories in place of typed ones. */
export function presentBoard(b: UnitBoard): BoardDocument & { meta: ReturnType<typeof context> & { draft?: boolean }; reconciliation: ReturnType<typeof presentReconciliation> } {
  const ru = b.rollup, x = b.extras;
  const note = (t: string) => x.notes.find((n) => n.noteType === t)?.body ?? "";
  const obl = (t: "LOAN" | "LEASE") => x.obligations.filter((o) => o.obligationType === t).map((o) => ({ name: o.name, payment: toDollars(o.paymentMinor), frequency: o.paymentFrequency, ends: o.endsOn, notes: o.notes }));
  const cats = categories(ru);
  return {
    meta: { ...context(b), draft: b.version.isPlaceholder || undefined },
    addback: { ytdBudget: toDollars(ru.addback.ytdBudget), ytdActual: toDollars(ru.addback.ytdActual) },
    priorYear: { debtorsCurrent: toDollars(x.receivables?.currentMinor), debtorsPrior: toDollars(x.receivables?.priorYearMinor), note: note("STRATEGIC_NOTE") },
    loans: obl("LOAN"), leases: obl("LEASE"),
    comments: { current: note("CURRENT_IMPACT"), upcoming: note("UPCOMING_IMPACT") },
    income: cats.income, expenditure: cats.expenditure,
    details: details(ru),
    reconciliation: presentReconciliation(b.reconciliation),
  };
}

export function presentReconciliation(items: ReconciliationItem[]) {
  return items.map((r) => ({
    checkCode: r.checkCode, label: r.label, field: columnLabel(r.column),
    lineItems: toDollars(r.actualMinor), page1: toDollars(r.expectedMinor), difference: toDollars(r.differenceMinor), status: r.status,
    note: `page 1 is ${Math.abs(toDollars(r.differenceMinor)).toLocaleString("en-AU")} ${r.differenceMinor > 0 ? "lower" : "higher"} than the line items`,
  }));
}

/** Computed overview: everything the Overview tab shows, ready to render. */
export function presentOverview(b: UnitBoard) {
  const ru = b.rollup, amber = b.structure.metrics.amberWithinPct;
  const t = ru.totals;
  const rows = [
    ...ru.income.map((g) => ({ label: g.name, section: "INCOME" as const, ...health(g, "INCOME", amber) })),
    ...ru.expenditure.map((g) => ({ label: g.name, section: "EXPENDITURE" as const, ...health(g, "EXPENDITURE", amber) })),
  ].map((r) => ({ label: r.label, section: r.section, variance: toDollars(r.varAmt), pct: r.pct, colour: toLower(r.colour) }));
  const surVar = ru.surVar;
  return {
    context: context(b),
    kpis: {
      income: { actual: toDollars(t.income.actual), budget: toDollars(t.income.budget), variance: toDollars(t.income.actual - t.income.budget), colour: toLower(health(t.income, "INCOME", amber).colour) },
      spending: { actual: toDollars(t.expenditure.actual), budget: toDollars(t.expenditure.budget), variance: toDollars(t.expenditure.budget - t.expenditure.actual), colour: toLower(health(t.expenditure, "EXPENDITURE", amber).colour) },
      surplus: { actual: toDollars(t.surplus.actual), budget: toDollars(t.surplus.budget), variance: toDollars(surVar), colour: toLower(financeStatus(ru, amber)) },
      margin: { actual: +ru.margin.actual.toFixed(2), budget: +ru.margin.budget.toFixed(2), basis: "EBIDA", colour: ru.margin.actual >= ru.margin.budget ? "green" : ru.margin.actual >= ru.margin.budget - 2 ? "amber" : "red" },
    },
    goingWell: rows.filter((r) => r.variance > 0).sort((a, b) => b.variance - a.variance).slice(0, 5),
    needsAttention: rows.filter((r) => r.variance < 0).sort((a, b) => a.variance - b.variance).slice(0, 5),
    categories: categories(ru),
    totals: { income: dollars(t.income), expenditure: dollars(t.expenditure), surplus: dollars(t.surplus) },
    ebida: { budget: toDollars(ru.ebida.budget), actual: toDollars(ru.ebida.actual), addback: { budget: toDollars(ru.addback.ytdBudget), actual: toDollars(ru.addback.ytdActual), computed: ru.addback.computed, lines: ru.addback.lineCount } },
    reconciliation: presentReconciliation(b.reconciliation),
    financeLight: toLower(financeStatus(ru, amber)),
  };
}

/** All schools: consolidated tiles, per-school rows, cross-school attention list. */
export function presentSummary(c: Consolidated, boards: UnitBoard[]) {
  const amber = boards[0]?.structure.metrics.amberWithinPct ?? 5;
  const flags = boards.flatMap((b) => [
    ...b.rollup.income.map((g) => ({ unit: b.unit.code, short: b.unit.shortName, label: g.name, ...health(g, "INCOME", amber) })),
    ...b.rollup.expenditure.map((g) => ({ unit: b.unit.code, short: b.unit.shortName, label: g.name, ...health(g, "EXPENDITURE", amber) })),
  ]).filter((f) => f.varAmt < 0).sort((a, b) => a.varAmt - b.varAmt).slice(0, 7)
    .map((f) => ({ unit: f.unit, short: f.short, label: f.label, unfavourable: toDollars(-f.varAmt), colour: toLower(f.colour) }));
  return {
    context: { periods: c.periods, mixedPeriods: c.mixedPeriods, includesPlaceholder: c.includesPlaceholder, boards: c.units.length, generatedAt: new Date().toISOString() },
    totals: { income: dollars(c.totals.income), expenditure: dollars(c.totals.expenditure), surplus: dollars(c.totals.surplus), incVar: toDollars(c.incVar), expVar: toDollars(c.expVar), surVar: toDollars(c.surVar), marginPct: +c.marginPct.toFixed(2) },
    schools: c.units.map((u) => ({
      unit: u.unitCode, name: u.unitName, short: u.shortName, asAt: u.periodLabel, placeholder: u.isPlaceholder,
      income: dollars(u.rollup.totals.income), spending: dollars(u.rollup.totals.expenditure), surplus: dollars(u.rollup.totals.surplus),
      surVar: toDollars(u.rollup.surVar), marginPct: +u.rollup.margin.actual.toFixed(2), finance: toLower(u.finance),
    })),
    needsAttention: flags,
  };
}

/** Month by month for the timeline card: each month's boards and their combined totals. Oldest first. */
export function presentTimeline(months: Array<{ period: PeriodDoc; boards: UnitBoard[] }>) {
  return {
    periods: months.map(({ period, boards }) => {
      const c = consolidate(boards.map((b) => ({ unitCode: b.unit.code, unitName: b.unit.name, shortName: b.unit.shortName, periodLabel: period.label, isPlaceholder: b.version.isPlaceholder, rollup: b.rollup })), boards[0]?.structure.metrics.amberWithinPct ?? 5);
      return {
        label: period.label, endsOn: period.endsOn.toISOString().slice(0, 10), boards: boards.length, includesPlaceholder: c.includesPlaceholder,
        totals: { income: dollars(c.totals.income), expenditure: dollars(c.totals.expenditure), surplus: dollars(c.totals.surplus), incVar: toDollars(c.incVar), expVar: toDollars(c.expVar), surVar: toDollars(c.surVar), marginPct: +c.marginPct.toFixed(2) },
        units: c.units.map((u) => ({
          unit: u.unitCode, name: u.unitName, short: u.shortName, placeholder: u.isPlaceholder,
          income: dollars(u.rollup.totals.income), spending: dollars(u.rollup.totals.expenditure), surplus: dollars(u.rollup.totals.surplus),
          surVar: toDollars(u.rollup.surVar), marginPct: +u.rollup.margin.actual.toFixed(2), finance: toLower(u.finance),
        })),
      };
    }),
  };
}

export const amountsInDollars = (a: Amounts) => dollars(a);
export { COLUMN_KEYS };
