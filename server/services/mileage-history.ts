import { and, asc, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { interactiveDamageChecks, vehicleMileageReadings, vehicles } from "../../shared/schema";
import {
  analyseMileage,
  type AnalysedRow,
  type MileageRow,
  type MileageSource,
  type MileageSummary,
} from "../../shared/mileage-history";
import { dateInZone, zonedDateTimeToInstant } from "../../shared/office-timezone";
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
      // The source can move to another car (a reservation or check whose vehicle
      // was swapped); the reading follows it.
      vehicleId: values.vehicleId,
      mileage: values.mileage,
      recordedAt: values.recordedAt,
      actorName: values.actorName,
      voidedAt: null,
      voidedBy: null,
    },
  });
}

/**
 * Het moment van een stand bij een overdracht die alleen een kantoordatum kent
 * (ophalen, inleveren, onderhoud afronden). Vandaag of geen datum = nu; een
 * andere datum = die dag op de huidige kantoorklok, zodat een terug-gedateerde
 * overdracht op de juiste dag staat en de volgorde binnen een dag blijft.
 */
export function readingInstantForOfficeDate(date: string | null | undefined, now: Date = new Date()): Date {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return now;
  const zone = officeTimeZone();
  if (dateInZone(now, zone) === date) return now;
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(now);
  return zonedDateTimeToInstant(date, clock, zone);
}

/**
 * Voor routes zonder transactie: de stand is al op voertuig of reservering
 * geschreven, dus een fout bij het vastleggen mag de overdracht niet alsnog
 * laten mislukken. Wordt gelogd, niet stil ingeslikt.
 */
export async function recordMileageReadingLogged(r: MileageReadingInput, context: string): Promise<void> {
  try {
    await recordMileageReading(db, r);
  } catch (error) {
    console.error(`[mileage-history] Could not record reading (${context}):`, error);
  }
}

/** Zelfde als `recordMileageReadingLogged`, voor het laten vervallen. */
export async function voidMileageReadingsLogged(
  m: { sourceTable: string; sourceId: number; source?: MileageSource },
  by: string,
  context: string,
): Promise<void> {
  try {
    await voidMileageReadings(db, m, by);
  } catch (error) {
    console.error(`[mileage-history] Could not void readings (${context}):`, error);
  }
}

/** Markeert de standen van een bron als vervallen; geeft het aantal gewijzigde regels terug. */
export async function voidMileageReadings(
  exec: DbOrTx,
  m: { sourceTable: string; sourceId: number; source?: MileageSource },
  by: string,
  at: Date = new Date(),
): Promise<number> {
  const conditions = [
    eq(vehicleMileageReadings.sourceTable, m.sourceTable),
    eq(vehicleMileageReadings.sourceId, m.sourceId),
    isNull(vehicleMileageReadings.voidedAt),
  ];
  if (m.source) conditions.push(eq(vehicleMileageReadings.source, m.source));
  const res = await exec.update(vehicleMileageReadings)
    .set({ voidedAt: at, voidedBy: by })
    .where(and(...conditions))
    .returning({ id: vehicleMileageReadings.id });
  return res.length;
}

/**
 * Tegenhanger van `voidMileageReadings`: maakt vervallen standen weer geldig.
 * Met `voidedAt` alleen de standen die op precies dat moment vervielen (zo haalt
 * een herstel uit de prullenbak niet terug wat eerder al was teruggedraaid).
 */
export async function unvoidMileageReadings(
  exec: DbOrTx,
  m: { sourceTable: string; sourceId: number; source?: MileageSource; voidedAt?: Date },
): Promise<number> {
  const conditions = [
    eq(vehicleMileageReadings.sourceTable, m.sourceTable),
    eq(vehicleMileageReadings.sourceId, m.sourceId),
    m.voidedAt ? eq(vehicleMileageReadings.voidedAt, m.voidedAt) : isNotNull(vehicleMileageReadings.voidedAt),
  ];
  if (m.source) conditions.push(eq(vehicleMileageReadings.source, m.source));
  const res = await exec.update(vehicleMileageReadings)
    .set({ voidedAt: null, voidedBy: null })
    .where(and(...conditions))
    .returning({ id: vehicleMileageReadings.id });
  return res.length;
}

async function damageCheckIdsOf(exec: DbOrTx, reservationId: number, checkType?: "pickup" | "return"): Promise<number[]> {
  const rows = await exec.select({ id: interactiveDamageChecks.id }).from(interactiveDamageChecks).where(and(
    eq(interactiveDamageChecks.reservationId, reservationId),
    checkType ? eq(interactiveDamageChecks.checkType, checkType) : undefined,
  ));
  return rows.map((r) => r.id);
}

/** Laat de standen van de schadecheck(s) van een reservering vervallen (bij terugdraaien: alleen dat soort check). */
export async function voidDamageCheckReadingsOfReservation(
  exec: DbOrTx,
  reservationId: number,
  by: string,
  opts: { checkType?: "pickup" | "return"; at?: Date } = {},
): Promise<number> {
  let n = 0;
  for (const checkId of await damageCheckIdsOf(exec, reservationId, opts.checkType)) {
    n += await voidMileageReadings(exec, { sourceTable: "interactive_damage_checks", sourceId: checkId }, by, opts.at);
  }
  return n;
}

/**
 * Verwijderen van een reservering: alle standen die eraan hangen (ophalen,
 * inleveren, onderhoud en de schadechecks) vervallen, met `at` = het moment
 * van verwijderen zodat een herstel precies deze terugzet.
 */
export async function voidReadingsOfDeletedReservation(exec: DbOrTx, reservationId: number, by: string, at: Date): Promise<number> {
  const own = await voidMileageReadings(exec, { sourceTable: "reservations", sourceId: reservationId }, by, at);
  return own + await voidDamageCheckReadingsOfReservation(exec, reservationId, by, { at });
}

/** Herstel uit de prullenbak: alleen de standen die bij het verwijderen (op `deletedAt`) vervielen. */
export async function unvoidReadingsOfRestoredReservation(exec: DbOrTx, reservationId: number, deletedAt: Date): Promise<number> {
  let n = await unvoidMileageReadings(exec, { sourceTable: "reservations", sourceId: reservationId, voidedAt: deletedAt });
  for (const checkId of await damageCheckIdsOf(exec, reservationId)) {
    n += await unvoidMileageReadings(exec, { sourceTable: "interactive_damage_checks", sourceId: checkId, voidedAt: deletedAt });
  }
  return n;
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
