/**
 * besluiten.md **B-09** — the warning text itself (BUG-013, BUG-037).
 *
 * The decision says "een duidelijke waarschuwing **met de onderhoudsperiode
 * erbij**", so the period is part of the assertion, not an implementation
 * detail. Pure functions, fixed dates: nothing here depends on today, on the
 * weekday or on the database.
 */
import { describe, it, expect } from "vitest";
import {
  BOOKING_WARNING_MAINTENANCE_OVERLAP,
  bookingWarningsFor,
  formatDutchDate,
  formatMaintenancePeriod,
  maintenanceOverlapWarning,
} from "./booking-warnings";

describe("B-09 — the maintenance overlap warning", () => {
  it("has no warning when nothing overlaps", () => {
    expect(maintenanceOverlapWarning([])).toBeNull();
    expect(bookingWarningsFor([])).toEqual([]);
  });

  it("names the period of a single block", () => {
    const warning = maintenanceOverlapWarning([
      { id: 42, startDate: "2029-03-10", endDate: "2029-03-20" },
    ]);
    expect(warning).not.toBeNull();
    expect(warning!.code).toBe(BOOKING_WARNING_MAINTENANCE_OVERLAP);
    expect(warning!.message).toContain("10-03-2029 t/m 20-03-2029");
    expect(warning!.maintenanceBlocks).toEqual([
      { id: 42, startDate: "2029-03-10", endDate: "2029-03-20", maintenanceStatus: null },
    ]);
  });

  it("says 'vanaf' for an open-ended block and collapses a one-day block", () => {
    expect(formatMaintenancePeriod({ id: 1, startDate: "2029-03-10", endDate: null }))
      .toBe("vanaf 10-03-2029");
    expect(formatMaintenancePeriod({ id: 1, startDate: "2029-03-10", endDate: "2029-03-10" }))
      .toBe("10-03-2029");
  });

  it("names every block when two of them overlap the period (BUG-037)", () => {
    const warning = maintenanceOverlapWarning([
      { id: 1, startDate: "2029-03-10", endDate: "2029-03-20" },
      { id: 2, startDate: "2029-03-15", endDate: "2029-03-25" },
    ]);
    expect(warning!.maintenanceBlocks.map((b) => b.id)).toEqual([1, 2]);
    expect(warning!.message).toContain("10-03-2029 t/m 20-03-2029");
    expect(warning!.message).toContain("15-03-2029 t/m 25-03-2029");
  });

  it("says 'opslaan mag' — the decision is a warning, not a refusal", () => {
    const warning = maintenanceOverlapWarning([{ id: 7, startDate: "2029-01-02", endDate: "2029-01-03" }]);
    expect(warning!.message.toLowerCase()).toContain("opslaan mag");
  });

  it("leaves a value that is not an ISO day alone", () => {
    expect(formatDutchDate("onzin")).toBe("onzin");
    expect(formatDutchDate(null)).toBe("");
  });
});
