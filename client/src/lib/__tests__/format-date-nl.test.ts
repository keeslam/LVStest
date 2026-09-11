/**
 * FIX-S — the two pure halves of the cluster (remediation plan §3 FIX-S).
 *
 *   BUG-223 — American dates and untranslated strings in a Dutch UI.
 *   BUG-228 — the calendar filters the whole reservation set per cell.
 *
 * The layout half (BUG-210 at 1182 px, BUG-222 at 768 px) is deliberately not
 * faked here: the plan says to verify it by hand at 768/1024/1182 px and record
 * the result, not to write a test that asserts a class name.
 */
import { describe, it, expect } from "vitest";
import { formatDateNl, formatDateTimeNl, formatDateRangeNl, EMPTY_DATE } from "../format-date-nl";
import { bucketByDay, bucketByVehicleAndDay, cellKey, dayKey } from "../reservation-buckets";

describe("FIX-S — formatDateNl (BUG-223)", () => {
  it("writes the month in Dutch, day before month", () => {
    expect(formatDateNl("2026-03-09")).toBe("9 maart 2026");
    expect(formatDateNl("2026-03-09")).not.toContain("March");
    expect(formatDateNl("2026-09-11", "medium")).toBe("11 sep. 2026");
    expect(formatDateNl("2026-09-11", "short")).toBe("11-09-2026");
  });

  it("accepts a Date as well as the API's yyyy-MM-dd", () => {
    expect(formatDateNl(new Date(2026, 2, 9))).toBe("9 maart 2026");
  });

  it("renders an unreadable date as an en dash, never 'Invalid date'", () => {
    for (const bad of ["", "not-a-date", "2026-13-45", null, undefined]) {
      expect(formatDateNl(bad as any)).toBe(EMPTY_DATE);
    }
  });

  it("formats a timestamp and a range", () => {
    expect(formatDateTimeNl("2026-03-09T14:05:00")).toBe("9 maart 2026 om 14:05");
    expect(formatDateRangeNl("2026-08-11", "2026-09-10")).toBe("11 aug. 2026 – 10 sep. 2026");
    expect(formatDateRangeNl(null, "2026-09-10")).toBe(`${EMPTY_DATE} – 10 sep. 2026`);
  });
});

describe("FIX-S — reservation bucketing (BUG-228)", () => {
  const row = (id: number, vehicleId: number, startDate: string, endDate: string | null) =>
    ({ id, vehicleId, startDate, endDate });

  it("puts a reservation in every day its period covers", () => {
    const buckets = bucketByDay([row(1, 10, "2026-03-09", "2026-03-11")]);
    expect(Array.from(buckets.keys()).sort()).toEqual(["2026-03-09", "2026-03-10", "2026-03-11"]);
    expect(buckets.get("2026-03-10")!.map((r) => r.id)).toEqual([1]);
  });

  it("buckets an open-ended reservation on its start day only", () => {
    const buckets = bucketByDay([row(2, 10, "2026-03-09", null)]);
    expect(Array.from(buckets.keys())).toEqual(["2026-03-09"]);
  });

  it("honours the visible window instead of walking a year-long rental", () => {
    const buckets = bucketByDay([row(3, 10, "2026-01-01", "2026-12-31")], {
      start: new Date(2026, 2, 9),
      end: new Date(2026, 2, 11),
    });
    expect(Array.from(buckets.keys()).sort()).toEqual(["2026-03-09", "2026-03-10", "2026-03-11"]);
  });

  it("gives each vehicle × day cell exactly the reservations that overlap it", () => {
    const rows = [
      row(1, 10, "2026-03-09", "2026-03-10"),
      row(2, 10, "2026-03-10", "2026-03-12"),
      row(3, 11, "2026-03-10", "2026-03-10"),
    ];
    const cells = bucketByVehicleAndDay(rows);

    expect(cells.get(cellKey(10, new Date(2026, 2, 9)))!.map((r) => r.id)).toEqual([1]);
    expect(cells.get(cellKey(10, new Date(2026, 2, 10)))!.map((r) => r.id).sort()).toEqual([1, 2]);
    expect(cells.get(cellKey(11, new Date(2026, 2, 10)))!.map((r) => r.id)).toEqual([3]);
    expect(cells.get(cellKey(11, new Date(2026, 2, 11)))).toBeUndefined();
  });

  it("is one pass over the data, not one per cell", () => {
    // 1 000 reservations over 30 days: the bucketing reads each row once, so the
    // total work is the rows, not rows × cells (which is the shape of BUG-228).
    const rows = Array.from({ length: 1000 }, (_, i) =>
      row(i + 1, (i % 35) + 1, "2026-03-01", "2026-03-30"),
    );
    let reads = 0;
    const counted = rows.map((r) => new Proxy(r, {
      get(target, prop, receiver) {
        if (prop === "startDate") reads += 1;
        return Reflect.get(target, prop, receiver);
      },
    }));

    const cells = bucketByVehicleAndDay(counted as any, {
      start: new Date(2026, 2, 1),
      end: new Date(2026, 2, 30),
    });

    expect(reads).toBe(rows.length);
    expect(cells.get(cellKey(1, new Date(2026, 2, 15)))!.length).toBeGreaterThan(0);
  });

  it("dayKey uses local time, so a cell never lands on the previous day", () => {
    expect(dayKey(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
    expect(dayKey(new Date(2026, 11, 31, 23, 30))).toBe("2026-12-31");
  });
});
