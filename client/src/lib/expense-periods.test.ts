import { describe, it, expect } from "vitest";
import { expensePeriodRange, matchingExpensePeriod } from "./expense-periods";

describe("expensePeriodRange", () => {
  it("this month runs from the first to the last day, leap years included", () => {
    expect(expensePeriodRange("thisMonth", "2026-10-16")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(expensePeriodRange("thisMonth", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("last month wraps into the previous year in January", () => {
    expect(expensePeriodRange("lastMonth", "2026-10-16")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(expensePeriodRange("lastMonth", "2027-01-03")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("this year is the whole calendar year", () => {
    expect(expensePeriodRange("thisYear", "2026-10-16")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("recognises the quick choice behind typed bounds, and nothing else", () => {
    expect(matchingExpensePeriod("2026-10-01", "2026-10-31", "2026-10-16")).toBe("thisMonth");
    expect(matchingExpensePeriod("2026-09-01", "2026-09-30", "2026-10-16")).toBe("lastMonth");
    expect(matchingExpensePeriod("2026-01-01", "2026-12-31", "2026-10-16")).toBe("thisYear");
    expect(matchingExpensePeriod("2026-10-01", "2026-10-16", "2026-10-16")).toBeNull();
    expect(matchingExpensePeriod("", "2026-10-31", "2026-10-16")).toBeNull();
  });
});
