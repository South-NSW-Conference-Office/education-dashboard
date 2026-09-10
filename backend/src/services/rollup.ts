/**
 * RollupService — line items → groups → section totals → KPIs.
 * Pure: takes a FinanceInput, returns a RollupResult. Minor units throughout.
 * This is the server-side twin of NS.rollup / NS.financeCalc in docs/legacy-static-dashboard/js/core.js.
 */
import {
  COLUMN_KEYS, columnFor, zeroAmounts,
  type Amounts, type FinanceInput, type GroupResult, type Health, type LineResult, type Rating, type RollupResult, type Section,
} from "@/domain/types";

const addInto = (target: Amounts, src: Amounts) => { for (const k of COLUMN_KEYS) target[k] += src[k]; };
const hasAny = (a: Amounts) => COLUMN_KEYS.some((k) => a[k] !== 0);

/** Variance colour: favourable = green, within amberWithinPct of budget = amber, worse = red. */
export function varianceColour(pct: number | null, amberWithinPct: number): Rating {
  if (pct === null) return "GREEN";
  if (pct >= 0) return "GREEN";
  return pct > -amberWithinPct ? "AMBER" : "RED";
}

/** Favourable variance for one row: income ahead of budget, or spending under budget. */
export function health(row: Amounts, section: Section, amberWithinPct: number): Health {
  const varAmt = section === "INCOME" ? row.actual - row.budget : row.budget - row.actual;
  const pct = row.budget ? (varAmt / Math.abs(row.budget)) * 100 : (varAmt < 0 ? -100 : null);
  return { varAmt, pct, colour: varianceColour(pct, amberWithinPct) };
}

/** Amounts per account code from the facts, using the four Details-tab columns. */
function amountsByAccount(input: FinanceInput): Map<string, Amounts> {
  const by = new Map<string, Amounts>();
  for (const f of input.facts) {
    const col = columnFor(f.scenario, f.basis);
    if (!col) continue;
    const a = by.get(f.accountCode) ?? zeroAmounts();
    a[col] += f.amountMinor;
    by.set(f.accountCode, a);
  }
  return by;
}

export function rollup(input: FinanceInput): RollupResult {
  const { metrics } = input;
  const amounts = amountsByAccount(input);
  const nameOf = new Map(input.accounts.map((a) => [a.code, a.name]));
  const groupOfAccount = new Map(input.mappings.map((m) => [m.accountCode, m.groupCode]));

  // reported (page-1) totals, per group and for the two whole-statement metrics
  const reportedGroup = new Map<string, Amounts>();
  const reportedAddback = { ytdBudget: 0, ytdActual: 0, present: false };
  let reportedSalary: Amounts | null = null;
  for (const r of input.reportedTotals) {
    const col = columnFor(r.scenario, r.basis);
    if (!col) continue;
    if (r.metricCode === "GROUP_TOTAL" && r.groupCode) {
      const a = reportedGroup.get(r.groupCode) ?? zeroAmounts(); a[col] += r.amountMinor; reportedGroup.set(r.groupCode, a);
    } else if (r.metricCode === "EBIDA_ADDBACK") {
      reportedAddback.present = true;
      if (col === "budget") reportedAddback.ytdBudget += r.amountMinor;
      if (col === "actual") reportedAddback.ytdActual += r.amountMinor;
    } else if (r.metricCode === "SALARY_SUBLINE") {
      reportedSalary = reportedSalary ?? zeroAmounts(); reportedSalary[col] += r.amountMinor;
    }
  }

  // groups in display order, each with its mapped lines
  const groups: GroupResult[] = [...input.groups]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((g) => ({ ...g, ...zeroAmounts(), lines: [], hasData: false, reported: reportedGroup.get(g.code) ?? null }));
  const byCode = new Map(groups.map((g) => [g.code, g]));
  const unmapped: LineResult[] = [];
  for (const [code, a] of amounts) {
    const line: LineResult = { code, label: nameOf.get(code) ?? code, ...a };
    const g = byCode.get(groupOfAccount.get(code) ?? "");
    if (!g) { unmapped.push(line); continue; }
    g.lines.push(line);
    addInto(g, a);
    if (hasAny(a)) g.hasData = true;
  }
  for (const g of groups) g.lines.sort((x, y) => x.code.localeCompare(y.code));
  // groups are organisation-wide; a unit's board shows only the ones it reports under
  const relevant = groups.filter((g) => g.lines.length || g.reported);
  groups.length = 0; groups.push(...relevant);
  if (unmapped.length) {
    // never lose money: unmapped accounts still count, under a visible group
    const g: GroupResult = { code: "UNMAPPED", name: "Unmapped accounts", section: "EXPENDITURE", displayOrder: 999, ...zeroAmounts(), lines: unmapped, hasData: true, reported: null };
    for (const l of unmapped) addInto(g, l);
    groups.push(g);
  }

  const income = groups.filter((g) => g.section === "INCOME");
  const expenditure = groups.filter((g) => g.section === "EXPENDITURE");
  const totals = { income: zeroAmounts(), expenditure: zeroAmounts(), surplus: zeroAmounts() };
  for (const g of income) addInto(totals.income, g);
  for (const g of expenditure) addInto(totals.expenditure, g);
  for (const k of COLUMN_KEYS) totals.surplus[k] = totals.income[k] - totals.expenditure[k];

  // EBIDA add-back = interest + depreciation + amortisation lines (from the metric definition)
  const addbackLines = metrics.ebidaAddbackCodes.map((c) => amounts.get(c)).filter((a): a is Amounts => !!a && (a.budget !== 0 || a.actual !== 0));
  const addbackComputed = addbackLines.length > 0;
  const addback = {
    computed: addbackComputed,
    lineCount: addbackLines.length,
    ytdBudget: addbackComputed ? addbackLines.reduce((s, a) => s + a.budget, 0) : reportedAddback.ytdBudget,
    ytdActual: addbackComputed ? addbackLines.reduce((s, a) => s + a.actual, 0) : reportedAddback.ytdActual,
    reported: reportedAddback.present ? { ytdBudget: reportedAddback.ytdBudget, ytdActual: reportedAddback.ytdActual } : null,
  };
  const ebida = { budget: totals.surplus.budget + addback.ytdBudget, actual: totals.surplus.actual + addback.ytdActual };
  const margin = {
    budget: totals.income.budget ? (ebida.budget / totals.income.budget) * 100 : 0,
    actual: totals.income.actual ? (ebida.actual / totals.income.actual) * 100 : 0,
  };

  // "of which: salaries" from the salary / casual / fringe lines named in the metric definition
  const inHostGroup = (code: string) => !metrics.salarySublineGroupCodes.length || metrics.salarySublineGroupCodes.includes(groupOfAccount.get(code) ?? "");
  const salaryLines = metrics.salarySublineCodes.filter(inHostGroup).map((c) => amounts.get(c)).filter((a): a is Amounts => !!a && hasAny(a));
  let salarySubline: RollupResult["salarySubline"] = null;
  if (salaryLines.length) {
    const s = zeroAmounts(); for (const a of salaryLines) addInto(s, a);
    salarySubline = { label: metrics.salarySublineLabel, ...s, computed: true, lineCount: salaryLines.length, reported: reportedSalary };
  } else if (reportedSalary) {
    salarySubline = { label: metrics.salarySublineLabel, ...reportedSalary, computed: false, lineCount: 0, reported: reportedSalary };
  }

  return {
    income, expenditure, totals, addback, ebida, margin, salarySubline,
    incVarPct: totals.income.budget ? ((totals.income.actual - totals.income.budget) / Math.abs(totals.income.budget)) * 100 : 0,
    expVarPct: totals.expenditure.budget ? ((totals.expenditure.actual - totals.expenditure.budget) / Math.abs(totals.expenditure.budget)) * 100 : 0,
    surVar: totals.surplus.actual - totals.surplus.budget,
  };
}
