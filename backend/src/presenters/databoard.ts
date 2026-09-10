/**
 * Databoard presenter — raw weekly fields plus everything derived from the finance side.
 * Output matches the frontend's databoard document with derived fields added.
 */
import type { CashItem, DataboardDocument, Rating } from "@/domain/types";
import { toDollars } from "@/lib/money";
import type { WeeklyBoardDoc } from "@/services/databoard";
import type { UnitBoard } from "@/services/financeQuery";
import type { UnitDoc } from "@/services/structure";
import { financeStatus, toLower, worst } from "@/services/status";

const compact = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2).replace(/\.?0+$/, "")}m` : a >= 1e3 ? `$${Math.round(a / 1e3)}k` : `$${Math.round(a)}`;
  return n < 0 ? `(${s})` : s;
};

export function presentDataboard(board: WeeklyBoardDoc, units: UnitDoc[], finance: UnitBoard[]): DataboardDocument & { derived: unknown } {
  const fin = new Map(finance.map((b) => [b.unit.code, b]));
  const amber = finance[0]?.structure.metrics.amberWithinPct ?? 5;
  const noteOf = (n: WeeklyBoardDoc["healthRatings"][number]["notes"]) => (n instanceof Map ? Object.fromEntries(n) : (n ?? {})) as Record<string, string>;

  const matrix = board.healthRatings.map((r) => {
    const u = units.find((x) => x.code === r.unitCode);
    const fb = fin.get(r.unitCode);
    const financeLight: Rating | null = fb ? financeStatus(fb.rollup, amber) : null;
    const status = { enrolments: r.enrolments ?? "GREEN", staffing: r.staffing ?? "GREEN", buildings: r.buildings ?? "GREEN", whs: r.whs ?? "GREEN" };
    const overall = worst([financeLight, status.enrolments, status.staffing, status.buildings, status.whs]);
    return {
      unit: r.unitCode, school: r.schoolLabel || u?.name || r.unitCode, sub: r.subLabel || u?.location || "",
      status: { overall: toLower(overall), finance: financeLight ? toLower(financeLight) : undefined, enrolments: toLower(status.enrolments), staffing: toLower(status.staffing), buildings: toLower(status.buildings), whs: toLower(status.whs) },
      notes: noteOf(r.notes),
      derived: { overall: true, finance: !!financeLight, financeVariance: fb ? toDollars(fb.rollup.surVar) : null, surplus: fb ? toDollars(fb.rollup.totals.surplus.actual) : null, asAt: fb?.period.label ?? null },
    };
  });

  const surA = finance.reduce((s, b) => s + b.rollup.totals.surplus.actual, 0);
  const surB = finance.reduce((s, b) => s + b.rollup.totals.surplus.budget, 0);
  const cash: Array<CashItem & { derived: boolean }> = board.cashItems.map((c) => {
    const kind = c.kind as CashItem["kind"];
    if (kind === "OPERATING_RESULT") {
      const v = toDollars(surA), d = toDollars(surA - surB);
      return { kind, label: c.label, value: `${v < 0 ? "−" : "+"}${compact(Math.abs(v))}`, delta: `${compact(Math.abs(d))} ${d >= 0 ? "ahead of" : "behind"} budget · ${finance.length} finance boards`, feature: c.feature, derived: true };
    }
    return { kind, label: c.label, value: c.valueText || (c.amountMinor != null ? compact(toDollars(c.amountMinor)) : ""), delta: c.changeNote, feature: c.feature, derived: false };
  });

  const schools = board.unitSnapshots.map((s) => {
    const u = units.find((x) => x.code === s.unitCode);
    const fb = fin.get(s.unitCode);
    const row = matrix.find((m) => m.unit === s.unitCode);
    const sur = fb ? toDollars(fb.rollup.totals.surplus.actual) : null;
    const sv = fb ? toDollars(fb.rollup.surVar) : null;
    return {
      unit: s.unitCode, name: u?.name ?? s.unitCode, loc: u?.location ?? "", colour: u?.colourHex ?? null,
      overall: row?.status.overall ?? "green",
      budget: sur == null ? "" : `${sur >= 0 ? "Surplus" : "Deficit"} ${compact(sur)} YTD`,
      variance: sv == null ? "" : `${compact(Math.abs(sv))} ${sv >= 0 ? "ahead of" : "behind"} budget`,
      finance: fb ? { asAt: fb.period.label, placeholder: fb.version.isPlaceholder, surplus: sur, surplusBudget: toDollars(fb.rollup.totals.surplus.budget), variance: sv } : null,
      project: s.buildingProject, progress: s.progressPct, loan: s.loanBalanceText, payments: s.paymentsText, staffing: s.staffingNote, enrolments: s.enrolmentNote,
      enrolLabel: s.enrolLabel, enrolTrend: s.enrolTrend,
    };
  });

  const list = (kind: "RISK" | "WHS" | "CELEBRATION") => board.items.filter((i) => i.kind === kind).sort((a, b) => a.displayOrder - b.displayOrder)
    .map((i) => ({ rating: i.rating ? toLower(i.rating) : undefined, main: i.title, meta: i.detail }));

  return {
    weekEnding: board.weekEndingLabel, status: board.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    lastUpdated: board.updatedAt?.toISOString(),
    cash, matrix, schools, risks: list("RISK"), whs: list("WHS"), celebrate: list("CELEBRATION"),
    derived: { operatingResult: { surplus: toDollars(surA), budget: toDollars(surB), boards: finance.length }, rule: "Overall = worst of the five measures; Finance = surplus vs budget on the school's approved finance board" },
  };
}
