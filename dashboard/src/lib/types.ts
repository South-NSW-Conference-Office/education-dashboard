/** Shapes of the backend's JSON (whole dollars; see backend/src/presenters). */
export type Light = "green" | "amber" | "red";

export interface Unit { code: string; name: string; short: string; type: string; location: string; colour: string | null; order: number }

export interface Amounts { budget: number; actual: number; annualBudget: number; eoyEstimate: number }
export interface SubLine extends Amounts { label: string; computed?: boolean; lines?: number }
export interface Category extends Amounts { label: string; sub?: SubLine[]; computed?: boolean; groups?: string[] }
export interface LineItem extends Amounts { code: string; label: string }
export interface DetailGroup { group: string; rows: LineItem[] }
export interface Obligation { name: string; payment: number; frequency: string; ends: string; notes: string }
export interface ReconItem { checkCode: string; label: string; field: string; lineItems: number; page1: number; difference: number; status: string; note: string }

export interface BoardMeta {
  unit: string; unitName: string; shortName: string; asAt: string; version: number; versionId: string;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "SUPERSEDED" | "REJECTED"; placeholder: boolean;
  lastSaved: string | null; approvedAt: string | null; generatedAt: string; draft?: boolean;
}
export interface Board {
  meta: BoardMeta;
  addback: { ytdBudget: number; ytdActual: number };
  priorYear: { debtorsCurrent: number; debtorsPrior: number; note: string };
  loans: Obligation[]; leases: Obligation[];
  comments: { current: string; upcoming: string };
  income: Category[]; expenditure: Category[];
  details: { income: DetailGroup[]; expenditure: DetailGroup[] };
  reconciliation: ReconItem[];
  warnings?: string[];
  saved?: VersionInfo;
}
export interface VersionInfo { id: string; versionNo: number; status: BoardMeta["status"]; placeholder: boolean; period?: string | null; createdAt: string | null; updatedAt: string | null; approvedAt: string | null; notes: string | null }

export interface Kpi { actual: number; budget: number; variance: number; colour: Light }
export interface Overview {
  context: BoardMeta;
  kpis: { income: Kpi; spending: Kpi; surplus: Kpi; margin: { actual: number; budget: number; basis: string; colour: Light } };
  goingWell: Array<{ label: string; section: "INCOME" | "EXPENDITURE"; variance: number; pct: number | null; colour: Light }>;
  needsAttention: Array<{ label: string; section: "INCOME" | "EXPENDITURE"; variance: number; pct: number | null; colour: Light }>;
  categories: { income: Category[]; expenditure: Category[] };
  totals: { income: Amounts; expenditure: Amounts; surplus: Amounts };
  ebida: { budget: number; actual: number; addback: { budget: number; actual: number; computed: boolean; lines: number } };
  reconciliation: ReconItem[];
  financeLight: Light;
}

export interface Summary {
  context: { periods: string[]; mixedPeriods: boolean; includesPlaceholder: boolean; boards: number; generatedAt: string };
  totals: { income: Amounts; expenditure: Amounts; surplus: Amounts; incVar: number; expVar: number; surVar: number; marginPct: number };
  schools: Array<{ unit: string; name: string; short: string; asAt: string; placeholder: boolean; income: Amounts; spending: Amounts; surplus: Amounts; surVar: number; marginPct: number; finance: Light }>;
  needsAttention: Array<{ unit: string; short: string; label: string; unfavourable: number; colour: Light }>;
}

export interface MatrixRow {
  unit: string; school: string; sub: string;
  status: { overall: Light; finance?: Light; enrolments: Light; staffing: Light; buildings: Light; whs: Light };
  notes: Record<string, string>;
  derived: { overall: boolean; finance: boolean; financeVariance: number | null; surplus: number | null; asAt: string | null };
}
export interface CashItem { kind: string; label: string; value: string; delta: string; feature?: boolean; derived?: boolean }
export interface SchoolCard {
  unit: string; name: string; loc: string; colour: string | null; overall: Light; budget: string; variance: string;
  finance: { asAt: string; placeholder: boolean; surplus: number; surplusBudget: number; variance: number } | null;
  project: string; progress: number; loan: string; payments: string; staffing: string; enrolments: string; enrolLabel: string; enrolTrend: number[];
}
export interface ListItem { rating?: Light; main: string; meta: string }
export interface Databoard {
  weekEnding: string; status: "DRAFT" | "PUBLISHED"; lastUpdated?: string;
  cash: CashItem[]; matrix: MatrixRow[]; schools: SchoolCard[]; risks: ListItem[]; whs: ListItem[]; celebrate: ListItem[];
  derived: { operatingResult: { surplus: number; budget: number; boards: number }; rule: string };
}
