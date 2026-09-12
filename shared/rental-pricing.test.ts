/**
 * The day count and the total that follows from it (besluiten **B-07**, used by
 * **B-16**). Fixed dates only: nothing here may depend on today or on the
 * weekday.
 *
 * These assertions pin the *existing* inclusive count — the one the booking form
 * has always used. BUG-153 (inclusive versus exclusive for invoicing) is still
 * an open business decision; when it is answered, this file and
 * `shared/rental-pricing.ts` are what change.
 */
import { describe, it, expect } from "vitest";
import { rentalDays, recalculateTotalPrice } from "./rental-pricing";

describe("rentalDays — the start day counts", () => {
  it("counts a single day as one", () => {
    expect(rentalDays("2029-05-01", "2029-05-01")).toBe(1);
  });

  it("counts an ordinary period inclusively", () => {
    expect(rentalDays("2029-05-01", "2029-05-10")).toBe(10);
  });

  it("counts across a month and a DST switch without drifting", () => {
    expect(rentalDays("2029-03-24", "2029-04-02")).toBe(10);
    expect(rentalDays("2029-10-25", "2029-10-30")).toBe(6);
  });

  it("has no answer for an open-ended or impossible period", () => {
    expect(rentalDays("2029-05-01", null)).toBeNull();
    expect(rentalDays("2029-05-01", "undefined")).toBeNull();
    expect(rentalDays("2029-05-10", "2029-05-01")).toBeNull();
  });
});

describe("recalculateTotalPrice", () => {
  it("multiplies the daily rate by the inclusive day count", () => {
    expect(recalculateTotalPrice("50", "2029-05-01", "2029-05-10")).toBe(500);
    expect(recalculateTotalPrice(37.5, "2029-05-01", "2029-05-04")).toBe(150);
  });

  it("rounds to cents", () => {
    expect(recalculateTotalPrice("33.333", "2029-05-01", "2029-05-03")).toBe(100);
  });

  it("invents nothing without a usable rate or period", () => {
    expect(recalculateTotalPrice(null, "2029-05-01", "2029-05-10")).toBeNull();
    expect(recalculateTotalPrice("0", "2029-05-01", "2029-05-10")).toBeNull();
    expect(recalculateTotalPrice("niets", "2029-05-01", "2029-05-10")).toBeNull();
    expect(recalculateTotalPrice("50", "2029-05-01", null)).toBeNull();
  });
});
