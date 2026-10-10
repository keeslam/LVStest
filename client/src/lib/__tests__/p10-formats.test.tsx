/**
 * A-2-10, A-5-6, A-7-5, A-10-5, A-12-7 (audit 2026-10-09): dates, amounts and
 * plates were written differently on every screen ("9 oktober 2026",
 * "04-06-2026", "2026-10-09", "€ 95.00", "38XT12"). One helper per kind.
 */
import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatCurrency, formatLicensePlate } from "@/lib/format-utils";
import { formatLicensePlate as formatLicensePlateFromUtils } from "@/lib/utils";

const nbsp = (s: string) => s.replace(/ /g, " ");

describe("formatDate", () => {
  it("writes d MMM yyyy in Dutch", () => {
    expect(formatDate("2026-10-09")).toBe("9 okt. 2026");
    expect(formatDate("2026-03-09")).toBe("9 mrt. 2026");
    expect(formatDate(new Date(2026, 4, 1))).toBe("1 mei 2026");
  });
  it("renders an unreadable value as a dash, never as raw text", () => {
    for (const bad of ["", "nope", null, undefined]) expect(formatDate(bad as never)).toBe("–");
  });
});

describe("formatDateTime", () => {
  it("has no seconds", () => {
    expect(formatDateTime("2026-10-09T14:05:33")).toBe("9 okt. 2026 14:05");
    expect(formatDateTime(new Date(2026, 9, 9, 8, 0, 59))).toBe("9 okt. 2026 08:00");
  });
  it("renders an unreadable value as a dash", () => {
    expect(formatDateTime(null)).toBe("–");
    expect(formatDateTime("x")).toBe("–");
  });
});

describe("formatCurrency", () => {
  it("writes euros the Dutch way", () => {
    expect(nbsp(formatCurrency(95))).toBe("€ 95,00");
    expect(nbsp(formatCurrency(1234.5))).toBe("€ 1.234,50");
    expect(nbsp(formatCurrency("95.00"))).toBe("€ 95,00");
  });
  it("renders a missing amount as a dash", () => {
    expect(formatCurrency(null)).toBe("–");
    expect(formatCurrency("abc")).toBe("–");
  });
});

describe("formatLicensePlate", () => {
  it("puts dashes in the common Dutch shapes", () => {
    expect(formatLicensePlate("38XT12")).toBe("38-XT-12");
    expect(formatLicensePlate("xx99xx")).toBe("XX-99-XX");
    expect(formatLicensePlate("38-XT-12")).toBe("38-XT-12");
    expect(formatLicensePlate("K123BC")).toBe("K-123-BC");
  });
  it("copes with an empty value", () => {
    expect(formatLicensePlate("")).toBe("");
    expect(formatLicensePlate(null as never)).toBe("");
  });
  it("is the same helper in lib/utils", () => {
    expect(formatLicensePlateFromUtils("38XT12")).toBe("38-XT-12");
    expect(formatLicensePlateFromUtils("K123BC")).toBe("K-123-BC");
  });
});
