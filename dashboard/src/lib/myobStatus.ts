/** Wording for a preliminary MYOB board and for the long month-by-month sync. */
import type { MyobProgress } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** YYYY-MM-DD (or an ISO instant) → "12 Nov 2026", without a timezone shift. */
export function postedOn(value: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/** The source sentence, plus the latest posting date when the board has one. */
export function sourceWithPosting(label: string, posted?: string | null): string {
  const when = postedOn(posted);
  return when ? `${label} · latest posting ${when}` : label;
}

/**
 * One calm line for a run that reads about a minute a month.
 * "Reading MYOB: March 2026 (3 of 10)" while that month's inquiry is the current one.
 */
export function myobProgressLine(progress: MyobProgress | null | undefined): string {
  if (!progress || progress.phase === "starting") return "Starting the MYOB sync…";
  if (progress.phase === "done") return "Finishing the sync…";
  if (progress.phase === "saving") {
    const schools = progress.schools;
    const current = schools.find((s) => s.status === "running");
    const done = schools.filter((s) => s.status === "saved" || s.status === "skipped" || s.status === "failed").length;
    if (current) return `Saving boards (${Math.min(done + 1, schools.length)} of ${schools.length})…`;
    return schools.length ? `Saving the preliminary boards (${done} of ${schools.length})…` : "Saving the preliminary boards…";
  }
  const months = progress.months;
  if (!months.length) return "Reading MYOB…";
  const current = months.find((m) => m.status === "running") ?? months.find((m) => m.status === "pending");
  if (!current) {
    const done = months.filter((m) => m.status === "done" || m.status === "failed").length;
    return `Reading MYOB (${done} of ${months.length})`;
  }
  const index = months.findIndex((m) => m.period === current.period) + 1;
  return `Reading MYOB: ${current.label} (${index} of ${months.length})`;
}
