/**
 * Punt 14 (Kees, 2026-10-20) — the data behind the availability window.
 *
 * "Free" is exactly what booking uses (storage.getAvailableVehiclesInRange), so
 * the window and the booking form never disagree. "Busy" is every other car that
 * could be rented (not in the workshop, not "not for rental", not out of the
 * fleet), with the first day it is free again.
 */
import { and, eq, gte, inArray, isNull, notInArray, or } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { reservations, type Vehicle } from "../../shared/schema";
import { apkExpiresBy, busyHint, overlapsPeriod, type BusyPeriod } from "../../shared/availability-board";
import { KM_ALLOWANCE_KEY, kmAllowanceFromSetting, kmRateForVehicle, vehicleTypeKey } from "../../shared/km-allowance";

const CLOSED = ["cancelled", "completed", "returned"];

export interface AvailabilityRow {
  id: number;
  licensePlate: string;
  brand: string;
  model: string;
  vehicleType: string | null;
  currentMileage: number | null;
  currentFuelLevel: string | null;
  apkDate: string | null;
  apkExpiresInPeriod: boolean;
  freeKmPerDay: number | null;
  /** A planned maintenance block overlaps the period (booking is still allowed, B-09). */
  maintenancePlanned: boolean;
  /** Busy cars only: rented at the start; first free day, null when an open-ended rental is in the way. */
  freeFrom?: string | null;
  /** Busy cars only: free at the start but rented later in the period; last free day. */
  freeUntil?: string;
}

export interface AvailabilityBoard {
  startDate: string;
  endDate: string;
  free: AvailabilityRow[];
  busy: AvailabilityRow[];
}

function rentable(v: Vehicle): boolean {
  return v.maintenanceStatus !== "in_service"
    && v.availabilityStatus !== "not_for_rental"
    && v.availabilityStatus !== "needs_fixing"
    && !(v as any).outOfFleetDate;
}

export async function availabilityBoard(startDate: string, endDate: string, type?: string | null): Promise<AvailabilityBoard> {
  const [freeVehicles, allVehicles, kmSetting] = await Promise.all([
    storage.getAvailableVehiclesInRange(startDate, endDate),
    storage.getAllVehicles(),
    storage.getAppSettingByKey(KM_ALLOWANCE_KEY),
  ]);
  const wantType = type ? vehicleTypeKey(type) : null;
  const ofType = (v: Vehicle) => !wantType || vehicleTypeKey(v.vehicleType) === wantType;
  const freeIds = new Set(freeVehicles.map((v) => v.id));
  const free = freeVehicles.filter((v) => rentable(v) && ofType(v));
  const busy = allVehicles.filter((v) => !freeIds.has(v.id) && rentable(v) && ofType(v));

  const ids = [...free, ...busy].map((v) => v.id);
  const rows = ids.length === 0 ? [] : await db
    .select({ vehicleId: reservations.vehicleId, type: reservations.type, startDate: reservations.startDate, endDate: reservations.endDate })
    .from(reservations)
    .where(and(
      inArray(reservations.vehicleId, ids),
      isNull(reservations.deletedAt),
      notInArray(reservations.status, CLOSED),
      or(isNull(reservations.endDate), eq(reservations.endDate, ""), gte(reservations.endDate, startDate)),
    ));

  const rentalsBy = new Map<number, BusyPeriod[]>();
  const blocksBy = new Map<number, BusyPeriod[]>();
  for (const r of rows) {
    const target = r.type === "maintenance_block" ? blocksBy : rentalsBy;
    const list = target.get(r.vehicleId!) ?? [];
    list.push({ startDate: r.startDate, endDate: r.endDate ?? null });
    target.set(r.vehicleId!, list);
  }

  const km = kmAllowanceFromSetting(kmSetting?.value);
  const toRow = (v: Vehicle): AvailabilityRow => ({
    id: v.id,
    licensePlate: v.licensePlate,
    brand: v.brand,
    model: v.model,
    vehicleType: v.vehicleType ?? null,
    currentMileage: v.currentMileage ?? null,
    currentFuelLevel: v.currentFuelLevel ?? null,
    apkDate: v.apkDate ?? null,
    apkExpiresInPeriod: apkExpiresBy(v.apkDate, endDate),
    freeKmPerDay: kmRateForVehicle(v, km).freeKmPerDay,
    maintenancePlanned: (blocksBy.get(v.id) ?? []).some((b) => overlapsPeriod(b, startDate, endDate)),
  });
  const byPlate = (a: AvailabilityRow, b: AvailabilityRow) => a.licensePlate.localeCompare(b.licensePlate);

  return {
    startDate,
    endDate,
    free: free.map(toRow).sort(byPlate),
    // Free at the start (until a later rental) first, then by the day they come free.
    busy: busy
      .map((v): AvailabilityRow => ({ ...toRow(v), ...busyHint(rentalsBy.get(v.id) ?? [], startDate, endDate) }))
      .sort((a, b) => {
        const key = (r: AvailabilityRow) => r.freeUntil ? `0${r.freeUntil}` : `1${r.freeFrom ?? "9999"}`;
        return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : byPlate(a, b);
      }),
  };
}
