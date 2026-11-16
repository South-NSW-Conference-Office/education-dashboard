import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { sourceNoteText } from "../src/components/FinanceSource";
import { MyobReconciliationView } from "../src/features/finance/MyobReconciliationPanel";
import { MyobSyncDialog } from "../src/features/finance/MyobSyncDialog";
import { FinanceBoardPage } from "../src/pages/FinanceBoardPage";
import { SummaryPage } from "../src/pages/SummaryPage";
import { DataboardPage } from "../src/pages/DataboardPage";
import { ApiError } from "../src/lib/api";
import type { MyobSyncLog, MyobSyncResult, Unit } from "../src/lib/types";

const LABEL = "From MYOB, preliminary - as at October 2026";
const amounts = { budget: 10, actual: 12, annualBudget: 20, eoyEstimate: 24 };
const units: Unit[] = [{ code: "bcc", name: "Border Christian College", short: "BCC", type: "SCHOOL", location: "Albury", colour: null, order: 1 }, { code: "ncs", name: "Narromine Christian School", short: "NCS", type: "SCHOOL", location: "Narromine", colour: null, order: 2 }];

const state = vi.hoisted(() => ({
  write: true,
  sourceLabel: "From MYOB, preliminary - as at October 2026" as string | null,
  placeholder: false,
  selection: { kind: "month" } as { kind: string; label?: string; from?: string; to?: string },
  periodLabel: "October 2026",
  sync: { mutate: vi.fn(), isPending: false, isError: false, error: null as unknown, data: undefined as MyobSyncResult | undefined },
  log: { data: undefined as MyobSyncLog | undefined, isPending: false, isError: false, error: null as unknown, refetch: vi.fn() },
}));

const board = () => ({
  meta: {
    unit: "bcc", unitName: "Border Christian College", shortName: "BCC", asAt: "October 2026", version: 4, versionId: "v",
    status: "APPROVED" as const, placeholder: state.placeholder, sourceLabel: state.sourceLabel,
    lastSaved: null, approvedAt: "2026-11-02T01:00:00.000Z", generatedAt: "2026-11-02T01:00:00.000Z",
  },
  addback: { ytdBudget: 0, ytdActual: 0 },
  priorYear: { debtorsCurrent: 0, debtorsPrior: 0, note: "" },
  loans: [], leases: [], comments: { current: "", upcoming: "" },
  income: [], expenditure: [], details: { income: [], expenditure: [] }, reconciliation: [],
});

vi.mock("@/hooks/useAuth", () => ({ useAccess: () => (p: string) => (p === "imports.write" ? state.write : true) }));
vi.mock("@/hooks/usePeriod", () => ({ usePeriod: () => ({ selection: state.selection, label: state.periodLabel, setSelection: vi.fn(), params: {}, key: "test" }) }));
vi.mock("@/hooks/queries", () => ({
  useBoard: () => ({ data: board(), isPending: false, error: null, dataUpdatedAt: 1, refetch: vi.fn() }),
  useOverview: () => ({ data: undefined, isPending: false }),
  useUnits: () => ({ data: units, isPending: false }),
  useVersions: () => ({ data: [] }),
  useSaveBoard: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePeriods: () => ({ data: [], isLoading: false, error: null }),
  useTimeline: () => ({ data: { periods: [] }, isPending: false }),
  useSyncFromMyob: () => state.sync,
  useMyobSync: () => state.log,
  useSummary: () => ({ data: state.summary, isPending: false, error: null }),
  useDataboard: () => ({ data: state.databoard, isPending: false, error: null }),
  useSaveDataboard: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const summarySchool = (over: Record<string, unknown>) => ({ unit: "bcc", name: "Border Christian College", short: "BCC", asAt: "October 2026", placeholder: false, income: amounts, spending: amounts, surplus: amounts, surVar: 2, marginPct: 4, finance: "green", ...over });
Object.assign(state, {
  summary: {
    context: { periods: ["October 2026"], mixedPeriods: false, includesPlaceholder: false, boards: 2, generatedAt: "2026-11-02T00:00:00.000Z" },
    totals: { income: amounts, expenditure: amounts, surplus: amounts, incVar: 1, expVar: 1, surVar: 2, marginPct: 4 },
    schools: [summarySchool({ sourceLabel: LABEL, preliminary: true }), summarySchool({ unit: "ncs", name: "Narromine Christian School", short: "NCS", asAt: "September 2026", sourceLabel: null })],
    needsAttention: [],
  },
  databoard: {
    weekEnding: "Friday 6 November 2026", status: "PUBLISHED", cash: [], risks: [], whs: [], celebrate: [],
    matrix: [{ unit: "bcc", school: "Border Christian College", sub: "Albury", notes: {}, status: { overall: "green", finance: "green", enrolments: "green", staffing: "green", buildings: "green", whs: "green" }, derived: { overall: true, finance: true, financeVariance: 1200, surplus: 5000, asAt: "October 2026" } }],
    schools: [{ unit: "bcc", name: "Border Christian College", loc: "Albury", colour: null, overall: "green", budget: "Surplus $5k YTD", variance: "$1k ahead of budget", finance: { asAt: "October 2026", placeholder: false, sourceLabel: LABEL, surplus: 5000, surplusBudget: 3800, variance: 1200 }, project: "Hall", progress: 40, loan: "", payments: "", staffing: "", enrolments: "", enrolLabel: "", enrolTrend: [] }],
  },
});

const blankResult = (over: Partial<MyobSyncResult>): MyobSyncResult => ({
  status: "ok", message: "", period: null, fromPeriod: null, toPeriod: null, ledger: null, budgetLedger: null, budgetSource: null,
  excludedBranches: [], unassignedBranches: [], units: [], ...over,
});

afterEach(() => {
  cleanup();
  state.write = true;
  state.sourceLabel = LABEL;
  state.placeholder = false;
  state.selection = { kind: "month" };
  state.periodLabel = "October 2026";
  state.sync = { mutate: vi.fn(), isPending: false, isError: false, error: null, data: undefined };
  state.log = { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() };
});

const finance = () => render(<MemoryRouter initialEntries={["/finance/bcc"]}><Routes><Route path="/finance/:unit" element={<FinanceBoardPage tab="overview" />} /></Routes></MemoryRouter>);

describe("MYOB source label", () => {
  it("names a preliminary board and keeps the placeholder banner for sample data only", () => {
    finance();
    expect(screen.getAllByText(/From MYOB, preliminary - as at October 2026/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Preliminary").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Placeholder figures/)).toBeNull();
  });

  it("keeps the month wording for an approved PDF import", () => {
    state.sourceLabel = null;
    state.selection = { kind: "latest" };
    state.periodLabel = "Latest";
    finance();
    expect(screen.queryByText("Preliminary")).toBeNull();
    expect(screen.queryByText(/From MYOB/)).toBeNull();
    expect(screen.getByText("October 2026")).toBeTruthy();
  });

  it("still uses the amber banner when the figures are a layout sample", () => {
    state.sourceLabel = null;
    state.placeholder = true;
    finance();
    expect(screen.getByText(/Placeholder figures/)).toBeTruthy();
    expect(screen.queryByText("Preliminary")).toBeNull();
  });

  it("joins a MYOB label with a PDF month the label does not already name", () => {
    expect(sourceNoteText([{ sourceLabel: LABEL, asAt: "October 2026" }, { sourceLabel: null, asAt: "October 2026" }, { asAt: "September 2026" }])).toBe(`${LABEL} · September 2026`);
    expect(sourceNoteText([{ asAt: "September 2026" }])).toBeNull();
  });
});

describe("Sync from MYOB", () => {
  it("sits beside Upload report PDF for someone who can import, and is absent otherwise", () => {
    finance();
    fireEvent.click(screen.getByText("Actions"));
    const labels = [...document.querySelectorAll(".board-actions-pop button")].map((b) => b.textContent);
    expect(labels).toEqual(["Present", "Upload report PDF", "Sync from MYOB", "Print"]);
    cleanup();
    state.write = false;
    finance();
    fireEvent.click(screen.getByText("Actions"));
    expect(screen.queryByRole("button", { name: "Sync from MYOB" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Upload report PDF" })).toBeNull();
    expect(screen.queryByText("MYOB reconciliation")).toBeNull();
  });

  it("shows progress, then a disabled status, a per-school month, or the error", () => {
    const { rerender } = render(<MyobSyncDialog pending error={null} units={units} onClose={vi.fn()} />);
    expect(screen.getByText(/Loading the year-to-date figures from MYOB/)).toBeTruthy();
    rerender(<MyobSyncDialog pending={false} error={null} units={units} onClose={vi.fn()} result={blankResult({ status: "disabled", message: "MYOB sync is off. Nothing was read or written." })} />);
    expect(screen.getByText(/Status: disabled/)).toBeTruthy();
    expect(screen.getByText(/Nothing was read or written/)).toBeTruthy();
    rerender(<MyobSyncDialog pending={false} error={null} units={units} onClose={vi.fn()} result={blankResult({
      status: "not_configured", message: "MYOB_EDUCATION_PASSWORD is not set. Sync did nothing.",
    })} />);
    expect(screen.getByText(/Status: not_configured/)).toBeTruthy();
    rerender(<MyobSyncDialog pending={false} error={null} units={units} onClose={vi.fn()} result={blankResult({
      status: "ok", period: "October 2026", message: "Saved 1 preliminary board for October 2026.",
      units: [{ unit: "bcc", branch: "BCC", status: "saved", message: `${LABEL}. Readers will see this until an operating report is approved.`, sourceLabel: LABEL, pdfRemainsAuthoritative: false, versionId: "1", comparisonNote: null, reconciliation: null }],
    })} />);
    expect(screen.getByText("Border Christian College")).toBeTruthy();
    expect(screen.getByText(new RegExp(LABEL))).toBeTruthy();
    expect(screen.getByText("October 2026")).toBeTruthy();
    rerender(<MyobSyncDialog pending={false} error={new Error("Ledger timed out")} units={units} onClose={vi.fn()} />);
    expect(screen.getByText(/Ledger timed out/)).toBeTruthy();
  });

  it("starts a sync from the finance board and shows the result", () => {
    state.sync.data = blankResult({ status: "disabled", message: "MYOB sync is off. Nothing was read or written." });
    finance();
    fireEvent.click(screen.getByText("Actions"));
    fireEvent.click(screen.getByRole("button", { name: "Sync from MYOB" }));
    expect(state.sync.mutate).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "Sync from MYOB" })).toBeTruthy();
    expect(screen.getByText(/Status: disabled/)).toBeTruthy();
  });
});

describe("MYOB reconciliation", () => {
  const recon = {
    lines: [{ accountCode: "1030", label: "Tuition", group: "Fees", section: "INCOME" as const, myobYtd: 100, pdfYtd: 90, difference: 10, note: null, rawCodes: ["1030"] }],
    unmapped: [{ accountCode: "4890", name: "Sundry", type: "Expense", myobYtd: 40, rawCodes: ["4890"] }],
    excluded: [],
    surplus: { pdf: 90, myobOnReportLines: 100, differenceOnReportLines: 10, unmappedIncome: 0, unmappedExpense: 40, glSurplusApprox: 60 },
  };
  const log = (row?: Partial<MyobSyncLog["lastRun"]>): MyobSyncLog => ({
    enabled: true, configured: true, schedule: "Weekdays", label: LABEL,
    lastRun: { id: "1", trigger: "manual", status: "OK", message: "Saved 1 preliminary board.", period: "October 2026", ledger: "ACTUALAUD", budgetLedger: null, budgetSource: "pdf", excludedBranches: [], unassignedBranches: [], units: [{ unit: "bcc", branch: "BCC", status: "saved", message: LABEL, sourceLabel: LABEL, pdfRemainsAuthoritative: false, versionId: "1", comparisonNote: "PDF figures are from September 2026; MYOB is October 2026.", reconciliation: recon }], startedAt: null, finishedAt: "2026-11-16T06:12:00.000Z", createdAt: null, ...row },
  });

  it("covers loading, empty, unavailable, and the line comparison", () => {
    const { rerender } = render(<MyobReconciliationView unit="bcc" unitName="Border Christian College" loading error={null} onRetry={vi.fn()} />);
    expect(screen.getByText(/Loading the MYOB reconciliation/)).toBeTruthy();
    rerender(<MyobReconciliationView unit="bcc" unitName="Border Christian College" loading={false} error={null} log={{ enabled: false, configured: false, schedule: "", label: "", lastRun: null }} />);
    expect(screen.getByText(/MYOB sync is off/)).toBeTruthy();
    rerender(<MyobReconciliationView unit="bcc" unitName="Border Christian College" loading={false} error={new ApiError(404, "Not found")} />);
    expect(screen.getByText(/not available on this server/)).toBeTruthy();
    rerender(<MyobReconciliationView unit="bcc" unitName="Border Christian College" loading={false} error={new Error("Boom")} />);
    expect(screen.getByText(/Boom/)).toBeTruthy();
    rerender(<MyobReconciliationView unit="ncs" unitName="Narromine Christian School" loading={false} error={null} log={log()} />);
    expect(screen.getByText(/was not in that sync/)).toBeTruthy();
    rerender(<MyobReconciliationView unit="bcc" unitName="Border Christian College" loading={false} error={null} log={log()} />);
    expect(screen.getByText(/Tuition/)).toBeTruthy();
    expect(screen.getByText(/Sundry/)).toBeTruthy();
    expect(screen.getByText(/PDF figures are from September 2026/)).toBeTruthy();
    expect(screen.getByText("$100")).toBeTruthy();
    expect(screen.getByText("$90")).toBeTruthy();
  });
});

describe("summary and weekly source lines", () => {
  it("shows the MYOB label on a summary school and leaves a PDF school on today's wording", () => {
    state.selection = { kind: "latest" };
    state.periodLabel = "Latest";
    render(<MemoryRouter><SummaryPage /></MemoryRouter>);
    expect(screen.getAllByText(new RegExp(LABEL)).length).toBeGreaterThan(0);
    expect(screen.getByText("As at September 2026")).toBeTruthy();
    expect(screen.getAllByText("Preliminary").length).toBeGreaterThan(0);
  });

  it("shows the label on the weekly finance note and the school snapshot", () => {
    render(<MemoryRouter><DataboardPage /></MemoryRouter>);
    expect(screen.getByText("Finance as at")).toBeTruthy();
    expect(screen.getAllByText(new RegExp(LABEL)).length).toBeGreaterThan(0);
    expect(screen.getByText(/From the finance board/)).toBeTruthy();
    expect(screen.getAllByText("Preliminary").length).toBeGreaterThan(0);
  });
});
