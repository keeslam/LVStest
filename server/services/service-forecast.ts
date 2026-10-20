/**
 * Punt 6 (Kees, 2026-10-20) — the expected date of the next service, per
 * vehicle. The dated odometer readings are gathered in one SQL query (the
 * reservation list is far too big to load for this, BUG-205):
 *  - pickup and return readings of reservations that are not deleted,
 *  - interactive damage checks,
 *  - the last service,
 *  - the current reading, on the day the vehicle row was last changed.
 * The rule itself lives in shared/service-forecast.ts.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import type { Vehicle } from "../../shared/schema";
import { computeServiceDue, serviceDueDefaultsFromSettings, type ServiceDueInfo } from "../../shared/service-due";
import { forecastService, kmPerDayFromReadings, type DatedReading, type ServiceForecast } from "../../shared/service-forecast";
import { isoToday } from "./lifecycle";
import { officeTimeZone } from "./office-time";

export interface VehicleServiceForecast extends Vehicle {
  serviceDue: ServiceDueInfo;
  forecast: ServiceForecast;
}

/** Every dated reading per vehicle; `vehicleId` narrows it to one. */
export async function odometerReadingsByVehicle(vehicleId?: number): Promise<Map<number, DatedReading[]>> {
  const zone = officeTimeZone();
  const only = vehicleId != null ? sql`AND vehicle_id = ${vehicleId}` : sql``;
  const result = await db.execute(sql`
    SELECT vehicle_id, day, mileage FROM (
      SELECT vehicle_id, COALESCE(NULLIF(actual_pickup_date, ''), start_date) AS day, pickup_mileage AS mileage
        FROM reservations WHERE deleted_at IS NULL AND pickup_mileage > 0
      UNION ALL
      SELECT vehicle_id, COALESCE(NULLIF(actual_return_date, ''), NULLIF(end_date, '')) AS day, return_mileage AS mileage
        FROM reservations WHERE deleted_at IS NULL AND return_mileage > 0
      UNION ALL
      SELECT vehicle_id, to_char(check_date AT TIME ZONE ${zone}, 'YYYY-MM-DD') AS day, mileage
        FROM interactive_damage_checks WHERE mileage > 0
      UNION ALL
      SELECT id AS vehicle_id, last_service_date AS day, last_service_mileage AS mileage
        FROM vehicles WHERE last_service_mileage > 0
      UNION ALL
      SELECT id AS vehicle_id, to_char(updated_at AT TIME ZONE ${zone}, 'YYYY-MM-DD') AS day, current_mileage AS mileage
        FROM vehicles WHERE current_mileage > 0
    ) readings
    WHERE vehicle_id IS NOT NULL AND day ~ '^\\d{4}-\\d{2}-\\d{2}' ${only}
  `);
  const byVehicle = new Map<number, DatedReading[]>();
  for (const row of result.rows as Array<{ vehicle_id: number; day: string; mileage: number }>) {
    const list = byVehicle.get(Number(row.vehicle_id)) ?? [];
    list.push({ date: String(row.day).slice(0, 10), mileage: Number(row.mileage) });
    byVehicle.set(Number(row.vehicle_id), list);
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
    odometerReadingsByVehicle(),
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
    odometerReadingsByVehicle(vehicleId),
  ]);
  if (!vehicle) return null;
  const serviceDue = computeServiceDue(vehicle, serviceDueDefaultsFromSettings(settings));
  return { serviceDue, forecast: forecastService(serviceDue, kmPerDayFromReadings(readings.get(vehicleId) ?? []), isoToday()) };
}
