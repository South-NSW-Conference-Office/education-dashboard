/**
 * StatusService — traffic lights derived from numbers.
 * Finance light: surplus against budget. Overall: the worst of the five measures.
 */
import type { Rating, RollupResult } from "@/domain/types";

export function financeStatus(ru: Pick<RollupResult, "surVar" | "totals">, amberWithinPct = 5): Rating {
  const sv = ru.surVar;
  if (sv >= 0) return "GREEN";
  const budget = Math.abs(ru.totals.surplus.budget || 1);
  return sv > -(amberWithinPct / 100) * budget ? "AMBER" : "RED";
}

export function worst(ratings: Array<Rating | null | undefined>): Rating {
  const r = ratings.filter((x): x is Rating => !!x);
  if (r.includes("RED")) return "RED";
  if (r.includes("AMBER")) return "AMBER";
  return "GREEN";
}

export const toLower = (r: Rating) => r.toLowerCase() as "green" | "amber" | "red";
export const toUpper = (r: string | null | undefined): Rating | null => {
  const u = (r ?? "").toUpperCase();
  return u === "GREEN" || u === "AMBER" || u === "RED" ? u : null;
};
