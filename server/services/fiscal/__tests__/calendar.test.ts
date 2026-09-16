/**
 * The one place that counts days and months for the fiscal check.
 *
 * Calendar days are inclusive of both the first and the last day, months are
 * calendar months, and none of it depends on the time zone of the machine.
 */
import { describe, it, expect } from "vitest";
import {
  isValidIsoDate,
  addDays,
  calendarDaysInclusive,
  daysInMonth,
  monthsTouched,
  ageInFullYears,
  yearOf,
  monthKey,
  compareIso,
} from "../calendar";

describe("fiscal calendar", () => {
  it("accepts only real yyyy-MM-dd dates", () => {
    expect(isValidIsoDate("2027-02-28")).toBe(true);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2027-02-29")).toBe(false);
    expect(isValidIsoDate("2027-13-01")).toBe(false);
    expect(isValidIsoDate("27-01-01")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2027-01-30", 3)).toBe("2027-02-02");
    expect(addDays("2027-12-31", 1)).toBe("2028-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });

  it("counts calendar days inclusive of both ends", () => {
    expect(calendarDaysInclusive("2027-03-01", "2027-03-01")).toBe(1);
    expect(calendarDaysInclusive("2027-03-01", "2027-03-07")).toBe(7);
    expect(calendarDaysInclusive("2027-03-25", "2027-04-07")).toBe(14);
    expect(calendarDaysInclusive("2027-12-29", "2028-01-04")).toBe(7);
  });

  it("knows the length of each month, including leap years", () => {
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 4)).toBe(30);
    expect(daysInMonth(2027, 12)).toBe(31);
  });

  it("splits a period into the calendar months it touches, with the days in each", () => {
    expect(monthsTouched("2027-03-25", "2027-04-07")).toEqual([
      { month: "2027-03", firstDay: "2027-03-25", lastDay: "2027-03-31", days: 7, daysInMonth: 31 },
      { month: "2027-04", firstDay: "2027-04-01", lastDay: "2027-04-07", days: 7, daysInMonth: 30 },
    ]);
    expect(monthsTouched("2027-06-10", "2027-06-10")).toEqual([
      { month: "2027-06", firstDay: "2027-06-10", lastDay: "2027-06-10", days: 1, daysInMonth: 30 },
    ]);
    // A period over a year boundary keeps the months in order.
    expect(monthsTouched("2027-12-29", "2028-01-04").map((m) => m.month)).toEqual(["2027-12", "2028-01"]);
  });

  it("measures age in full years, counting the birthday itself", () => {
    expect(ageInFullYears("2002-03-15", "2027-03-14")).toBe(24);
    expect(ageInFullYears("2002-03-15", "2027-03-15")).toBe(25);
    expect(ageInFullYears("2002-03-15", "2027-04-01")).toBe(25);
    // A 29 February first admission turns a year older on 1 March in a common year.
    expect(ageInFullYears("2000-02-29", "2027-02-28")).toBe(26);
    expect(ageInFullYears("2000-02-29", "2027-03-01")).toBe(27);
  });

  it("reads year and month keys and compares dates as text", () => {
    expect(yearOf("2027-12-29")).toBe(2027);
    expect(monthKey("2027-12-29")).toBe("2027-12");
    expect(compareIso("2027-01-01", "2027-01-02")).toBeLessThan(0);
    expect(compareIso("2027-01-02", "2027-01-02")).toBe(0);
  });
});
