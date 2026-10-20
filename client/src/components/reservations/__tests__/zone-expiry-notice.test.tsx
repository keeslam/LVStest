/**
 * Round 2 punt 9 (Kees, 2026-10-20) — the zone / Move IZI warning in the booking
 * form and the pickup dialog.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/i18n";
import { ZoneExpiryNotice } from "@/components/reservations/zone-expiry-notice";

describe("ZoneExpiryNotice", () => {
  const car = { euroZoneEndDate: "2026-11-10", moveIziExpirationDate: "2026-10-15" };

  it("warns about an end before the rental and one during it", () => {
    render(<ZoneExpiryNotice vehicle={car} startDate="2026-10-20" endDate="2026-11-20" />);
    expect(screen.getByTestId("warning-zone-expiry-moveIzi").textContent).toContain("verlopen op 15-10-2026");
    expect(screen.getByTestId("warning-zone-expiry-euroZone").textContent).toContain("verloopt op 10-11-2026, tijdens de huur");
  });

  it("shows nothing when the dates lie after the rental", () => {
    const { container } = render(<ZoneExpiryNotice vehicle={car} startDate="2026-09-01" endDate="2026-09-10" />);
    expect(container.textContent).toBe("");
  });
});
