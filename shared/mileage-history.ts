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
}

export interface MileageSummary {
  drivenKm: number;
  avgPerMonth: number | null;
  freeKm: number | null;
  overFreeKm: number | null;
  readings: number;
  warnings: number;
}

import { DEFAULT_OFFICE_TIMEZONE, dateInZone } from "./office-timezone";

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

/**
 * Analyseert een reeks kilometerstanden. `from`/`to` zijn kantoordata (yyyy-mm-dd)
 * en bepalen het aantal dagen van de periode (inclusief). `baseline` is de laatste
 * geldige stand voor `from`; die wordt niet getoond maar dient als "vorige".
 */
export function analyseMileage(
  rows: MileageRow[],
  opts: { from: string; to: string; freeKmPerDay: number | null; baseline?: MileageRow | null; zone?: string },
): { rows: AnalysedRow[]; summary: MileageSummary } {
  const sorted = [...rows].sort((a, b) =>
    a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : a.id - b.id);

  let prev: MileageRow | null = opts.baseline && !opts.baseline.voided ? opts.baseline : null;
  let drivenKm = 0;
  let warnings = 0;
  let readings = 0;
  const zone = opts.zone ?? DEFAULT_OFFICE_TIMEZONE;
  const officeDay = (iso: string) => dayNumber(dateInZone(new Date(iso), zone));
  const out: AnalysedRow[] = sorted.map((r) => {
    if (r.voided) return { ...r, drivenSincePrevious: null, warning: null };
    readings += 1;
    let driven: number | null = null;
    let warning: AnalysedRow["warning"] = null;
    if (prev) {
      driven = r.mileage - prev.mileage;
      if (driven < 0) warning = "decrease";
      else {
        const days = Math.max(1, Math.round((Date.parse(r.recordedAt) - Date.parse(prev.recordedAt)) / DAY_MS));
        if (driven / days > MILEAGE_JUMP_KM_PER_DAY) warning = "jump";
      }
      if (driven > 0) {
        if (prev === opts.baseline) {
          // Only the part of the baseline delta inside the period counts, pro-rated by office days.
          const span = officeDay(r.recordedAt) - officeDay(prev.recordedAt);
          const inside = officeDay(r.recordedAt) - dayNumber(opts.from);
          const share = span <= 0 ? 1 : Math.min(1, Math.max(0, inside / span));
          drivenKm += Math.round(driven * share);
        } else drivenKm += driven;
      }
    }
    if (warning) warnings += 1;
    prev = r;
    return { ...r, drivenSincePrevious: driven, warning };
  });

  const days = Math.max(1, Math.round(dayNumber(opts.to) - dayNumber(opts.from)) + 1);
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
    },
  };
}
