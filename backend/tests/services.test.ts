/**
 * Service tests that need no school data.
 *
 * The acceptance suite — the roll-up, reconciliation and consolidation checked to the
 * dollar against the frontend's own figures — asserts real school amounts, so it lives
 * with the data handover rather than in this repository. Restoring `seed-data/` also
 * restores the full version of this file over the top of it. See backend/README.md.
 */
import { describe, expect, it } from "vitest";
import { financeStatus, worst } from "@/services/status";
import { groupCodeFor, accountCodeFor } from "@/services/boardDocument";

describe("statuses", () => {
  it("finance light from surplus vs budget", () => {
    expect(financeStatus({ surVar: 0, totals: { surplus: { budget: 10000 } } } as never)).toBe("GREEN");
    expect(financeStatus({ surVar: -100, totals: { surplus: { budget: 10000 } } } as never)).toBe("AMBER");
    expect(financeStatus({ surVar: -600, totals: { surplus: { budget: 10000 } } } as never)).toBe("RED");
  });

  it("overall is the worst of the measures given", () => {
    expect(worst(["GREEN", "AMBER", "RED"])).toBe("RED");
    expect(worst(["GREEN", "AMBER", null])).toBe("AMBER");
    expect(worst(["GREEN", "GREEN"])).toBe("GREEN");
  });
});

describe("board document transformer", () => {
  it("maps report group names to canonical codes and gives code-less lines a stable synthetic code", () => {
    expect(groupCodeFor("Occupancy expenses")).toBe("PROPERTY_EXPENSES");
    expect(groupCodeFor("Property expenses")).toBe("PROPERTY_EXPENSES");
    expect(groupCodeFor("Capital expenses")).toBe("CAPITAL_EXPENDITURE");
    expect(accountCodeFor({ code: "", label: "Family fees (summary figure)" })).toBe("X-FAMILY_FEES_SUMMARY_FIGURE");
    expect(accountCodeFor({ code: "1030", label: "Salaries - Teachers" })).toBe("1030");
  });
});
