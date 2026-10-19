/**
 * Punt 9 (Kees, 2026-10-19) — which drivers the "Rijbewijzen" tile lists.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));

import { pickLicenseTileRows } from "../services/driver-license-tile";

const row = (over: Partial<Parameters<typeof pickLicenseTileRows>[0][number]>) => ({
  driverId: 1, driverName: "Jan", customerName: "Klant BV", licenseExpiry: "2026-11-01",
  reservationId: 10, licensePlate: "AB-123-C", startDate: "2026-10-20", status: "booked", ...over,
});

describe("pickLicenseTileRows", () => {
  it("lists expired and soon-expiring licences, not later ones", () => {
    const rows = pickLicenseTileRows([
      row({ driverId: 1, licenseExpiry: "2026-10-01" }),
      row({ driverId: 2, licenseExpiry: "2026-11-18" }),
      row({ driverId: 3, licenseExpiry: "2026-11-19" }),
      row({ driverId: 4, licenseExpiry: "kwijt" }),
    ], "2026-10-19");
    expect(rows.map((r) => r.driverId)).toEqual([1, 2]);
    expect(rows[0].expiryDay).toBe("2026-10-01");
  });

  it("keeps one row per driver, on the earliest rental", () => {
    const rows = pickLicenseTileRows([
      row({ reservationId: 11, startDate: "2026-12-01" }),
      row({ reservationId: 12, startDate: "2026-10-25" }),
    ], "2026-10-19");
    expect(rows).toHaveLength(1);
    expect(rows[0].reservationId).toBe(12);
  });

  it("puts the soonest expiry first", () => {
    const rows = pickLicenseTileRows([
      row({ driverId: 1, driverName: "B", licenseExpiry: "2026-11-10" }),
      row({ driverId: 2, driverName: "A", licenseExpiry: "1-11-2026" }),
    ], "2026-10-19");
    expect(rows.map((r) => r.driverName)).toEqual(["A", "B"]);
  });
});
