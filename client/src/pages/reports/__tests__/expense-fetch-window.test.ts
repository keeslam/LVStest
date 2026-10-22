import { describe, expect, it } from "vitest";
import { expenseFetchWindow } from "../report-helpers";

const now = new Date(2026, 9, 22); // 22 October 2026, local time

describe("expenseFetchWindow (B-65)", () => {
  it("covers the three trend months when the period lies inside them", () => {
    expect(expenseFetchWindow("2026-10-01", "2026-10-22", now)).toEqual({ from: "2026-08-01", to: "2026-10-31" });
  });
  it("widens to a longer chosen period", () => {
    expect(expenseFetchWindow("2025-01-01", "2026-12-31", now)).toEqual({ from: "2025-01-01", to: "2026-12-31" });
  });
  it("falls back to the trend months without a period", () => {
    expect(expenseFetchWindow(undefined, undefined, now)).toEqual({ from: "2026-08-01", to: "2026-10-31" });
  });
});
