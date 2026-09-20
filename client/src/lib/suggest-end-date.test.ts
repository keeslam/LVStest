import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { suggestEndDate } from "./suggest-end-date";

/**
 * The reservations page went down with "Invalid time value" whenever someone
 * emptied the start date in the reservation form (Chrome's "Wissen" button,
 * Backspace on a date segment) or typed a five-digit year: the form computed
 * `format(addDays(parseISO(startDate), 3))` during render, and date-fns'
 * `format` throws on an unreadable date.
 */
describe("suggestEndDate", () => {
  it("suggests the start date plus three days", () => {
    expect(suggestEndDate("2026-09-18")).toBe("2026-09-21");
    expect(suggestEndDate("2026-12-30")).toBe("2027-01-02");
    expect(suggestEndDate("2026-09-18", 1)).toBe("2026-09-19");
  });

  it("suggests nothing, and never throws, for a start date that cannot be read", () => {
    for (const unreadable of ["", "   ", "20266-09-18", "2026-02-30", "18-09-2026", "undefined", "null"]) {
      expect(() => suggestEndDate(unreadable)).not.toThrow();
      expect(suggestEndDate(unreadable)).toBe("");
    }
    expect(suggestEndDate(null)).toBe("");
    expect(suggestEndDate(undefined)).toBe("");
  });

  it("is what the reservation form uses: no bare date-fns format on the typed start date", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../components/reservations/reservation-form.tsx"),
      "utf8",
    );
    expect(source).toContain("suggestEndDate(");
    expect(source).not.toMatch(/format\(\s*addDays\(\s*parseISO\(/);
    expect(source).not.toMatch(/format\(\s*suggestedEndDate/);
  });
});
