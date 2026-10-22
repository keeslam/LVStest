import { describe, expect, it } from "vitest";
import { deviceLabel, isDormant } from "../user-activity";

const now = new Date("2026-10-22T12:00:00Z");

describe("isDormant", () => {
  it("is dormant after more than 90 days without a login", () => {
    expect(isDormant({ active: true, lastLoginAt: "2026-07-01T00:00:00Z" }, now)).toBe(true);
    expect(isDormant({ active: true, lastLoginAt: "2026-09-01T00:00:00Z" }, now)).toBe(false);
  });
  it("counts a never-used account from its creation", () => {
    expect(isDormant({ active: true, lastLoginAt: null, createdAt: "2026-10-01T00:00:00Z" }, now)).toBe(false);
    expect(isDormant({ active: true, lastLoginAt: null, createdAt: "2026-01-01T00:00:00Z" }, now)).toBe(true);
  });
  it("never calls a switched-off account dormant", () => {
    expect(isDormant({ active: false, lastLoginAt: "2025-01-01T00:00:00Z" }, now)).toBe(false);
  });
});

describe("deviceLabel", () => {
  it("names browser and system", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")).toEqual({ browser: "Chrome", os: "Windows" });
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toEqual({ browser: "Safari", os: "iPhone" });
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0")).toEqual({ browser: "Edge", os: "Windows" });
    expect(deviceLabel(null)).toEqual({ browser: "", os: "" });
  });
});
