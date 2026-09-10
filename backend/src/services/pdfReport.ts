/**
 * Operating-report parser — the monthly "Financial Performance" PDF (Excel → PDF) into a board document.
 * Pure: positioned text in, figures and warnings out. No database, no pdf.js.
 *
 * What the report looks like, and what the parser leans on:
 *   · Page 1 (portrait): one row per category with YTD budget / actual / difference, annual budget,
 *     estimated end of year and movement; then Total income, Total expenditure, Surplus, EBIDA.
 *     Family debtors and capital expenditure are charts, so their figures are not in the text.
 *   · Detail pages (landscape): a heading per group, one row per account (4-digit code, label,
 *     the same six figures plus two percentages), a subtotal row repeating the group name, and
 *     TOTAL INCOME / TOTAL OPERATING EXPENSES / SURPLUS rows.
 *   · Cells are Excel cells. Numbers are right-aligned, so every cell in a column shares one right
 *     edge and blanks are simply absent. Long labels wrap upwards: the code sits on the bottom line
 *     of a tall row and the earlier parts of its label sit on the lines above it.
 */
import type { PageText, TextItem } from "@/lib/pdf";
import { COLUMN_KEYS, zeroAmounts, type Amounts, type BoardDocument, type ObligationItem, type Section } from "@/domain/types";
import { groupCodeFor, isAddbackLine } from "./boardDocument";

/* ------------------------------------------------------------------ */
/* Output                                                               */
/* ------------------------------------------------------------------ */

export interface ParsedLine extends Amounts { code: string; label: string; page: number }
export interface ParsedGroup { name: string; section: Section; rows: ParsedLine[]; subtotal: Amounts | null }
export interface SummaryRow extends Amounts { label: string; section: Section }
export interface ParsedReport {
  /** "Narromine Christian School" — the part of the page-1 title after the entity name */
  unitName: string | null;
  /** "August 2026" */
  periodLabel: string | null;
  /** title lines from the top of the pages, for matching the report to a unit */
  headerLines: string[];
  summary: { rows: SummaryRow[]; surplus: Amounts | null; ebida: Amounts | null };
  /** family debtors, measured off the bars of the page-1 chart (dollars, approximate) */
  debtors: { current: number; prior: number } | null;
  groups: ParsedGroup[];
  warnings: string[];
  /** anything that stops the figures being trusted; the board should not be published with these */
  errors: string[];
}

/* ------------------------------------------------------------------ */
/* Tokens and lines                                                     */
/* ------------------------------------------------------------------ */

/** Runs on one text line share a baseline exactly; the next line of a wrapped cell is ≥ 1pt away. */
const LINE_TOLERANCE = 0.6;
/** A cell's right edge may drift by a fraction of a point between rows. */
const COLUMN_TOLERANCE = 3;
const AMOUNT = /^\(?-?\$?\d[\d,]*(?:\.\d+)?\)?$/;

/** "(78,441)" → -78441, "1,872" → 1872; percentages, "-", "#REF!" and words → null. */
export function parseAmount(s: string): number | null {
  if (!AMOUNT.test(s)) return null;
  const n = Number(s.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return s.startsWith("(") || s.includes("-") ? -n : n;
}
const isAmount = (it: TextItem) => parseAmount(it.s) !== null;
const isPercent = (it: TextItem) => /%$/.test(it.s);
const isWord = (it: TextItem) => !isAmount(it) && !isPercent(it) && it.s !== "-" && it.s !== "#REF!";
const right = (it: TextItem) => it.x + it.w;

interface Line { page: number; y: number; items: TextItem[] }

/** Group a page's runs into text lines, top to bottom, left to right. */
export function toLines(page: PageText): Line[] {
  const sorted = [...page.items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= LINE_TOLERANCE) last.items.push(it);
    else lines.push({ page: page.page, y: it.y, items: [it] });
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

/** One right edge per numeric column: cluster the right edges of the amounts on the given lines. */
function findColumns(lines: Line[], skip: (it: TextItem) => boolean = () => false, gap = 4): Array<{ edge: number; count: number }> {
  const edges = lines.flatMap((l) => l.items.filter((it) => isAmount(it) && !skip(it)).map(right)).sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const e of edges) {
    const c = clusters[clusters.length - 1];
    if (c && e - c[c.length - 1] <= gap) c.push(e); else clusters.push([e]);
  }
  return clusters.map((c) => ({ edge: c.reduce((s, v) => s + v, 0) / c.length, count: c.length }));
}

/** Which column an amount belongs to, by its right edge; -1 when it sits between columns. */
function columnOf(it: TextItem, columns: number[]): number {
  let best = -1, bestDist = COLUMN_TOLERANCE + 1;
  columns.forEach((edge, i) => { const d = Math.abs(right(it) - edge); if (d < bestDist) { best = i; bestDist = d; } });
  return best;
}

/** The four board columns from a row's six (or four) figures, by position. */
type ColumnMap = Record<"budget" | "actual" | "annualBudget" | "eoyEstimate", number> & { varYtd?: number };
function mapColumns(count: number): ColumnMap | null {
  if (count === 6) return { budget: 0, actual: 1, varYtd: 2, annualBudget: 3, eoyEstimate: 4 };   // budget, actual, var, annual, EOY, var
  if (count === 4) return { budget: 0, actual: 1, annualBudget: 2, eoyEstimate: 3 };
  return null;
}

function amountsOn(line: Line, edges: number[], map: ColumnMap, warnings: string[], what: string, skip: (it: TextItem) => boolean = () => false): Amounts & { varYtd: number | null } {
  const byCol = new Map<number, number>();
  for (const it of line.items) {
    if (skip(it)) continue;
    const v = parseAmount(it.s);
    if (v === null) continue;
    const c = columnOf(it, edges);
    if (c < 0) { warnings.push(`${what}: the figure ${it.s} sits between columns and was ignored`); continue; }
    byCol.set(c, (byCol.get(c) ?? 0) + v);
  }
  const at = (i: number | undefined) => (i === undefined ? 0 : byCol.get(i) ?? 0);
  return { budget: at(map.budget), actual: at(map.actual), annualBudget: at(map.annualBudget), eoyEstimate: at(map.eoyEstimate), varYtd: map.varYtd === undefined ? null : byCol.has(map.varYtd) ? byCol.get(map.varYtd)! : null };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const sentenceCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);
const textOf = (items: TextItem[]) => items.map((i) => i.s).join(" ").replace(/\s+/g, " ").trim();
const allZero = (a: Amounts) => COLUMN_KEYS.every((k) => !a[k]);

/**
 * Join the wrapped parts of a label. Excel wraps at spaces, so parts get a space between them —
 * except the one case it breaks inside a word: a token too long for the cell. That part fills the
 * cell exactly (its right edge is the wrap width, with less than a character to spare), its last
 * token is long, and the continuation starts in lower case.
 */
export function joinLabel(parts: Array<{ s: string; x: number; w: number }>, wrapWidth: number): string {
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i], s = p.s.trim();
    if (!s) continue;
    if (!out) { out = s; continue; }
    const prev = parts[i - 1];
    const lastToken = out.split(" ").pop() ?? "";
    const charWidth = prev.w / Math.max(prev.s.length, 1);
    const fillsCell = wrapWidth - (prev.x + prev.w) < charWidth;
    if (/\s-$/.test(out)) out += " " + s;                                        // "Tuition fees -" + "Students"
    else if (/-$/.test(out)) out += s;                                          // "(non-" + "refundable)"
    else if (fillsCell && lastToken.length >= 10 && /^[a-z]/.test(s)) out += s; // "Enrolment/applicat" + "ion"
    else out += " " + s;
  }
  return out.replace(/\s+/g, " ").replace(/\s-$/, "").trim();
}

/* ------------------------------------------------------------------ */
/* Page 1                                                               */
/* ------------------------------------------------------------------ */

const isCodeItem = (it: TextItem, page: PageText) => /^\d{4}$/.test(it.s) && it.x < page.width * 0.12;

function parseSummary(page: PageText, out: ParsedReport): void {
  const lines = toLines(page);
  const labelLimit = page.width * 0.12;
  const isCategoryLine = (l: Line) => isWord(l.items[0]) && l.items[0].x < labelLimit && l.items.filter(isAmount).length >= 3;
  const catLines = lines.filter(isCategoryLine);
  if (!catLines.length) { out.errors.push("Page 1 has no category rows (expected Student tuition, Government grants, …)"); return; }

  const columns = findColumns(catLines);
  const map = mapColumns(columns.length);
  if (!map) { out.errors.push(`Page 1 has ${columns.length} numeric columns; expected 6 (YTD budget, actual, difference, annual budget, estimated end of year, movement)`); return; }
  const edges = columns.map((c) => c.edge);

  let section: Section | null = null;
  for (const l of lines) {
    const words = l.items.filter((i) => isWord(i) && i.x < edges[0] - 40);
    const text = textOf(words);
    if (l.items.length === 1 && /^income$/i.test(text)) { section = "INCOME"; continue; }
    if (l.items.length === 1 && /^expenditure$/i.test(text)) { section = "EXPENDITURE"; continue; }
    if (!isCategoryLine(l)) continue;
    const a = amountsOn(l, edges, map, out.warnings, `Page 1 "${text}"`);
    const amounts: Amounts = { budget: a.budget, actual: a.actual, annualBudget: a.annualBudget, eoyEstimate: a.eoyEstimate };
    if (/^total/i.test(text) || /margin/i.test(text)) continue;
    if (/^surplus/i.test(text)) { out.summary.surplus = amounts; continue; }
    if (/^ebida/i.test(text)) { out.summary.ebida = amounts; continue; }
    if (!section) { out.warnings.push(`Page 1 row "${text}" appears before the Income / Expenditure headings and was ignored`); continue; }
    out.summary.rows.push({ label: text, section, ...amounts });
  }
  parseDebtorsChart(page, out);
}

/**
 * The Family Debtors chart prints no figures, only bars. Excel draws each bar as a rectangle whose
 * height is proportional to its value, so the bars are measured against the axis labels. Legend
 * order (Current YTD, Prior YTD) matches bar order. Good to a few hundred dollars, not to the dollar.
 */
function parseDebtorsChart(page: PageText, out: ParsedReport): void {
  const title = page.items.find((i) => /family debtors/i.test(i.s));
  if (!title || !page.rects.length) return;
  const nextTitle = page.items.filter((i) => Math.abs(i.y - title.y) < 2 && i.x > title.x + 40).sort((a, b) => a.x - b.x)[0];
  const left = 0, rightBound = nextTitle ? nextTitle.x - 60 : page.width, top = title.y, bottom = title.y - 120;
  const inRegion = (x: number, y: number) => x >= left && x < rightBound && y > bottom && y < top;

  // Axis labels are right-aligned on one edge; the category labels under the axis ("1", "2") are not.
  const candidates = page.items.filter((i) => inRegion(i.x, i.y) && i.x < title.x && parseAmount(i.s) !== null).map((i) => ({ y: i.y, v: parseAmount(i.s)!, r: right(i) }));
  const edges = candidates.map((c) => c.r).sort((a, b) => a - b);
  const median = edges[Math.floor(edges.length / 2)] ?? 0;
  const axis = candidates.filter((c) => Math.abs(c.r - median) <= 3);
  if (axis.length < 2) return;
  const hi = axis.reduce((a, b) => (b.v > a.v ? b : a)), lo = axis.reduce((a, b) => (b.v < a.v ? b : a));
  if (hi.y === lo.y || hi.v === lo.v) return;
  const perPoint = (hi.v - lo.v) / (hi.y - lo.y);
  const axisRight = Math.max(...axis.map((a) => a.r));

  const bars = page.rects.filter((r) => inRegion(r.x, r.y) && r.x > axisRight && r.w >= 8 && r.w <= 80 && r.h >= 1).sort((a, b) => a.x - b.x);
  const plotBottom = Math.min(...bars.map((b) => b.y));
  const legend = page.items.filter((i) => inRegion(i.x, i.y) && i.y < plotBottom && isWord(i)).sort((a, b) => a.x - b.x).map((i) => i.s);
  if (bars.length !== 2 || legend.length < 2) { out.warnings.push("Family Debtors chart on page 1 could not be read; type the debtors in on the board"); return; }
  const value = (b: (typeof bars)[number]) => lo.v + b.h * perPoint;
  const byLegend = new Map(legend.slice(0, 2).map((l, i) => [l, value(bars[i])]));
  const current = [...byLegend].find(([l]) => /current/i.test(l))?.[1], prior = [...byLegend].find(([l]) => /prior/i.test(l))?.[1];
  if (current === undefined || prior === undefined) { out.warnings.push(`Family Debtors chart legend reads "${legend.join(" / ")}", not Current / Prior; type the debtors in on the board`); return; }
  out.debtors = { current: Math.round(current / 100) * 100, prior: Math.round(prior / 100) * 100 };
}

/* ------------------------------------------------------------------ */
/* Detail pages                                                         */
/* ------------------------------------------------------------------ */

function parseDetails(pages: PageText[], out: ParsedReport): void {
  const pageLines = pages.map((p) => ({ page: p, lines: toLines(p) }));
  const codeLines = pageLines.flatMap(({ page, lines }) => lines.filter((l) => l.items.some((i) => isCodeItem(i, page))));
  if (!codeLines.length) { out.errors.push("No account lines found (rows starting with a 4-digit account code)"); return; }

  // Columns: the amounts on account lines only (less the code itself), so the hidden helper cells on heading rows do not count.
  const isCode = (it: TextItem) => /^\d{4}$/.test(it.s) && it.x < pages[0].width * 0.12;
  const columns = findColumns(codeLines, isCode);
  const map = mapColumns(columns.length);
  if (!map) { out.errors.push(`Detail pages have ${columns.length} numeric columns; expected 6 (YTD budget, actual, variance, annual budget, EOY forecast, variance)`); return; }
  const edges = columns.map((c) => c.edge);
  const labelLimit = edges[0] - 80;

  const summaryCode = new Map(out.summary.rows.map((r) => [groupCodeFor(r.label), r.section]));
  let section: Section = "INCOME";
  let group: ParsedGroup | null = null;
  let pending: TextItem[] = [];
  // Labels are joined after the pass, once the label cell's wrap width is known from every wrapped part.
  const labelParts: Array<{ row: ParsedLine; wrapped: TextItem[]; own: TextItem[] }> = [];

  for (const { page, lines } of pageLines) {
    for (const line of lines) {
      const code = line.items.find((i) => isCodeItem(i, page));
      const words = line.items.filter((i) => isWord(i) && i.x < labelLimit && i.s !== "##");

      if (code) {
        const own = words.filter((i) => i.x > code.x + code.w);
        if (!group) { group = { name: section === "INCOME" ? "Other income" : "Other expenses", section, rows: [], subtotal: null }; out.groups.push(group); out.warnings.push(`Account ${code.s} appears before any group heading; listed under ${group.name}`); }
        const a = amountsOn(line, edges, map, out.warnings, `Account ${code.s}`, (it) => it === code);
        const row: ParsedLine = { code: code.s, label: "", page: page.page, budget: a.budget, actual: a.actual, annualBudget: a.annualBudget, eoyEstimate: a.eoyEstimate };
        labelParts.push({ row, wrapped: pending, own });
        pending = [];
        // The report's own arithmetic: variance = actual − budget for income, budget − actual for spending.
        if (a.varYtd !== null) {
          const expected = group.section === "INCOME" ? a.actual - a.budget : a.budget - a.actual;
          if (Math.abs(expected - a.varYtd) > 1) out.warnings.push(`Account ${code.s}: printed variance ${a.varYtd.toLocaleString("en-AU")} does not equal budget vs actual (${expected.toLocaleString("en-AU")}); check the column alignment on page ${page.page}`);
        }
        group.rows.push(row);
        continue;
      }

      const first = line.items[0];
      if (first.x < page.width * 0.11) {
        // Structural row: heading, subtotal or a statement total.
        const text = textOf(words);
        pending = [];
        if (/^total income/i.test(text)) { section = "EXPENDITURE"; continue; }
        if (/^total|^surplus|^margin|^ebida/i.test(text)) continue;
        const marked = line.items.some((i) => i.s === "##");
        if (!marked && group && norm(text) === norm(group.name)) {
          const a = amountsOn(line, edges, map, out.warnings, `Subtotal "${text}"`);
          group.subtotal = { budget: a.budget, actual: a.actual, annualBudget: a.annualBudget, eoyEstimate: a.eoyEstimate };
          continue;
        }
        if (!text) continue;
        const name = sentenceCase(text);
        const known = summaryCode.get(groupCodeFor(name));
        if (known) section = known;
        group = { name, section, rows: [], subtotal: null };
        out.groups.push(group);
        continue;
      }

      // Part of a wrapped label, waiting for its account code on a line below.
      pending.push(...words.filter((i) => i.s.length > 1));
    }
  }

  // Wrap width of the label cell = the right edge of the widest wrapped part.
  const wrapWidth = Math.max(0, ...labelParts.flatMap((p) => p.wrapped.map(right)));
  for (const { row, wrapped, own } of labelParts) {
    row.label = joinLabel([...wrapped, ...own], wrapWidth);
    if (!row.label) { out.warnings.push(`Account ${row.code} (page ${row.page}) has no label`); row.label = `Account ${row.code}`; }
  }

  // Title lines above the first heading read as headings too; without accounts they are nothing.
  out.groups = out.groups.filter((g) => g.rows.length);

  const COLUMN_NAMES: Record<(typeof COLUMN_KEYS)[number], string> = { budget: "YTD budget", actual: "YTD actual", annualBudget: "annual budget", eoyEstimate: "end-of-year" };
  for (const g of out.groups) {
    if (!g.subtotal) continue;
    const sum = zeroAmounts();
    for (const r of g.rows) for (const k of COLUMN_KEYS) sum[k] += r[k];
    const off = COLUMN_KEYS.filter((k) => Math.abs(sum[k] - g.subtotal![k]) > 2);
    if (off.length) out.warnings.push(`${g.name}: the lines add to less than the report's subtotal (${off.map((k) => `${COLUMN_NAMES[k]} ${(g.subtotal![k] - sum[k]).toLocaleString("en-AU")}`).join(", ")}) — a line may be hidden in the report`);
  }
}

/* ------------------------------------------------------------------ */
/* Entry points                                                         */
/* ------------------------------------------------------------------ */

export function parseOperatingReport(pages: PageText[]): ParsedReport {
  const out: ParsedReport = { unitName: null, periodLabel: null, headerLines: [], summary: { rows: [], surplus: null, ebida: null }, debtors: null, groups: [], warnings: [], errors: [] };
  if (!pages.length) { out.errors.push("The PDF has no pages"); return out; }

  const hasCodes = (p: PageText) => p.items.some((i) => isCodeItem(i, p));
  const summaryPage = pages.find((p) => p.items.some((i) => /financial performance/i.test(i.s))) ?? pages.find((p) => !hasCodes(p)) ?? null;
  const detailPages = pages.filter((p) => hasCodes(p));

  // Titles: the lines above "As at …" on the summary page and the first detail page.
  for (const p of [summaryPage, detailPages[0]]) {
    if (!p) continue;
    for (const l of toLines(p)) {
      const t = textOf(l.items);
      const asAt = /^as at\s+([A-Za-z]+\s+\d{4})\b/i.exec(t);
      if (asAt) { out.periodLabel = out.periodLabel ?? `${asAt[1].split(/\s+/)[0][0].toUpperCase()}${asAt[1].split(/\s+/)[0].slice(1).toLowerCase()} ${asAt[1].split(/\s+/)[1]}`; out.headerLines.push(t); break; }
      out.headerLines.push(t);
      if (out.headerLines.length > 8) break;
    }
  }
  const title = out.headerLines.find((t) => / - /.test(t));
  if (title) out.unitName = title.split(" - ").pop()!.trim();
  if (!out.periodLabel) out.errors.push('Could not find the reporting period ("As at August 2026") on the report');

  if (summaryPage) parseSummary(summaryPage, out); else out.errors.push("Could not find the Financial Performance summary page");
  if (detailPages.length) parseDetails(detailPages, out); else out.errors.push("Could not find the detail pages (rows with 4-digit account codes)");
  return out;
}

/** The Overview's wording for a group, where the report's differs ("Other incomes", "Administrative expense"). */
export const CANONICAL_GROUP_NAMES: Record<string, string> = {
  STUDENT_TUITION: "Student tuition", OTHER_STUDENT_INCOME: "Other student income", GOVERNMENT_GRANTS: "Government grants",
  TRADING_INCOME: "Trading income", INVESTMENT_INCOME: "Investment income", OTHER_INCOME: "Other income", CAPITAL_INCOME: "Capital income",
  APPROPRIATIONS: "Appropriations", TUITION_EXPENSES: "Tuition expenses", ADMINISTRATIVE_EXPENSES: "Administrative expenses",
  PROPERTY_EXPENSES: "Property expenses", TRADING_EXPENSES: "Trading expenses", CAPITAL_EXPENDITURE: "Capital expenditure",
};
const canonical = (name: string) => CANONICAL_GROUP_NAMES[groupCodeFor(name)] ?? name;

export const DEBTORS_NOTE = "Family debtor figures still to be entered. Please read them from the Family Debtors chart on page 1 of the operating report and type them in here.";

const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
const hasAmount = (l: ParsedLine | undefined): l is ParsedLine => !!l && COLUMN_KEYS.some((k) => l[k] !== 0);

/**
 * Loans and leases, from the lines the report carries about them: finance leases from their
 * amortisation and interest lines, operating leases and land rent from their payment lines, loans
 * from their interest lines. The wording follows what the boards have always said.
 */
export function obligationsFrom(r: ParsedReport): { loans: ObligationItem[]; leases: ObligationItem[] } {
  const lines = r.groups.filter((g) => g.section === "EXPENDITURE").flatMap((g) => g.rows);
  const find = (re: RegExp) => lines.find((l) => re.test(l.label));
  const budgetNote = (l: ParsedLine) => `YTD budget ${dollars(l.budget)}. Annual budget ${dollars(l.annualBudget)}, forecast ${dollars(l.eoyEstimate)}.`;
  const leases: ObligationItem[] = [], loans: ObligationItem[] = [];

  const amort = find(/amortis.*lease/i), interest = find(/interest.*lease/i);
  if (hasAmount(amort) || hasAmount(interest)) {
    const a = amort ?? { budget: 0, actual: 0, annualBudget: 0, eoyEstimate: 0 };
    const notes = [
      hasAmount(interest) ? `Interest YTD ${dollars(interest.actual)}${interest.actual === interest.budget ? ", on budget" : ` against a ${dollars(interest.budget)} budget`}.` : null,
      amort ? `Annual amortisation budget ${dollars(a.annualBudget)}, forecast ${dollars(a.eoyEstimate)}.` : null,
    ].filter(Boolean).join(" ");
    leases.push({ name: "Finance leases", payment: a.actual, frequency: "YTD amortisation", ends: "", notes });
  }
  const operating = find(/lease payments.*operating/i);
  if (hasAmount(operating)) leases.push({ name: "Operating leases", payment: operating.actual, frequency: "YTD payments", ends: "", notes: budgetNote(operating) });
  const rent = find(/rent.*lease.*land/i);
  if (hasAmount(rent)) leases.push({ name: "Rent/lease for land", payment: rent.actual, frequency: "YTD payments", ends: "", notes: budgetNote(rent) });
  for (const l of lines) if (/interest.*(loan|overdraft)/i.test(l.label) && hasAmount(l)) loans.push({ name: l.label, payment: l.actual, frequency: "YTD interest", ends: "", notes: budgetNote(l) });
  return { loans, leases };
}

/**
 * A board document from the parsed report. Page-1 categories become the Overview rows and the
 * reported totals; detail groups become the line items. Categories the report prints as all zero
 * (Appropriations, Capital income) are left off the Overview, as the boards have always done.
 */
export function toBoardDocument(r: ParsedReport): { board: BoardDocument; warnings: string[]; notes: string[] } {
  const warnings: string[] = [];
  const notes: string[] = [];
  const cat = (row: SummaryRow) => ({ label: canonical(row.label), budget: row.budget, actual: row.actual, annualBudget: row.annualBudget, eoyEstimate: row.eoyEstimate });
  const income = r.summary.rows.filter((x) => x.section === "INCOME" && !allZero(x)).map(cat);
  const expenditure = r.summary.rows.filter((x) => x.section === "EXPENDITURE" && !allZero(x)).map(cat);
  const detail = (section: Section) => r.groups.filter((g) => g.section === section).map((g) => ({
    group: g.name, rows: g.rows.map((l) => ({ code: l.code, label: l.label, budget: l.budget, actual: l.actual, annualBudget: l.annualBudget, eoyEstimate: l.eoyEstimate })),
  }));

  let addback = { ytdBudget: 0, ytdActual: 0 };
  if (r.summary.ebida && r.summary.surplus) {
    addback = { ytdBudget: r.summary.ebida.budget - r.summary.surplus.budget, ytdActual: r.summary.ebida.actual - r.summary.surplus.actual };
  } else {
    for (const g of r.groups) if (g.section === "EXPENDITURE") for (const l of g.rows) if (isAddbackLine(l.label)) { addback.ytdBudget += l.budget; addback.ytdActual += l.actual; }
    warnings.push("Page 1 has no EBIDA row; the EBIDA add-back was summed from the interest, depreciation and amortisation lines instead");
  }

  const { loans, leases } = obligationsFrom(r);
  if (leases.length || loans.length) notes.push(`${[leases.length ? `${leases.length} lease${leases.length === 1 ? "" : "s"}` : "", loans.length ? `${loans.length} loan${loans.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ")} read from the report's lease, amortisation and interest lines`);

  let priorYear = { debtorsCurrent: 0, debtorsPrior: 0, note: DEBTORS_NOTE };
  if (r.debtors) {
    priorYear = {
      debtorsCurrent: r.debtors.current, debtorsPrior: r.debtors.prior,
      note: `Family debtors measured off the chart on page 1 of the ${r.periodLabel ?? ""} report: current about ${dollars(r.debtors.current)}, prior year about ${dollars(r.debtors.prior)}. The chart prints no figures, so confirm these with the accountant.`,
    };
    notes.push(`Family debtors were measured off the page-1 chart (current about ${dollars(r.debtors.current)}, prior year about ${dollars(r.debtors.prior)}) — good to a few hundred dollars, so confirm them`);
  }

  const board: BoardDocument = {
    meta: { asAt: r.periodLabel ?? "", source: "PDF_REPORT" },
    addback,
    priorYear,
    loans, leases,
    comments: { current: "", upcoming: "" },
    income, expenditure,
    details: { income: detail("INCOME"), expenditure: detail("EXPENDITURE") },
  };
  return { board, warnings, notes };
}

/**
 * Which unit a report belongs to, from its title lines. Scores each unit by the words of its name
 * found in the titles; an early learning centre also needs the titles to say so, since its name
 * shares most words with its school.
 */
export function detectUnit<U extends { code: string; name: string; unitType: string }>(headerLines: string[], units: U[]): U | null {
  const text = ` ${norm(headerLines.join(" "))} `;
  const elc = /\b(elc|early learning)\b/.test(text);
  const scored = units.map((u) => {
    const words = norm(u.name).split(" ").filter((w) => w.length >= 3);
    let score = words.filter((w) => text.includes(` ${w} `)).length;
    if (u.unitType === "EARLY_LEARNING_CENTRE") score += elc ? 2 : -2;
    return { u, score };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return scored[0].u;
}
