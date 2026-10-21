import { describe, it, expect } from "vitest";
import { dismissalHolds, dismissalUntil, isDismissalKey } from "./notification-dismissal";

describe("notification dismissals", () => {
  it("accepts only the notification centre's keys", () => {
    expect(isDismissalKey("dismissed_apk_12")).toBe(true);
    expect(isDismissalKey("dismissed_zone_moveIzi_3")).toBe(true);
    expect(isDismissalKey("dismissed_missing_invoice_3201")).toBe(true);
    expect(isDismissalKey("dismissed_apk_")).toBe(false);
    expect(isDismissalKey("anything_else_1")).toBe(false);
  });

  it("ends a week or a month later", () => {
    const now = new Date("2026-10-21T10:00:00Z");
    expect(dismissalUntil("week", now)?.toISOString().slice(0, 10)).toBe("2026-10-28");
    expect(dismissalUntil("month", now)?.toISOString().slice(0, 10)).toBe("2026-11-21");
    expect(dismissalUntil("until_change", now)).toBeNull();
  });

  it("holds until its end, or while the date is unchanged", () => {
    const now = new Date("2026-10-21T10:00:00Z");
    expect(dismissalHolds({ key: "k", mode: "week", until: "2026-10-28T10:00:00Z", fingerprint: null }, now)).toBe(true);
    expect(dismissalHolds({ key: "k", mode: "week", until: "2026-10-20T10:00:00Z", fingerprint: null }, now)).toBe(false);
    const d = { key: "k", mode: "until_change", until: null, fingerprint: "2026-11-01" };
    expect(dismissalHolds(d, now, "2026-11-01")).toBe(true);
    expect(dismissalHolds(d, now, "2027-11-01")).toBe(false);
    expect(dismissalHolds(undefined, now)).toBe(false);
  });
});
