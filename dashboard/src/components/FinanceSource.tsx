/**
 * How a finance figure says where it came from.
 * An approved operating-report PDF keeps the caller's existing "as at {month}" wording.
 * A preliminary MYOB board shows `sourceLabel` and a neutral Preliminary tag — never the amber
 * placeholder banner, which means the figures are layout samples.
 */
import { Badge } from "./ui";

export function PreliminaryTag({ title }: { title?: string }) {
  return <Badge tone="preliminary" title={title ?? "Year-to-date actuals from MYOB, before an operating report for this month is approved"}>Preliminary</Badge>;
}

export function uniqueLabels(labels: Array<string | null | undefined>): string[] {
  return [...new Set(labels.filter((s): s is string => !!s && s.trim().length > 0))];
}

/**
 * Text for a shared "as at" note when several boards are on screen.
 * Returns null when every board is an ordinary PDF, so the caller keeps today's wording.
 * A PDF month is appended only when the MYOB label does not already name it.
 */
export function sourceNoteText(entries: Array<{ sourceLabel?: string | null; asAt?: string | null }>): string | null {
  const labels = uniqueLabels(entries.map((e) => e.sourceLabel));
  if (!labels.length) return null;
  const months = uniqueLabels(entries.filter((e) => !e.sourceLabel).map((e) => e.asAt));
  const extra = months.filter((m) => !labels.some((l) => l.includes(m)));
  return [...labels, ...extra].join(" · ");
}

/** The source sentence plus the Preliminary tag. */
export function SourceLine({ text }: { text: string }) {
  return <span className="source-note">{text} <PreliminaryTag title={text} /></span>;
}
