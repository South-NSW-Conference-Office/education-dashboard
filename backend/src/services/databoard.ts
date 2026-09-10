/**
 * DataboardService — the weekly education databoard: load, save raw fields, publish.
 * Only judgement fields are stored; the presenter adds everything derived from finance.
 */
import { WeeklyBoardModel } from "@/models";
import type { DataboardDocument, Rating } from "@/domain/types";
import { badRequest, notFound } from "@/lib/http";
import { toMinor } from "@/lib/money";
import { getOrg, listUnits, type UnitDoc } from "./structure";
import { toUpper } from "./status";
import { audit } from "./workflow";

export interface WeeklyBoardDoc {
  _id: unknown; weekEnding: Date; weekEndingLabel: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; publishedAt: Date | null; updatedAt: Date;
  healthRatings: Array<{ unitCode: string; schoolLabel: string; subLabel: string; enrolments?: Rating; staffing?: Rating; buildings?: Rating; whs?: Rating; notes?: Map<string, string> | Record<string, string> }>;
  cashItems: Array<{ kind: string; label: string; amountMinor: number | null; valueText: string; changeNote: string; feature: boolean }>;
  unitSnapshots: Array<{ unitCode: string; buildingProject: string; progressPct: number; loanBalanceText: string; paymentsText: string; staffingNote: string; enrolmentNote: string; enrolLabel: string; enrolTrend: number[] }>;
  items: Array<{ kind: "RISK" | "WHS" | "CELEBRATION"; rating: Rating | null; title: string; detail: string; displayOrder: number }>;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** "Friday 20 June 2026" or "2026-06-20" → Date (UTC midnight). */
export function parseWeekEnding(s: string): Date {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(s);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  if (!m || month < 0) throw badRequest(`Week ending "${s}" must look like "Friday 20 June 2026" or "2026-06-20"`);
  return new Date(Date.UTC(+m[3], month, +m[1]));
}
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** The newest board, published if there is one. With `upTo`, the newest whose week ended on or before that date. */
export async function latestBoard(preferPublished = true, upTo?: Date): Promise<WeeklyBoardDoc | null> {
  const org = await getOrg();
  const q: Record<string, unknown> = preferPublished ? { organisationId: org._id, status: "PUBLISHED" } : { organisationId: org._id };
  if (upTo) q.weekEnding = { $lte: upTo };
  const b = (await WeeklyBoardModel.findOne(q).sort({ weekEnding: -1 }).lean()) as unknown as WeeklyBoardDoc | null;
  return b ?? (preferPublished ? latestBoard(false, upTo) : null);
}
export async function boardFor(weekEnding: string): Promise<WeeklyBoardDoc> {
  const org = await getOrg();
  const b = (await WeeklyBoardModel.findOne({ organisationId: org._id, weekEnding: parseWeekEnding(weekEnding) }).lean()) as unknown as WeeklyBoardDoc | null;
  if (!b) throw notFound(`Databoard for week ending ${weekEnding}`);
  return b;
}

/** Map a unit for a matrix/snapshot row: by explicit unit code, by the original file's theme key, or by name. */
export function unitForRow(row: { unit?: string; theme?: string; id?: string; name?: string; school?: string }, units: UnitDoc[]): UnitDoc | null {
  const code = row.unit ?? row.id;
  if (code) { const u = units.find((x) => x.code === code); if (u) return u; }
  if (row.theme) { const u = units.find((x) => x.databoardKey === row.theme); if (u) return u; }
  const name = row.name ?? row.school;
  return units.find((x) => x.name === name) ?? null;
}

/** Store the raw fields of a databoard document (derived fields in the payload are ignored). */
export async function saveBoard(doc: DataboardDocument & { matrix: Array<Record<string, unknown>>; schools: Array<Record<string, unknown>> }, opts: { publish?: boolean } = {}): Promise<WeeklyBoardDoc> {
  if (!doc?.weekEnding) throw badRequest("weekEnding is required");
  const org = await getOrg();
  const units = await listUnits();
  const weekEnding = parseWeekEnding(doc.weekEnding);

  const healthRatings = (doc.matrix ?? []).map((r) => {
    const u = unitForRow(r as never, units);
    if (!u) throw badRequest(`Matrix row "${r.school ?? r.unit}" does not match a unit`);
    const st = (r.status ?? {}) as Record<string, string>;
    return {
      unitCode: u.code, schoolLabel: String(r.school ?? u.name), subLabel: String(r.sub ?? u.location),
      enrolments: toUpper(st.enrolments) ?? "GREEN", staffing: toUpper(st.staffing) ?? "GREEN", buildings: toUpper(st.buildings) ?? "GREEN", whs: toUpper(st.whs) ?? "GREEN",
      notes: Object.fromEntries(Object.entries((r.notes ?? {}) as Record<string, string>).filter(([, v]) => v)),
    };
  });
  const cashItems = (doc.cash ?? []).map((c, i) => {
    const kind = c.kind ?? (/operating result/i.test(c.label) ? "OPERATING_RESULT" : /cash on hand/i.test(c.label) ? "CASH_ON_HAND" : /loan/i.test(c.label) ? "LOAN_BALANCES" : /reserve/i.test(c.label) ? "RESERVES" : "OTHER");
    const num = /^\$?([\d.,]+)\s*([km])?$/i.exec(String(c.value ?? "").replace(/[+\s]/g, ""));
    const amountMinor = kind === "OPERATING_RESULT" || !num ? null : toMinor(parseFloat(num[1].replace(/,/g, "")) * (num[2]?.toLowerCase() === "m" ? 1e6 : num[2]?.toLowerCase() === "k" ? 1e3 : 1));
    return { kind, label: c.label, amountMinor, valueText: kind === "OPERATING_RESULT" ? "" : String(c.value ?? ""), changeNote: kind === "OPERATING_RESULT" ? "" : String(c.delta ?? ""), feature: !!c.feature || i === 0 };
  });
  const unitSnapshots = (doc.schools ?? []).map((s) => {
    const u = unitForRow(s as never, units);
    if (!u) throw badRequest(`School card "${s.name}" does not match a unit`);
    return {
      unitCode: u.code, buildingProject: String(s.project ?? ""), progressPct: Math.max(0, Math.min(100, Number(s.progress) || 0)),
      loanBalanceText: String(s.loan ?? ""), paymentsText: String(s.payments ?? ""), staffingNote: String(s.staffing ?? ""), enrolmentNote: String(s.enrolments ?? ""),
      enrolLabel: String(s.enrolLabel ?? ""), enrolTrend: ((s.enrolTrend as unknown[]) ?? []).map(Number).filter((n) => !isNaN(n)),
    };
  });
  const items = [
    ...(doc.risks ?? []).map((x, i) => ({ kind: "RISK" as const, rating: toUpper(x.rating), title: x.main, detail: x.meta ?? "", displayOrder: i })),
    ...(doc.whs ?? []).map((x, i) => ({ kind: "WHS" as const, rating: toUpper(x.rating), title: x.main, detail: x.meta ?? "", displayOrder: i })),
    ...(doc.celebrate ?? []).map((x, i) => ({ kind: "CELEBRATION" as const, rating: null, title: x.main, detail: x.meta ?? "", displayOrder: i })),
  ];

  const set: Record<string, unknown> = { weekEndingLabel: doc.weekEnding, healthRatings, cashItems, unitSnapshots, items };
  const setOnInsert: Record<string, unknown> = { organisationId: org._id, weekEnding };
  if (opts.publish) { set.status = "PUBLISHED"; set.publishedAt = new Date(); } else setOnInsert.status = "DRAFT";
  const saved = await WeeklyBoardModel.findOneAndUpdate(
    { organisationId: org._id, weekEnding },
    { $set: set, $setOnInsert: setOnInsert },
    { upsert: true, returnDocument: "after" },
  ).lean();
  await audit("weekly_board", String(saved!._id), opts.publish ? "SAVE_AND_PUBLISH" : "SAVE");
  return saved as unknown as WeeklyBoardDoc;
}

export async function publishBoard(weekEnding: string): Promise<WeeklyBoardDoc> {
  const b = await boardFor(weekEnding);
  await WeeklyBoardModel.updateOne({ _id: b._id }, { $set: { status: "PUBLISHED", publishedAt: new Date() } });
  await audit("weekly_board", String(b._id), "PUBLISH");
  return boardFor(weekEnding);
}
