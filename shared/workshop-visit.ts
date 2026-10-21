/**
 * Round 2 punt 11 (Kees, 2026-10-21) — a workshop visit (a `maintenance_block`
 * reservation): its costs and its downtime.
 *
 * The garage's invoice usually arrives after the car is back, so an expense of the
 * same vehicle dated from the visit's start up to 60 days after its end is offered
 * as "Nieuwe factuur gevonden". Linking always takes a confirmation, because another
 * invoice may come in between.
 */
import { maintenanceTypeOf } from "./maintenance-type";

export const INVOICE_WINDOW_DAYS_AFTER_VISIT = 60;

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function ymd(value: string | null | undefined): string | null {
  const day = (value ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** The dates (inclusive) an unlinked expense of the vehicle counts as a candidate invoice. */
export function invoiceCandidateWindow(
  visit: { startDate: string; endDate?: string | null },
  today: string,
): { from: string; to: string } | null {
  const from = ymd(visit.startDate);
  if (!from) return null;
  const end = ymd(visit.endDate) ?? today;
  return { from, to: addDays(end < from ? from : end, INVOICE_WINDOW_DAYS_AFTER_VISIT) };
}

export interface DowntimeVisit {
  vehicleId: number;
  startDate: string;
  endDate?: string | null;
  maintenanceType?: string | null;
  notes?: string | null;
}

export interface DowntimeVehicle {
  id: number;
  licensePlate: string;
  brand?: string | null;
  model?: string | null;
}

export interface DowntimeRow {
  vehicleId: number;
  licensePlate: string;
  brand: string;
  model: string;
  visits: number;
  days: number;
  breakdowns: number;
  costs: number;
}

/** Days of the visit inside the period (both ends counted); an open visit runs to `today`. */
export function visitDaysInPeriod(visit: { startDate: string; endDate?: string | null }, from: string, to: string, today: string): number {
  const start = ymd(visit.startDate);
  if (!start) return 0;
  const end = ymd(visit.endDate) ?? today;
  const a = start > from ? start : from;
  const b = end < to ? end : to;
  if (b < a) return 0;
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) + 1;
}

/**
 * Per vehicle: visits overlapping the period, workshop days inside it, how many
 * were breakdowns, and the costs linked to those visits. Vehicles without a visit
 * in the period are left out. Most days first.
 */
export function downtimeRows(
  vehicles: DowntimeVehicle[],
  visits: Array<DowntimeVisit & { id: number }>,
  linkedCosts: Array<{ maintenanceBlockId: number | null; amount: string | number }>,
  from: string,
  to: string,
  today: string,
): DowntimeRow[] {
  const costByVisit = new Map<number, number>();
  for (const c of linkedCosts) {
    if (c.maintenanceBlockId == null) continue;
    const amount = Number(c.amount);
    if (!Number.isFinite(amount)) continue;
    costByVisit.set(c.maintenanceBlockId, (costByVisit.get(c.maintenanceBlockId) ?? 0) + amount);
  }
  const byVehicle = new Map<number, DowntimeRow>();
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  for (const visit of visits) {
    const days = visitDaysInPeriod(visit, from, to, today);
    if (days === 0) continue;
    const vehicle = vehicleById.get(visit.vehicleId);
    if (!vehicle) continue;
    const row = byVehicle.get(vehicle.id) ?? {
      vehicleId: vehicle.id,
      licensePlate: vehicle.licensePlate,
      brand: vehicle.brand ?? "",
      model: vehicle.model ?? "",
      visits: 0,
      days: 0,
      breakdowns: 0,
      costs: 0,
    };
    row.visits += 1;
    row.days += days;
    if (maintenanceTypeOf(visit) === "breakdown") row.breakdowns += 1;
    row.costs += costByVisit.get(visit.id) ?? 0;
    byVehicle.set(vehicle.id, row);
  }
  return Array.from(byVehicle.values()).sort((a, b) => b.days - a.days || a.licensePlate.localeCompare(b.licensePlate));
}

export interface DowntimeModelRow {
  brand: string;
  model: string;
  vehicles: number;
  visits: number;
  days: number;
  breakdowns: number;
  costs: number;
}

/** The same numbers summed per brand and model, most breakdowns first. */
export function downtimeByModel(rows: DowntimeRow[]): DowntimeModelRow[] {
  const map = new Map<string, DowntimeModelRow>();
  for (const r of rows) {
    const key = `${r.brand}\u0000${r.model}`;
    const m = map.get(key) ?? { brand: r.brand, model: r.model, vehicles: 0, visits: 0, days: 0, breakdowns: 0, costs: 0 };
    m.vehicles += 1;
    m.visits += r.visits;
    m.days += r.days;
    m.breakdowns += r.breakdowns;
    m.costs += r.costs;
    map.set(key, m);
  }
  return Array.from(map.values()).sort((a, b) => b.breakdowns - a.breakdowns || b.days - a.days || a.brand.localeCompare(b.brand));
}
