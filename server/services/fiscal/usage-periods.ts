/**
 * Usage periods ("terbeschikkingstellingsperioden").
 *
 * One row per reservation of type standard or replacement, derived on every
 * write of that reservation (the storage layer calls
 * `syncUsagePeriodForReservation` after each one). The derived facts —
 * dates, vehicle, customer, drivers, replacement — follow the reservation.
 * The facts only people know — private use, commuting, pool, the reason a
 * replacement was needed, whether the car was already with this employer
 * before the cutoff — are entered once and never overwritten; when the
 * derived facts move after a confirmation, the row is flagged for
 * reconfirmation. A period is never deleted: it is closed, with a reason.
 */
import { and, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  appSettings,
  reservationDriverAssignments,
  reservations,
  vehicleUsagePeriods,
  type Reservation,
  type VehicleUsagePeriod,
} from "../../../shared/schema";
import {
  REPLACEMENT_REASONS,
  USAGE_PERIOD_DERIVATION_START,
  TRI_STATES,
  USAGE_TYPES,
  type ConfirmedByKind,
  type ReplacementReason,
  type TriState,
  type UsageType,
} from "../../../shared/fiscal-types";
import { addDays, compareIso, isValidIsoDate } from "./calendar";
import { FiscalNotFoundError, FiscalValidationError } from "./errors";
import { recordFiscalEvent, type Actor } from "./audit";

/**
 * besluit F-10: periods are derived from reservations that start on or after
 * this day. Earlier reservations are only read to hint at the transition rule.
 * A business decision about the data, not a fiscal parameter.
 */
export { USAGE_PERIOD_DERIVATION_START };

const DERIVED_TYPES = ["standard", "replacement"];
const BACKFILL_MARKER = "migration:fiscal_usage_periods_v1";

export async function getUsagePeriod(id: number): Promise<VehicleUsagePeriod | null> {
  const [row] = await db.select().from(vehicleUsagePeriods).where(eq(vehicleUsagePeriods.id, id));
  return row ?? null;
}

export async function getUsagePeriodByReservation(reservationId: number): Promise<VehicleUsagePeriod | null> {
  const [row] = await db.select().from(vehicleUsagePeriods).where(eq(vehicleUsagePeriods.reservationId, reservationId));
  return row ?? null;
}

interface DerivedFacts {
  vehicleId: number | null;
  customerId: number;
  primaryDriverId: number | null;
  startDate: string;
  endDate: string | null;
  dateBasis: "planned" | "actual";
  /** Besluit F-15: 'actual' once the car is back — the final calculation applies. */
  endBasis: "planned" | "actual" | null;
  driverCount: number;
  isReplacement: boolean;
  derivedReplacementReason: ReplacementReason | null;
  replacedReservationId: number | null;
  providedBeforeCutoffHint: boolean;
}

type Eligibility = { eligible: true; facts: DerivedFacts } | { eligible: false; closedReason: "cancelled" | "deleted" | "out_of_scope" };

function periodEndOf(r: Pick<Reservation, "endDate" | "actualReturnDate">): string | null {
  if (isValidIsoDate(r.actualReturnDate)) return r.actualReturnDate;
  return isValidIsoDate(r.endDate) ? r.endDate : null;
}

async function deriveFacts(r: Reservation): Promise<Eligibility> {
  if (r.deletedAt) return { eligible: false, closedReason: "deleted" };
  if (r.status === "cancelled") return { eligible: false, closedReason: "cancelled" };
  if (!DERIVED_TYPES.includes(r.type) || r.customerId === null) return { eligible: false, closedReason: "out_of_scope" };
  const pickup = isValidIsoDate(r.actualPickupDate) ? r.actualPickupDate : null;
  const startDate = pickup ?? (isValidIsoDate(r.startDate) ? r.startDate : null);
  if (!startDate) {
    console.warn(`[fiscal] reservering ${r.id} heeft geen geldige startdatum; geen gebruiksperiode afgeleid`);
    return { eligible: false, closedReason: "out_of_scope" };
  }
  if (compareIso(startDate, USAGE_PERIOD_DERIVATION_START) < 0) return { eligible: false, closedReason: "out_of_scope" };
  const endDate = periodEndOf(r);
  const dateBasis: "planned" | "actual" = pickup || isValidIsoDate(r.actualReturnDate) ? "actual" : "planned";
  const endBasis: "planned" | "actual" | null = isValidIsoDate(r.actualReturnDate) ? "actual" : endDate !== null ? "planned" : null;

  const assignments = await db
    .select({ driverId: reservationDriverAssignments.driverId })
    .from(reservationDriverAssignments)
    .where(eq(reservationDriverAssignments.reservationId, r.id));
  const driverIds = new Set<number>();
  for (const a of assignments) if (a.driverId !== null) driverIds.add(a.driverId);
  if (r.driverId !== null) driverIds.add(r.driverId);

  let derivedReplacementReason: ReplacementReason | null = null;
  if (r.type === "replacement" && r.maintenanceBlockId !== null) {
    const [block] = await db.select({ category: reservations.maintenanceCategory }).from(reservations).where(eq(reservations.id, r.maintenanceBlockId));
    if (block?.category === "scheduled_maintenance") derivedReplacementReason = "maintenance";
    else if (block?.category === "repair") derivedReplacementReason = "repair";
  }

  // The transition hint: the same car was with the same customer, without a
  // gap, in a rental that began before the derivation start.
  let providedBeforeCutoffHint = false;
  if (r.vehicleId !== null) {
    const dayBefore = addDays(startDate, -1);
    const earlier = await db
      .select({ startDate: reservations.startDate, endDate: reservations.endDate, actualReturnDate: reservations.actualReturnDate, actualPickupDate: reservations.actualPickupDate })
      .from(reservations)
      .where(
        and(
          eq(reservations.vehicleId, r.vehicleId),
          eq(reservations.customerId, r.customerId),
          ne(reservations.id, r.id),
          inArray(reservations.type, DERIVED_TYPES),
          ne(reservations.status, "cancelled"),
          isNull(reservations.deletedAt),
          sql`${reservations.startDate} < ${USAGE_PERIOD_DERIVATION_START}`,
        ),
      );
    providedBeforeCutoffHint = earlier.some((e) => {
      const end = periodEndOf(e);
      return end !== null && compareIso(end, dayBefore) >= 0;
    });
  }

  return {
    eligible: true,
    facts: {
      vehicleId: r.vehicleId,
      customerId: r.customerId,
      primaryDriverId: r.driverId,
      startDate,
      endDate,
      dateBasis,
      endBasis,
      driverCount: driverIds.size,
      isReplacement: r.type === "replacement",
      derivedReplacementReason,
      replacedReservationId: r.replacementForReservationId ?? null,
      providedBeforeCutoffHint,
    },
  };
}

async function closePeriod(period: VehicleUsagePeriod, reason: "cancelled" | "deleted" | "out_of_scope"): Promise<VehicleUsagePeriod> {
  if (period.closedReason === reason) return period;
  const [row] = await db
    .update(vehicleUsagePeriods)
    .set({ closedAt: period.closedAt ?? new Date(), closedReason: reason, derivedAt: new Date(), updatedAt: new Date() })
    .where(eq(vehicleUsagePeriods.id, period.id))
    .returning();
  return row;
}

/** Derives (or re-derives) the period of one reservation. Safe to call after any write. */
export async function syncUsagePeriodForReservation(reservationId: number): Promise<VehicleUsagePeriod | null> {
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  const existing = await getUsagePeriodByReservation(reservationId);
  if (!reservation) return existing ? closePeriod(existing, "deleted") : null;

  const outcome = await deriveFacts(reservation);
  if (!outcome.eligible) return existing ? closePeriod(existing, outcome.closedReason) : null;
  const f = outcome.facts;
  const now = new Date();

  if (!existing) {
    const [created] = await db
      .insert(vehicleUsagePeriods)
      .values({
        reservationId,
        vehicleId: f.vehicleId,
        customerId: f.customerId,
        primaryDriverId: f.primaryDriverId,
        startDate: f.startDate,
        endDate: f.endDate,
        dateBasis: f.dateBasis,
        endBasis: f.endBasis,
        usageType: f.isReplacement ? "replacement" : "unknown",
        driverCount: f.driverCount,
        isReplacement: f.isReplacement,
        replacementReason: f.derivedReplacementReason ?? "unknown",
        replacedReservationId: f.replacedReservationId,
        providedBeforeCutoffHint: f.providedBeforeCutoffHint,
        source: "derived",
        derivedAt: now,
      })
      .returning();
    if (f.endBasis === "actual") await finalAssessmentSafely(created.id);
    return created;
  }

  const moved =
    existing.startDate !== f.startDate ||
    (existing.endDate ?? null) !== (f.endDate ?? null) ||
    (existing.vehicleId ?? null) !== (f.vehicleId ?? null) ||
    existing.driverCount !== f.driverCount;
  const patch: Partial<typeof vehicleUsagePeriods.$inferInsert> = {
    vehicleId: f.vehicleId,
    customerId: f.customerId,
    primaryDriverId: f.primaryDriverId,
    startDate: f.startDate,
    endDate: f.endDate,
    dateBasis: f.dateBasis,
    endBasis: f.endBasis,
    driverCount: f.driverCount,
    isReplacement: f.isReplacement,
    replacedReservationId: f.replacedReservationId,
    providedBeforeCutoffHint: f.providedBeforeCutoffHint,
    derivedAt: now,
    closedAt: null,
    closedReason: null,
    updatedAt: now,
  };
  if (existing.replacementReason === "unknown" && f.derivedReplacementReason) patch.replacementReason = f.derivedReplacementReason;
  if (existing.usageType === "unknown" && f.isReplacement) patch.usageType = "replacement";
  if (existing.confirmedByKind !== "none" && moved) patch.reconfirmRequired = true;

  const [updated] = await db.update(vehicleUsagePeriods).set(patch).where(eq(vehicleUsagePeriods.id, existing.id)).returning();
  // Besluit F-15: the car came back — the period gets its final calculation at once.
  if (existing.endBasis !== "actual" && f.endBasis === "actual") await finalAssessmentSafely(updated.id);
  return updated;
}

/** The final calculation after a return. Imported lazily: assess.ts imports this module. Never throws. */
async function finalAssessmentSafely(periodId: number): Promise<void> {
  try {
    const { assessUsagePeriod } = await import("./assess");
    await assessUsagePeriod(periodId, { trigger: "final" });
  } catch (error) {
    console.error(`[fiscal] eindberekening van gebruiksperiode ${periodId} mislukt:`, error);
  }
}

/** The storage layer's hook: a failure here must never break the reservation write. */
export async function syncUsagePeriodSafely(reservationId: number): Promise<void> {
  try {
    await syncUsagePeriodForReservation(reservationId);
  } catch (error) {
    console.error(`[fiscal] gebruiksperiode van reservering ${reservationId} kon niet worden bijgewerkt:`, error);
  }
}

export interface ConfirmUsageInput {
  privateUse: TriState;
  commuting: TriState;
  providedBeforeCutoff: TriState;
  usageType?: UsageType;
  isPool?: boolean;
  replacementReason?: ReplacementReason;
  replacedVehicleText?: string | null;
  notes?: string | null;
}

/**
 * Records what a person knows about a period (besluit F-02: a portal admin
 * may, a driver may not; staff may override). For a replacement the reason is
 * required at this point (besluit F-09).
 */
export async function confirmUsage(
  reservationId: number,
  input: ConfirmUsageInput,
  by: { kind: Exclude<ConfirmedByKind, "none">; actor: Actor },
): Promise<VehicleUsagePeriod> {
  const period = await getUsagePeriodByReservation(reservationId);
  if (!period) throw new FiscalNotFoundError("Geen gebruiksperiode voor deze reservering");
  const issues = [];
  for (const key of ["privateUse", "commuting", "providedBeforeCutoff"] as const) {
    if (!TRI_STATES.includes(input[key])) issues.push({ key, message: "moet ja, nee of onbekend zijn" });
  }
  if (input.usageType !== undefined && !USAGE_TYPES.includes(input.usageType)) issues.push({ key: "usageType", message: "onbekend gebruikstype" });
  if (input.replacementReason !== undefined && !REPLACEMENT_REASONS.includes(input.replacementReason)) issues.push({ key: "replacementReason", message: "onbekende reden" });
  const effectiveReason = input.replacementReason ?? period.replacementReason;
  if (period.isReplacement && effectiveReason === "unknown") issues.push({ key: "replacementReason", message: "de reden van vervanging is verplicht" });
  if (issues.length) throw new FiscalValidationError(`Ongeldige invoer: ${issues.map((i) => i.message).join("; ")}`, issues);

  const now = new Date();
  const patch: Partial<typeof vehicleUsagePeriods.$inferInsert> = {
    privateUse: input.privateUse,
    commuting: input.commuting,
    providedBeforeCutoff: input.providedBeforeCutoff,
    confirmedByKind: by.kind,
    confirmedById: by.actor.userId,
    confirmedByName: by.actor.username,
    confirmedAt: now,
    reconfirmRequired: false,
    updatedAt: now,
  };
  if (input.usageType !== undefined) patch.usageType = input.usageType;
  if (input.isPool !== undefined) patch.isPool = input.isPool;
  if (input.replacementReason !== undefined) patch.replacementReason = input.replacementReason;
  if (input.replacedVehicleText !== undefined) patch.replacedVehicleText = input.replacedVehicleText;
  if (input.notes !== undefined) patch.notes = input.notes;

  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
    if (["confirmedAt", "updatedAt", "confirmedById", "confirmedByName", "confirmedByKind", "reconfirmRequired"].includes(key)) continue;
    const before = (period as Record<string, unknown>)[key] ?? null;
    const after = (patch as Record<string, unknown>)[key] ?? null;
    if (before !== after) changes[key] = { old: before, new: after };
  }
  const overriding = period.confirmedByKind !== "none" && period.confirmedByKind !== by.kind;

  return db.transaction(async (tx) => {
    const [updated] = await tx.update(vehicleUsagePeriods).set(patch).where(eq(vehicleUsagePeriods.id, period.id)).returning();
    await recordFiscalEvent(
      by.actor,
      {
        action: overriding ? "usage_overridden" : "usage_confirmed",
        entityType: "usage_period",
        entityId: period.id,
        customerId: period.customerId,
        vehicleId: period.vehicleId,
        details: { reservationId, confirmedByKind: by.kind, changes },
      },
      tx,
    );
    return updated;
  });
}

/**
 * First derivation after deploy (03-schema-en-dataflow.md §7 step 4).
 * Idempotent through a marker row in app_settings; safe to run at every start.
 */
export async function backfillUsagePeriods(): Promise<{ scanned: number; skipped: boolean }> {
  const [marker] = await db.select({ id: appSettings.id }).from(appSettings).where(eq(appSettings.key, BACKFILL_MARKER));
  if (marker) return { scanned: 0, skipped: true };
  const rows = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(and(inArray(reservations.type, DERIVED_TYPES), isNull(reservations.deletedAt), sql`${reservations.startDate} >= ${USAGE_PERIOD_DERIVATION_START}`));
  for (const row of rows) await syncUsagePeriodSafely(row.id);
  await db
    .insert(appSettings)
    .values({
      key: BACKFILL_MARKER,
      value: { appliedAt: new Date().toISOString(), scanned: rows.length },
      category: "fiscal",
      description: "Eerste afleiding van gebruiksperioden uit reserveringen (docs/fiscaal)",
    })
    .onConflictDoNothing();
  return { scanned: rows.length, skipped: false };
}

/**
 * The safety net under the storage hooks: every reservation that was written
 * without `syncUsagePeriodSafely` — a path that forgot the hook, a direct
 * database edit, an older build — is derived again here. Runs at start-up and
 * in the nightly run, so a missed period is never silent for more than a night.
 *
 * Picks up: eligible reservations without a period; periods whose reservation
 * changed after the last derivation; open periods of a cancelled or deleted
 * reservation. `synced` counts the reservations that ended up with a period
 * (created, updated or closed), `scanned` everything examined.
 */
export async function reconcileUsagePeriods(options: { limit?: number } = {}): Promise<{ scanned: number; synced: number }> {
  const limit = options.limit ?? 5000;
  const rows = await db
    .select({ id: reservations.id })
    .from(reservations)
    .leftJoin(vehicleUsagePeriods, eq(vehicleUsagePeriods.reservationId, reservations.id))
    .where(
      or(
        and(
          isNull(vehicleUsagePeriods.id),
          isNull(reservations.deletedAt),
          ne(reservations.status, "cancelled"),
          isNotNull(reservations.customerId),
          inArray(reservations.type, DERIVED_TYPES),
          or(gte(reservations.startDate, USAGE_PERIOD_DERIVATION_START), gte(reservations.actualPickupDate, USAGE_PERIOD_DERIVATION_START)),
        ),
        and(isNotNull(vehicleUsagePeriods.id), sql`${reservations.updatedAt} > ${vehicleUsagePeriods.derivedAt}`),
        // Rows derived before besluit F-15 do not know yet whether their end is planned or actual.
        and(isNotNull(vehicleUsagePeriods.id), isNotNull(vehicleUsagePeriods.endDate), isNull(vehicleUsagePeriods.endBasis)),
        and(isNotNull(vehicleUsagePeriods.id), isNull(vehicleUsagePeriods.closedAt), or(isNotNull(reservations.deletedAt), eq(reservations.status, "cancelled"))),
      ),
    )
    .orderBy(reservations.id)
    .limit(limit);
  let synced = 0;
  for (const { id } of rows) {
    try {
      if (await syncUsagePeriodForReservation(id)) synced += 1;
    } catch (error) {
      console.error(`[fiscal] herstelronde: gebruiksperiode van reservering ${id} kon niet worden afgeleid:`, error);
    }
  }
  return { scanned: rows.length, synced };
}
