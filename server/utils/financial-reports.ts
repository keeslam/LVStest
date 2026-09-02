import type { Expense, Reservation, Vehicle, InteractiveDamageCheck } from "../../shared/schema";

// Pure aggregation helpers behind /api/reports/vehicle-financials and
// /api/reports/mileage-per-month. Kept free of storage access so they can be
// unit-tested and reused by the report builder later.

export interface DateRangeYmd {
  from: string; // yyyy-MM-dd inclusive
  to: string;   // yyyy-MM-dd inclusive
}

function ymd(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : null;
}

function inRange(date: string | null, range: DateRangeYmd): boolean {
  return !!date && date >= range.from && date <= range.to;
}

function daysBetweenYmd(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

const money = (value: unknown): number => {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------------------
// Revenue vs. expenses per vehicle
// ---------------------------------------------------------------------------

export interface VehicleFinancialRow {
  vehicleId: number;
  licensePlate: string;
  brand: string;
  model: string;
  dailyPrice: number | null;
  rentals: number;
  rentalDays: number;
  revenue: number;
  expenses: number;
  expensesByCategory: Record<string, number>;
  margin: number;
}

export interface VehicleFinancialsReport {
  range: DateRangeYmd;
  rows: VehicleFinancialRow[];
  totals: { rentals: number; rentalDays: number; revenue: number; expenses: number; margin: number };
}

/**
 * Revenue = totalPrice of standard, non-cancelled reservations whose start
 * date falls in the range. Expenses = expense rows dated in the range.
 */
export function buildVehicleFinancials(
  vehicles: Vehicle[],
  reservations: Reservation[],
  expenses: Expense[],
  range: DateRangeYmd,
  today: string = new Date().toISOString().slice(0, 10),
): VehicleFinancialsReport {
  const rowsById = new Map<number, VehicleFinancialRow>();
  for (const v of vehicles) {
    rowsById.set(v.id, {
      vehicleId: v.id,
      licensePlate: v.licensePlate,
      brand: v.brand,
      model: v.model,
      dailyPrice: v.dailyPrice != null ? money(v.dailyPrice) : null,
      rentals: 0,
      rentalDays: 0,
      revenue: 0,
      expenses: 0,
      expensesByCategory: {},
      margin: 0,
    });
  }

  for (const r of reservations) {
    if (r.type !== "standard" || r.status === "cancelled" || r.vehicleId == null) continue;
    if ((r as any).deletedAt) continue;
    const start = ymd(r.startDate);
    if (!inRange(start, range)) continue;
    const row = rowsById.get(r.vehicleId);
    if (!row) continue;
    row.rentals++;
    row.revenue += money(r.totalPrice);
    const end = ymd(r.actualReturnDate) || ymd(r.endDate) || (today > start! ? today : start!);
    row.rentalDays += Math.max(1, daysBetweenYmd(start!, end) + 1);
  }

  for (const e of expenses) {
    if (!inRange(ymd(e.date), range)) continue;
    const row = rowsById.get(e.vehicleId);
    if (!row) continue;
    const amount = money(e.amount);
    row.expenses += amount;
    row.expensesByCategory[e.category] = (row.expensesByCategory[e.category] || 0) + amount;
  }

  const rows = [...rowsById.values()].map((row) => ({
    ...row,
    revenue: Math.round(row.revenue * 100) / 100,
    expenses: Math.round(row.expenses * 100) / 100,
    margin: Math.round((row.revenue - row.expenses) * 100) / 100,
  }));
  rows.sort((a, b) => b.revenue - a.revenue || b.margin - a.margin);

  const totals = rows.reduce(
    (acc, r) => ({
      rentals: acc.rentals + r.rentals,
      rentalDays: acc.rentalDays + r.rentalDays,
      revenue: acc.revenue + r.revenue,
      expenses: acc.expenses + r.expenses,
      margin: acc.margin + r.margin,
    }),
    { rentals: 0, rentalDays: 0, revenue: 0, expenses: 0, margin: 0 },
  );
  totals.revenue = Math.round(totals.revenue * 100) / 100;
  totals.expenses = Math.round(totals.expenses * 100) / 100;
  totals.margin = Math.round(totals.margin * 100) / 100;

  return { range, rows, totals };
}

// ---------------------------------------------------------------------------
// Kilometres per month from odometer readings
// ---------------------------------------------------------------------------

export interface OdometerReading {
  date: string; // yyyy-MM-dd
  mileage: number;
  source: "pickup" | "return" | "damage_check" | "service" | "current";
}

export interface MileageMonth {
  month: string; // yyyy-MM
  km: number;
  vehicles: number; // vehicles contributing km in this month
}

export interface VehicleMileageRow {
  vehicleId: number;
  licensePlate: string;
  brand: string;
  model: string;
  km: number;
  readings: number;      // readings used (monotonic) inside/around the range
  firstReading: string | null;
  lastReading: string | null;
  sparse: boolean;       // fewer than 2 usable readings -> nothing to derive
}

export interface MileagePerMonthReport {
  range: DateRangeYmd;
  months: MileageMonth[];
  rows: VehicleMileageRow[];
  totalKm: number;
}

/** Collect every dated odometer reading we know of, per vehicle */
export function collectOdometerReadings(
  vehicles: Vehicle[],
  reservations: Reservation[],
  damageChecks: InteractiveDamageCheck[],
): Map<number, OdometerReading[]> {
  const byVehicle = new Map<number, OdometerReading[]>();
  const push = (vehicleId: number | null | undefined, date: string | null, mileage: number | null | undefined, source: OdometerReading["source"]) => {
    if (vehicleId == null || !date || mileage == null || !Number.isFinite(mileage) || mileage <= 0) return;
    if (!byVehicle.has(vehicleId)) byVehicle.set(vehicleId, []);
    byVehicle.get(vehicleId)!.push({ date, mileage, source });
  };

  for (const r of reservations) {
    if ((r as any).deletedAt) continue;
    push(r.vehicleId, ymd(r.actualPickupDate) || ymd(r.startDate), r.pickupMileage, "pickup");
    push(r.vehicleId, ymd(r.actualReturnDate) || ymd(r.endDate), r.returnMileage, "return");
  }
  for (const c of damageChecks) {
    push(c.vehicleId, ymd(c.checkDate as any), c.mileage, "damage_check");
  }
  for (const v of vehicles) {
    push(v.id, ymd(v.lastServiceDate), v.lastServiceMileage, "service");
    // The live odometer counts as a reading on the day the vehicle row was last touched
    push(v.id, ymd(v.updatedAt as any), v.currentMileage, "current");
  }

  for (const [id, list] of byVehicle) {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.mileage - b.mileage);
    // Keep a monotonically non-decreasing series: a lower reading after a higher
    // one is a typo or a swapped odometer, not negative distance.
    const clean: OdometerReading[] = [];
    for (const reading of list) {
      const prev = clean[clean.length - 1];
      if (prev && reading.mileage < prev.mileage) continue;
      if (prev && prev.date === reading.date) { clean[clean.length - 1] = reading; continue; }
      clean.push(reading);
    }
    byVehicle.set(id, clean);
  }
  return byVehicle;
}

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function daysInMonthOf(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** Distribute the km driven between two readings over the calendar months they span */
function allocateKm(from: OdometerReading, to: OdometerReading, add: (month: string, km: number) => void): void {
  const km = to.mileage - from.mileage;
  const totalDays = daysBetweenYmd(from.date, to.date);
  if (km <= 0) return;
  if (totalDays <= 0) { add(monthOf(to.date), km); return; }
  let cursor = from.date;
  while (cursor < to.date) {
    const month = monthOf(cursor);
    const monthEnd = `${month}-${String(daysInMonthOf(month)).padStart(2, "0")}`;
    const segmentEnd = monthEnd < to.date ? monthEnd : to.date;
    // days from cursor (exclusive) to segmentEnd (inclusive), plus one day when we roll into the next month
    let days = daysBetweenYmd(cursor, segmentEnd);
    if (segmentEnd === monthEnd && monthEnd < to.date) days += 1;
    add(month, (km * days) / totalDays);
    cursor = segmentEnd === monthEnd && monthEnd < to.date
      ? nextDay(monthEnd)
      : segmentEnd;
    if (cursor === segmentEnd && segmentEnd === to.date) break;
  }
}

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export function buildMileagePerMonth(
  vehicles: Vehicle[],
  reservations: Reservation[],
  damageChecks: InteractiveDamageCheck[],
  range: DateRangeYmd,
): MileagePerMonthReport {
  const readingsByVehicle = collectOdometerReadings(vehicles, reservations, damageChecks);
  const monthTotals = new Map<string, { km: number; vehicles: Set<number> }>();
  const rows: VehicleMileageRow[] = [];

  for (const v of vehicles) {
    const readings = readingsByVehicle.get(v.id) || [];
    const perMonth = new Map<string, number>();
    for (let i = 1; i < readings.length; i++) {
      allocateKm(readings[i - 1], readings[i], (month, km) => {
        perMonth.set(month, (perMonth.get(month) || 0) + km);
      });
    }
    let km = 0;
    for (const [month, monthKm] of perMonth) {
      if (month < range.from.slice(0, 7) || month > range.to.slice(0, 7)) continue;
      km += monthKm;
      if (!monthTotals.has(month)) monthTotals.set(month, { km: 0, vehicles: new Set() });
      const bucket = monthTotals.get(month)!;
      bucket.km += monthKm;
      if (monthKm > 0) bucket.vehicles.add(v.id);
    }
    rows.push({
      vehicleId: v.id,
      licensePlate: v.licensePlate,
      brand: v.brand,
      model: v.model,
      km: Math.round(km),
      readings: readings.length,
      firstReading: readings[0]?.date ?? null,
      lastReading: readings[readings.length - 1]?.date ?? null,
      sparse: readings.length < 2,
    });
  }
  rows.sort((a, b) => b.km - a.km);

  // Every month in the range, even when nothing was driven
  const months: MileageMonth[] = [];
  let cursor = range.from.slice(0, 7);
  const last = range.to.slice(0, 7);
  while (cursor <= last && months.length < 240) {
    const bucket = monthTotals.get(cursor);
    months.push({ month: cursor, km: Math.round(bucket?.km || 0), vehicles: bucket?.vehicles.size || 0 });
    const [y, m] = cursor.split("-").map(Number);
    cursor = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  }

  return { range, months, rows, totalKm: rows.reduce((s, r) => s + r.km, 0) };
}
