/**
 * ReconciliationService — declared page-1 totals vs the calculated roll-up.
 * Pure. Differences within tolerance pass; anything else is a WARNING the
 * dashboard must show (the finance team resolves or waives it on the version).
 */
import { COLUMN_KEYS, COLUMNS, type ReconciliationItem, type RollupResult } from "@/domain/types";

export const DEFAULT_TOLERANCE_MINOR = 1000; // $10 of whole-dollar rounding on the statement

const COLUMN_LABEL = { budget: "YTD budget", actual: "YTD actual", annualBudget: "Annual budget", eoyEstimate: "Est. end of year" } as const;

export function reconcile(ru: RollupResult, toleranceMinor = DEFAULT_TOLERANCE_MINOR): ReconciliationItem[] {
  const out: ReconciliationItem[] = [];
  const status = (diff: number) => (Math.abs(diff) <= toleranceMinor ? "PASS" : "WARNING") as ReconciliationItem["status"];

  for (const g of [...ru.income, ...ru.expenditure]) {
    if (!g.hasData || !g.reported) continue;
    for (const k of COLUMN_KEYS) {
      const diff = g[k] - g.reported[k];
      if (status(diff) === "PASS") continue;
      out.push({
        checkCode: "GROUP_DETAIL_TO_OVERVIEW", groupCode: g.code, label: g.name, column: k,
        scenario: COLUMNS[k].scenario, basis: COLUMNS[k].basis,
        expectedMinor: g.reported[k], actualMinor: g[k], differenceMinor: diff, status: status(diff),
      });
    }
  }
  if (ru.addback.computed && ru.addback.reported) {
    (["ytdBudget", "ytdActual"] as const).forEach((k) => {
      const diff = ru.addback[k] - ru.addback.reported![k];
      if (status(diff) === "PASS") return;
      out.push({
        checkCode: "EBIDA_ADDBACK", groupCode: null, label: "EBIDA add-back", column: k,
        scenario: k === "ytdBudget" ? "BUDGET" : "ACTUAL", basis: "YEAR_TO_DATE",
        expectedMinor: ru.addback.reported![k], actualMinor: ru.addback[k], differenceMinor: diff, status: status(diff),
      });
    });
  }
  if (ru.salarySubline?.computed && ru.salarySubline.reported) {
    for (const k of COLUMN_KEYS) {
      const diff = ru.salarySubline[k] - ru.salarySubline.reported[k];
      if (status(diff) === "PASS") continue;
      out.push({
        checkCode: "SALARY_SUBLINE", groupCode: null, label: ru.salarySubline.label, column: k,
        scenario: COLUMNS[k].scenario, basis: COLUMNS[k].basis,
        expectedMinor: ru.salarySubline.reported[k], actualMinor: ru.salarySubline[k], differenceMinor: diff, status: status(diff),
      });
    }
  }
  return out;
}

export const columnLabel = (c: ReconciliationItem["column"]) =>
  c === "ytdBudget" ? "YTD budget" : c === "ytdActual" ? "YTD actual" : COLUMN_LABEL[c];
