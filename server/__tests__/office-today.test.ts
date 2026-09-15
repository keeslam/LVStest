/**
 * "Vandaag" is de dag op de kantooragenda, niet de dag in UTC.
 *
 * Found while the suite was running just after midnight: `isoToday()` was
 * `new Date().toISOString().split("T")[0]`, which is the UTC date. The office
 * is in Amsterdam and the container runs on UTC, so between 00:00 and 01:00
 * (winter) or 02:00 (summer) the application believed it was still yesterday.
 *
 * What that costs in the yard: a rental that starts today is refused at
 * handover with "de huur start later" (B-16), the work-day screen shows
 * yesterday's pickups, and every "does this block cover today" question
 * answers for the wrong day — during exactly the hours the night shift hands
 * out cars.
 */
import { describe, it, expect } from "vitest";
import { isoToday, officeDate } from "../services/lifecycle";

describe("de kantooragenda bepaalt welke dag het is", () => {
  it("leest een instant in Europe/Amsterdam, niet in UTC", () => {
    // 21 June 2026 23:30 UTC is already 22 June in Amsterdam (UTC+2).
    expect(officeDate(new Date("2026-06-21T23:30:00Z"))).toBe("2026-06-22");
    // 21 December 2026 23:30 UTC is 22 December in Amsterdam (UTC+1).
    expect(officeDate(new Date("2026-12-21T23:30:00Z"))).toBe("2026-12-22");
    // And during the day the two agree.
    expect(officeDate(new Date("2026-06-21T10:00:00Z"))).toBe("2026-06-21");
  });

  it("geeft yyyy-MM-dd, de vorm waarin de API datums opslaat", () => {
    expect(isoToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("loopt na middernacht niet achter op de kalender van het kantoor", () => {
    // Whatever time this suite runs, `isoToday()` must equal the Amsterdam day.
    const amsterdam = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(isoToday()).toBe(amsterdam);
  });
});
