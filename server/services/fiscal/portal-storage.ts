/**
 * What a customer may see of the fiscal check (docs/fiscaal §4.6).
 *
 * Every function takes the customer of the session and its scope, like
 * server/services/portal-storage.ts: a driver-role account sees only the
 * periods of rentals it drove. Only the latest assessment of an open period
 * is shown, never a draft version, and amounts only when the caller says the
 * customer's dashboard switch is on (besluit F-05).
 */
import { and, desc, eq, exists, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  fiscalAssessments,
  fiscalRuleVersions,
  reservationDriverAssignments,
  vehicleUsagePeriods,
  vehicles,
  type FiscalAssessment,
  type VehicleUsagePeriod,
} from "../../../shared/schema";
import { FISCAL_ASSESSMENT_STATUSES, FISCAL_STATUS_LABELS, type FiscalAssessmentStatus } from "../../../shared/fiscal-types";

export interface FiscalScope {
  driverId?: number | null;
}

export type { PortalFiscalPeriodDto, PortalFiscalVehicleDto } from "../../../shared/fiscal-types";
import type { PortalFiscalPeriodDto, PortalFiscalVehicleDto } from "../../../shared/fiscal-types";

export function scopeCondition(scope: FiscalScope) {
  if (!scope.driverId) return undefined;
  const driven = db
    .select({ id: reservationDriverAssignments.id })
    .from(reservationDriverAssignments)
    .where(and(eq(reservationDriverAssignments.reservationId, vehicleUsagePeriods.reservationId), eq(reservationDriverAssignments.driverId, scope.driverId)));
  return or(eq(vehicleUsagePeriods.primaryDriverId, scope.driverId), exists(driven));
}

/** Lines with an amount are left out when the customer's dashboard switch is off. */
export function explanationFor(assessment: FiscalAssessment, withAmounts: boolean): string {
  if (withAmounts) return assessment.explanation;
  return assessment.explanation
    .split("\n")
    .filter((line) => !line.includes("€"))
    .join("\n");
}

async function latestFor(periodIds: number[]): Promise<Map<number, FiscalAssessment & { ruleVersionTitle: string | null }>> {
  const map = new Map<number, FiscalAssessment & { ruleVersionTitle: string | null }>();
  if (periodIds.length === 0) return map;
  const rows = await db
    .select({ assessment: fiscalAssessments, ruleVersionTitle: fiscalRuleVersions.title })
    .from(fiscalAssessments)
    .leftJoin(fiscalRuleVersions, eq(fiscalRuleVersions.id, fiscalAssessments.ruleVersionId))
    .where(
      and(
        inArray(fiscalAssessments.usagePeriodId, periodIds),
        sql`not exists (select 1 from ${fiscalAssessments} later where later.usage_period_id = ${fiscalAssessments.usagePeriodId} and later.sequence > ${fiscalAssessments.sequence})`,
      ),
    )
    .orderBy(desc(fiscalAssessments.id));
  for (const r of rows) map.set(r.assessment.usagePeriodId, { ...r.assessment, ruleVersionTitle: r.ruleVersionTitle });
  return map;
}

function toDto(period: VehicleUsagePeriod, plate: string | null, latest: (FiscalAssessment & { ruleVersionTitle: string | null }) | undefined, withAmounts: boolean): PortalFiscalPeriodDto {
  const status = (latest?.status as FiscalAssessmentStatus | undefined) ?? null;
  const needsInput = period.confirmedByKind === "none" || period.reconfirmRequired || (latest?.missingData ?? []).some((c) => ["private_use_unknown", "commuting_unknown", "transition_status_unknown", "replacement_reason_unknown", "usage_unknown"].includes(c));
  const dto: PortalFiscalPeriodDto = {
    reservationId: period.reservationId,
    usagePeriodId: period.id,
    vehicleId: period.vehicleId,
    licensePlate: plate,
    startDate: period.startDate,
    endDate: period.endDate,
    isReplacement: period.isReplacement,
    replacementReason: period.replacementReason,
    replacedVehicleText: period.replacedVehicleText,
    usageType: period.usageType,
    privateUse: period.privateUse,
    commuting: period.commuting,
    providedBeforeCutoff: period.providedBeforeCutoff,
    providedBeforeCutoffHint: period.providedBeforeCutoffHint,
    isPool: period.isPool,
    confirmedByKind: period.confirmedByKind,
    confirmedAt: period.confirmedAt ? period.confirmedAt.toISOString() : null,
    reconfirmRequired: period.reconfirmRequired,
    status,
    statusLabel: status ? FISCAL_STATUS_LABELS[status] : "Nog niet beoordeeld",
    isFinal: latest?.isFinal ?? false,
    assessedThrough: latest?.periodEndEffective ?? null,
    explanation: latest ? explanationFor(latest, withAmounts) : null,
    missingData: latest?.missingData ?? [],
    reviewReasons: latest?.reviewReasons ?? [],
    ruleVersionTitle: latest?.ruleVersionTitle ?? null,
    assessedAt: latest ? latest.createdAt.toISOString() : null,
    needsInput,
  };
  if (withAmounts) {
    dto.amount = latest?.amount ?? null;
    dto.settledAmount = latest?.settledAmount ?? null;
    dto.provisionalAmount = latest?.provisionalAmount ?? null;
  }
  return dto;
}

async function openPeriods(customerId: number, scope: FiscalScope, reservationId?: number) {
  const conditions = [eq(vehicleUsagePeriods.customerId, customerId), isNull(vehicleUsagePeriods.closedAt)];
  const scoped = scopeCondition(scope);
  if (scoped) conditions.push(scoped);
  if (reservationId !== undefined) conditions.push(eq(vehicleUsagePeriods.reservationId, reservationId));
  return db
    .select({ period: vehicleUsagePeriods, vehicle: { id: vehicles.id, licensePlate: vehicles.licensePlate, brand: vehicles.brand, model: vehicles.model } })
    .from(vehicleUsagePeriods)
    .leftJoin(vehicles, eq(vehicles.id, vehicleUsagePeriods.vehicleId))
    .where(and(...conditions))
    .orderBy(desc(vehicleUsagePeriods.startDate));
}

export async function listFiscalVehiclesForCustomer(customerId: number, scope: FiscalScope, options: { withAmounts: boolean }): Promise<PortalFiscalVehicleDto[]> {
  const rows = await openPeriods(customerId, scope);
  const latest = await latestFor(rows.map((r) => r.period.id));
  const byVehicle = new Map<number, PortalFiscalVehicleDto>();
  for (const { period, vehicle } of rows) {
    if (!vehicle?.id) continue;
    if (!byVehicle.has(vehicle.id)) byVehicle.set(vehicle.id, { vehicleId: vehicle.id, licensePlate: vehicle.licensePlate, brand: vehicle.brand, model: vehicle.model, periods: [] });
    byVehicle.get(vehicle.id)!.periods.push(toDto(period, vehicle.licensePlate, latest.get(period.id), options.withAmounts));
  }
  return [...byVehicle.values()];
}

export async function getFiscalReservationForCustomer(reservationId: number, customerId: number, scope: FiscalScope, options: { withAmounts: boolean }): Promise<PortalFiscalPeriodDto | null> {
  const [row] = await openPeriods(customerId, scope, reservationId);
  if (!row) return null;
  const latest = await latestFor([row.period.id]);
  return toDto(row.period, row.vehicle?.licensePlate ?? null, latest.get(row.period.id), options.withAmounts);
}

/** The latest assessment of one of the customer's reservations, for the PDF; null when outside the customer's scope or not yet assessed. */
export async function getFiscalAssessmentForCustomer(
  reservationId: number,
  customerId: number,
  scope: FiscalScope,
): Promise<{ assessment: FiscalAssessment; licensePlate: string | null; vehicle: string | null } | null> {
  const [row] = await openPeriods(customerId, scope, reservationId);
  if (!row) return null;
  const latest = (await latestFor([row.period.id])).get(row.period.id);
  if (!latest) return null;
  const { ruleVersionTitle: _title, ...assessment } = latest;
  return {
    assessment,
    licensePlate: row.vehicle?.licensePlate ?? null,
    vehicle: row.vehicle ? [row.vehicle.brand, row.vehicle.model].filter(Boolean).join(" ") || null : null,
  };
}

export async function fiscalSummaryForCustomer(customerId: number, scope: FiscalScope): Promise<{ periods: number; needsInput: number; byStatus: Record<FiscalAssessmentStatus, number>; unassessed: number }> {
  const rows = await openPeriods(customerId, scope);
  const latest = await latestFor(rows.map((r) => r.period.id));
  const byStatus = Object.fromEntries(FISCAL_ASSESSMENT_STATUSES.map((s) => [s, 0])) as Record<FiscalAssessmentStatus, number>;
  let unassessed = 0;
  let needsInput = 0;
  for (const { period, vehicle } of rows) {
    const a = latest.get(period.id);
    if (a) byStatus[a.status as FiscalAssessmentStatus] += 1;
    else unassessed += 1;
    if (toDto(period, vehicle?.licensePlate ?? null, a, false).needsInput) needsInput += 1;
  }
  return { periods: rows.length, needsInput, byStatus, unassessed };
}
