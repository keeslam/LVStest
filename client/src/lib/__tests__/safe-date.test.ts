/**
 * FIX-Q (BUG-201) — one unparseable date must not take a page down.
 */
import { describe, it, expect } from "vitest";
import { safeFormatDate, toSafeDate, EMPTY_DATE } from "../safe-date";

describe("safeFormatDate", () => {
  it("formats a real date with the pattern it was given", () => {
    expect(safeFormatDate("2026-03-09", "dd-MM-yyyy")).toBe("09-03-2026");
    expect(safeFormatDate(new Date(2026, 2, 9), "yyyy-MM-dd")).toBe("2026-03-09");
  });

  it("never throws on the values that used to white-screen the page", () => {
    for (const value of ["not-a-date", "undefined", "", "0000-00-00", null, undefined, NaN, {} as any]) {
      expect(() => safeFormatDate(value as any, "dd-MM-yyyy")).not.toThrow();
      expect(safeFormatDate(value as any, "dd-MM-yyyy")).toBe(EMPTY_DATE);
    }
  });

  it("date-fns itself does throw on the same input — this is the bug being fixed", async () => {
    const { format, parseISO } = await import("date-fns");
    expect(() => format(parseISO("undefined"), "dd-MM-yyyy")).toThrow();
  });

  it("accepts a caller-chosen fallback", () => {
    expect(safeFormatDate(null, "PP", "-")).toBe("-");
    expect(safeFormatDate("nonsense", "PP", "")).toBe("");
  });

  it("an invalid pattern is caught too", () => {
    // date-fns throws on unsupported tokens (e.g. the YYYY/DD confusion).
    expect(() => safeFormatDate("2026-03-09", "YYYY-MM-DD")).not.toThrow();
  });

  it("toSafeDate returns null rather than an Invalid Date object", () => {
    expect(toSafeDate("nope")).toBeNull();
    expect(toSafeDate(new Date("nope"))).toBeNull();
    expect(toSafeDate("2026-03-09")).toBeInstanceOf(Date);
  });
});
