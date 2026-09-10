/** Immutable helpers for edit mode. The editable copy is a plain board document; the server computes the rest. */
import type { Amounts, Board, DetailGroup, LineItem } from "./types";

export const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
export const KEYS = ["budget", "actual", "annualBudget", "eoyEstimate"] as const;

export function sumRows(rows: LineItem[]): Amounts {
  const a: Amounts = { budget: 0, actual: 0, annualBudget: 0, eoyEstimate: 0 };
  for (const r of rows) for (const k of KEYS) a[k] += Number(r[k]) || 0;
  return a;
}
export function sumGroups(groups: DetailGroup[]): Amounts {
  const a: Amounts = { budget: 0, actual: 0, annualBudget: 0, eoyEstimate: 0 };
  for (const g of groups) { const s = sumRows(g.rows); for (const k of KEYS) a[k] += s[k]; }
  return a;
}
export const rowEmpty = (r: LineItem) => KEYS.every((k) => !Number(r[k]));
export const matches = (r: LineItem, q: string) => !q || `${r.code} ${r.label}`.toLowerCase().includes(q);

export function updateRow(board: Board, sec: "income" | "expenditure", gi: number, ri: number, patch: Partial<LineItem>): Board {
  const b = clone(board);
  Object.assign(b.details[sec][gi].rows[ri], patch);
  return b;
}
export function addRow(board: Board, sec: "income" | "expenditure", gi: number): Board {
  const b = clone(board);
  b.details[sec][gi].rows.push({ code: "", label: "New line", budget: 0, actual: 0, annualBudget: 0, eoyEstimate: 0 });
  return b;
}
export function removeRow(board: Board, sec: "income" | "expenditure", gi: number, ri: number): Board {
  const b = clone(board);
  b.details[sec][gi].rows.splice(ri, 1);
  return b;
}
export function setPath(board: Board, path: string, value: unknown): Board {
  const b = clone(board);
  const parts = path.split(".");
  let o: Record<string, unknown> = b as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] as Record<string, unknown>;
  o[parts[parts.length - 1]] = value;
  return b;
}
