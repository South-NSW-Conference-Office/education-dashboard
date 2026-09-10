/**
 * ConsolidationService — all schools together.
 * Sums comparable units and says plainly when periods differ. No eliminations yet
 * (accounts flagged intercompany are reported, not removed — phase 2).
 */
import { COLUMN_KEYS, zeroAmounts, type Amounts, type Rating, type RollupResult } from "@/domain/types";
import { financeStatus } from "./status";

export interface UnitResult { unitCode: string; unitName: string; shortName: string; periodLabel: string; isPlaceholder: boolean; rollup: RollupResult }

export interface Consolidated {
  totals: { income: Amounts; expenditure: Amounts; surplus: Amounts };
  incVar: number; expVar: number; surVar: number;
  /** surplus over income, since EBIDA add-backs are unit-specific */
  marginPct: number;
  periods: string[]; mixedPeriods: boolean; includesPlaceholder: boolean;
  units: Array<UnitResult & { finance: Rating }>;
}

export function consolidate(units: UnitResult[], amberWithinPct = 5): Consolidated {
  const totals = { income: zeroAmounts(), expenditure: zeroAmounts(), surplus: zeroAmounts() };
  for (const u of units) for (const k of COLUMN_KEYS) {
    totals.income[k] += u.rollup.totals.income[k];
    totals.expenditure[k] += u.rollup.totals.expenditure[k];
    totals.surplus[k] += u.rollup.totals.surplus[k];
  }
  const periods = [...new Set(units.map((u) => u.periodLabel))];
  return {
    totals,
    incVar: totals.income.actual - totals.income.budget,
    expVar: totals.expenditure.actual - totals.expenditure.budget,
    surVar: totals.surplus.actual - totals.surplus.budget,
    marginPct: totals.income.actual ? (totals.surplus.actual / totals.income.actual) * 100 : 0,
    periods, mixedPeriods: periods.length > 1,
    includesPlaceholder: units.some((u) => u.isPlaceholder),
    units: units.map((u) => ({ ...u, finance: financeStatus(u.rollup, amberWithinPct) })),
  };
}
