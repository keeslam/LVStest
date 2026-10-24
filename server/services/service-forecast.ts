/**
 * Punt 6 (Kees, 2026-10-20) — the expected date of the next service, per
 * vehicle. Rapporten fase 3 (2026-10-25): the km per day comes from the km
 * history (`vehicle_mileage_readings`, every reading that is not voided), the
 * same source as the maintenance outlook report, so the maintenance calendar,
 * the vehicle card and the report never disagree. The history already holds
 * pickup and return readings, damage checks, services and manual readings, and
 * a reading someone voided (a typo) no longer counts.
 * The rule itself lives in shared/service-forecast.ts.
 */
import { and, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { vehicleMileageReadings, type Vehicle } from "../../shared/schema";
import { computeServiceDue, serviceDueDefaultsFromSettings, type ServiceDueInfo } from "../../shared/service-due";
import { forecastService, kmPerDayFromReadings, type DatedReading, type ServiceForecast } from "../../shared/service-forecast";
import { isoToday } from "./lifecycle";
import { officeTimeZone } from "./office-time";

export interface VehicleServiceForecast extends Vehicle {
  serviceDue: ServiceDueInfo;
  forecast: ServiceForecast;
}

/**
 * Every km reading from the km history that is not voided, per vehicle, dated as
 * the office day it was recorded. One query; `vehicleIds` narrows it (empty = none).
 */
export async function mileageHistoryReadingsByVehicle(vehicleIds?: number[]): Promise<Map<number, DatedReading[]>> {
  const byVehicle = new Map<number, DatedReading[]>();
  if (vehicleIds && vehicleIds.length === 0) return byVehicle;
  const rows = await db
    .select({
      vehicleId: vehicleMileageReadings.vehicleId,
      date: sql<string>`to_char(${vehicleMileageReadings.recordedAt} AT TIME ZONE ${officeTimeZone()}, 'YYYY-MM-DD')`,
      mileage: vehicleMileageReadings.mileage,
    })
    .from(vehicleMileageReadings)
    .where(and(
      isNull(vehicleMileageReadings.voidedAt),
      vehicleIds ? inArray(vehicleMileageReadings.vehicleId, vehicleIds) : undefined,
    ));
  for (const row of rows) {
    const list = byVehicle.get(row.vehicleId) ?? [];
    list.push({ date: String(row.date), mileage: Number(row.mileage) });
    byVehicle.set(row.vehicleId, list);
  }
  return byVehicle;
}

/**
 * The forecast for every vehicle the maintenance calendar plans for: the same
 * vehicles the service-due list uses (not "not for rental" and the like, not
 * already in the workshop), whether the service is near or months away.
 */
export async function serviceForecasts(): Promise<VehicleServiceForecast[]> {
  const [settings, vehicles, readings] = await Promise.all([
    storage.getSettings(),
    storage.getAllVehicles(),
    mileageHistoryReadingsByVehicle(),
  ]);
  const defaults = serviceDueDefaultsFromSettings(settings);
  const excluded = settings?.maintenanceExcludedStatuses || ["not_for_rental"];
  const today = isoToday();
  const result: VehicleServiceForecast[] = [];
  for (const vehicle of vehicles) {
    if (excluded.includes(vehicle.availabilityStatus || "available")) continue;
    if (vehicle.maintenanceStatus === "in_service") continue;
    const serviceDue = computeServiceDue(vehicle, defaults);
    if (!serviceDue.hasData) continue;
    const forecast = forecastService(serviceDue, kmPerDayFromReadings(readings.get(vehicle.id) ?? []), today);
    result.push({ ...vehicle, serviceDue, forecast });
  }
  return result;
}

/** The forecast of one vehicle, for its own card (no exclusions there). */
export async function serviceForecastFor(vehicleId: number): Promise<{ serviceDue: ServiceDueInfo; forecast: ServiceForecast } | null> {
  const [settings, vehicle, readings] = await Promise.all([
    storage.getSettings(),
    storage.getVehicle(vehicleId),
    mileageHistoryReadingsByVehicle([vehicleId]),
  ]);
  if (!vehicle) return null;
  const serviceDue = computeServiceDue(vehicle, serviceDueDefaultsFromSettings(settings));
  return { serviceDue, forecast: forecastService(serviceDue, kmPerDayFromReadings(readings.get(vehicleId) ?? []), isoToday()) };
}
