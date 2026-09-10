/**
 * The reporting period every page reads as at. One selection is shared across the app (see
 * hooks/usePeriod): "latest" is each board's newest approved month, "month" pins one month,
 * "range" shows the newest board inside two months and a month-by-month timeline, "all" is the
 * whole timeline. Labels look like "June 2026", the backend's fiscal-period label.
 */
export type PeriodSelection =
  | { kind: "latest" }
  | { kind: "all" }
  | { kind: "month"; label: string }
  | { kind: "range"; from: string; to: string };

/** Query-string parameters the API reads for a selection. */
export type PeriodParams = { period?: string; from?: string; to?: string };

export const LATEST: PeriodSelection = { kind: "latest" };

export function periodParams(s: PeriodSelection): PeriodParams {
  switch (s.kind) {
    case "month": return { period: s.label };
    case "range": return { from: s.from, to: s.to };
    default: return {};
  }
}

/** Stable string for query keys and storage. */
export function periodKey(s: PeriodSelection): string {
  switch (s.kind) {
    case "month": return `month:${s.label}`;
    case "range": return `range:${s.from}..${s.to}`;
    default: return s.kind;
  }
}
export function parsePeriodKey(key: string | null | undefined): PeriodSelection {
  if (!key) return LATEST;
  if (key === "all") return { kind: "all" };
  if (key.startsWith("month:")) return { kind: "month", label: key.slice(6) };
  const m = /^range:(.+)\.\.(.+)$/.exec(key);
  if (m) return { kind: "range", from: m[1], to: m[2] };
  return LATEST;
}

/** "Latest", "All time", "June 2026", "Jan – Jun 2026". */
export function periodLabel(s: PeriodSelection): string {
  switch (s.kind) {
    case "latest": return "Latest";
    case "all": return "All time";
    case "month": return s.label;
    case "range": return rangeLabel(s.from, s.to);
  }
}
export function rangeLabel(from: string, to: string): string {
  const a = splitLabel(from), b = splitLabel(to);
  if (a && b && a.year === b.year) return `${a.month.slice(0, 3)} – ${b.month.slice(0, 3)} ${a.year}`;
  return `${short(from)} – ${short(to)}`;
}
export const short = (label: string) => { const p = splitLabel(label); return p ? `${p.month.slice(0, 3)} ${p.year}` : label; };
export const splitLabel = (label: string) => { const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(label.trim()); return m ? { month: m[1], year: m[2] } : null; };

/** Is a range or all time: the pages then add a month-by-month timeline. */
export const isSpan = (s: PeriodSelection) => s.kind === "all" || s.kind === "range";

/**
 * Does a month label match what was typed? Every word typed must start a word of the label
 * ("jun 26" → June 2026, "2026" → every month that year, "june 2026" → that month).
 */
export function matchesPeriod(label: string, query: string): boolean {
  const words = label.toLowerCase().split(/\s+/);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((t) => words.some((w) => w.startsWith(t) || (/^\d{2}$/.test(t) && w.endsWith(t))));
}
