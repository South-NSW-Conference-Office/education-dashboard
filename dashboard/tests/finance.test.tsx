import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PairedBars } from "../src/components/charts";
import { BoardMenu } from "../src/components/BoardMenu";
import { DetailsTab } from "../src/features/finance/DetailsTab";
import { SearchProvider } from "../src/components/ui";
import type { Board } from "../src/lib/types";

vi.mock("@/hooks/useAuth", () => ({ useAccess: () => () => true }));
const amounts = { budget: 100, actual: 125, annualBudget: 200, eoyEstimate: 250 };
const board = {
  details: {
    income: [{ group: "Fees", rows: [{ code: "100", label: "Tuition", ...amounts }, { code: "101", label: "Other fees", budget: 0, actual: 0, annualBudget: 0, eoyEstimate: 0 }] }],
    expenditure: [],
  }, reconciliation: [],
} as unknown as Board;
afterEach(cleanup);

describe("finance board redesign", () => {
  it("positions deficits left of zero and positive values right on the same scale", () => {
    const { container } = render(<PairedBars isIncome rows={[{ label: "School A", actual: -50, budget: 100 }, { label: "School B", actual: 0, budget: 50 }]} />);
    const bars = container.querySelectorAll<HTMLElement>(".bar");
    expect(bars[0].classList.contains("bar-negative")).toBe(true);
    expect(parseFloat(bars[0].style.left)).toBeCloseTo(0);
    expect(parseFloat(bars[0].style.width)).toBeCloseTo(100 / 3);
    expect(parseFloat(bars[1].style.left)).toBeCloseTo(100 / 3);
    expect(parseFloat(bars[1].style.width)).toBeCloseTo(200 / 3);
    expect(bars[2].style.width).toBe("0%");
    expect(screen.getByText("($50)")).toBeTruthy();
  });

  it("shows an empty chart state without manufacturing values", () => {
    render(<PairedBars isIncome rows={[{ label: "Empty", actual: 0, budget: 0 }]} />);
    expect(screen.getByText("Nothing to chart yet.")).toBeTruthy();
  });

  it("keeps secondary actions accessible and closes the menu after selection", () => {
    const action = vi.fn();
    render(<BoardMenu items={[{ label: "Print", action }]} />);
    fireEvent.click(screen.getByText("Actions"));
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(action).toHaveBeenCalledOnce();
    expect(screen.getByText("Actions").closest("details")?.open).toBe(false);
  });

  it("filters line items locally, keeps totals, and preserves pencil editing", () => {
    const beginEdit = vi.fn(), toggle = vi.fn();
    render(<MemoryRouter><SearchProvider><DetailsTab board={board} editable={false} hideZeros onToggleZeros={toggle} onChange={vi.fn()} onBeginEdit={beginEdit} /></SearchProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Tuition" }));
    expect(beginEdit).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter statement line items" }), { target: { value: "no-match" } });
    expect(screen.queryByText("Tuition")).toBeNull();
    expect(screen.getAllByText("125").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("checkbox", { name: "Show empty lines" }));
    expect(toggle).toHaveBeenCalledOnce();
  });
});
