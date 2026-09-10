/** Build calculation inputs straight from seed-data without a database. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import type { BoardDocument, DataboardDocument, FinanceInput } from "@/domain/types";
import { extractBoard, isAddbackLine, isSalaryHostGroup, isSalaryLine } from "@/services/boardDocument";

const DATA_DIR = path.resolve(__dirname, "../seed-data");
const DATA_FILES = ["schools.js", "databoard.js", "finance-bcc.js", "finance-ncs.js", "finance-ccs.js", "finance-ccs-elc.js"];

/** The board files hold real school figures, so they ship separately — see backend/README.md. */
export const hasSeedData = () => DATA_FILES.every((f) => fs.existsSync(path.join(DATA_DIR, f)));

export function loadData() {
  const w: Record<string, unknown> = {};
  for (const f of DATA_FILES) {
    vm.runInNewContext(fs.readFileSync(path.join(DATA_DIR, f), "utf8"), { window: w });
  }
  const d = w.SNSW_DATA as { finance: Record<string, BoardDocument>; databoard: DataboardDocument };
  return { finance: d.finance, databoard: d.databoard };
}

/** What loadStructure + loadFinanceInput would produce for one board, built from the file. */
export function inputFor(code: string, doc: BoardDocument, allDocs: Record<string, BoardDocument>): FinanceInput {
  const ex = extractBoard(doc);
  // metric definitions are organisation-wide: discover codes across every board, as the seed does
  const addback = new Set<string>(), salary = new Set<string>(), salaryGroups = new Set<string>();
  const accounts = new Map<string, string>();
  for (const d of Object.values(allDocs)) for (const l of extractBoard(d).lines) {
    accounts.set(l.accountCode, l.label);
    if (l.section === "EXPENDITURE" && isAddbackLine(l.label)) addback.add(l.accountCode);
    if (l.section === "EXPENDITURE" && isSalaryLine(l.label) && isSalaryHostGroup(l.groupCode)) { salary.add(l.accountCode); salaryGroups.add(l.groupCode); }
  }
  const sub = doc.expenditure.find((c) => c.sub?.length)?.sub?.[0];
  return {
    unitCode: code, periodLabel: doc.meta.asAt,
    facts: ex.lines.flatMap((l) => ([
      { accountCode: l.accountCode, scenario: "BUDGET", basis: "YEAR_TO_DATE", amountMinor: l.amountsMinor.budget },
      { accountCode: l.accountCode, scenario: "ACTUAL", basis: "YEAR_TO_DATE", amountMinor: l.amountsMinor.actual },
      { accountCode: l.accountCode, scenario: "BUDGET", basis: "FULL_YEAR", amountMinor: l.amountsMinor.annualBudget },
      { accountCode: l.accountCode, scenario: "FORECAST", basis: "END_OF_YEAR_ESTIMATE", amountMinor: l.amountsMinor.eoyEstimate },
    ])),
    accounts: [...accounts].map(([c, n]) => ({ code: c, name: n })),
    groups: ex.groups,
    mappings: ex.lines.map((l) => ({ accountCode: l.accountCode, groupCode: l.groupCode })),
    reportedTotals: ex.reportedTotals,
    metrics: { ebidaAddbackCodes: [...addback], salarySublineCodes: [...salary], salarySublineGroupCodes: [...salaryGroups], salarySublineLabel: sub?.label ?? "Salaries & wages", amberWithinPct: 5 },
  };
}
