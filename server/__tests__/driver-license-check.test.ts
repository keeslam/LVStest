/**
 * Punt 9 (Kees, 2026-10-19) — pickup with an expired licence needs the tick.
 */
import { describe, it, expect } from "vitest";
import {
  DriverLicenseExpiredError,
  assertDriverLicenseChecked,
  driverLicenseInfo,
} from "../services/driver-license-check";

const expired = { id: 7, displayName: "Jan de Vries", licenseExpiry: "2026-10-01" };
const valid = { id: 8, displayName: "Piet", licenseExpiry: "2030-01-01" };
const unknown = { id: 9, firstName: "Ana", lastName: "Silva", licenseExpiry: null };

describe("driverLicenseInfo", () => {
  it("is null without a driver", () => {
    expect(driverLicenseInfo(null, "2026-10-19")).toBeNull();
  });

  it("names the driver and reads the day", () => {
    expect(driverLicenseInfo(expired, "2026-10-19")).toEqual({
      driverId: 7, driverName: "Jan de Vries", licenseExpiry: "2026-10-01", expiryDay: "2026-10-01", state: "expired",
    });
    expect(driverLicenseInfo(unknown, "2026-10-19")?.driverName).toBe("Ana Silva");
    expect(driverLicenseInfo(unknown, "2026-10-19")?.state).toBe("unknown");
  });
});

describe("assertDriverLicenseChecked", () => {
  it("refuses an expired licence without the tick", () => {
    const info = driverLicenseInfo(expired, "2026-10-19");
    expect(() => assertDriverLicenseChecked(info, false)).toThrow(DriverLicenseExpiredError);
    try {
      assertDriverLicenseChecked(info, false);
    } catch (error) {
      const e = error as DriverLicenseExpiredError;
      expect(e.status).toBe(409);
      expect(e.toBody()).toMatchObject({ code: "DRIVER_LICENSE_EXPIRED", driverId: 7, licenseExpiry: "2026-10-01" });
    }
  });

  it("lets an expired licence through with the tick and asks for a history row", () => {
    expect(assertDriverLicenseChecked(driverLicenseInfo(expired, "2026-10-19"), true)).toBe(true);
  });

  it("never refuses a valid or unknown licence, or no driver", () => {
    expect(assertDriverLicenseChecked(driverLicenseInfo(valid, "2026-10-19"), false)).toBe(false);
    expect(assertDriverLicenseChecked(driverLicenseInfo(unknown, "2026-10-19"), false)).toBe(false);
    expect(assertDriverLicenseChecked(null, false)).toBe(false);
  });
});
