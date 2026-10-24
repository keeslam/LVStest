import { describe, it, expect } from "vitest";
import { isoWeekStart } from "./maintenance-outlook-report";

describe("isoWeekStart", () => {
  it("geeft de maandag van de ISO-week", () => {
    expect(isoWeekStart("2026-11-12")).toBe("2026-11-09");
    expect(isoWeekStart("2026-11-09")).toBe("2026-11-09");
    expect(isoWeekStart("2026-11-15")).toBe("2026-11-09");
    expect(isoWeekStart("2027-01-01")).toBe("2026-12-28");
  });
});
