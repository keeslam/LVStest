/**
 * Punt 16 / OPT-009 (Kees, 2026-10-20) — which free car to suggest as a
 * replacement.
 *
 * Kees's order: the same vehicle type first; within that, the same make and
 * model, then the same make, then the rest. When nothing of the same type is
 * free, other types are suggested and marked as such. A car whose APK runs out
 * within the period is suggested too, with a warning ("toch ja met
 * waarschuwing voor de apk!"), just behind an otherwise equal car without that
 * problem. The plate breaks the remaining ties, so the suggestion is stable.
 * The candidates are the cars that are free (the booking rule; the dialogs
 * fetch them), so nothing here decides availability.
 */
import { apkExpiresBy } from "./availability-board";

export interface SpareVehicleLike {
  id: number;
  licensePlate: string;
  brand?: string | null;
  model?: string | null;
  vehicleType?: string | null;
  apkDate?: string | null;
}

export interface SpareSuggestion<T extends SpareVehicleLike = SpareVehicleLike> {
  vehicle: T;
  sameType: boolean;
  sameModel: boolean;
  sameBrand: boolean;
  apkWarning: boolean;
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

export function rankSpareCandidates<T extends SpareVehicleLike>(
  original: Omit<SpareVehicleLike, "id" | "licensePlate"> | null | undefined,
  candidates: T[],
  endDate: string | null | undefined,
): SpareSuggestion<T>[] {
  const type = norm(original?.vehicleType);
  const brand = norm(original?.brand);
  const model = norm(original?.model);
  const scored = candidates.map((vehicle) => {
    const sameType = !!type && norm(vehicle.vehicleType) === type;
    const sameBrand = !!brand && norm(vehicle.brand) === brand;
    const sameModel = sameBrand && !!model && norm(vehicle.model) === model;
    const apkWarning = !!endDate && apkExpiresBy(vehicle.apkDate, endDate);
    return { vehicle, sameType, sameModel, sameBrand, apkWarning };
  });
  const key = (s: SpareSuggestion<T>) => [
    s.sameType ? 0 : 1,
    s.sameModel ? 0 : s.sameBrand ? 1 : 2,
    s.apkWarning ? 1 : 0,
  ];
  return scored.sort((a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return a.vehicle.licensePlate.localeCompare(b.vehicle.licensePlate);
  });
}

/**
 * "Alles invullen": the best suggestion per open replacement, never the same
 * car twice. Rows are filled in the order given; a row with no car left gets
 * nothing (the employee chooses there).
 */
export function suggestForAll<T extends SpareVehicleLike>(
  rows: Array<{ key: number; original: Omit<SpareVehicleLike, "id" | "licensePlate"> | null | undefined; endDate: string | null | undefined; candidates: T[] }>,
  alreadyTaken: number[] = [],
): Map<number, number> {
  const used = new Set(alreadyTaken);
  const result = new Map<number, number>();
  for (const row of rows) {
    const pick = rankSpareCandidates(row.original, row.candidates.filter((c) => !used.has(c.id)), row.endDate)[0];
    if (!pick) continue;
    used.add(pick.vehicle.id);
    result.set(row.key, pick.vehicle.id);
  }
  return result;
}
