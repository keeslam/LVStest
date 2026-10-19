/**
 * Punt 9 (Kees, 2026-10-19) — which drivers the "Rijbewijzen" tile lists:
 * every active driver, with or without a rental.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));

import { pickLicenseTileRows, type LicenseTileDriver } from "../services/driver-license-tile";

const driver = (over: Partial<LicenseTileDriver>): LicenseTileDriver => ({
  driverId: 1, driverName: "Jan", customerId: 5, customerName: "Klant BV", licenseExpiry: "2026-11-01", ...over,
});

describe("pickLicenseTileRows", () => {
  it("lists expired and soon-expiring licences, not later or unreadable ones", () => {
    const rows = pickLicenseTileRows([
      driver({ driverId: 1, licenseExpiry: "2026-10-01" }),
      driver({ driverId: 2, licenseExpiry: "2026-11-18" }),
      driver({ driverId: 3, licenseExpiry: "2026-11-19" }),
      driver({ driverId: 4, licenseExpiry: "kwijt" }),
    ], [], "2026-10-19");
    expect(rows.map((r) => r.driverId)).toEqual([1, 2]);
    expect(rows[0].expiryDay).toBe("2026-10-01");
  });

  it("lists a driver without a rental, pointing at no reservation", () => {
    const rows = pickLicenseTileRows([driver({ driverId: 9, licenseExpiry: "2026-10-28" })], [], "2026-10-19");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ driverId: 9, reservationId: null, licensePlate: null, customerId: 5 });
  });

  it("attaches the earliest rental of a driver", () => {
    const rows = pickLicenseTileRows([driver({})], [
      { driverId: 1, reservationId: 11, licensePlate: "AB-123-C", startDate: "2026-12-01" },
      { driverId: 1, reservationId: 12, licensePlate: "XY-999-Z", startDate: "2026-10-25" },
    ], "2026-10-19");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reservationId: 12, licensePlate: "XY-999-Z" });
  });

  it("puts the soonest expiry first", () => {
    const rows = pickLicenseTileRows([
      driver({ driverId: 1, driverName: "B", licenseExpiry: "2026-11-10" }),
      driver({ driverId: 2, driverName: "A", licenseExpiry: "1-11-2026" }),
    ], [], "2026-10-19");
    expect(rows.map((r) => r.driverName)).toEqual(["A", "B"]);
  });
});
