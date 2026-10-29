import { describe, it, expect } from "vitest";
import { apkPlanning, APK_PLAN_WINDOW_DAYS } from "./apk-planning";

const base = { status: "picked_up", endDate: "2026-12-31", apkDate: "2026-11-20", daysLeft: 30 };

describe("when the portal offers to plan the APK", () => {
  it("offers it for a rental on the road whose APK runs out within 45 days, before the rental ends", () => {
    expect(apkPlanning(base)).toEqual({ offer: true, expired: false });
    expect(apkPlanning({ ...base, daysLeft: APK_PLAN_WINDOW_DAYS }).offer).toBe(true);
  });

  it("offers it when the APK has already expired", () => {
    expect(apkPlanning({ ...base, apkDate: "2026-09-01", daysLeft: -40 })).toEqual({ offer: true, expired: true });
  });

  it("offers nothing when the APK is further away than the window", () => {
    expect(apkPlanning({ ...base, daysLeft: APK_PLAN_WINDOW_DAYS + 1 }).offer).toBe(false);
  });

  it("offers nothing when the APK only runs out after the rental has ended", () => {
    expect(apkPlanning({ ...base, endDate: "2026-11-10" }).offer).toBe(false);
    expect(apkPlanning({ ...base, endDate: "2026-11-20" }).offer).toBe(true);
  });

  it("offers it for a rental without an end date", () => {
    expect(apkPlanning({ ...base, endDate: null }).offer).toBe(true);
  });

  it("only for a rental that is in use, and only when the car has an APK date", () => {
    for (const status of ["booked", "completed", "returned", "cancelled"]) expect(apkPlanning({ ...base, status }).offer).toBe(false);
    expect(apkPlanning({ ...base, apkDate: null, daysLeft: null }).offer).toBe(false);
  });
});
