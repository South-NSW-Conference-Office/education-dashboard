import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DataboardPage } from "../src/pages/DataboardPage";

const state = vi.hoisted(() => ({ canEdit: true, save: vi.fn(), selection: { kind: "latest" } }));
const board = vi.hoisted(() => ({
  weekEnding: "Friday 20 June 2026", status: "PUBLISHED", cash: [], schools: [], risks: [], whs: [], celebrate: [],
  matrix: [{ unit: "test", school: "Test School", sub: "Test site", notes: {},
    status: { overall: "green", finance: "green", enrolments: "green", staffing: "green", buildings: "green", whs: "green" },
    derived: { overall: true, finance: true, financeVariance: 0, surplus: 0, asAt: "June 2026" } }],
}));
vi.mock("@/hooks/queries", () => ({
  useDataboard: () => ({ data: board, isPending: false }),
  useSaveDataboard: () => ({ mutateAsync: state.save, isPending: false }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAccess: () => () => state.canEdit }));
vi.mock("@/hooks/usePeriod", () => ({ usePeriod: () => ({ selection: state.selection, label: "Latest", setSelection: vi.fn() }) }));
vi.mock("@/components/PeriodPicker", () => ({ PeriodPicker: () => <span>Latest</span> }));

const enrolments = () => screen.getByRole("button", { name: /Test School · Enrolments:/ });
const mount = () => render(<MemoryRouter><DataboardPage /></MemoryRouter>);
beforeEach(() => { state.canEdit = true; state.save.mockReset().mockResolvedValue({}); });
afterEach(cleanup);

describe("dashboard status interactions", () => {
  it("cycles a circle through all three colors and discards without changing the source board", () => {
    mount();
    expect(enrolments().className).toContain("light-green");
    fireEvent.click(enrolments());
    expect(enrolments().className).toContain("light-amber");
    expect(screen.getByText("Unsaved status changes")).toBeTruthy();
    expect(screen.queryByPlaceholderText("note")).toBeNull();
    fireEvent.click(enrolments());
    expect(enrolments().className).toContain("light-red");
    fireEvent.click(enrolments());
    expect(enrolments().className).toContain("light-green");
    fireEvent.click(enrolments());
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(enrolments().className).toContain("light-green");
    expect(board.matrix[0].status.enrolments).toBe("green");
    expect(state.save).not.toHaveBeenCalled();
  });

  it("keeps circles interactive in Present mode and submits the changed status", async () => {
    mount();
    fireEvent.click(screen.getByText("Actions"));
    fireEvent.click(screen.getByRole("button", { name: "Present", exact: true }));
    expect(document.body.classList.contains("presenting")).toBe(true);
    fireEvent.click(enrolments());
    expect(enrolments().className).toContain("light-amber");
    fireEvent.click(screen.getByRole("button", { name: "Save & publish" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
    const payload = state.save.mock.calls[0][0];
    expect(payload.publish).toBe(true);
    expect(payload.doc.matrix[0].status.enrolments).toBe("amber");
    expect(payload.doc.matrix[0].status.overall).toBe("amber");
  });

  it("retains the changed color if saving fails", async () => {
    state.save.mockRejectedValue(new Error("Save failed"));
    mount();
    fireEvent.click(enrolments());
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
    expect(enrolments().className).toContain("light-amber");
    expect(screen.getByText("Unsaved status changes")).toBeTruthy();
  });

  it("keeps calculated values and accounts with read-only permissions non-editable", () => {
    state.canEdit = false;
    mount();
    expect(screen.queryByRole("button", { name: /Test School · Enrolments:/ })).toBeNull();
    expect(screen.getByRole("img", { name: /Test School · Enrolments:.*read-only/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Test School · Overall:.*calculated/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Test School · Finance:.*calculated/ })).toBeTruthy();
  });
});
