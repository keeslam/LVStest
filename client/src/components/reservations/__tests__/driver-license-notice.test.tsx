/**
 * Punt 9 (Kees, 2026-10-19) — the licence note in the booking form: measured
 * on the start date only, never blocking.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DriverLicenseNotice } from "@/components/reservations/driver-license-notice";

describe("DriverLicenseNotice", () => {
  it("warns when the licence is expired on the start date", () => {
    render(<DriverLicenseNotice driver={{ displayName: "Jan", licenseExpiry: "2026-10-01" }} startDate="2026-10-20" />);
    const warning = screen.getByTestId("warning-license-expired");
    expect(warning.textContent).toContain("01-10-2026");
    expect(warning.textContent).toContain("20-10-2026");
  });

  it("says nothing when the licence runs out during the rental", () => {
    const { container } = render(<DriverLicenseNotice driver={{ displayName: "Jan", licenseExpiry: "2026-10-25" }} startDate="2026-10-20" />);
    expect(container.textContent).toBe("");
  });

  it("notes a missing expiry date quietly", () => {
    render(<DriverLicenseNotice driver={{ displayName: "Jan", licenseExpiry: null }} startDate="2026-10-20" />);
    expect(screen.getByTestId("note-license-unknown").textContent).toMatch(/onbekend/);
  });

  it("shows nothing without a driver", () => {
    const { container } = render(<DriverLicenseNotice driver={null} startDate="2026-10-20" />);
    expect(container.textContent).toBe("");
  });
});
