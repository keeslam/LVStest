import { describe, it, expect } from "vitest";
import { apkExpiresBy, busyHint, freeFromDate, overlapsPeriod } from "./availability-board";

describe("freeFromDate", () => {
  it("is the day itself when nothing covers it", () => {
    expect(freeFromDate([], "2026-10-20")).toBe("2026-10-20");
    expect(freeFromDate([{ startDate: "2026-10-25", endDate: "2026-10-27" }], "2026-10-20")).toBe("2026-10-20");
  });

  it("is the day after the rental that covers it", () => {
    expect(freeFromDate([{ startDate: "2026-10-18", endDate: "2026-10-22" }], "2026-10-20")).toBe("2026-10-23");
  });

  it("walks over rentals that follow each other", () => {
    expect(freeFromDate([
      { startDate: "2026-10-23", endDate: "2026-10-25" },
      { startDate: "2026-10-18", endDate: "2026-10-22" },
      { startDate: "2026-10-30", endDate: "2026-11-02" },
    ], "2026-10-20")).toBe("2026-10-26");
  });

  it("does not know when an open-ended rental comes back", () => {
    expect(freeFromDate([{ startDate: "2026-10-01", endDate: null }], "2026-10-20")).toBeNull();
    expect(freeFromDate([{ startDate: "2026-10-18", endDate: "2026-10-22" }, { startDate: "2026-10-23", endDate: "" }], "2026-10-20")).toBeNull();
  });

  it("crosses a month end", () => {
    expect(freeFromDate([{ startDate: "2026-10-20", endDate: "2026-10-31" }], "2026-10-20")).toBe("2026-11-01");
  });
});

describe("overlapsPeriod / apkExpiresBy", () => {
  it("counts both ends of the period", () => {
    expect(overlapsPeriod({ startDate: "2026-10-23", endDate: "2026-10-24" }, "2026-10-20", "2026-10-23")).toBe(true);
    expect(overlapsPeriod({ startDate: "2026-10-24", endDate: "2026-10-25" }, "2026-10-20", "2026-10-23")).toBe(false);
    expect(overlapsPeriod({ startDate: "2026-10-01", endDate: null }, "2026-10-20", "2026-10-23")).toBe(true);
  });

  it("flags an APK that runs out before the end of the period", () => {
    expect(apkExpiresBy("2026-10-22", "2026-10-23")).toBe(true);
    expect(apkExpiresBy("2025-01-01", "2026-10-23")).toBe(true);
    expect(apkExpiresBy("2026-10-24", "2026-10-23")).toBe(false);
    expect(apkExpiresBy(null, "2026-10-23")).toBe(false);
  });
});

describe("busyHint", () => {
  it("says until when a car is free when it is rented later in the period", () => {
    expect(busyHint([{ startDate: "2026-10-23", endDate: "2026-10-30" }], "2026-10-21", "2026-10-24")).toEqual({ freeUntil: "2026-10-22" });
  });

  it("says from when a car is free when it is rented at the start", () => {
    expect(busyHint([{ startDate: "2026-10-18", endDate: "2026-10-22" }], "2026-10-21", "2026-10-24")).toEqual({ freeFrom: "2026-10-23" });
    expect(busyHint([{ startDate: "2026-10-01", endDate: null }], "2026-10-21", "2026-10-24")).toEqual({ freeFrom: null });
  });
});
