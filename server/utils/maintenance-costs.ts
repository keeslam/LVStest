import { format } from "date-fns";
import { isMaintenanceExpenseCategory, MAINTENANCE_EXPENSE_CATEGORIES } from "../../shared/expense-categories";

/**
 * BUG-089: every crash-prone spot in the aggregation rests on two
 * assumptions: that `expenses.amount` is never null (`null.toString()` is a
 * TypeError) and that `expenses.date` always parses (date-fns `format` throws
 * `RangeError: Invalid time value` on an invalid Date). Both are nullable /
 * free text in the schema, so the report tolerates them instead of dying on them.
 */
export function toAmount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

/** A parsed date, or null when the stored text is not one. */
export function toDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface ExpenseLike { vehicleId: number; category: string | null; amount: unknown; date: unknown }
interface VehicleLike {
  id: number; licensePlate: string; brand: string | null; model: string | null;
  currentMileage?: number | null; departureMileage?: number | null;
}

export interface MaintenanceCostOptions {
  timeRange?: string;
  brand?: string;
  now?: Date;
}

const odometer = (v: VehicleLike): number => v.currentMileage || v.departureMileage || 0;

/** Lower-cased and trimmed, the same key `lower(btrim(category))` gives in SQL (A-14-2). */
const categoryKey = (raw: string | null | undefined): string => (raw ?? "").trim().toLowerCase() || "unknown";

/**
 * A-14-2: the maintenance cost analysis.
 *
 * - only maintenance categories count (MAINTENANCE_EXPENSE_CATEGORIES);
 * - categories are grouped on the lower-cased, trimmed key, so a dump restored
 *   before the startup migration cannot split "Maintenance" and "maintenance";
 * - cost per km divides by the odometers of the vehicles that carry the costs
 *   (numerator and denominator share one base), not by the whole fleet; with no
 *   kilometres at all it is null, never 0. The odometer is a lifetime total, so
 *   the figure only means something when the costs are lifetime too: in a period
 *   view (month, 3 months, ...) it is null as well (`costPerKmAvailable` false);
 * - the monthly trend is keyed `yyyy-MM`; the client writes the month in Dutch.
 */
export function buildMaintenanceCostReport(expenses: ExpenseLike[], vehicles: VehicleLike[], options: MaintenanceCostOptions = {}) {
  const { timeRange, brand } = options;
  const now = options.now ?? new Date();
  const costPerKmAvailable = !timeRange || timeRange === "all";

  let filteredExpenses = expenses.filter((e) => isMaintenanceExpenseCategory(e.category));

  if (timeRange && timeRange !== "all") {
    const cutoffDate = new Date(now);
    switch (timeRange) {
      case "month": cutoffDate.setMonth(now.getMonth() - 1); break;
      case "3months": cutoffDate.setMonth(now.getMonth() - 3); break;
      case "6months": cutoffDate.setMonth(now.getMonth() - 6); break;
      case "year": cutoffDate.setFullYear(now.getFullYear() - 1); break;
    }
    filteredExpenses = filteredExpenses.filter((e) => {
      const d = toDate(e.date);
      return d !== null && d >= cutoffDate;
    });
  }

  if (brand && brand !== "all") {
    const vehicleIds = new Set(vehicles.filter((v) => v.brand === brand).map((v) => v.id));
    filteredExpenses = filteredExpenses.filter((e) => vehicleIds.has(e.vehicleId));
  }

  const vehicleById = new Map(vehicles.map((v) => [v.id, v] as const));
  const totalCosts = filteredExpenses.reduce((sum, e) => sum + toAmount(e.amount), 0);

  const vehiclesWithExpenses = new Set(filteredExpenses.map((e) => e.vehicleId));
  const averageCostPerVehicle = vehiclesWithExpenses.size > 0 ? totalCosts / vehiclesWithExpenses.size : 0;

  // Same base top and bottom: the kilometres of the vehicles that carry the costs.
  let totalMileage = 0;
  vehiclesWithExpenses.forEach((id) => {
    const v = vehicleById.get(id);
    if (v) totalMileage += odometer(v);
  });
  const averageCostPerKm = costPerKmAvailable && totalMileage > 0 ? totalCosts / totalMileage : null;

  const categoryMap = new Map<string, number>();
  filteredExpenses.forEach((e) => {
    const key = categoryKey(e.category);
    categoryMap.set(key, (categoryMap.get(key) || 0) + toAmount(e.amount));
  });
  const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, amount]) => ({
    category,
    amount,
    percentage: totalCosts > 0 ? (amount / totalCosts) * 100 : 0,
  }));

  const brandMap = new Map<string, { totalCost: number; vehicles: Set<number>; expenseCount: number }>();
  filteredExpenses.forEach((e) => {
    const vehicle = vehicleById.get(e.vehicleId);
    if (!vehicle) return;
    const key = vehicle.brand ?? "unknown";
    const data = brandMap.get(key) || { totalCost: 0, vehicles: new Set<number>(), expenseCount: 0 };
    data.totalCost += toAmount(e.amount);
    data.vehicles.add(vehicle.id);
    data.expenseCount += 1;
    brandMap.set(key, data);
  });
  const brandComparison = Array.from(brandMap.entries()).map(([brandName, data]) => ({
    brand: brandName,
    totalCost: data.totalCost,
    avgCost: data.vehicles.size > 0 ? data.totalCost / data.vehicles.size : 0,
    vehicleCount: data.vehicles.size,
    expenseCount: data.expenseCount,
  }));

  const vehicleExpenseMap = new Map<number, { count: number; totalCost: number }>();
  filteredExpenses.forEach((e) => {
    const data = vehicleExpenseMap.get(e.vehicleId) || { count: 0, totalCost: 0 };
    data.count += 1;
    data.totalCost += toAmount(e.amount);
    vehicleExpenseMap.set(e.vehicleId, data);
  });
  const vehicleDetails = Array.from(vehicleExpenseMap.entries()).map(([vehicleId, data]) => {
    const vehicle = vehicleById.get(vehicleId);
    if (!vehicle) return null;
    const mileage = odometer(vehicle);
    return {
      vehicleId: vehicle.id,
      licensePlate: vehicle.licensePlate,
      brand: vehicle.brand,
      model: vehicle.model,
      totalCost: data.totalCost,
      costPerKm: costPerKmAvailable && mileage > 0 ? data.totalCost / mileage : null,
      currentMileage: mileage,
      expenseCount: data.count,
    };
  }).filter(Boolean);

  // Last 12 months, oldest first. `yyyy-MM` so the client can label it in Dutch.
  const monthlyMap = new Map<string, number>();
  const last12Months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = format(date, "yyyy-MM");
    last12Months.push(monthKey);
    monthlyMap.set(monthKey, 0);
  }
  filteredExpenses.forEach((e) => {
    const parsed = toDate(e.date);
    if (!parsed) return;
    const monthKey = format(parsed, "yyyy-MM");
    if (monthlyMap.has(monthKey)) monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + toAmount(e.amount));
  });
  const monthlyTrend = last12Months.map((month) => ({ month, amount: monthlyMap.get(month) || 0 }));

  return {
    totalCosts,
    averageCostPerVehicle,
    averageCostPerKm,
    costPerKmAvailable,
    totalVehicles: vehiclesWithExpenses.size,
    categories: [...MAINTENANCE_EXPENSE_CATEGORIES],
    categoryBreakdown,
    brandComparison,
    vehicleDetails,
    monthlyTrend,
  };
}
