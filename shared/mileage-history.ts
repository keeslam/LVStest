import { DEFAULT_OFFICE_TIMEZONE, dateInZone } from "./office-timezone";

export const MILEAGE_SOURCES = ["pickup", "return", "damage_check", "manual", "portal", "service", "import"] as const;
export type MileageSource = (typeof MILEAGE_SOURCES)[number];

/** Km per dag boven dit gemiddelde tussen twee standen telt als onlogische sprong. */
export const MILEAGE_JUMP_KM_PER_DAY = 2000;

export interface MileageRow {
  id: number;
  mileage: number;
  recordedAt: string;
  source: MileageSource;
  actorName: string | null;
  voided: boolean;
}

export interface AnalysedRow extends MileageRow {
  drivenSincePrevious: number | null;
  warning: "decrease" | "jump" | null;
  /** What this row adds to `summary.drivenKm`: 0 when voided, a warning, or without a previous reading. */
  countedKm: number;
  /** Office date of the previous reading (for the baseline row: the day before the effective start); null when countedKm is 0. */
  countedSince: string | null;
}

export interface MileageSummary {
  drivenKm: number;
  avgPerMonth: number | null;
  freeKm: number | null;
  overFreeKm: number | null;
  readings: number;
  warnings: number;
  /**
   * The period the averages and free km are computed over: the asked period, starting no
   * earlier than the first known reading (baseline or first valid row) and ending no later
   * than the office today. Null when the period has no readings.
   */
  periodFrom: string | null;
  periodTo: string | null;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function dayString(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Analyseert een reeks kilometerstanden. `from`/`to` zijn kantoordata (yyyy-mm-dd)
 * en bepalen het aantal dagen van de periode (inclusief). `baseline` is de laatste
 * geldige stand voor `from`; die wordt niet getoond maar dient als "vorige".
 */
export function analyseMileage(
  rows: MileageRow[],
  opts: { from: string; to: string; freeKmPerDay: number | null; baseline?: MileageRow | null; zone?: string; today?: string },
): { rows: AnalysedRow[]; summary: MileageSummary } {
  const sorted = [...rows].sort((a, b) =>
    a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : a.id - b.id);

  let prev: MileageRow | null = opts.baseline && !opts.baseline.voided ? opts.baseline : null;
  let drivenKm = 0;
  let warnings = 0;
  let readings = 0;
  const zone = opts.zone ?? DEFAULT_OFFICE_TIMEZONE;
  const officeDate = (iso: string) => dateInZone(new Date(iso), zone);
  const officeDay = (iso: string) => dayNumber(officeDate(iso));

  // Effective period: never before the first known reading, never after the office today,
  // so "Alle tijd" or a period ending in the future does not dilute the average or credit free km.
  const firstKnown = prev ?? sorted.find((r) => !r.voided) ?? null;
  const firstDate = firstKnown ? officeDate(firstKnown.recordedAt) : null;
  const today = opts.today ?? dateInZone(new Date(), zone);
  const effFrom = firstDate && firstDate > opts.from ? firstDate : opts.from;
  const clampedTo = opts.to < today ? opts.to : today;
  const effTo = clampedTo < effFrom ? effFrom : clampedTo;
  const out: AnalysedRow[] = sorted.map((r) => {
    if (r.voided) return { ...r, drivenSincePrevious: null, warning: null, countedKm: 0, countedSince: null };
    readings += 1;
    let driven: number | null = null;
    let warning: AnalysedRow["warning"] = null;
    let countedKm = 0;
    let countedSince: string | null = null;
    if (prev) {
      driven = r.mileage - prev.mileage;
      if (driven < 0) warning = "decrease";
      else {
        const days = Math.max(1, Math.round((Date.parse(r.recordedAt) - Date.parse(prev.recordedAt)) / DAY_MS));
        if (driven / days > MILEAGE_JUMP_KM_PER_DAY) warning = "jump";
      }
      // A jump is listed but not counted: it is as likely a typo as a real distance.
      if (driven > 0 && warning !== "jump") {
        if (prev === opts.baseline) {
          // Only the part of the baseline delta inside the period counts, pro-rated by office days.
          const span = officeDay(r.recordedAt) - officeDay(prev.recordedAt);
          const inside = officeDay(r.recordedAt) - dayNumber(effFrom);
          const share = span <= 0 ? 1 : Math.min(1, Math.max(0, inside / span));
          countedKm = Math.round(driven * share);
          if (countedKm > 0) countedSince = dayString(dayNumber(effFrom) - 1);
        } else {
          countedKm = driven;
          countedSince = officeDate(prev.recordedAt);
        }
        drivenKm += countedKm;
      }
    }
    if (warning) warnings += 1;
    // A lower reading stays listed with its warning but is not trusted as the next "previous",
    // so one typo (124 900 -> 12 500 -> 125 000) does not add the whole odometer to driven km.
    if (warning !== "decrease") prev = r;
    return { ...r, drivenSincePrevious: driven, warning, countedKm, countedSince };
  });

  const days = Math.max(1, Math.round(dayNumber(effTo) - dayNumber(effFrom)) + 1);
  const freeKm = opts.freeKmPerDay == null ? null : opts.freeKmPerDay * days;
  return {
    rows: out,
    summary: {
      drivenKm,
      avgPerMonth: readings === 0 ? null : Math.round(drivenKm / (days / 30.44)),
      freeKm,
      overFreeKm: freeKm == null ? null : Math.max(0, drivenKm - freeKm),
      readings,
      warnings,
      periodFrom: readings === 0 ? null : effFrom,
      periodTo: readings === 0 ? null : effTo,
    },
  };
}

/**
 * Spreads every row's `countedKm` evenly over the office days (countedSince, day of the row]
 * (the same day: all in that month) and sums per month. Whole numbers by cumulative rounding,
 * so the total is exactly `summary.drivenKm`. Ascending, only months with km > 0.
 */
export function drivenKmByMonth(rows: AnalysedRow[], zone: string = DEFAULT_OFFICE_TIMEZONE): Array<{ month: string; km: number }> {
  const totals = new Map<string, number>();
  const add = (month: string, km: number) => totals.set(month, (totals.get(month) ?? 0) + km);
  for (const r of rows) {
    if (r.countedKm <= 0) continue;
    const rowDay = dateInZone(new Date(r.recordedAt), zone);
    const n = r.countedSince ? Math.round(dayNumber(rowDay) - dayNumber(r.countedSince)) : 0;
    if (n <= 0) {
      add(rowDay.slice(0, 7), r.countedKm);
      continue;
    }
    const daysPerMonth = new Map<string, number>();
    for (let d = 1; d <= n; d++) {
      const month = dayString(dayNumber(r.countedSince!) + d).slice(0, 7);
      daysPerMonth.set(month, (daysPerMonth.get(month) ?? 0) + 1);
    }
    let t = 0;
    for (const [month, count] of daysPerMonth) {
      t += count;
      add(month, Math.round((r.countedKm * t) / n) - Math.round((r.countedKm * (t - count)) / n));
    }
  }
  return [...totals.entries()]
    .filter(([, km]) => km > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, km]) => ({ month, km }));
}
