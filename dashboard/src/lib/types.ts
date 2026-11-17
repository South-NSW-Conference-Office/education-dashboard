/** Shapes of the backend's JSON (whole dollars; see backend/src/presenters). */
export type Light = "green" | "amber" | "red";

export interface Unit { code: string; name: string; short: string; type: string; location: string; colour: string | null; order: number }
/** A fiscal month, with the units that hold an approved board or an open draft in it. */
export interface Period { id: string; label: string; periodNo: number; startsOn: string; endsOn: string; status: string; approved: string[]; drafts: string[]; placeholder: boolean }

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
  /** Set on a preliminary MYOB cut, e.g. "From MYOB, preliminary - as at October 2026". Absent for an approved operating-report PDF. */
  sourceLabel?: string | null; preliminary?: boolean; source?: string | null;
  /** Latest MYOB posting date on this school's rows, YYYY-MM-DD. */
  myobLastPosted?: string | null;
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

/** A board as parsed from an uploaded operating report: page-1 categories as typed, before any roll-up. */
export interface ImportedBoard {
  meta: { asAt: string; unit?: string; source?: string };
  addback: Board["addback"]; priorYear: Board["priorYear"]; loans: Obligation[]; leases: Obligation[]; comments: Board["comments"];
  income: Category[]; expenditure: Category[]; details: Board["details"];
}
export interface ImportBatch { id: string; sourceSystem: string; fileName: string | null; status: "RECEIVED" | "VALIDATED" | "PUBLISHED" | "FAILED" | "REJECTED"; unit: string | null; period: string | null; reportVersion: string | null; createdAt: string | null }
export interface PdfImport {
  import: ImportBatch;
  board: ImportedBoard;
  detected: { unitName: string | null; unitCode: string | null; period: string | null };
  warnings: string[]; notes: string[]; errors: string[];
  lines: number;
  version: VersionInfo | null;
}
export interface PublishedImport { import: ImportBatch; version: VersionInfo; warnings: string[] }

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
  schools: Array<{ unit: string; name: string; short: string; asAt: string; placeholder: boolean; preliminary?: boolean; sourceLabel?: string | null; income: Amounts; spending: Amounts; surplus: Amounts; surVar: number; marginPct: number; finance: Light }>;
  needsAttention: Array<{ unit: string; short: string; label: string; unfavourable: number; colour: Light }>;
}

export interface TimelineMonth {
  label: string; endsOn: string; boards: number; includesPlaceholder: boolean;
  totals: Summary["totals"];
  units: Array<{ unit: string; name: string; short: string; placeholder: boolean; preliminary?: boolean; sourceLabel?: string | null; income: Amounts; spending: Amounts; surplus: Amounts; surVar: number; marginPct: number; finance: Light }>;
}
export interface Timeline { periods: TimelineMonth[] }

export interface MatrixRow {
  unit: string; school: string; sub: string;
  status: { overall: Light; finance?: Light; enrolments: Light; staffing: Light; buildings: Light; whs: Light };
  notes: Record<string, string>;
  derived: { overall: boolean; finance: boolean; financeVariance: number | null; surplus: number | null; asAt: string | null };
}
export interface CashItem { kind: string; label: string; value: string; delta: string; feature?: boolean; derived?: boolean }
export interface SchoolCard {
  unit: string; name: string; loc: string; colour: string | null; overall: Light; budget: string; variance: string;
  finance: { asAt: string; placeholder: boolean; sourceLabel?: string | null; surplus: number; surplusBudget: number; variance: number } | null;
  project: string; progress: number; loan: string; payments: string; staffing: string; enrolments: string; enrolLabel: string; enrolTrend: number[];
}
export interface ListItem { rating?: Light; main: string; meta: string }
export interface Databoard {
  weekEnding: string; status: "DRAFT" | "PUBLISHED"; lastUpdated?: string;
  cash: CashItem[]; matrix: MatrixRow[]; schools: SchoolCard[]; risks: ListItem[]; whs: ListItem[]; celebrate: ListItem[];
  derived: { operatingResult: { surplus: number; budget: number; boards: number }; rule: string };
}

/** One report line on the MYOB reconciliation log: ledger YTD against the operating-report YTD. */
export interface MyobReconLine {
  accountCode: string; label: string; group: string; section: "INCOME" | "EXPENDITURE";
  myobYtd: number | null; pdfYtd: number | null; difference: number | null; note: string | null; rawCodes: string[];
}
export interface MyobUnmappedAccount { accountCode: string; name: string; type: string | null; myobYtd: number; rawCodes: string[] }
export interface MyobReconciliation {
  lines: MyobReconLine[];
  unmapped: MyobUnmappedAccount[];
  excluded: Array<MyobUnmappedAccount & { reason: string }>;
  surplus: { pdf: number; myobOnReportLines: number; differenceOnReportLines: number; unmappedIncome: number; unmappedExpense: number; glSurplusApprox: number };
}
/** One school on a finished sync. `saved` means a preliminary month was loaded; `sourceLabel` names that month. */
export interface MyobUnitSync {
  unit: string; branch: string | null; status: "saved" | "skipped" | "failed"; message: string;
  sourceLabel: string | null; pdfRemainsAuthoritative: boolean; versionId: string | null;
  comparisonNote: string | null; reconciliation: MyobReconciliation | null;
}
export interface MyobMonthProgress {
  period: string; label: string; status: "pending" | "running" | "done" | "failed"; rows: number | null; error: string | null;
}
export interface MyobSchoolProgress {
  unit: string; branch: string | null; status: "pending" | "running" | "saved" | "skipped" | "failed"; message: string | null;
}
export interface MyobProgress {
  runId: string; trigger: string; startedAt: string | null; period: string | null;
  phase: "starting" | "pulling" | "saving" | "done";
  months: MyobMonthProgress[]; schools: MyobSchoolProgress[];
}
/** 202 from POST /imports/myob: a run is in progress. Poll GET /imports/myob. */
export interface MyobSyncRunning {
  accepted: true; alreadyRunning: boolean; runId: string; status: "running"; poll: string;
}
/** 200 from POST: the sync did not start. */
export interface MyobSyncDeclined {
  status: "disabled" | "not_configured"; message: string; period?: string | null; units?: MyobUnitSync[];
}
export type MyobSyncStart = MyobSyncRunning | MyobSyncDeclined;
export interface MyobLastResult {
  id: string; trigger: string; status: "OK" | "PARTIAL" | "FAILED" | string; message: string; period: string | null;
  ledger: string | null; budgetLedger: string | null; budgetSource: string | null;
  excludedBranches: string[]; unassignedBranches: string[]; units: MyobUnitSync[];
  startedAt: string | null; finishedAt: string | null;
}
/** GET /imports/myob. `running` is polled until it is false, then `lastResult` is the finished run. */
export interface MyobSyncLog {
  enabled: boolean; configured: boolean; schedule: string; label: string;
  running: boolean; progress: MyobProgress | null; lastResult: MyobLastResult | null; lastError: string | null;
}
