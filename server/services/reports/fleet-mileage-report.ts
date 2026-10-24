/**
 * Rapporten fase 3, onderdeel 8 — the fleet mileage report (admin only, enforced by requireAdmin
 * on the routes). Per vehicle it runs `analyseMileage`, the same function as the km panel, so the
 * km of a car here equal the summary of Km-historie for the same period.
 *
 * Two queries: the readings inside the period for the cars in scope, and per car the last valid
 * reading before the period (the baseline). The fleet is around a hundred cars, so the rows are
 * built in memory and the tiles, count and list all use the same `tileRows`.
 *
 * Cars in scope: in the fleet during the period (`out_of_fleet_date` empty or not before `from`),
 * or with a reading in the period. `vehicleId` narrows it down.
 */
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../../db";
import { vehicleMileageReadings, vehicles, type VehicleMileageReading } from "../../../shared/schema";
import { analyseMileage, drivenKmByMonth } from "../../../shared/mileage-history";
import { fillMonths } from "../../../shared/report-kit";
import {
  FLEET_MILEAGE_SORTS,
  FLEET_MILEAGE_TILES,
  type FleetMileageRow,
  type FleetMileageSort,
  type FleetMileageSummary,
  type FleetMileageTile,
  type FleetMileageVehicleRow,
  type FleetMileageWarningRow,
} from "../../../shared/reports/fleet-mileage-report";
import { officeTimeZone } from "../office-time";
import { officePeriodInstants, parseFreeKmPerDay, toRow } from "../mileage-history";
import type { ReportDefinition, ReportFilter } from "./report-kit";

interface FleetAnalysis {
  vehicles: FleetMileageVehicleRow[];
  warnings: FleetMileageWarningRow[];
  /** Ids of the cars in the fleet with fewer than 2 valid readings (baseline included). */
  sparseIds: Set<number>;
}

export async function analyseFleet(filter: ReportFilter): Promise<FleetAnalysis> {
  const { start, endExclusive } = officePeriodInstants(filter.from, filter.to);
  const vehicleScope = filter.vehicleId !== null ? eq(vehicles.id, filter.vehicleId) : undefined;
  const readingScope = filter.vehicleId !== null ? eq(vehicleMileageReadings.vehicleId, filter.vehicleId) : undefined;

  const [fleet, listed] = await Promise.all([
    db.select().from(vehicles).where(vehicleScope).orderBy(asc(vehicles.id)),
    db.select().from(vehicleMileageReadings).where(and(
      readingScope,
      gte(vehicleMileageReadings.recordedAt, start),
      lt(vehicleMileageReadings.recordedAt, endExclusive),
    )).orderBy(asc(vehicleMileageReadings.recordedAt), asc(vehicleMileageReadings.id)),
  ]);

  const byVehicle = new Map<number, VehicleMileageReading[]>();
  for (const r of listed) {
    const list = byVehicle.get(r.vehicleId) ?? [];
    list.push(r);
    byVehicle.set(r.vehicleId, list);
  }
  const inFleet = (v: (typeof fleet)[number]) => !v.outOfFleetDate || v.outOfFleetDate.slice(0, 10) >= filter.from;
  const scope = fleet.filter((v) => inFleet(v) || byVehicle.has(v.id));

  // The last valid reading before the period, per car.
  const baselines = new Map<number, VehicleMileageReading>();
  if (scope.length > 0) {
    const ids = sql.join(scope.map((v) => sql`${v.id}`), sql`, `);
    const result = await db.execute(sql`
      SELECT DISTINCT ON (vehicle_id) id, vehicle_id, mileage, recorded_at, source, actor_name
      FROM vehicle_mileage_readings
      WHERE voided_at IS NULL AND recorded_at < ${start.toISOString()}::timestamptz AND vehicle_id IN (${ids})
      ORDER BY vehicle_id, recorded_at DESC, id DESC`);
    const rows = (Array.isArray(result) ? result : (result as unknown as { rows: unknown[] }).rows) as Array<Record<string, unknown>>;
    for (const raw of rows) {
      baselines.set(Number(raw.vehicle_id), {
        id: Number(raw.id),
        vehicleId: Number(raw.vehicle_id),
        mileage: Number(raw.mileage),
        recordedAt: new Date(raw.recorded_at as string | Date),
        source: String(raw.source),
        sourceTable: null,
        sourceId: null,
        actorName: (raw.actor_name as string | null) ?? null,
        voidedAt: null,
        voidedBy: null,
        createdAt: new Date(),
      });
    }
  }

  const zone = officeTimeZone();
  const out: FleetAnalysis = { vehicles: [], warnings: [], sparseIds: new Set() };
  for (const v of scope) {
    const base = baselines.get(v.id);
    const { rows, summary } = analyseMileage((byVehicle.get(v.id) ?? []).map(toRow), {
      from: filter.from, to: filter.to, freeKmPerDay: parseFreeKmPerDay(v.freeKmPerDay), baseline: base ? toRow(base) : null, zone,
    });
    const valid = rows.filter((r) => !r.voided);
    const kmByMonth: Record<string, number> = {};
    for (const m of drivenKmByMonth(rows, zone)) kmByMonth[m.month] = m.km;
    out.vehicles.push({
      kind: "vehicle",
      id: `v-${v.id}`,
      vehicleId: v.id,
      licensePlate: v.licensePlate,
      brand: v.brand,
      model: v.model,
      drivenKm: summary.drivenKm,
      avgPerMonth: summary.avgPerMonth,
      freeKm: summary.freeKm,
      overFreeKm: summary.overFreeKm,
      readings: summary.readings,
      warnings: summary.warnings,
      firstReading: valid[0]?.recordedAt ?? null,
      lastReading: valid[valid.length - 1]?.recordedAt ?? null,
      kmByMonth,
      amount: summary.drivenKm,
    });
    if (inFleet(v) && summary.readings + (base ? 1 : 0) < 2) out.sparseIds.add(v.id);
    for (const r of rows) {
      if (!r.warning) continue;
      out.warnings.push({
        kind: "warning",
        id: `r-${r.id}`,
        readingId: r.id,
        vehicleId: v.id,
        licensePlate: v.licensePlate,
        recordedAt: r.recordedAt,
        mileage: r.mileage,
        drivenSincePrevious: r.drivenSincePrevious,
        warning: r.warning,
        source: r.source,
        actorName: r.actorName,
        amount: 0,
      });
    }
  }
  return out;
}

/** The rows of a tile, unsorted; the tiles, count and list all go through here. */
function tileRows(a: FleetAnalysis, tile: FleetMileageTile): FleetMileageRow[] {
  if (tile === "driven") return a.vehicles.filter((v) => v.drivenKm > 0);
  if (tile === "warnings") return a.warnings;
  return a.vehicles.filter((v) => a.sparseIds.has(v.vehicleId)).map((v) => ({ ...v, amount: 0 }));
}

function sortKey(row: FleetMileageRow, sort: Exclude<FleetMileageSort, "licensePlate">): number | string {
  if (sort === "km") return row.kind === "vehicle" ? row.drivenKm : row.mileage;
  if (sort === "warnings") return row.kind === "vehicle" ? row.warnings : 1;
  return (row.kind === "vehicle" ? row.lastReading : row.recordedAt) ?? "";
}

function compareRows(sort: FleetMileageSort, dir: "asc" | "desc") {
  const sign = dir === "asc" ? 1 : -1;
  const plate = (a: FleetMileageRow, b: FleetMileageRow) => a.licensePlate.localeCompare(b.licensePlate);
  const recorded = (r: FleetMileageRow) => (r.kind === "warning" ? r.recordedAt : "");
  return (a: FleetMileageRow, b: FleetMileageRow) => {
    let primary = 0;
    if (sort === "licensePlate") primary = plate(a, b);
    else {
      const x = sortKey(a, sort);
      const y = sortKey(b, sort);
      primary = x < y ? -1 : x > y ? 1 : 0;
    }
    if (primary) return sign * primary;
    return plate(a, b) || recorded(a).localeCompare(recorded(b)) || a.id.localeCompare(b.id);
  };
}

export const fleetMileageReport: ReportDefinition<FleetMileageTile, FleetMileageSort, FleetMileageRow, FleetMileageSummary> = {
  key: "fleet-mileage",
  tiles: FLEET_MILEAGE_TILES,
  sorts: FLEET_MILEAGE_SORTS,
  defaultSort: "licensePlate",
  defaultDir: "asc",

  async summary(filter) {
    const a = await analyseFleet(filter);
    const tiles = Object.fromEntries(FLEET_MILEAGE_TILES.map((tile) => {
      const rows = tileRows(a, tile);
      return [tile, { count: rows.length, amount: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100 }];
    })) as FleetMileageSummary["tiles"];
    const months = new Map<string, { month: string; km: number; vehicles: number }>();
    for (const v of a.vehicles) {
      for (const [month, km] of Object.entries(v.kmByMonth)) {
        const m = months.get(month) ?? { month, km: 0, vehicles: 0 };
        m.km += km;
        m.vehicles += 1;
        months.set(month, m);
      }
    }
    return { tiles, byMonth: fillMonths([...months.values()], (month) => ({ month, km: 0, vehicles: 0 })) };
  },

  async count(filter, tile) {
    return tileRows(await analyseFleet(filter), tile).length;
  },

  async list(filter, tile, order, limit, offset) {
    return tileRows(await analyseFleet(filter), tile)
      .sort(compareRows(order.sort, order.dir))
      .slice(offset, offset + limit);
  },
};
