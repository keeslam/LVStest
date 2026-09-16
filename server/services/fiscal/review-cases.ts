/**
 * Review cases: the queue of periods a person must look at. Opened and
 * closed automatically by assess.ts; assigned, worked and resolved by staff
 * here. Resolving by hand requires a resolution and a note, and is audited.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { fiscalAssessments, fiscalReviewCases, users, vehicleUsagePeriods, vehicles, customers, type FiscalReviewCase } from "../../../shared/schema";
import { REVIEW_CASE_STATUSES, REVIEW_RESOLUTIONS, type ReviewCaseStatus, type ReviewResolution } from "../../../shared/fiscal-types";
import { FiscalNotFoundError, FiscalStateError, FiscalValidationError } from "./errors";
import { recordFiscalEvent, type Actor } from "./audit";

export interface ReviewCaseRow extends FiscalReviewCase {
  licensePlate: string | null;
  customerName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  reservationId: number | null;
  assessmentStatus: string | null;
}

const listSelect = {
  id: fiscalReviewCases.id,
  usagePeriodId: fiscalReviewCases.usagePeriodId,
  assessmentId: fiscalReviewCases.assessmentId,
  customerId: fiscalReviewCases.customerId,
  vehicleId: fiscalReviewCases.vehicleId,
  reasons: fiscalReviewCases.reasons,
  status: fiscalReviewCases.status,
  assignedToId: fiscalReviewCases.assignedToId,
  assignedToName: fiscalReviewCases.assignedToName,
  resolution: fiscalReviewCases.resolution,
  resolutionNote: fiscalReviewCases.resolutionNote,
  resolvedById: fiscalReviewCases.resolvedById,
  resolvedByName: fiscalReviewCases.resolvedByName,
  resolvedAt: fiscalReviewCases.resolvedAt,
  createdAt: fiscalReviewCases.createdAt,
  updatedAt: fiscalReviewCases.updatedAt,
  licensePlate: vehicles.licensePlate,
  customerName: customers.name,
  periodStart: vehicleUsagePeriods.startDate,
  periodEnd: vehicleUsagePeriods.endDate,
  reservationId: vehicleUsagePeriods.reservationId,
  assessmentStatus: fiscalAssessments.status,
};

function baseQuery() {
  return db
    .select(listSelect)
    .from(fiscalReviewCases)
    .leftJoin(vehicleUsagePeriods, eq(vehicleUsagePeriods.id, fiscalReviewCases.usagePeriodId))
    .leftJoin(vehicles, eq(vehicles.id, fiscalReviewCases.vehicleId))
    .leftJoin(customers, eq(customers.id, fiscalReviewCases.customerId))
    .leftJoin(fiscalAssessments, eq(fiscalAssessments.id, fiscalReviewCases.assessmentId));
}

export async function listReviewCases(filter: { status?: ReviewCaseStatus; customerId?: number; vehicleId?: number; limit?: number } = {}): Promise<ReviewCaseRow[]> {
  const conditions = [];
  if (filter.status) conditions.push(eq(fiscalReviewCases.status, filter.status));
  if (filter.customerId !== undefined) conditions.push(eq(fiscalReviewCases.customerId, filter.customerId));
  if (filter.vehicleId !== undefined) conditions.push(eq(fiscalReviewCases.vehicleId, filter.vehicleId));
  const rows = await baseQuery()
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(fiscalReviewCases.createdAt))
    .limit(Math.min(filter.limit ?? 200, 500));
  return rows as ReviewCaseRow[];
}

export async function getReviewCase(id: number): Promise<ReviewCaseRow | null> {
  const [row] = await baseQuery().where(eq(fiscalReviewCases.id, id));
  return (row as ReviewCaseRow) ?? null;
}

export interface UpdateReviewCaseInput {
  status?: ReviewCaseStatus;
  assignedToId?: number | null;
  resolution?: ReviewResolution | null;
  resolutionNote?: string | null;
}

export async function updateReviewCase(id: number, input: UpdateReviewCaseInput, actor: Actor): Promise<ReviewCaseRow> {
  const [current] = await db.select().from(fiscalReviewCases).where(eq(fiscalReviewCases.id, id));
  if (!current) throw new FiscalNotFoundError("Beoordelingszaak niet gevonden");
  const issues = [];
  if (input.status !== undefined && !REVIEW_CASE_STATUSES.includes(input.status)) issues.push({ key: "status", message: "onbekende status" });
  if (input.resolution !== undefined && input.resolution !== null && !REVIEW_RESOLUTIONS.includes(input.resolution)) issues.push({ key: "resolution", message: "onbekende afhandeling" });
  const closing = input.status === "resolved" || input.status === "dismissed";
  if (closing && !input.resolution) issues.push({ key: "resolution", message: "afhandeling is verplicht bij het sluiten" });
  if (closing && !(input.resolutionNote ?? "").trim()) issues.push({ key: "resolutionNote", message: "toelichting is verplicht bij het sluiten" });
  if (issues.length) throw new FiscalValidationError("Ongeldige invoer", issues);
  if ((current.status === "resolved" || current.status === "dismissed") && input.status && input.status !== current.status) {
    throw new FiscalStateError("Een gesloten zaak kan niet opnieuw worden geopend; een nieuwe beoordeling opent zo nodig een nieuwe zaak");
  }

  const patch: Partial<typeof fiscalReviewCases.$inferInsert> = { updatedAt: new Date() };
  let assignedName: string | null | undefined;
  if (input.assignedToId !== undefined) {
    if (input.assignedToId === null) {
      assignedName = null;
    } else {
      const [user] = await db.select({ username: users.username, fullName: users.fullName }).from(users).where(eq(users.id, input.assignedToId));
      if (!user) throw new FiscalValidationError("Onbekende gebruiker", [{ key: "assignedToId", message: "bestaat niet" }]);
      assignedName = user.fullName || user.username;
    }
    patch.assignedToId = input.assignedToId;
    patch.assignedToName = assignedName;
  }
  if (input.status !== undefined) patch.status = input.status;
  if (closing) {
    patch.resolution = input.resolution;
    patch.resolutionNote = (input.resolutionNote ?? "").trim();
    patch.resolvedById = actor.userId;
    patch.resolvedByName = actor.username;
    patch.resolvedAt = new Date();
  }

  await db.transaction(async (tx) => {
    await tx.update(fiscalReviewCases).set(patch).where(eq(fiscalReviewCases.id, id));
    if (input.assignedToId !== undefined) {
      await recordFiscalEvent(
        actor,
        { action: "review_assigned", entityType: "review_case", entityId: id, customerId: current.customerId, vehicleId: current.vehicleId, oldValue: current.assignedToName, newValue: assignedName ?? null },
        tx,
      );
    }
    if (closing) {
      await recordFiscalEvent(
        actor,
        { action: "review_resolved", entityType: "review_case", entityId: id, customerId: current.customerId, vehicleId: current.vehicleId, oldValue: current.status, newValue: input.status, reasonText: patch.resolutionNote, details: { resolution: input.resolution } },
        tx,
      );
    }
  });
  return (await getReviewCase(id))!;
}

export async function countOpenReviewCases(): Promise<number> {
  const rows = await db.select({ id: fiscalReviewCases.id }).from(fiscalReviewCases).where(inArray(fiscalReviewCases.status, ["open", "in_progress"]));
  return rows.length;
}
