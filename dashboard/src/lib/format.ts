/** Number formatting. Accountants' negatives, en-AU grouping, compact tiles. */
export const fmt = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return "–";
  const s = Math.abs(Math.round(n)).toLocaleString("en-AU");
  return n < 0 ? `(${s})` : s;
};
export const fmt$ = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return "–";
  const s = "$" + Math.abs(Math.round(n)).toLocaleString("en-AU");
  return n < 0 ? `(${s})` : s;
};
export const compact$ = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return "–";
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, "")}m` : a >= 1e3 ? `$${Math.round(a / 1e3)}k` : `$${Math.round(a)}`;
  return n < 0 ? `(${s})` : s;
};
export const signed$ = (n: number): string => (n < 0 ? "−" : "+") + fmt$(Math.abs(n));
export const pct = (n: number | null | undefined, dp = 1): string => (n == null || isNaN(n) ? "–" : `${n.toFixed(dp)}%`);
export const when = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
export const STATUS_LABEL: Record<"green" | "amber" | "red", string> = { green: "On track", amber: "Watch", red: "Action needed" };
