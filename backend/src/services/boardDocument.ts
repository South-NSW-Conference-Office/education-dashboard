/**
 * Board-document transformer — the bridge between the JSON the existing frontend
 * uses (backend/seed-data/finance-*.js, exports, PUT bodies) and the fact model.
 * Pure. Used by the seed, the import pipeline and the write endpoints.
 */
import { COLUMN_KEYS, COLUMNS, type BoardDocument, type ReportedTotalLite, type Section } from "@/domain/types";
import { toMinor } from "@/lib/money";

/** How the source reports name a group ↔ the canonical group. Codes are stable; names are display. */
export const GROUP_ALIASES: Record<string, string[]> = {
  PROPERTY_EXPENSES: ["Property expenses", "Occupancy expenses"],
  CAPITAL_EXPENDITURE: ["Capital expenditure", "Capital expenses"],
  OTHER_INCOME: ["Other income", "Other incomes"],                          // page 1 of the operating report says "Other incomes"
  ADMINISTRATIVE_EXPENSES: ["Administrative expenses", "Administrative expense"], // its detail pages say "Administrative expense"
};

export const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
export const normName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Canonical group code for a name the report uses. */
export function groupCodeFor(name: string): string {
  const n = normName(name);
  for (const [code, names] of Object.entries(GROUP_ALIASES)) if (names.some((x) => normName(x) === n)) return code;
  return slug(name);
}

/** Account code for a line; lines the report gave no code get a stable synthetic one from their label. */
export function accountCodeFor(row: { code?: string; label: string }): string {
  const c = (row.code ?? "").trim();
  return c || `X-${slug(row.label)}`;
}

export interface ExtractedLine {
  section: Section; groupCode: string; groupName: string;
  accountCode: string; label: string; sourceCode: string;
  amountsMinor: Record<(typeof COLUMN_KEYS)[number], number>;
}
export interface Extracted {
  lines: ExtractedLine[];
  groups: Array<{ code: string; name: string; section: Section; displayOrder: number }>;
  reportedTotals: ReportedTotalLite[];
  addbackMinor: { ytdBudget: number; ytdActual: number };
  salaryLabel: string | null;
  duplicates: string[];
  warnings: string[];
}

/** Take a board document apart into lines, groups and page-1 totals (all minor units). */
export function extractBoard(doc: BoardDocument): Extracted {
  const lines: ExtractedLine[] = [];
  const groups: Extracted["groups"] = [];
  const reportedTotals: ReportedTotalLite[] = [];
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  const warnings: string[] = [];
  let order = 0;

  (["income", "expenditure"] as const).forEach((sec) => {
    const section: Section = sec === "income" ? "INCOME" : "EXPENDITURE";
    for (const g of doc.details?.[sec] ?? []) {
      const groupCode = groupCodeFor(g.group);
      if (!groups.some((x) => x.code === groupCode)) groups.push({ code: groupCode, name: g.group, section, displayOrder: order++ });
      for (const r of g.rows ?? []) {
        const accountCode = accountCodeFor(r);
        const prev = seen.get(accountCode);
        if (prev && prev !== groupCode) duplicates.push(`${accountCode} appears under ${prev} and ${groupCode}`);
        seen.set(accountCode, groupCode);
        lines.push({
          section, groupCode, groupName: g.group, accountCode, label: r.label, sourceCode: r.code ?? "",
          amountsMinor: { budget: toMinor(r.budget), actual: toMinor(r.actual), annualBudget: toMinor(r.annualBudget), eoyEstimate: toMinor(r.eoyEstimate) },
        });
      }
    }
    // page-1 category figures → reported totals per group
    for (const cat of doc[sec] ?? []) {
      const groupCode = groupCodeFor(cat.label);
      const existing = groups.find((x) => x.code === groupCode);
      if (!existing) {
        groups.push({ code: groupCode, name: cat.label, section, displayOrder: order++ });
        warnings.push(`Overview category "${cat.label}" has no line items`);
      } else existing.name = cat.label; // the dashboard shows the Overview's wording (e.g. "Capital expenditure", not "Capital expenses")
      for (const k of COLUMN_KEYS) reportedTotals.push({ metricCode: "GROUP_TOTAL", groupCode, ...COLUMNS[k], amountMinor: toMinor(cat[k]) });
    }
  });

  const sub = doc.expenditure?.find((c) => c.sub?.length)?.sub?.[0] ?? null;
  if (sub) for (const k of COLUMN_KEYS) reportedTotals.push({ metricCode: "SALARY_SUBLINE", ...COLUMNS[k], amountMinor: toMinor(sub[k]) });

  const addbackMinor = { ytdBudget: toMinor(doc.addback?.ytdBudget), ytdActual: toMinor(doc.addback?.ytdActual) };
  reportedTotals.push({ metricCode: "EBIDA_ADDBACK", ...COLUMNS.budget, amountMinor: addbackMinor.ytdBudget });
  reportedTotals.push({ metricCode: "EBIDA_ADDBACK", ...COLUMNS.actual, amountMinor: addbackMinor.ytdActual });

  return { lines, groups, reportedTotals, addbackMinor, salaryLabel: sub?.label ?? null, duplicates, warnings };
}

/** Account codes for the two formula metrics, discovered from line labels (then stored as data). */
export const isAddbackLine = (label: string) => /depreciation|amortis|interest/i.test(label);
export const isSalaryLine = (label: string) => /salar|casual|fringe/i.test(label);
/** The "of which: salaries" sub-line belongs to the tuition group only. */
export const isSalaryHostGroup = (groupCode: string) => /^TUITION/.test(groupCode);

export function accountClassFor(section: Section, groupCode: string): "REVENUE" | "EXPENSE" | "CAPITAL_INCOME" | "CAPITAL_EXPENDITURE" {
  if (groupCode.startsWith("CAPITAL")) return section === "INCOME" ? "CAPITAL_INCOME" : "CAPITAL_EXPENDITURE";
  return section === "INCOME" ? "REVENUE" : "EXPENSE";
}
