import type { Expense, Reservation, Vehicle, InteractiveDamageCheck } from "../../shared/schema";

// Pure aggregation helpers behind /api/reports/vehicle-financials. Kept free of storage access so they can be
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
  /** Punt 1: the part of revenue that is extra costs settled at return (fuel, extra km). */
  extraCosts: number;
  expenses: number;
  expensesByCategory: Record<string, number>;
  margin: number;
}

export interface VehicleFinancialsReport {
  range: DateRangeYmd;
  rows: VehicleFinancialRow[];
  totals: { rentals: number; rentalDays: number; revenue: number; extraCosts: number; expenses: number; margin: number };
}

/**
 * Revenue = totalPrice of standard, non-cancelled reservations whose start
 * date falls in the range, plus the extra costs settled at their return
 * (fuelCost, extraKmCost; punt 1, also reported apart as extraCosts).
 * Expenses = expense rows dated in the range.
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
      extraCosts: 0,
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
    const extra = money((r as any).fuelCost) + money((r as any).extraKmCost);
    row.revenue += money(r.totalPrice) + extra;
    row.extraCosts += extra;
    const end = ymd(r.actualReturnDate) || ymd(r.endDate) || (today > start! ? today : start!);
    row.rentalDays += Math.max(1, daysBetweenYmd(start!, end) + 1);
  }

  for (const e of expenses) {
    if (!inRange(ymd(e.date), range)) continue;
    const row = rowsById.get(e.vehicleId);
    if (!row) continue;
    const amount = money(e.amount);
    row.expenses += amount;
    // lower(btrim(category)): a dump restored before the startup migration must not split one category in two (A-14-2).
    const category = (e.category ?? "").trim().toLowerCase() || "other";
    row.expensesByCategory[category] = (row.expensesByCategory[category] || 0) + amount;
  }

  const rows = [...rowsById.values()].map((row) => ({
    ...row,
    revenue: Math.round(row.revenue * 100) / 100,
    extraCosts: Math.round(row.extraCosts * 100) / 100,
    expenses: Math.round(row.expenses * 100) / 100,
    margin: Math.round((row.revenue - row.expenses) * 100) / 100,
  }));
  rows.sort((a, b) => b.revenue - a.revenue || b.margin - a.margin);

  const totals = rows.reduce(
    (acc, r) => ({
      rentals: acc.rentals + r.rentals,
      rentalDays: acc.rentalDays + r.rentalDays,
      revenue: acc.revenue + r.revenue,
      extraCosts: acc.extraCosts + r.extraCosts,
      expenses: acc.expenses + r.expenses,
      margin: acc.margin + r.margin,
    }),
    { rentals: 0, rentalDays: 0, revenue: 0, extraCosts: 0, expenses: 0, margin: 0 },
  );
  totals.revenue = Math.round(totals.revenue * 100) / 100;
  totals.extraCosts = Math.round(totals.extraCosts * 100) / 100;
  totals.expenses = Math.round(totals.expenses * 100) / 100;
  totals.margin = Math.round(totals.margin * 100) / 100;

  return { range, rows, totals };
}

// ---------------------------------------------------------------------------
// Odometer readings (the pure collection step; the km report itself is fleet-mileage)
// ---------------------------------------------------------------------------

export interface OdometerReading {
  date: string; // yyyy-MM-dd
  mileage: number;
  source: "pickup" | "return" | "damage_check" | "service" | "current";
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
