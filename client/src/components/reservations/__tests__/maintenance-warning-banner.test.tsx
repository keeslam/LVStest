/**
 * besluiten.md **B-09** (BUG-013, BUG-037) — the client half: the booking form
 * has to *show* the overlapping maintenance clearly, with the period, before
 * the save — and it must stay a warning, so the save button is untouched.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MaintenanceWarningBanner } from "@/components/reservations/maintenance-warning-banner";
import { maintenanceOverlapWarning } from "@shared/booking-warnings";

describe("B-09 — the maintenance warning the booking form shows", () => {
  it("renders nothing when there is nothing to warn about", () => {
    const { container } = render(<MaintenanceWarningBanner warnings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the warning with the maintenance period in it", () => {
    const warning = maintenanceOverlapWarning([
      { id: 42, startDate: "2029-03-10", endDate: "2029-03-20" },
    ])!;

    render(<MaintenanceWarningBanner warnings={[warning]} />);

    const banner = screen.getByTestId("warning-maintenance-overlap");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("10-03-2029 t/m 20-03-2029");
    // It is a warning, not a refusal — the wording has to say so.
    expect(banner.textContent?.toLowerCase()).toContain("opslaan mag");
  });

  it("shows one line per overlapping block", () => {
    const first = maintenanceOverlapWarning([{ id: 1, startDate: "2029-03-10", endDate: "2029-03-12" }])!;
    const second = maintenanceOverlapWarning([{ id: 2, startDate: "2029-04-01", endDate: null }])!;

    render(<MaintenanceWarningBanner warnings={[first, second]} />);

    const banner = screen.getByTestId("warning-maintenance-overlap");
    expect(banner).toHaveTextContent("10-03-2029 t/m 12-03-2029");
    expect(banner).toHaveTextContent("vanaf 01-04-2029");
  });
});
