/**
 * Punt 9 (Kees, 2026-10-19) — the driver licence check.
 *
 * "Verlopen" is measured on one day only: the start of the rental at booking,
 * the pickup day at pickup. A licence that runs out during the rental is not
 * warned about. Pure functions, fixed dates.
 */
import { describe, it, expect } from "vitest";
import {
  DRIVER_LICENSE_EXPIRED_CODE,
  licenseExpiryDay,
  licenseStateOn,
  licenseExpiresWithin,
} from "./driver-license";

describe("licenseExpiryDay — reading the stored text", () => {
  it("reads an ISO day", () => {
    expect(licenseExpiryDay("2027-03-01")).toBe("2027-03-01");
  });

  it("reads a Dutch day with dashes or slashes", () => {
    expect(licenseExpiryDay("1-3-2027")).toBe("2027-03-01");
    expect(licenseExpiryDay("01/03/2027")).toBe("2027-03-01");
  });

  it("gives null for empty, unreadable or impossible dates", () => {
    expect(licenseExpiryDay(null)).toBeNull();
    expect(licenseExpiryDay(undefined)).toBeNull();
    expect(licenseExpiryDay("")).toBeNull();
    expect(licenseExpiryDay("  ")).toBeNull();
    expect(licenseExpiryDay("onbekend")).toBeNull();
    expect(licenseExpiryDay("2027-02-30")).toBeNull();
    expect(licenseExpiryDay("31-04-2027")).toBeNull();
  });
});

describe("licenseStateOn", () => {
  it("is valid on and before the expiry day", () => {
    expect(licenseStateOn("2027-03-01", "2027-03-01")).toBe("valid");
    expect(licenseStateOn("2027-03-01", "2026-12-31")).toBe("valid");
  });

  it("is expired the day after the expiry day", () => {
    expect(licenseStateOn("2027-03-01", "2027-03-02")).toBe("expired");
  });

  it("is unknown without a readable date", () => {
    expect(licenseStateOn(null, "2027-03-02")).toBe("unknown");
    expect(licenseStateOn("kwijt", "2027-03-02")).toBe("unknown");
  });

  it("is unknown without a day to compare with", () => {
    expect(licenseStateOn("2027-03-01", null)).toBe("unknown");
    expect(licenseStateOn("2027-03-01", "")).toBe("unknown");
  });

  it("does not warn about a licence that runs out during the rental", () => {
    // Rental 2027-02-20 .. 2027-03-10, licence until 2027-03-01: the start day decides.
    expect(licenseStateOn("2027-03-01", "2027-02-20")).toBe("valid");
  });
});

describe("licenseExpiresWithin — the dashboard tile", () => {
  it("includes licences that are already expired", () => {
    expect(licenseExpiresWithin("2026-10-01", "2026-10-19", 30)).toBe(true);
  });

  it("includes the last day of the window and not the day after", () => {
    expect(licenseExpiresWithin("2026-11-18", "2026-10-19", 30)).toBe(true);
    expect(licenseExpiresWithin("2026-11-19", "2026-10-19", 30)).toBe(false);
  });

  it("never includes an unknown date", () => {
    expect(licenseExpiresWithin(null, "2026-10-19", 30)).toBe(false);
  });
});

it("has a stable refusal code", () => {
  expect(DRIVER_LICENSE_EXPIRED_CODE).toBe("DRIVER_LICENSE_EXPIRED");
});
