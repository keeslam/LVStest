import { describe, it, expect } from "vitest";
import { forecastService, kmPerDayFromReadings } from "./service-forecast";
import type { ServiceDueInfo } from "./service-due";

const due = (over: Partial<ServiceDueInfo>): ServiceDueInfo => ({
  intervalKm: 30000, intervalMonths: 12, nextServiceDate: null, nextServiceMileage: null,
  daysUntilService: null, kmUntilService: null, isDueByDate: false, isDueByMileage: false,
  isServiceDue: false, isServiceDueSoon: false, hasData: true, ...over,
});

describe("kmPerDayFromReadings", () => {
  it("averages first to last reading over all data", () => {
    const pace = kmPerDayFromReadings([
      { date: "2026-01-01", mileage: 10_000 },
      { date: "2026-04-11", mileage: 18_000 }, // 100 days, 8000 km
      { date: "2026-02-01", mileage: 12_000 },
    ]);
    expect(pace).toEqual({ kmPerDay: 80, firstDate: "2026-01-01", lastDate: "2026-04-11", readings: 3 });
  });

  it("skips a reading lower than an earlier one", () => {
    const pace = kmPerDayFromReadings([
      { date: "2026-01-01", mileage: 10_000 },
      { date: "2026-02-01", mileage: 9_000 },
      { date: "2026-01-31", mileage: 13_000 },
    ]);
    expect(pace?.kmPerDay).toBe(100);
    expect(pace?.readings).toBe(2);
  });

  it("skips a jump: a typo followed by a correction gives the normal pace", () => {
    const pace = kmPerDayFromReadings([
      { date: "2026-01-01", mileage: 70_000 },
      { date: "2026-02-01", mileage: 760_000 },
      { date: "2026-03-02", mileage: 76_000 }, // 60 days, 6000 km
    ]);
    expect(pace).toEqual({ kmPerDay: 100, firstDate: "2026-01-01", lastDate: "2026-03-02", readings: 2 });
  });

  it("skips a jump on the same day as the correction", () => {
    const pace = kmPerDayFromReadings([
      { date: "2026-01-01", mileage: 70_000 },
      { date: "2026-03-02", mileage: 760_000 },
      { date: "2026-03-02", mileage: 76_000 },
    ]);
    expect(pace?.kmPerDay).toBe(100);
  });

  it("predicts nothing with too few readings", () => {
    expect(kmPerDayFromReadings([])).toBeNull();
    expect(kmPerDayFromReadings([{ date: "2026-01-01", mileage: 10_000 }])).toBeNull();
    expect(kmPerDayFromReadings([
      { date: "2026-01-01", mileage: 10_000 },
      { date: "2026-01-10", mileage: 11_000 },
    ])).toBeNull();
  });
});

describe("forecastService", () => {
  const pace = { kmPerDay: 100, firstDate: "2026-01-01", lastDate: "2026-10-01", readings: 5 };

  it("takes the km date when it comes first", () => {
    const f = forecastService(due({ kmUntilService: 3000, nextServiceDate: "2027-06-01" }), pace, "2026-10-20");
    expect(f).toMatchObject({ expectedDate: "2026-11-19", basis: "km", kmDate: "2026-11-19", kmPerDay: 100, tooFewReadings: false });
  });

  it("takes the months date when it comes first", () => {
    const f = forecastService(due({ kmUntilService: 30_000, nextServiceDate: "2026-12-01" }), pace, "2026-10-20");
    expect(f).toMatchObject({ expectedDate: "2026-12-01", basis: "months" });
  });

  it("puts an already passed km limit on today", () => {
    const f = forecastService(due({ kmUntilService: -500 }), pace, "2026-10-20");
    expect(f).toMatchObject({ expectedDate: "2026-10-20", basis: "km" });
  });

  it("falls back to the months date without a pace", () => {
    const f = forecastService(due({ kmUntilService: 3000, nextServiceDate: "2027-01-01" }), null, "2026-10-20");
    expect(f).toMatchObject({ expectedDate: "2027-01-01", basis: "months", kmDate: null, tooFewReadings: true });
  });

  it("has nothing without any basis", () => {
    const f = forecastService(due({ hasData: false }), null, "2026-10-20");
    expect(f.expectedDate).toBeNull();
  });
});
