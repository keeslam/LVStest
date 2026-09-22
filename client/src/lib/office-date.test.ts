import { describe, it, expect, vi, afterEach } from "vitest";
import { officeDate, officeToday, officeTomorrow } from "./office-date";

/**
 * The pickup and return dialogs filled in "today" with
 * `new Date().toISOString().split("T")[0]`, which is the date in UTC. Between
 * midnight and 01:00 (winter) or 02:00 (summer) the desk saw yesterday's date.
 */
describe("officeDate", () => {
  it("gives the Amsterdam calendar date, not the UTC one, just after midnight", () => {
    // 00:30 in Amsterdam on 21 September (summer time, UTC+2).
    expect(officeDate(new Date("2026-09-20T22:30:00Z"))).toBe("2026-09-21");
    // 00:30 in Amsterdam on 16 January (winter time, UTC+1).
    expect(officeDate(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16");
  });

  it("agrees with UTC during the rest of the day", () => {
    expect(officeDate(new Date("2026-09-20T10:00:00Z"))).toBe("2026-09-20");
    expect(officeDate(new Date("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
  });

  it("rolls over the year at Amsterdam midnight", () => {
    expect(officeDate(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
  });
});

describe("officeToday", () => {
  afterEach(() => vi.useRealTimers());

  it("reads the clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T22:30:00Z"));
    expect(officeToday()).toBe("2026-09-21");
  });
});

/**
 * The portal's "tomorrow" took the browser's local date plus one and then read
 * it back in UTC, so just after midnight "tomorrow" was today.
 */
describe("officeTomorrow", () => {
  afterEach(() => vi.useRealTimers());

  it("is the day after the office's today, not after the UTC date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T22:30:00Z"));
    expect(officeTomorrow()).toBe("2026-09-22");
  });

  it("rolls over the month and the year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T10:00:00Z"));
    expect(officeTomorrow()).toBe("2026-10-01");
    vi.setSystemTime(new Date("2026-12-31T10:00:00Z"));
    expect(officeTomorrow()).toBe("2027-01-01");
  });

  it("does not skip or repeat a day when the clocks change", () => {
    vi.useFakeTimers();
    // Sunday 25 October 2026 lasts 25 hours in Amsterdam.
    vi.setSystemTime(new Date("2026-10-24T22:30:00Z"));
    expect(officeTomorrow()).toBe("2026-10-26");
    // Sunday 29 March 2026 lasts 23 hours.
    vi.setSystemTime(new Date("2026-03-28T23:30:00Z"));
    expect(officeTomorrow()).toBe("2026-03-30");
  });
});
