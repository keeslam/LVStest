/**
 * Rapporten fase 3, onderdeel 7 — the maintenance and APK outlook. The period is
 * the horizon: `from` is today (also the "today" of the service forecast), `to`
 * is from + N months.
 *
 * Which vehicles: in the fleet (`out_of_fleet_date IS NULL`) and not in one of the
 * statuses the maintenance list leaves out (`settings.maintenanceExcludedStatuses`).
 * A service row only when there is service data, an expected date and the car is
 * not already in the workshop (the same rules as the maintenance calendar); an
 * APK row when the APK date is a real date. Km per day comes from the km history
 * (`mileageHistoryReadingsByVehicle`), the same source as the calendar.
 *
 * The fleet is around a hundred cars, so the rows are built in memory and the
 * tiles, count and list all filter the same rows with the same `inTile`.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import { vehicles } from "../../../shared/schema";
import { computeServiceDue, serviceDueDefaultsFromSettings } from "../../../shared/service-due";
import { forecastService, kmPerDayFromReadings } from "../../../shared/service-forecast";
import {
  isoWeekStart,
  MAINTENANCE_OUTLOOK_SORTS,
  MAINTENANCE_OUTLOOK_TILES,
  type MaintenanceOutlookRow,
  type MaintenanceOutlookSort,
  type MaintenanceOutlookSummary,
  type MaintenanceOutlookTile,
  type MaintenanceOutlookWeek,
} from "../../../shared/reports/maintenance-outlook-report";
import { mileageHistoryReadingsByVehicle } from "../service-forecast";
import { isRealDate, type ReportDefinition, type ReportFilter, type ReportViewer } from "./report-kit";

function inTile(row: MaintenanceOutlookRow, tile: MaintenanceOutlookTile, filter: ReportFilter): boolean {
  if (tile === "overdue") return row.overdue;
  if (tile === "all") return row.overdue || row.dueDate <= filter.to;
  // An overdue row (also a km-overdue one dated today) belongs to the overdue tile only.
  return !row.overdue && row.kind === tile && row.dueDate >= filter.from && row.dueDate <= filter.to;
}

/** yyyy-mm-dd as a local midnight Date, the form `computeServiceDue` reads "today" in. */
function localDate(ymd: string): Date {
  return new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
}

/** Every APK and service row of the fleet that is due up to `filter.to` (overdue ones included). */
export async function loadOutlookRows(filter: ReportFilter): Promise<MaintenanceOutlookRow[]> {
  const today = filter.from;
  const [settings, fleet] = await Promise.all([
    storage.getSettings(),
    db.select().from(vehicles)
      .where(and(isNull(vehicles.outOfFleetDate), filter.vehicleId !== null ? eq(vehicles.id, filter.vehicleId) : undefined))
      .orderBy(asc(vehicles.id)),
  ]);
  const excluded = settings?.maintenanceExcludedStatuses || ["not_for_rental"];
  const inScope = fleet.filter((v) => !excluded.includes(v.availabilityStatus || "available"));
  const readings = await mileageHistoryReadingsByVehicle(inScope.map((v) => v.id));
  const defaults = serviceDueDefaultsFromSettings(settings);

  const rows: MaintenanceOutlookRow[] = [];
  const push = (vehicle: (typeof fleet)[number], kind: "apk" | "service", dueDate: string, { overdue, ...rest }: Pick<MaintenanceOutlookRow,
    "basis" | "tooFewReadings" | "currentMileage" | "nextServiceMileage" | "kmUntilService" | "kmPerDay"> & { overdue?: boolean }) => {
    const isOverdue = overdue === true || dueDate < filter.from;
    if (!isOverdue && dueDate > filter.to) return;
    rows.push({
      id: `${vehicle.id}-${kind}`,
      vehicleId: vehicle.id,
      licensePlate: vehicle.licensePlate,
      brand: vehicle.brand,
      model: vehicle.model,
      kind,
      dueDate,
      weekStart: isoWeekStart(dueDate),
      overdue: isOverdue,
      ...rest,
      amount: 0,
    });
  };

  for (const vehicle of inScope) {
    const apk = vehicle.apkDate ? vehicle.apkDate.slice(0, 10) : "";
    if (isRealDate(apk)) {
      push(vehicle, "apk", apk, {
        basis: "apk", tooFewReadings: false, currentMileage: vehicle.currentMileage ?? null,
        nextServiceMileage: null, kmUntilService: null, kmPerDay: null,
      });
    }
    if (vehicle.maintenanceStatus === "in_service") continue;
    const serviceDue = computeServiceDue(vehicle, defaults, localDate(today));
    if (!serviceDue.hasData) continue;
    const forecast = forecastService(serviceDue, kmPerDayFromReadings(readings.get(vehicle.id) ?? []), today);
    // Already over the limit (by date or by km): always overdue, whatever the forecast says.
    // A forecast would put a km-overdue car on "today" (not overdue), or without a km pace on
    // the months date, possibly beyond the horizon, so the most urgent car would drop out.
    let dueDate = forecast.expectedDate;
    let basis = forecast.basis;
    let overdue: boolean | undefined;
    if (serviceDue.isDueByDate && serviceDue.nextServiceDate) {
      dueDate = serviceDue.nextServiceDate.slice(0, 10);
      basis = "months";
      overdue = true;
    } else if (serviceDue.isDueByMileage) {
      dueDate = today;
      basis = "km";
      overdue = true;
    }
    if (!dueDate || !basis) continue;
    push(vehicle, "service", dueDate, {
      overdue,
      basis,
      tooFewReadings: forecast.tooFewReadings,
      currentMileage: vehicle.currentMileage ?? null,
      nextServiceMileage: serviceDue.nextServiceMileage,
      kmUntilService: serviceDue.kmUntilService,
      kmPerDay: forecast.kmPerDay,
    });
  }
  return rows;
}

const KIND_ORDER: Record<"apk" | "service", number> = { apk: 0, service: 1 };

/** The chosen sort first, then dueDate, license plate and kind, so the order is always stable. */
function compareRows(sort: MaintenanceOutlookSort, dir: "asc" | "desc") {
  const keys: Record<MaintenanceOutlookSort, (a: MaintenanceOutlookRow, b: MaintenanceOutlookRow) => number> = {
    dueDate: (a, b) => a.dueDate.localeCompare(b.dueDate),
    licensePlate: (a, b) => a.licensePlate.localeCompare(b.licensePlate),
    kind: (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  };
  const sign = dir === "asc" ? 1 : -1;
  return (a: MaintenanceOutlookRow, b: MaintenanceOutlookRow) =>
    sign * keys[sort](a, b) || keys.dueDate(a, b) || keys.licensePlate(a, b) || keys.kind(a, b) || a.vehicleId - b.vehicleId;
}

/** Non-admins see the expected date and basis, never the km readings. */
export function redactOutlookRow(row: MaintenanceOutlookRow, viewer: ReportViewer): MaintenanceOutlookRow {
  if (viewer.isAdmin) return row;
  return { ...row, currentMileage: null, nextServiceMileage: null, kmUntilService: null, kmPerDay: null };
}

export const maintenanceOutlookReport: ReportDefinition<MaintenanceOutlookTile, MaintenanceOutlookSort, MaintenanceOutlookRow, MaintenanceOutlookSummary> = {
  key: "maintenance-outlook",
  tiles: MAINTENANCE_OUTLOOK_TILES,
  sorts: MAINTENANCE_OUTLOOK_SORTS,
  defaultSort: "dueDate",
  defaultDir: "asc",
  redact: redactOutlookRow,
  // `from` is "today" here (overdue, forecast), so a month cannot narrow it.
  months: false,

  async summary(filter) {
    const rows = await loadOutlookRows(filter);
    const tiles = Object.fromEntries(MAINTENANCE_OUTLOOK_TILES.map((tile) =>
      [tile, { count: rows.filter((r) => inTile(r, tile, filter)).length, amount: 0 }])) as MaintenanceOutlookSummary["tiles"];
    const weeks = new Map<string, MaintenanceOutlookWeek>();
    for (const row of [...rows].sort(compareRows("dueDate", "asc"))) {
      if (row.overdue) continue;
      const week = weeks.get(row.weekStart) ?? { weekStart: row.weekStart, apk: 0, service: 0, items: [] };
      week[row.kind] += 1;
      week.items.push({ vehicleId: row.vehicleId, licensePlate: row.licensePlate, kind: row.kind, dueDate: row.dueDate });
      weeks.set(row.weekStart, week);
    }
    const byWeek = [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    return { tiles, byWeek };
  },

  async count(filter, tile) {
    return (await loadOutlookRows(filter)).filter((r) => inTile(r, tile, filter)).length;
  },

  async list(filter, tile, order, limit, offset) {
    return (await loadOutlookRows(filter))
      .filter((r) => inTile(r, tile, filter))
      .sort(compareRows(order.sort, order.dir))
      .slice(offset, offset + limit);
  },
};
