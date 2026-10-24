import { and, asc, eq, gt, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "../db";
import { appSettings, auditLogs, interactiveDamageChecks, reservations, vehicles } from "../../shared/schema";
import { dateInZone } from "../../shared/office-timezone";
import { officeTimeZone } from "./office-time";
import { insertMileageReadingIfAbsent, officeNoonInstant, type MileageReadingInput } from "./mileage-history";

export const MILEAGE_BACKFILL_KEY = "mileage_history_backfill_v1";
const BATCH = 500;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export interface BackfillResult { inserted: number; skipped: number }

function positive(n: unknown): number | null {
  const v = typeof n === "string" && n.trim() !== "" ? Number(n) : n;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Haalt de kilometerstand-geschiedenis terug uit bestaande gegevens (reserveringen,
 * schadechecks, onderhoud, auditlog). Raakt nooit een bestaande regel aan. Eenmalig:
 * na een complete run staat de instelling `mileage_history_backfill_v1`.
 */
export async function backfillMileageHistory(opts: { force?: boolean } = {}): Promise<BackfillResult> {
  if (!opts.force) {
    const [flag] = await db.select({ id: appSettings.id }).from(appSettings).where(eq(appSettings.key, MILEAGE_BACKFILL_KEY));
    if (flag) return { inserted: 0, skipped: 0 };
  }
  const runStart = new Date();
  const zone = officeTimeZone();
  const counts: BackfillResult = { inserted: 0, skipped: 0 };
  // One bad row (e.g. a reservation pointing at a car that no longer exists) is logged and
  // skipped; it must not abort the run, or the one-shot backfill would fail on every boot.
  const put = async (r: MileageReadingInput) => {
    try {
      if (await insertMileageReadingIfAbsent(db, r)) counts.inserted++;
      else counts.skipped++;
    } catch (error) {
      counts.skipped++;
      console.warn(`[mileage-history] backfill skipped ${r.sourceTable ?? r.source} ${r.sourceId ?? "?"}:`, error instanceof Error ? error.message : error);
    }
  };
  // Handovers that only know an office date are placed at 12:00 office time on that date.
  const atDate = (d: string | null | undefined): Date | null => (d && YMD.test(d) ? officeNoonInstant(d) : null);

  // Reservations (not deleted): pickup and return.
  for (let last = 0; ;) {
    const batch = await db.select().from(reservations)
      .where(and(gt(reservations.id, last), isNull(reservations.deletedAt)))
      .orderBy(asc(reservations.id)).limit(BATCH);
    if (!batch.length) break;
    last = batch[batch.length - 1].id;
    for (const r of batch) {
      if (r.vehicleId == null) continue;
      const pickupAt = atDate(r.actualPickupDate ?? r.startDate);
      if (pickupAt && r.pickupMileage != null) {
        await put({ vehicleId: r.vehicleId, mileage: r.pickupMileage, recordedAt: pickupAt, source: "pickup", sourceTable: "reservations", sourceId: r.id });
      }
      const returnAt = atDate(r.actualReturnDate ?? r.endDate);
      if (returnAt && r.returnMileage != null) {
        await put({ vehicleId: r.vehicleId, mileage: r.returnMileage, recordedAt: returnAt, source: "return", sourceTable: "reservations", sourceId: r.id });
      }
    }
  }

  // Damage checks of live reservations; skip a check that repeats the handover reading of the same day.
  for (let last = 0; ;) {
    const batch = await db.select({
      id: interactiveDamageChecks.id, vehicleId: interactiveDamageChecks.vehicleId, checkType: interactiveDamageChecks.checkType,
      checkDate: interactiveDamageChecks.checkDate, mileage: interactiveDamageChecks.mileage, completedBy: interactiveDamageChecks.completedBy,
      reservationId: interactiveDamageChecks.reservationId,
      pickupMileage: reservations.pickupMileage, returnMileage: reservations.returnMileage,
      actualPickupDate: reservations.actualPickupDate, startDate: reservations.startDate,
      actualReturnDate: reservations.actualReturnDate, endDate: reservations.endDate,
      reservationFound: reservations.id, reservationDeletedAt: reservations.deletedAt,
    }).from(interactiveDamageChecks)
      .leftJoin(reservations, eq(reservations.id, interactiveDamageChecks.reservationId))
      .where(and(gt(interactiveDamageChecks.id, last), isNotNull(interactiveDamageChecks.mileage)))
      .orderBy(asc(interactiveDamageChecks.id)).limit(BATCH);
    if (!batch.length) break;
    last = batch[batch.length - 1].id;
    for (const c of batch) {
      const isReturn = c.checkType === "return";
      const handoverMileage = isReturn ? c.returnMileage : c.pickupMileage;
      if (c.reservationId != null) {
        // Reservation gone or soft-deleted: its readings do not count.
        if (c.reservationFound == null || c.reservationDeletedAt != null) continue;
        // The handover this check measured was reverted (km cleared on the reservation).
        if (handoverMileage == null) {
          counts.skipped++;
          continue;
        }
      }
      const handoverDate = isReturn ? (c.actualReturnDate ?? c.endDate) : (c.actualPickupDate ?? c.startDate);
      if (handoverMileage != null && handoverMileage === c.mileage && handoverDate === dateInZone(c.checkDate, zone)) {
        counts.skipped++;
        continue;
      }
      await put({ vehicleId: c.vehicleId, mileage: c.mileage!, recordedAt: c.checkDate, source: "damage_check", sourceTable: "interactive_damage_checks", sourceId: c.id, actorName: c.completedBy });
    }
  }

  // Last service per vehicle.
  for (let last = 0; ;) {
    const batch = await db.select({ id: vehicles.id, m: vehicles.lastServiceMileage, d: vehicles.lastServiceDate }).from(vehicles)
      .where(gt(vehicles.id, last)).orderBy(asc(vehicles.id)).limit(BATCH);
    if (!batch.length) break;
    last = batch[batch.length - 1].id;
    for (const v of batch) {
      const at = atDate(v.d);
      if (at && v.m != null) await put({ vehicleId: v.id, mileage: v.m, recordedAt: at, source: "service", sourceTable: "vehicles", sourceId: v.id });
    }
  }

  // Audit log: manual/portal mileage changes from before this run (later ones are recorded live).
  for (let last = 0; ;) {
    const batch = await db.select().from(auditLogs)
      .where(and(gt(auditLogs.id, last), eq(auditLogs.resourceType, "vehicle"), lt(auditLogs.createdAt, runStart)))
      .orderBy(asc(auditLogs.id)).limit(BATCH);
    if (!batch.length) break;
    last = batch[batch.length - 1].id;
    const found: { id: number; vehicleId: number; to: number; at: Date; actor: string }[] = [];
    for (const a of batch) {
      const d = (a.details ?? {}) as Record<string, any>;
      const vehicleId = Number(a.resourceId);
      if (!Number.isInteger(vehicleId)) continue;
      const changes = Array.isArray(d.changes) ? d.changes.find((c: any) => c && c.field === "currentMileage") : null;
      const to = positive(changes ? changes.to : d.currentMileage?.to);
      if (to == null) continue;
      found.push({ id: a.id, vehicleId, to, at: a.createdAt, actor: a.username ?? "systeem" });
    }
    if (!found.length) continue;
    const existing = await db.select({ id: vehicles.id }).from(vehicles).where(inArray(vehicles.id, [...new Set(found.map((f) => f.vehicleId))]));
    const ids = new Set(existing.map((e) => e.id));
    for (const f of found) {
      if (!ids.has(f.vehicleId)) continue;
      await put({ vehicleId: f.vehicleId, mileage: f.to, recordedAt: f.at, source: "import", sourceTable: "audit_logs", sourceId: f.id, actorName: f.actor });
    }
  }

  await db.delete(appSettings).where(eq(appSettings.key, MILEAGE_BACKFILL_KEY));
  await db.insert(appSettings).values({
    key: MILEAGE_BACKFILL_KEY, value: { finishedAt: new Date().toISOString(), ...counts }, category: "system",
    description: "Eenmalig terughalen van de kilometerstand-geschiedenis",
  });
  return counts;
}
