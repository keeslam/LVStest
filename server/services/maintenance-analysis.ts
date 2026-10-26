/**
 * Onderhoudsanalyse (Kees, 2026-10-26) — the server half of the maintenance analysis window:
 * GET /api/reports/maintenance-analysis/{overview,brands,vehicles,suppliers,trends,signals,rows}.
 *
 * The fleet is small (around a hundred vehicles), so every part loads the maintenance costs
 * (categories of MAINTENANCE_EXPENSE_CATEGORIES), the vehicles and, for admins, the km history
 * once and works in memory. All parts share one filter (parseMaintenanceQuery) and one rule set:
 *
 * - per vehicle per month = amount ÷ months owned inside the period (owned from dateIn, else the
 *   creation day, or the first cost if that is earlier; until outOfFleetDate or today);
 * - a cost's km is the last valid reading on or before its day (km history, voided readings left
 *   out, a decrease or a jump skipped like kmPerDayFromReadings); its band is kmBandOf(km);
 * - km driven in a band = the distance between consecutive valid readings, the part inside the
 *   period (pro rata by day), split at the band boundaries; cost per km = cost in band ÷ km in band
 *   (null when there are no km);
 * - comparisons (group averages for signals and the forecast) use the vehicles of the same brand
 *   and model under the same filters, but never narrowed to one vehicle, supplier or km band;
 * - km fields only for admins; a km-band filter or drill from anyone else is a 403.
 */
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { deletedRecords, expenses, reservations, vehicles, type Vehicle } from "../../shared/schema";
import { MAINTENANCE_EXPENSE_CATEGORIES, type ExpenseCategory } from "../../shared/expense-categories";
import { formatLicensePlate } from "../../shared/license-plate";
import { kmPerDayFromReadings, type DatedReading } from "../../shared/service-forecast";
import { MILEAGE_JUMP_KM_PER_DAY } from "../../shared/mileage-history";
import { downtimeRows } from "../../shared/workshop-visit";
import { dateInZone } from "../../shared/office-timezone";
import { REPORT_DRILL_NULL_KEY } from "../../shared/report-kit";
import {
  KM_BANDS, KM_BAND_KEYS, kmBandOf, modelWithoutBrand, supplierKey, modelGroupKey,
  UNKNOWN_SUPPLIER_LABEL, MAINTENANCE_CATEGORY_LABELS, MIN_EXPENSES_FOR_RATING, MIN_VEHICLES_FOR_RATING,
  SIGNAL_ABOVE_GROUP_FACTOR, SIGNAL_MIN_COMPARABLES, SIGNAL_RISING_MONTHS, SIGNAL_REPEAT_DAYS,
  FORECAST_DAYS, FORECAST_MONTHS, MAINTENANCE_ANALYSIS_DRILLS,
  type KmBand, type MaintenanceAnalysisDrill, type MaintenanceTiles, type MaintenanceOverview,
  type MaintenanceBrands, type MaintenanceGroupLine, type MaintenanceKmBandLine, type MaintenanceVehicleLine,
  type MaintenanceSuppliers, type MaintenanceTrends, type MaintenanceSignal, type MaintenanceSignals,
  type MaintenanceCostRow, type MaintenanceRows,
} from "../../shared/maintenance-analysis";
import { isRealDate, oneOf, parseReportFilter } from "./reports/report-kit";
import { mileageHistoryReadingsByVehicle } from "./service-forecast";
import { officeTimeZone } from "./office-time";

const DAY_MS = 86_400_000;
const DAYS_PER_MONTH = 365.25 / 12;

const dayOf = (ymd: string): number => Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`) / DAY_MS;
const ymdOf = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const ratio = (top: number, bottom: number, digits: (n: number) => number = round2): number | null =>
  bottom > 0 ? digits(top / bottom) : null;

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export interface MaintenanceQuery {
  from: string;
  to: string;
  compare: { from: string; to: string } | null;
  category: ExpenseCategory | null;
  brand: string | null;
  model: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  kmBand: KmBand | null;
  /** undefined = every supplier, null = "Onbekend", a string = that supplier key. */
  supplier: string | null | undefined;
  vehicleId: number | null;
}

type Refusal = { ok: false; status: number; body: { message: string; code: string } };

const badFilter = (message: string): Refusal => ({ ok: false, status: 400, body: { message, code: "INVALID_FILTER" } });

const given = (value: unknown): value is string => typeof value === "string" && value !== "" && value !== "all";

function yearParam(value: unknown): number | null | "bad" {
  if (!given(value)) return null;
  if (!/^\d{4}$/.test(value)) return "bad";
  return Number(value);
}

/** The shared filter of every part. Km band from a non-admin is a 403 (server-enforced, not only hidden). */
export function parseMaintenanceQuery(query: Record<string, unknown>, today: string, isAdmin: boolean): { ok: true; q: MaintenanceQuery } | Refusal {
  // brand=a&brand=b (an array) or brand[x]=a (an object) is never silently half-read.
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && typeof value !== "string") return badFilter(`Repeated or malformed query value: ${name}`);
  }
  const parsed = parseReportFilter(query, today);
  if (!parsed.ok) {
    return { ok: false, status: 400, body: { message: parsed.code === "INVALID_DATE" ? "Invalid date range" : "Invalid vehicle", code: parsed.code } };
  }
  let compare: MaintenanceQuery["compare"] = null;
  if (given(query.compareFrom) || given(query.compareTo)) {
    const cf = query.compareFrom;
    const ct = query.compareTo;
    if (typeof cf !== "string" || typeof ct !== "string" || !isRealDate(cf) || !isRealDate(ct) || cf > ct) {
      return { ok: false, status: 400, body: { message: "Invalid comparison range", code: "INVALID_DATE" } };
    }
    compare = { from: cf, to: ct };
  }
  let category: ExpenseCategory | null = null;
  if (given(query.category)) {
    category = oneOf(query.category, MAINTENANCE_EXPENSE_CATEGORIES);
    if (!category) return badFilter("Invalid category");
  }
  let kmBand: KmBand | null = null;
  if (given(query.kmBand)) {
    if (!isAdmin) return { ok: false, status: 403, body: { message: "Km data is for admins only", code: "KM_ADMIN_ONLY" } };
    kmBand = oneOf(query.kmBand, KM_BAND_KEYS);
    if (!kmBand) return badFilter("Invalid km band");
  }
  const yearFrom = yearParam(query.yearFrom);
  const yearTo = yearParam(query.yearTo);
  if (yearFrom === "bad" || yearTo === "bad") return badFilter("Invalid year");
  if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) return badFilter("Year from is after year to");
  let supplier: string | null | undefined;
  if (given(query.supplier)) {
    supplier = query.supplier === REPORT_DRILL_NULL_KEY ? null : supplierKey(query.supplier);
  }
  return {
    ok: true,
    q: {
      from: parsed.filter.from,
      to: parsed.filter.to,
      compare,
      category,
      // "__null" (Onbekend) is the vehicle without a brand or model name.
      brand: given(query.brand) ? (query.brand === REPORT_DRILL_NULL_KEY ? "" : query.brand.trim().toUpperCase()) : null,
      model: given(query.model) ? (query.model === REPORT_DRILL_NULL_KEY ? "" : query.model.trim().replace(/\s+/g, " ").toUpperCase()) : null,
      yearFrom,
      yearTo,
      kmBand,
      supplier,
      vehicleId: parsed.filter.vehicleId,
    },
  };
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface Reading { day: number; mileage: number }

interface VehicleCtx {
  id: number;
  plate: string;
  brand: string;
  model: string;
  modelKey: string;
  year: number | null;
  ownedFrom: number;
  ownedTo: number;
  inFleet: boolean;
  readings: Reading[];
  raw: DatedReading[];
}

interface CostCtx {
  id: number;
  vehicleId: number;
  date: string;
  day: number;
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  supplierKey: string | null;
  km: number | null;
  band: KmBand | null;
}

export interface MaintenanceData {
  today: string;
  isAdmin: boolean;
  vehicles: Map<number, VehicleCtx>;
  costs: CostCtx[];
  supplierNames: Map<string, string>;
  /** kmByBandInPeriod per vehicle and period, computed once per request. */
  kmCache: Map<string, Map<KmBand, number>>;
}

/** The vehicle fields the analysis reads: a vehicles row, or the `vehicle` of a recycle-bin snapshot (JSON). */
interface VehicleSnapshot {
  id: number;
  licensePlate?: string | null;
  brand?: string | null;
  model?: string | null;
  productionDate?: string | null;
  dateIn?: string | null;
  outOfFleetDate?: string | null;
  createdAt?: string | Date | null;
}

/** Valid readings in day order: a decrease or a jump is skipped, the same rule as kmPerDayFromReadings. */
export function cleanReadings(readings: DatedReading[]): Reading[] {
  const usable = readings
    .filter((r) => Number.isFinite(r.mileage) && r.mileage > 0 && isRealDate(r.date.slice(0, 10)))
    .map((r) => ({ day: dayOf(r.date), mileage: r.mileage }))
    .sort((a, b) => a.day - b.day || a.mileage - b.mileage);
  const clean: Reading[] = [];
  for (const r of usable) {
    const prev = clean[clean.length - 1];
    if (prev && r.mileage < prev.mileage) continue;
    if (prev && (r.mileage - prev.mileage) / Math.max(1, r.day - prev.day) > MILEAGE_JUMP_KM_PER_DAY) continue;
    clean.push(r);
  }
  return clean;
}

/** The last valid reading on or before the day, or null. */
export function kmAtDay(readings: Reading[], day: number): number | null {
  let km: number | null = null;
  for (const r of readings) {
    if (r.day > day) break;
    km = r.mileage;
  }
  return km;
}

/**
 * Km driven inside [fromDay, toDay] per band: each stretch between two valid readings counts
 * for the part of its days inside the period (pro rata), split at the band boundaries.
 */
export function kmByBandInPeriod(readings: Reading[], fromDay: number, toDay: number): Map<KmBand, number> {
  const out = new Map<KmBand, number>();
  const add = (m0: number, m1: number) => {
    for (const band of KM_BANDS) {
      const lo = Math.max(m0, band.min);
      const hi = Math.min(m1, band.max);
      if (hi > lo) out.set(band.key, (out.get(band.key) ?? 0) + (hi - lo));
    }
  };
  for (let i = 1; i < readings.length; i++) {
    const a = readings[i - 1];
    const b = readings[i];
    const span = b.day - a.day;
    if (span <= 0) {
      if (b.day >= fromDay && b.day <= toDay) add(a.mileage, b.mileage);
      continue;
    }
    // The distance is spread over the days (a.day, b.day]; the period covers (fromDay - 1, toDay].
    const s = Math.max(a.day, fromDay - 1);
    const e = Math.min(b.day, toDay);
    if (e <= s) continue;
    const per = (b.mileage - a.mileage) / span;
    add(a.mileage + per * (s - a.day), a.mileage + per * (e - a.day));
  }
  return out;
}

function yearOf(productionDate: string | null | undefined): number | null {
  const m = /(\d{4})/.exec(productionDate ?? "");
  return m ? Number(m[1]) : null;
}

/** Loads costs, vehicles and (admins only) km history once. */
export async function loadMaintenanceData(isAdmin: boolean, now: Date = new Date()): Promise<MaintenanceData> {
  const zone = officeTimeZone();
  const today = dateInZone(now, zone);
  const todayDay = dayOf(today);
  const [vehicleRows, expenseRows, readingMap] = await Promise.all([
    // Every row of the vehicles table, out-of-fleet (sold) vehicles included.
    db.select().from(vehicles),
    // Only the maintenance categories, on the same key as isMaintenanceExpenseCategory.
    db.select({
      id: expenses.id, vehicleId: expenses.vehicleId, category: expenses.category, amount: expenses.amount,
      date: expenses.date, description: expenses.description, supplier: expenses.supplier,
    }).from(expenses).where(inArray(sql`lower(btrim(${expenses.category}))`, [...MAINTENANCE_EXPENSE_CATEGORIES])),
    isAdmin ? mileageHistoryReadingsByVehicle() : Promise.resolve(new Map<number, DatedReading[]>()),
  ]);

  const firstCost = new Map<number, number>();
  const lastCost = new Map<number, number>();
  const rawCosts: Array<Omit<CostCtx, "km" | "band"> & { supplierRaw: string | null }> = [];
  for (const e of expenseRows) {
    const category = (e.category ?? "").trim().toLowerCase() as ExpenseCategory;
    if (!(MAINTENANCE_EXPENSE_CATEGORIES as readonly string[]).includes(category)) continue;
    const date = typeof e.date === "string" ? e.date.slice(0, 10) : "";
    if (!isRealDate(date)) continue;
    const amount = Number.parseFloat(String(e.amount));
    const day = dayOf(date);
    firstCost.set(e.vehicleId, Math.min(firstCost.get(e.vehicleId) ?? day, day));
    lastCost.set(e.vehicleId, Math.max(lastCost.get(e.vehicleId) ?? day, day));
    rawCosts.push({
      id: e.id, vehicleId: e.vehicleId, date, day, category,
      amount: Number.isFinite(amount) ? amount : 0,
      description: e.description ?? null,
      supplierKey: supplierKey(e.supplier),
      supplierRaw: e.supplier,
    });
  }

  const vehicleMap = new Map<number, VehicleCtx>();
  /**
   * Ownership: from dateIn (else the creation day), earlier when a cost is earlier; until the
   * out-of-fleet day, the removal day or today, later when a cost comes after it (a bill after the sale).
   */
  const addVehicle = (v: VehicleSnapshot, removedDay: number | null) => {
    const createdAt = v.createdAt ? new Date(v.createdAt) : null;
    const created = createdAt && !Number.isNaN(createdAt.getTime()) ? dateInZone(createdAt, zone) : null;
    const dateIn = typeof v.dateIn === "string" && isRealDate(v.dateIn.slice(0, 10)) ? v.dateIn.slice(0, 10) : null;
    const first = firstCost.get(v.id);
    const last = lastCost.get(v.id);
    let ownedFrom = dateIn ? dayOf(dateIn) : created ? dayOf(created) : first ?? todayDay;
    if (first !== undefined && first < ownedFrom) ownedFrom = first;
    const out = typeof v.outOfFleetDate === "string" && isRealDate(v.outOfFleetDate.slice(0, 10)) ? dayOf(v.outOfFleetDate) : null;
    const end = Math.min(out ?? todayDay, removedDay ?? todayDay, todayDay);
    const ownedTo = last !== undefined && last > end ? last : end;
    const brand = (v.brand ?? "").trim().replace(/\s+/g, " ").toUpperCase();
    const model = modelWithoutBrand(brand, (v.model ?? "").toUpperCase());
    const raw = readingMap.get(v.id) ?? [];
    vehicleMap.set(v.id, {
      id: v.id,
      plate: v.licensePlate ? formatLicensePlate(v.licensePlate) : `#${v.id}`,
      brand,
      model,
      modelKey: model.toUpperCase(),
      year: yearOf(v.productionDate),
      ownedFrom,
      ownedTo,
      inFleet: removedDay === null && (out === null || out > todayDay),
      readings: cleanReadings(raw),
      raw,
    });
  };
  for (const v of vehicleRows as Vehicle[]) addVehicle(v, null);

  // Costs whose vehicle is no longer in the vehicles table keep counting: under the recycle-bin
  // snapshot of the vehicle when there is one, otherwise as "#id" without brand or model.
  const missing = [...new Set(rawCosts.map((c) => c.vehicleId))].filter((id) => !vehicleMap.has(id));
  if (missing.length > 0) {
    const snapshots = await db.select({ entityId: deletedRecords.entityId, payload: deletedRecords.payload, deletedAt: deletedRecords.deletedAt })
      .from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "vehicle"), inArray(deletedRecords.entityId, missing)))
      .orderBy(desc(deletedRecords.deletedAt));
    for (const s of snapshots) {
      if (vehicleMap.has(s.entityId)) continue; // the newest snapshot wins
      const snap = (s.payload as { vehicle?: VehicleSnapshot } | null)?.vehicle;
      addVehicle({ ...(snap ?? {}), id: s.entityId }, dayOf(dateInZone(new Date(s.deletedAt), zone)));
    }
    for (const id of missing) {
      if (!vehicleMap.has(id)) addVehicle({ id }, lastCost.get(id) ?? todayDay);
    }
  }

  // The most used spelling of each supplier group is its name (ties: alphabetical).
  const spellings = new Map<string, Map<string, number>>();
  for (const c of rawCosts) {
    if (c.supplierKey === null || c.supplierRaw === null) continue;
    const spelling = c.supplierRaw.trim().replace(/\s+/g, " ");
    const counts = spellings.get(c.supplierKey) ?? new Map<string, number>();
    counts.set(spelling, (counts.get(spelling) ?? 0) + 1);
    spellings.set(c.supplierKey, counts);
  }
  const supplierNames = new Map<string, string>();
  for (const [key, counts] of spellings) {
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0];
    supplierNames.set(key, best[0]);
  }

  const costs: CostCtx[] = [];
  for (const { supplierRaw: _unused, ...c } of rawCosts) {
    const vehicle = vehicleMap.get(c.vehicleId);
    if (!vehicle) continue; // never: every vehicle id of a cost was added above
    const km = isAdmin ? kmAtDay(vehicle.readings, c.day) : null;
    costs.push({ ...c, km, band: km === null ? null : kmBandOf(km) });
  }
  costs.sort((a, b) => b.day - a.day || b.id - a.id);
  return { today, isAdmin, vehicles: vehicleMap, costs, supplierNames, kmCache: new Map() };
}

// ---------------------------------------------------------------------------
// Filters and aggregates
// ---------------------------------------------------------------------------

interface Period { from: string; to: string }

interface Ignore { vehicle?: boolean; supplier?: boolean; kmBand?: boolean; period?: boolean }

function vehicleMatches(v: VehicleCtx, q: MaintenanceQuery, ignore: Ignore = {}): boolean {
  if (!ignore.vehicle && q.vehicleId !== null && v.id !== q.vehicleId) return false;
  if (q.brand !== null && v.brand !== q.brand) return false;
  if (q.model !== null && v.modelKey !== q.model) return false;
  if (q.yearFrom !== null && (v.year === null || v.year < q.yearFrom)) return false;
  if (q.yearTo !== null && (v.year === null || v.year > q.yearTo)) return false;
  return true;
}

function costMatches(c: CostCtx, q: MaintenanceQuery, period: Period, ignore: Ignore = {}): boolean {
  if (!ignore.period && (c.date < period.from || c.date > period.to)) return false;
  if (q.category !== null && c.category !== q.category) return false;
  if (!ignore.supplier && q.supplier !== undefined && c.supplierKey !== q.supplier) return false;
  if (!ignore.kmBand && q.kmBand !== null && c.band !== q.kmBand) return false;
  return true;
}

/**
 * Months owned inside the period (period end clamped to today); 0 when not owned at all. A vehicle
 * owned at all in it counts at least 1 month (a 2-day owner with one bill is not EUR 750 a month),
 * but never more than the period itself, so a one-week period stays a monthly rate.
 */
function ownedMonths(v: VehicleCtx, period: Period, today: string): number {
  const periodFrom = dayOf(period.from);
  const periodTo = dayOf(period.to < today ? period.to : today);
  const from = Math.max(v.ownedFrom, periodFrom);
  const to = Math.min(v.ownedTo, periodTo);
  if (to < from) return 0;
  const floor = Math.min(1, Math.max(1, periodTo - periodFrom + 1) / DAYS_PER_MONTH);
  return Math.max(floor, (to - from + 1) / DAYS_PER_MONTH);
}

/** kmByBandInPeriod of one vehicle, memoised per request. */
function kmBands(data: MaintenanceData, v: VehicleCtx, period: Period): Map<KmBand, number> {
  const key = `${v.id}:${period.from}:${period.to}`;
  let hit = data.kmCache.get(key);
  if (!hit) {
    hit = kmByBandInPeriod(v.readings, dayOf(period.from), dayOf(period.to));
    data.kmCache.set(key, hit);
  }
  return hit;
}

function kmInPeriod(data: MaintenanceData, v: VehicleCtx, period: Period, band: KmBand | null): number {
  const byBand = kmBands(data, v, period);
  if (band !== null) return byBand.get(band) ?? 0;
  let total = 0;
  for (const km of byBand.values()) total += km;
  return total;
}

interface Scope {
  data: MaintenanceData;
  q: MaintenanceQuery;
  period: Period;
  vehicles: VehicleCtx[];
  costs: CostCtx[];
}

/**
 * Vehicles that match the filter and are owned in the period, or carry a matching cost in it.
 * With a km-band filter only the vehicles with a cost or with km driven in that band count.
 */
function scopeOf(data: MaintenanceData, q: MaintenanceQuery, period: Period, ignore: Ignore = {}): Scope {
  const costs = data.costs.filter((c) => {
    const v = data.vehicles.get(c.vehicleId)!;
    return vehicleMatches(v, q, ignore) && costMatches(c, q, period, ignore);
  });
  const withCost = new Set(costs.map((c) => c.vehicleId));
  const band = ignore.kmBand ? null : q.kmBand;
  const vehicles = [...data.vehicles.values()].filter((v) =>
    vehicleMatches(v, q, ignore) && (withCost.has(v.id) || (ownedMonths(v, period, data.today) > 0
      && (band === null || kmInPeriod(data, v, period, band) > 0))));
  return { data, q, period, vehicles, costs };
}

/** An empty brand or model goes out as null ("Onbekend" on screen). */
const orNull = (s: string): string | null => (s === "" ? null : s);

/** The vehicle fields every line carries: id, plate, brand and model (null when empty). */
const vehicleFields = (v: VehicleCtx) => ({ vehicleId: v.id, licensePlate: v.plate, brand: orNull(v.brand), model: orNull(v.model) });

/** A drill key "BRAND | MODEL" in the form modelGroupKey gives: parts upper-cased, "__null" kept. */
function normalModelKey(key: string): string {
  const [brand = "", model = ""] = key.split(" | ");
  const part = (s: string) => (s.trim() === REPORT_DRILL_NULL_KEY ? "" : s.trim().replace(/\s+/g, " ").toUpperCase());
  return modelGroupKey(part(brand), part(model));
}

function sumAmount(costs: CostCtx[]): number {
  return costs.reduce((n, c) => n + c.amount, 0);
}

function groupLine(scope: Scope, vehicles: VehicleCtx[], costs: CostCtx[]): MaintenanceGroupLine {
  const total = sumAmount(costs);
  const months = vehicles.reduce((n, v) => n + ownedMonths(v, scope.period, scope.data.today), 0);
  const withCosts = new Set(costs.map((c) => c.vehicleId)).size;
  const line: MaintenanceGroupLine = {
    total: round2(total),
    perVehicleMonth: ratio(total, months),
    vehicles: vehicles.filter((v) => ownedMonths(v, scope.period, scope.data.today) > 0).length,
    vehiclesWithCosts: withCosts,
    count: costs.length,
    rated: costs.length >= MIN_EXPENSES_FOR_RATING && withCosts >= MIN_VEHICLES_FOR_RATING,
  };
  if (scope.data.isAdmin) {
    const km = vehicles.reduce((n, v) => n + kmInPeriod(scope.data, v, scope.period, scope.q.kmBand), 0);
    line.perKm = ratio(total, km, round4);
  }
  return line;
}

function tilesOf(scope: Scope): MaintenanceTiles {
  const line = groupLine(scope, scope.vehicles, scope.costs);
  const tiles: MaintenanceTiles = { total: line.total, perVehicleMonth: line.perVehicleMonth, count: line.count };
  if (scope.data.isAdmin) tiles.perKm = line.perKm ?? null;
  return tiles;
}

function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = out.get(key);
    if (list) list.push(item);
    else out.set(key, [item]);
  }
  return out;
}

const categoryLabel = (key: string): string => MAINTENANCE_CATEGORY_LABELS[key] ?? key;

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

export function overviewPart(data: MaintenanceData, q: MaintenanceQuery): MaintenanceOverview {
  const scope = scopeOf(data, q, q);
  const byCat = groupBy(scope.costs, (c) => c.category);
  const categories = q.category ? [q.category] : [...MAINTENANCE_EXPENSE_CATEGORIES];
  const byVehicle = groupBy(scope.costs, (c) => c.vehicleId);
  const topVehicles = [...byVehicle.entries()]
    .map(([vehicleId, costs]) => {
      const v = data.vehicles.get(vehicleId)!;
      return { ...vehicleFields(v), total: round2(sumAmount(costs)), count: costs.length };
    })
    .sort((a, b) => b.total - a.total || a.licensePlate.localeCompare(b.licensePlate))
    .slice(0, 10);
  const result: MaintenanceOverview = {
    from: q.from,
    to: q.to,
    tiles: tilesOf(scope),
    byCategory: categories.map((key) => {
      const costs = byCat.get(key) ?? [];
      return { key, label: categoryLabel(key), amount: round2(sumAmount(costs)), count: costs.length };
    }),
    topVehicles,
  };
  if (q.compare) result.previous = { ...tilesOf(scopeOf(data, q, q.compare)), ...q.compare };
  return result;
}

export function brandsPart(data: MaintenanceData, q: MaintenanceQuery): MaintenanceBrands {
  const scope = scopeOf(data, q, q);
  const vehiclesByBrand = groupBy(scope.vehicles, (v) => v.brand);
  const costsByVehicle = groupBy(scope.costs, (c) => c.vehicleId);
  const costsOf = (vs: VehicleCtx[]) => vs.flatMap((v) => costsByVehicle.get(v.id) ?? []);
  const brands = [...vehiclesByBrand.entries()]
    .map(([brand, vs]) => ({ brand: orNull(brand), ...groupLine(scope, vs, costsOf(vs)) }))
    .sort((a, b) => b.total - a.total || (a.brand ?? "").localeCompare(b.brand ?? ""));
  const vehiclesByModel = groupBy(scope.vehicles, (v) => modelGroupKey(v.brand, v.modelKey));
  const models = [...vehiclesByModel.values()]
    .map((vs) => ({ brand: orNull(vs[0].brand), model: orNull(vs[0].model), key: modelGroupKey(vs[0].brand, vs[0].modelKey), ...groupLine(scope, vs, costsOf(vs)) }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  const result: MaintenanceBrands = { from: q.from, to: q.to, brands, models };
  if (data.isAdmin) {
    const bandRows: MaintenanceKmBandLine[] = [];
    const kmOf = new Map(scope.vehicles.map((v) => [v.id, kmBands(data, v, q)] as const));
    const bandLines = (level: MaintenanceKmBandLine["level"], brand: string, model: string | null, vs: VehicleCtx[]) => {
      const costs = costsOf(vs);
      const head = { level, brand: orNull(brand), model: model === null ? null : orNull(model) };
      for (const band of KM_BAND_KEYS) {
        if (q.kmBand !== null && band !== q.kmBand) continue;
        const inBand = costs.filter((c) => c.band === band);
        const amount = sumAmount(inBand);
        let km = 0;
        const ids = new Set(inBand.map((c) => c.vehicleId));
        for (const v of vs) {
          const k = kmOf.get(v.id)?.get(band) ?? 0;
          if (k > 0) ids.add(v.id);
          km += k;
        }
        if (km <= 0 && inBand.length === 0) continue;
        bandRows.push({ ...head, band, amount: round2(amount), km: Math.round(km), perKm: ratio(amount, km, round4), vehicles: ids.size, count: inBand.length });
      }
      // "Onbekende km": costs without a km reading on their day, so the row adds up to the group total.
      const unknown = q.kmBand === null ? costs.filter((c) => c.band === null) : [];
      if (unknown.length > 0) {
        bandRows.push({ ...head, band: null, amount: round2(sumAmount(unknown)), km: 0, perKm: null, vehicles: new Set(unknown.map((c) => c.vehicleId)).size, count: unknown.length });
      }
    };
    for (const [brand, vs] of vehiclesByBrand) bandLines("brand", brand, null, vs);
    for (const vs of vehiclesByModel.values()) bandLines("model", vs[0].brand, vs[0].model, vs);
    result.kmBands = bandRows;
  }
  return result;
}

export function vehiclesPart(data: MaintenanceData, q: MaintenanceQuery): { from: string; to: string; vehicles: MaintenanceVehicleLine[] } {
  const scope = scopeOf(data, q, q);
  const costsByVehicle = groupBy(scope.costs, (c) => c.vehicleId);
  const toDay = dayOf(q.to);
  const lines = scope.vehicles.map((v) => {
    const costs = costsByVehicle.get(v.id) ?? [];
    const total = sumAmount(costs);
    const line: MaintenanceVehicleLine = {
      ...vehicleFields(v),
      year: v.year,
      total: round2(total),
      perMonth: ratio(total, ownedMonths(v, q, data.today)),
      count: costs.length,
      lastDate: costs.reduce<string | null>((last, c) => (last === null || c.date > last ? c.date : last), null),
    };
    if (data.isAdmin) {
      const km = kmAtDay(v.readings, toDay);
      line.kmBand = km === null ? null : kmBandOf(km);
      line.perKm = ratio(total, kmInPeriod(scope.data, v, q, q.kmBand), round4);
    }
    return line;
  });
  lines.sort((a, b) => b.total - a.total || a.licensePlate.localeCompare(b.licensePlate));
  return { from: q.from, to: q.to, vehicles: lines };
}

function costRow(data: MaintenanceData, c: CostCtx): MaintenanceCostRow {
  const v = data.vehicles.get(c.vehicleId)!;
  const row: MaintenanceCostRow = {
    id: c.id,
    date: c.date,
    ...vehicleFields(v),
    category: c.category,
    categoryLabel: categoryLabel(c.category),
    supplier: c.supplierKey === null ? UNKNOWN_SUPPLIER_LABEL : data.supplierNames.get(c.supplierKey) ?? c.supplierKey,
    supplierKey: c.supplierKey,
    amount: round2(c.amount),
    description: c.description,
  };
  if (data.isAdmin) row.km = c.km;
  return row;
}

export async function suppliersPart(data: MaintenanceData, q: MaintenanceQuery): Promise<MaintenanceSuppliers> {
  const scope = scopeOf(data, q, q);
  const suppliers = [...groupBy(scope.costs, (c) => c.supplierKey).entries()]
    .map(([key, costs]) => {
      const total = sumAmount(costs);
      return {
        key,
        supplier: key === null ? UNKNOWN_SUPPLIER_LABEL : data.supplierNames.get(key) ?? key,
        total: round2(total),
        count: costs.length,
        avg: round2(total / costs.length),
      };
    })
    .sort((a, b) => b.total - a.total || a.supplier.localeCompare(b.supplier));

  // Workshop downtime: the same rule as /api/reports/workshop-downtime, for the filtered vehicles.
  const vehicleScope = scopeOf(data, q, q, { supplier: true, kmBand: true });
  const ids = vehicleScope.vehicles.map((v) => v.id);
  const [visits, linked] = ids.length === 0 ? [[], []] : await Promise.all([
    db.select().from(reservations).where(and(
      eq(reservations.type, "maintenance_block"), isNull(reservations.deletedAt), inArray(reservations.vehicleId, ids))),
    db.select({ maintenanceBlockId: expenses.maintenanceBlockId, amount: expenses.amount }).from(expenses)
      .where(and(isNotNull(expenses.maintenanceBlockId), inArray(expenses.vehicleId, ids))),
  ]);
  const idSet = new Set(ids);
  const downtime = downtimeRows(
    vehicleScope.vehicles.map((v) => ({ id: v.id, licensePlate: v.plate, brand: v.brand, model: v.model })),
    visits.filter((v) => v.vehicleId != null && idSet.has(v.vehicleId)).map((v) => ({ ...v, vehicleId: v.vehicleId as number })),
    linked,
    q.from,
    q.to,
    data.today,
  ).map((r) => ({ vehicleId: r.vehicleId, plate: r.licensePlate, brand: orNull(r.brand ?? ""), model: orNull(r.model ?? ""), visits: r.visits, days: r.days }));

  const topRepairs = [...scope.costs]
    .sort((a, b) => b.amount - a.amount || b.day - a.day || b.id - a.id)
    .slice(0, 10)
    .map((c) => costRow(data, c));
  return { from: q.from, to: q.to, suppliers, downtime, topRepairs };
}

/** yyyy-MM of every month the period touches, oldest first. */
function monthsOf(period: Period): string[] {
  const out: string[] = [];
  let y = Number(period.from.slice(0, 4));
  let m = Number(period.from.slice(5, 7));
  const end = period.to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(key);
    if (key >= end || out.length > 1200) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

function nextMonth(key: string, n: number): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7)) - 1 + n;
  return `${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
}

/** Cost per km of a brand + model in a band, over the comparison group (never narrowed to one vehicle, supplier or band). */
function groupRates(data: MaintenanceData, q: MaintenanceQuery): Map<string, number | null> {
  const peers = scopeOf(data, q, q, { vehicle: true, supplier: true, kmBand: true });
  const amount = new Map<string, number>();
  const km = new Map<string, number>();
  const keyOf = (v: VehicleCtx, band: string) => `${modelGroupKey(v.brand, v.modelKey)}#${band}`;
  for (const c of peers.costs) {
    if (c.band === null) continue;
    const k = keyOf(data.vehicles.get(c.vehicleId)!, c.band);
    amount.set(k, (amount.get(k) ?? 0) + c.amount);
  }
  for (const v of peers.vehicles) {
    for (const [band, n] of kmBands(data, v, q)) {
      const k = keyOf(v, band);
      km.set(k, (km.get(k) ?? 0) + n);
    }
  }
  const out = new Map<string, number | null>();
  for (const [k, n] of km) out.set(k, n > 0 ? (amount.get(k) ?? 0) / n : null);
  return out;
}

export function trendsPart(data: MaintenanceData, q: MaintenanceQuery): MaintenanceTrends {
  const scope = scopeOf(data, q, q);
  const sumByMonth = (costs: CostCtx[]) => {
    const out = new Map<string, number>();
    for (const c of costs) out.set(c.date.slice(0, 7), (out.get(c.date.slice(0, 7)) ?? 0) + c.amount);
    return out;
  };
  const current = sumByMonth(scope.costs);
  const months: MaintenanceTrends["months"] = monthsOf(q).map((month) => ({ month, amount: round2(current.get(month) ?? 0) }));
  if (q.compare) {
    const previous = sumByMonth(scopeOf(data, q, q.compare).costs);
    const previousMonths = monthsOf(q.compare);
    months.forEach((m, i) => { m.previous = round2(previous.get(previousMonths[i] ?? "") ?? 0); });
  }
  const result: MaintenanceTrends = { from: q.from, to: q.to, months };
  if (data.isAdmin) {
    const rates = groupRates(data, q);
    const forecastVehicles: NonNullable<MaintenanceTrends["forecastVehicles"]> = [];
    for (const v of scope.vehicles) {
      if (!v.inFleet) continue;
      const pace = kmPerDayFromReadings(v.raw);
      const km = v.readings.length ? v.readings[v.readings.length - 1].mileage : null;
      if (!pace || km === null) continue;
      const band = kmBandOf(km);
      const rate = rates.get(`${modelGroupKey(v.brand, v.modelKey)}#${band}`);
      if (rate === undefined || rate === null) continue;
      forecastVehicles.push({
        ...vehicleFields(v), band,
        kmPerDay: pace.kmPerDay, perKm: round4(rate), amount: round2(FORECAST_DAYS * pace.kmPerDay * rate),
      });
    }
    forecastVehicles.sort((a, b) => b.amount - a.amount || a.licensePlate.localeCompare(b.licensePlate));
    const total = forecastVehicles.reduce((n, f) => n + f.amount, 0);
    const thisMonth = data.today.slice(0, 7);
    result.forecast = Array.from({ length: FORECAST_MONTHS }, (_, i) => ({ month: nextMonth(thisMonth, i + 1), amount: round2(total / FORECAST_MONTHS) }));
    result.forecastVehicles = forecastVehicles;
  }
  return result;
}

/** The last full month on or before the day: the day's own month when it is the month's last day. */
function lastFullMonth(day: string): string {
  const next = ymdOf(dayOf(day) + 1);
  return next.slice(0, 7) !== day.slice(0, 7) ? day.slice(0, 7) : nextMonth(day.slice(0, 7), -1);
}

export function signalsPart(data: MaintenanceData, q: MaintenanceQuery): MaintenanceSignals {
  const scope = scopeOf(data, q, q);
  const signals: MaintenanceSignal[] = [];
  const base = vehicleFields;

  // 1. Above the group: same brand + model (admin: per km in the vehicle's band), at least 3 others.
  const peers = scopeOf(data, q, q, { vehicle: true, supplier: true, kmBand: true });
  const peerCosts = groupBy(peers.costs, (c) => c.vehicleId);
  const peersByModel = groupBy(peers.vehicles, (v) => modelGroupKey(v.brand, v.modelKey));
  const toDay = dayOf(q.to);
  const kmOf = new Map(peers.vehicles.map((v) => [v.id, kmBands(data, v, q)] as const));
  for (const v of scope.vehicles) {
    const group = (peersByModel.get(modelGroupKey(v.brand, v.modelKey)) ?? []).filter((o) => o.id !== v.id);
    const own = peerCosts.get(v.id) ?? [];
    if (data.isAdmin) {
      const km = kmAtDay(v.readings, toDay);
      if (km === null) continue;
      const band = kmBandOf(km);
      const ownKm = kmOf.get(v.id)?.get(band) ?? 0;
      if (ownKm <= 0) continue;
      const others = group.filter((o) => (kmOf.get(o.id)?.get(band) ?? 0) > 0);
      if (others.length < SIGNAL_MIN_COMPARABLES) continue;
      const otherAmount = others.reduce((n, o) => n + sumAmount((peerCosts.get(o.id) ?? []).filter((c) => c.band === band)), 0);
      const otherKm = others.reduce((n, o) => n + (kmOf.get(o.id)?.get(band) ?? 0), 0);
      const average = otherAmount / otherKm;
      const value = sumAmount(own.filter((c) => c.band === band)) / ownKm;
      if (average > 0 && value >= average * SIGNAL_ABOVE_GROUP_FACTOR) {
        signals.push({ kind: "aboveGroup", ...base(v), basis: "km", band, value: round4(value), average: round4(average), percent: Math.round((value / average - 1) * 100), comparables: others.length });
      }
    } else {
      const ownMonths = ownedMonths(v, q, data.today);
      if (ownMonths <= 0) continue;
      const others = group.filter((o) => ownedMonths(o, q, data.today) > 0);
      if (others.length < SIGNAL_MIN_COMPARABLES) continue;
      const average = others.reduce((n, o) => n + sumAmount(peerCosts.get(o.id) ?? []), 0)
        / others.reduce((n, o) => n + ownedMonths(o, q, data.today), 0);
      const value = sumAmount(own) / ownMonths;
      if (average > 0 && value >= average * SIGNAL_ABOVE_GROUP_FACTOR) {
        signals.push({ kind: "aboveGroup", ...base(v), basis: "month", value: round2(value), average: round2(average), percent: Math.round((value / average - 1) * 100), comparables: others.length });
      }
    }
  }

  // 2. Rising: each of the last 3 full months (up to the period end, never past today) higher than the month before.
  const last = lastFullMonth(q.to < data.today ? q.to : data.today);
  const window = Array.from({ length: SIGNAL_RISING_MONTHS + 1 }, (_, i) => nextMonth(last, i - SIGNAL_RISING_MONTHS));
  const allTime = scopeOf(data, q, q, { period: true });
  const allByVehicle = groupBy(allTime.costs, (c) => c.vehicleId);
  for (const v of scope.vehicles) {
    const costs = allByVehicle.get(v.id) ?? [];
    const amounts = window.map((month) => sumAmount(costs.filter((c) => c.date.startsWith(month))));
    if (amounts.every((a, i) => i === 0 || a > amounts[i - 1])) {
      signals.push({
        kind: "rising", ...base(v), months: window.map((month, i) => ({ month, amount: round2(amounts[i]) })),
        drillFrom: `${window[0]}-01`, drillTo: ymdOf(dayOf(`${nextMonth(window[window.length - 1], 1)}-01`) - 1),
      });
    }
  }

  // 3. Repeated: the same category again within 90 days; the second one inside the period.
  for (const v of scope.vehicles) {
    const byCategory = groupBy((allByVehicle.get(v.id) ?? []).slice().sort((a, b) => a.day - b.day || a.id - b.id), (c) => c.category);
    for (const [category, costs] of byCategory) {
      let found: [CostCtx, CostCtx] | null = null;
      for (let i = 1; i < costs.length; i++) {
        const gap = costs[i].day - costs[i - 1].day;
        if (gap >= 1 && gap <= SIGNAL_REPEAT_DAYS && costs[i].date >= q.from && costs[i].date <= q.to) found = [costs[i - 1], costs[i]];
      }
      if (found) {
        signals.push({
          kind: "repeated", ...base(v), category, categoryLabel: categoryLabel(category),
          firstDate: found[0].date, secondDate: found[1].date, days: found[1].day - found[0].day, expenseIds: [found[0].id, found[1].id],
          drillFrom: found[0].date, drillTo: found[1].date,
        });
      }
    }
  }
  return { from: q.from, to: q.to, signals };
}

/** The cost lines behind a tile, bar, slice or cell: the same filters, plus `drill` + `key`. */
export function rowsPart(data: MaintenanceData, q: MaintenanceQuery, query: Record<string, unknown>): { ok: true; body: MaintenanceRows } | Refusal {
  let costs = scopeOf(data, q, q).costs;
  if (query.drill !== undefined && query.drill !== "") {
    const drill = oneOf(query.drill, MAINTENANCE_ANALYSIS_DRILLS) as MaintenanceAnalysisDrill | null;
    if (drill === "kmBand" && !data.isAdmin) return { ok: false, status: 403, body: { message: "Km data is for admins only", code: "KM_ADMIN_ONLY" } };
    const key = query.key;
    if (!drill || typeof key !== "string" || key === "") return { ok: false, status: 400, body: { message: "Invalid drill-down", code: "INVALID_DRILL" } };
    const vehicleOf = (c: CostCtx) => data.vehicles.get(c.vehicleId)!;
    switch (drill) {
      case "category": costs = costs.filter((c) => c.category === key); break;
      case "brand": {
        const wanted = key === REPORT_DRILL_NULL_KEY ? "" : key.trim().toUpperCase();
        costs = costs.filter((c) => vehicleOf(c).brand === wanted);
        break;
      }
      case "model": {
        const wanted = normalModelKey(key);
        costs = costs.filter((c) => modelGroupKey(vehicleOf(c).brand, vehicleOf(c).modelKey) === wanted);
        break;
      }
      case "supplier": {
        const wanted = key === REPORT_DRILL_NULL_KEY ? null : supplierKey(key);
        costs = costs.filter((c) => c.supplierKey === wanted);
        break;
      }
      case "vehicle": costs = costs.filter((c) => String(c.vehicleId) === key); break;
      case "month": costs = costs.filter((c) => c.date.slice(0, 7) === key); break;
      // "__null" = Onbekende km: the lines without a km reading on their day.
      case "kmBand": costs = costs.filter((c) => c.band === (key === REPORT_DRILL_NULL_KEY ? null : key)); break;
    }
  }
  const rows = costs.map((c) => costRow(data, c));
  return { ok: true, body: { from: q.from, to: q.to, rows, total: rows.length, amount: round2(sumAmount(costs)) } };
}
