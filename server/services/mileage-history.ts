import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { vehicleMileageReadings, vehicles } from "../../shared/schema";
import {
  analyseMileage,
  type AnalysedRow,
  type MileageRow,
  type MileageSource,
  type MileageSummary,
} from "../../shared/mileage-history";
import { zonedDateTimeToInstant } from "../../shared/office-timezone";
import { officeTimeZone } from "./office-time";

export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface MileageReadingInput {
  vehicleId: number;
  mileage: number;
  recordedAt: Date;
  source: MileageSource;
  sourceTable?: string;
  sourceId?: number;
  actorName?: string | null;
}

/** Legt een stand vast; zelfde (source, sourceTable, sourceId) overschrijft en heft een vervallen op. */
export async function recordMileageReading(exec: DbOrTx, r: MileageReadingInput): Promise<void> {
  if (!Number.isFinite(r.mileage) || r.mileage <= 0) return;
  const values = {
    vehicleId: r.vehicleId,
    mileage: Math.round(r.mileage),
    recordedAt: r.recordedAt,
    source: r.source,
    sourceTable: r.sourceTable ?? null,
    sourceId: r.sourceId ?? null,
    actorName: r.actorName ?? null,
  };
  if (r.sourceId == null) {
    await exec.insert(vehicleMileageReadings).values(values);
    return;
  }
  if (!r.sourceTable) throw new Error("recordMileageReading: sourceTable is required when sourceId is given");
  await exec.insert(vehicleMileageReadings).values(values).onConflictDoUpdate({
    target: [vehicleMileageReadings.source, vehicleMileageReadings.sourceTable, vehicleMileageReadings.sourceId],
    targetWhere: sql`source_id is not null`,
    set: {
      mileage: values.mileage,
      recordedAt: values.recordedAt,
      actorName: values.actorName,
      voidedAt: null,
      voidedBy: null,
    },
  });
}

/** Markeert de standen van een bron als vervallen; geeft het aantal gewijzigde regels terug. */
export async function voidMileageReadings(
  exec: DbOrTx,
  m: { sourceTable: string; sourceId: number; source?: MileageSource },
  by: string,
): Promise<number> {
  const conditions = [
    eq(vehicleMileageReadings.sourceTable, m.sourceTable),
    eq(vehicleMileageReadings.sourceId, m.sourceId),
    isNull(vehicleMileageReadings.voidedAt),
  ];
  if (m.source) conditions.push(eq(vehicleMileageReadings.source, m.source));
  const res = await exec.update(vehicleMileageReadings)
    .set({ voidedAt: new Date(), voidedBy: by })
    .where(and(...conditions))
    .returning({ id: vehicleMileageReadings.id });
  return res.length;
}

function toRow(r: typeof vehicleMileageReadings.$inferSelect): MileageRow {
  return {
    id: r.id,
    mileage: r.mileage,
    recordedAt: r.recordedAt.toISOString(),
    source: r.source as MileageSource,
    actorName: r.actorName,
    voided: r.voidedAt != null,
  };
}

export interface MileageHistory {
  vehicle: { id: number; licensePlate: string; brand: string; model: string; freeKmPerDay: number | null };
  rows: AnalysedRow[];
  summary: MileageSummary;
}

/** Standen binnen [from, to] (kantoordata) plus de laatste geldige stand ervoor als basis. Null = onbekend voertuig. */
export async function getMileageHistory(vehicleId: number, from: string, to: string): Promise<MileageHistory | null> {
  const [v] = await db.select({
    id: vehicles.id, licensePlate: vehicles.licensePlate, brand: vehicles.brand,
    model: vehicles.model, freeKmPerDay: vehicles.freeKmPerDay,
  }).from(vehicles).where(eq(vehicles.id, vehicleId));
  if (!v) return null;
  const freeRaw = v.freeKmPerDay as unknown;
  const freeKmPerDay = freeRaw == null || freeRaw === "" || !Number.isFinite(Number(freeRaw)) ? null : Number(freeRaw);

  const zone = officeTimeZone();
  const start = zonedDateTimeToInstant(from, "00:00", zone);
  const nextDay = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const endExclusive = zonedDateTimeToInstant(nextDay, "00:00", zone);

  const listed = await db.select().from(vehicleMileageReadings).where(and(
    eq(vehicleMileageReadings.vehicleId, vehicleId),
    gte(vehicleMileageReadings.recordedAt, start),
    lt(vehicleMileageReadings.recordedAt, endExclusive),
  )).orderBy(asc(vehicleMileageReadings.recordedAt), asc(vehicleMileageReadings.id));

  const [base] = await db.select().from(vehicleMileageReadings).where(and(
    eq(vehicleMileageReadings.vehicleId, vehicleId),
    lt(vehicleMileageReadings.recordedAt, start),
    isNull(vehicleMileageReadings.voidedAt),
  )).orderBy(desc(vehicleMileageReadings.recordedAt), desc(vehicleMileageReadings.id)).limit(1);

  const { rows, summary } = analyseMileage(listed.map(toRow), {
    from, to, freeKmPerDay, baseline: base ? toRow(base) : null, zone,
  });
  return {
    vehicle: { id: v.id, licensePlate: v.licensePlate, brand: v.brand, model: v.model, freeKmPerDay },
    rows,
    summary,
  };
}
