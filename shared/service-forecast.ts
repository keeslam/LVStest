/**
 * Punt 6 (Kees, 2026-10-20) — when is the next service expected?
 *
 * The km side of the service interval says "nog 4.200 km", never when. From
 * the dated odometer readings the app already has (pickup, return, damage
 * checks, last service, current reading) it derives the average km per day
 * over ALL readings (Kees: "Alle gegevens"): first to last reading. The date
 * the remaining km run out is today + km left / km per day; the expected
 * service is the earlier of that date and the existing date by months.
 *
 * Too few readings (fewer than 2, or less than 14 days apart) means no
 * prediction at all (Kees: "Niets voorspellen"); the existing km and months
 * calculation stays as it is.
 */
import type { ServiceDueInfo } from "./service-due";
import { MILEAGE_JUMP_KM_PER_DAY } from "./mileage-history";

export const FORECAST_MIN_SPAN_DAYS = 14;

export interface DatedReading {
  /** yyyy-MM-dd */
  date: string;
  mileage: number;
}

export interface KmPerDay {
  kmPerDay: number;
  firstDate: string;
  lastDate: string;
  readings: number;
}

function dayNumber(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : Math.round(t / 86_400_000);
}

function fromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Average km per day between the first and the last reading. A reading lower
 * than the last kept one (a typo or a swapped odometer), or more than
 * MILEAGE_JUMP_KM_PER_DAY above it (a typo like 760 000 for 76 000), is
 * skipped, the same rule as the km history (analyseMileage), so a typo that is
 * later corrected does not inflate the pace. Null when there is not enough to go on.
 */
export function kmPerDayFromReadings(readings: DatedReading[]): KmPerDay | null {
  const usable = readings
    .filter((r) => Number.isFinite(r.mileage) && r.mileage > 0 && dayNumber(r.date) !== null)
    .map((r) => ({ day: dayNumber(r.date)!, date: r.date.slice(0, 10), mileage: r.mileage }))
    .sort((a, b) => a.day - b.day || a.mileage - b.mileage);
  const clean: typeof usable = [];
  for (const r of usable) {
    const prev = clean[clean.length - 1];
    if (prev && r.mileage < prev.mileage) continue;
    if (prev && (r.mileage - prev.mileage) / Math.max(1, r.day - prev.day) > MILEAGE_JUMP_KM_PER_DAY) continue;
    clean.push(r);
  }
  if (clean.length < 2) return null;
  const first = clean[0];
  const last = clean[clean.length - 1];
  const span = last.day - first.day;
  if (span < FORECAST_MIN_SPAN_DAYS) return null;
  return {
    kmPerDay: Math.round(((last.mileage - first.mileage) / span) * 10) / 10,
    firstDate: first.date,
    lastDate: last.date,
    readings: clean.length,
  };
}

export interface ServiceForecast {
  /** yyyy-MM-dd the next service is expected; null without any basis. */
  expectedDate: string | null;
  /** Which limit is reached first. */
  basis: "km" | "months" | null;
  /** yyyy-MM-dd the remaining km run out at the average pace; null without a usable pace. */
  kmDate: string | null;
  kmPerDay: number | null;
  /** True when there were too few readings for a km prediction. */
  tooFewReadings: boolean;
}

/** Combines the existing service calculation with the km pace. */
export function forecastService(due: ServiceDueInfo, pace: KmPerDay | null, today: string): ServiceForecast {
  const todayNumber = dayNumber(today)!;
  let kmDate: string | null = null;
  if (pace && pace.kmPerDay > 0 && due.kmUntilService !== null) {
    const days = due.kmUntilService <= 0 ? 0 : Math.ceil(due.kmUntilService / pace.kmPerDay);
    kmDate = fromDayNumber(todayNumber + days);
  }
  const monthsDate = due.nextServiceDate;
  let expectedDate: string | null = null;
  let basis: ServiceForecast["basis"] = null;
  if (kmDate && (!monthsDate || kmDate < monthsDate)) {
    expectedDate = kmDate;
    basis = "km";
  } else if (monthsDate) {
    expectedDate = monthsDate;
    basis = "months";
  }
  return { expectedDate, basis, kmDate, kmPerDay: pace?.kmPerDay ?? null, tooFewReadings: pace === null };
}
