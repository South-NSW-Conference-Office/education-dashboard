/**
 * Domain vocabulary shared by models, services, presenters and controllers.
 * Money is held in integer minor units (cents) everywhere except the presenters,
 * which convert to whole dollars for the JSON the frontend reads.
 */

export const SCENARIOS = ["ACTUAL", "BUDGET", "FORECAST", "PRIOR_YEAR_ACTUAL"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const PERIOD_BASES = ["PERIOD", "YEAR_TO_DATE", "FULL_YEAR", "END_OF_YEAR_ESTIMATE", "CLOSING_BALANCE"] as const;
export type PeriodBasis = (typeof PERIOD_BASES)[number];

export const VERSION_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "SUPERSEDED", "REJECTED"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const SECTIONS = ["INCOME", "EXPENDITURE"] as const;
export type Section = (typeof SECTIONS)[number];

export const RATINGS = ["GREEN", "AMBER", "RED"] as const;
export type Rating = (typeof RATINGS)[number];

export const SOURCE_SYSTEMS = ["MANUAL", "MYOB", "SYNERGETIC", "HUBWORKS"] as const;
export type SourceSystem = (typeof SOURCE_SYSTEMS)[number];

export const UNIT_TYPES = ["CONFERENCE", "SCHOOL", "EARLY_LEARNING_CENTRE"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

/** The four columns of the Details tab, each a (scenario, basis) pair on one account. */
export const COLUMNS = {
  budget: { scenario: "BUDGET", basis: "YEAR_TO_DATE" },
  actual: { scenario: "ACTUAL", basis: "YEAR_TO_DATE" },
  annualBudget: { scenario: "BUDGET", basis: "FULL_YEAR" },
  eoyEstimate: { scenario: "FORECAST", basis: "END_OF_YEAR_ESTIMATE" },
} as const satisfies Record<string, { scenario: Scenario; basis: PeriodBasis }>;
export type ColumnKey = keyof typeof COLUMNS;
export const COLUMN_KEYS = ["budget", "actual", "annualBudget", "eoyEstimate"] as const satisfies readonly ColumnKey[];

export function columnFor(scenario: Scenario, basis: PeriodBasis): ColumnKey | null {
  for (const k of COLUMN_KEYS) if (COLUMNS[k].scenario === scenario && COLUMNS[k].basis === basis) return k;
  return null;
}

/** Four amounts, one per column. Minor units inside services; dollars in presenters. */
export type Amounts = Record<ColumnKey, number>;
export const zeroAmounts = (): Amounts => ({ budget: 0, actual: 0, annualBudget: 0, eoyEstimate: 0 });

/* ------------------------------------------------------------------ */
/* Calculation inputs — plain data, no Mongo, so services are testable  */
/* ------------------------------------------------------------------ */

export interface FactLite { accountCode: string; scenario: Scenario; basis: PeriodBasis; amountMinor: number }
export interface AccountLite { code: string; name: string }
export interface GroupLite { code: string; name: string; section: Section; displayOrder: number }
export interface MappingLite { accountCode: string; groupCode: string }
export type ReportedMetric = "GROUP_TOTAL" | "EBIDA_ADDBACK" | "SALARY_SUBLINE";
export interface ReportedTotalLite { metricCode: ReportedMetric; groupCode?: string; scenario: Scenario; basis: PeriodBasis; amountMinor: number }
export interface MetricConfig {
  /** account codes whose YTD figures are added back to surplus for EBIDA */
  ebidaAddbackCodes: string[];
  /** account codes summed for the "of which: salaries" sub-line */
  salarySublineCodes: string[];
  /** only lines mapped into these groups count (the tuition group), so admin or property salaries stay out */
  salarySublineGroupCodes: string[];
  salarySublineLabel: string;
  /** unfavourable variance within this % of budget is amber, beyond it red */
  amberWithinPct: number;
}
export interface FinanceInput {
  unitCode: string;
  periodLabel: string;
  facts: FactLite[];
  accounts: AccountLite[];
  groups: GroupLite[];
  mappings: MappingLite[];
  reportedTotals: ReportedTotalLite[];
  metrics: MetricConfig;
}

/* ------------------------------------------------------------------ */
/* Calculation outputs                                                  */
/* ------------------------------------------------------------------ */

export interface LineResult extends Amounts { code: string; label: string }
export interface GroupResult extends Amounts {
  code: string; name: string; section: Section; displayOrder: number;
  lines: LineResult[]; hasData: boolean; reported: Amounts | null;
}
export interface Health { varAmt: number; pct: number | null; colour: Rating }
export interface RollupResult {
  income: GroupResult[];
  expenditure: GroupResult[];
  totals: { income: Amounts; expenditure: Amounts; surplus: Amounts };
  addback: { ytdBudget: number; ytdActual: number; computed: boolean; lineCount: number; reported: { ytdBudget: number; ytdActual: number } | null };
  ebida: { budget: number; actual: number };
  /** percentages, not minor units */
  margin: { budget: number; actual: number };
  salarySubline: (Amounts & { label: string; computed: boolean; lineCount: number; reported: Amounts | null }) | null;
  incVarPct: number; expVarPct: number; surVar: number;
}

export interface ReconciliationItem {
  checkCode: string; groupCode: string | null; label: string; column: ColumnKey | "ytdBudget" | "ytdActual";
  scenario: Scenario | null; basis: PeriodBasis | null;
  expectedMinor: number; actualMinor: number; differenceMinor: number; status: "PASS" | "WARNING" | "FAILED";
}

/* ------------------------------------------------------------------ */
/* Board document — the JSON shape the existing frontend reads/writes   */
/* ------------------------------------------------------------------ */

export interface LineItem { code: string; label: string; budget: number; actual: number; annualBudget: number; eoyEstimate: number }
export interface DetailGroup { group: string; rows: LineItem[] }
export interface SubLine { label: string; budget: number; actual: number; annualBudget: number; eoyEstimate: number; computed?: boolean; lines?: number }
export interface Category extends Amounts { label: string; sub?: SubLine[]; computed?: boolean; groups?: string[] }
export interface ObligationItem { name: string; payment: number; frequency: string; ends: string; notes: string }
export interface BoardDocument {
  meta: { asAt: string; draft?: boolean; unit?: string; version?: number; status?: VersionStatus; lastSaved?: string | null; source?: string };
  addback: { ytdBudget: number; ytdActual: number };
  priorYear: { debtorsCurrent: number; debtorsPrior: number; note: string };
  loans: ObligationItem[];
  leases: ObligationItem[];
  comments: { current: string; upcoming: string };
  income: Category[];
  expenditure: Category[];
  details: { income: DetailGroup[]; expenditure: DetailGroup[] };
}

/* ------------------------------------------------------------------ */
/* Weekly databoard document (raw fields; derived fields added by the    */
/* presenter)                                                           */
/* ------------------------------------------------------------------ */

export const JUDGEMENT_MEASURES = ["enrolments", "staffing", "buildings", "whs"] as const;
export type JudgementMeasure = (typeof JUDGEMENT_MEASURES)[number];
export type MatrixMeasure = JudgementMeasure | "overall" | "finance";

export interface MatrixRow {
  unit: string; school: string; sub: string;
  status: Partial<Record<MatrixMeasure, "green" | "amber" | "red">>;
  notes: Partial<Record<MatrixMeasure, string>>;
}
export interface CashItem { kind: "CASH_ON_HAND" | "OPERATING_RESULT" | "LOAN_BALANCES" | "RESERVES" | "OTHER"; label: string; value: string; delta: string; feature?: boolean }
export interface SchoolSnapshot {
  unit: string; name: string; loc: string;
  budget?: string; variance?: string;
  project: string; progress: number; loan: string; payments: string; staffing: string; enrolments: string;
  enrolLabel: string; enrolTrend: number[];
}
export interface BoardListItem { rating?: "green" | "amber" | "red"; main: string; meta: string }
export interface DataboardDocument {
  weekEnding: string;
  status?: "DRAFT" | "PUBLISHED";
  lastUpdated?: string;
  cash: CashItem[];
  matrix: MatrixRow[];
  schools: SchoolSnapshot[];
  risks: BoardListItem[];
  whs: BoardListItem[];
  celebrate: BoardListItem[];
}
