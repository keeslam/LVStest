import { describe, it, expect } from "vitest";
import { isApkExpired } from "@/lib/apk-expiry";

describe("isApkExpired (A-3-14)", () => {
  it("is expired the day after the APK date, not on it", () => {
    expect(isApkExpired("2026-02-27", "2026-02-28")).toBe(true);
    expect(isApkExpired("2026-02-27", "2026-02-27")).toBe(false);
    expect(isApkExpired("2026-02-27", "2026-02-26")).toBe(false);
  });

  it("takes the office day by default and tolerates timestamps", () => {
    expect(isApkExpired("2000-01-01T00:00:00.000Z")).toBe(true);
    expect(isApkExpired("2999-01-01")).toBe(false);
  });

  it("has no opinion without a date", () => {
    expect(isApkExpired(null)).toBe(false);
    expect(isApkExpired(undefined)).toBe(false);
    expect(isApkExpired("")).toBe(false);
    expect(isApkExpired("not a date")).toBe(false);
  });
});
