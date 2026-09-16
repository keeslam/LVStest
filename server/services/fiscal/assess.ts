/**
 * Assessing one usage period: gather the facts, pick the rule version for
 * the calculation date, run the pure calculation, explain it in Dutch, and
 * store the whole thing — inputs, parameters, verdict — as one immutable row.
 *
 * A second run over unchanged facts writes nothing (the input hash matches).
 * A changed fact, a different rule version or an explicit recalculation
 * writes a new row that supersedes the previous one; the previous one is
 * never touched. Whatever a human must decide becomes a review case, one
 * open case per period, closed by the system as soon as the data is complete.
 */
import { createHash } from "crypto";
import { and, desc, eq, inArray, isNull, lt, ne } from "drizzle-orm";
import { db } from "../../db";
import {
  customers,
  fiscalAssessments,
  fiscalReviewCases,
  vehicles,
  vehicleUsagePeriods,
  type FiscalAssessment,
  type VehicleUsagePeriod,
} from "../../../shared/schema";
import type { AssessmentTrigger, FiscalAssessmentStatus, FiscalRuleKey } from "../../../shared/fiscal-types";
import { addDays, compareIso } from "./calendar";
import { evaluatePseudoEindheffing, type FiscalInput, type PriorPeriodRef, type Verdict } from "./rules/pseudo-eindheffing";
import { explainVerdict } from "./explain";
import { resolveForDate } from "./resolve";
import { ensureProfile } from "./profiles";
import { getUsagePeriod } from "./usage-periods";
import { FiscalNotFoundError, FiscalValidationError } from "./errors";
import { recordFiscalEvent, type Actor } from "./audit";
import { isoToday } from "../lifecycle";

const RULE: FiscalRuleKey = "pseudo_eindheffing_fossiel";

/** The actor for what the system does on its own (nightly runs, automatic closing of cases). */
export const SYSTEM_ACTOR: Actor = { userId: null, username: "systeem", role: "system" };

export interface AssessOptions {
  trigger: AssessmentTrigger;
  calculationDate?: string;
  actor?: Actor;
  reason?: string | null;
}

export async function latestAssessmentForPeriod(periodId: number): Promise<FiscalAssessment | null> {
  const [row] = await db.select().from(fiscalAssessments).where(eq(fiscalAssessments.usagePeriodId, periodId)).orderBy(desc(fiscalAssessments.sequence)).limit(1);
  return row ?? null;
}

async function priorPeriods(period: VehicleUsagePeriod): Promise<FiscalInput["priorPeriods"]> {
  const rows = await db
    .select({ id: vehicleUsagePeriods.id, vehicleId: vehicleUsagePeriods.vehicleId, primaryDriverId: vehicleUsagePeriods.primaryDriverId, startDate: vehicleUsagePeriods.startDate, endDate: vehicleUsagePeriods.endDate })
    .from(vehicleUsagePeriods)
    .where(and(eq(vehicleUsagePeriods.customerId, period.customerId), lt(vehicleUsagePeriods.startDate, period.startDate), isNull(vehicleUsagePeriods.closedAt), ne(vehicleUsagePeriods.id, period.id)));
  const ref = (r: (typeof rows)[number]): PriorPeriodRef => ({ periodId: r.id, startDate: r.startDate, endDate: r.endDate });
  return {
    sameCustomer: rows.map(ref),
    samePlate: rows.filter((r) => period.vehicleId !== null && r.vehicleId === period.vehicleId).map(ref),
    sameDriver: rows.filter((r) => period.primaryDriverId !== null && r.primaryDriverId === period.primaryDriverId).map(ref),
  };
}

async function buildInput(period: VehicleUsagePeriod, calculationDate: string, lookaheadDays: number, ruleVersion: FiscalInput["ruleVersion"]): Promise<FiscalInput> {
  const [customer] = await db.select({ id: customers.id, customerType: customers.customerType }).from(customers).where(eq(customers.id, period.customerId));
  if (!customer) throw new FiscalNotFoundError("Klant van de gebruiksperiode niet gevonden");

  let vehicle: FiscalInput["vehicle"] = null;
  if (period.vehicleId !== null) {
    const [row] = await db.select({ id: vehicles.id, licensePlate: vehicles.licensePlate }).from(vehicles).where(eq(vehicles.id, period.vehicleId));
    if (row) {
      const profile = await ensureProfile(row.id);
      vehicle = {
        id: row.id,
        licensePlate: row.licensePlate,
        europeanCategory: profile.europeanCategory,
        vehicleKind: profile.vehicleKind,
        fuelCategory: profile.fuelCategory as FiscalInput["vehicle"] extends null ? never : NonNullable<FiscalInput["vehicle"]>["fuelCategory"],
        co2GKm: profile.co2GKm,
        firstAdmissionDate: profile.firstAdmissionDate,
        catalogValue: profile.catalogValue,
        marketValue: profile.marketValue,
        isDrivingSchoolManual: profile.isDrivingSchoolManual,
      };
    }
  }

  const horizon = addDays(calculationDate, lookaheadDays);
  const endDateEffective = period.endDate ?? (compareIso(horizon, period.startDate) < 0 ? period.startDate : horizon);

  return {
    calculationDate,
    ruleVersion,
    customer: { id: customer.id, customerType: customer.customerType },
    vehicle,
    period: {
      id: period.id,
      startDate: period.startDate,
      endDate: period.endDate,
      endDateEffective,
      usageType: period.usageType as FiscalInput["period"]["usageType"],
      privateUse: period.privateUse as FiscalInput["period"]["privateUse"],
      commuting: period.commuting as FiscalInput["period"]["commuting"],
      isPool: period.isPool,
      driverCount: period.driverCount,
      isReplacement: period.isReplacement,
      replacementReason: period.replacementReason as FiscalInput["period"]["replacementReason"],
      providedBeforeCutoff: period.providedBeforeCutoff as FiscalInput["period"]["providedBeforeCutoff"],
      closedReason: period.closedReason,
    },
    priorPeriods: await priorPeriods(period),
  };
}

function unavailableVerdict(status: Extract<FiscalAssessmentStatus, "RULE_NOT_AVAILABLE" | "CONFIGURATION_INVALID">, input: FiscalInput): Verdict {
  return {
    status,
    months: [],
    monthsCharged: 0,
    amount: null,
    dataQuality: "insufficient",
    missingData: [],
    reviewReasons: [],
    facts: { openEnded: input.period.endDate === null, calendarDays: 0 },
    parametersUsed: [],
  };
}

function hashOf(input: FiscalInput, parameters: Verdict["parametersUsed"], ruleVersionId: number | null): string {
  return createHash("sha256").update(JSON.stringify({ input, parameters, ruleVersionId })).digest("hex");
}

/** Opens, updates or closes the period's review case to match the new assessment. */
async function syncReviewCase(period: VehicleUsagePeriod, assessment: FiscalAssessment, verdict: Verdict, actor: Actor): Promise<void> {
  const [open] = await db
    .select()
    .from(fiscalReviewCases)
    .where(and(eq(fiscalReviewCases.usagePeriodId, period.id), inArray(fiscalReviewCases.status, ["open", "in_progress"])));
  const needsHuman = verdict.status === "MANUAL_REVIEW_REQUIRED" || verdict.status === "DATA_INSUFFICIENT";
  const reasons = [...verdict.missingData, ...verdict.reviewReasons];

  if (needsHuman) {
    if (open) {
      await db.update(fiscalReviewCases).set({ reasons, assessmentId: assessment.id, updatedAt: new Date() }).where(eq(fiscalReviewCases.id, open.id));
      return;
    }
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(fiscalReviewCases)
        .values({ usagePeriodId: period.id, assessmentId: assessment.id, customerId: period.customerId, vehicleId: period.vehicleId, reasons })
        .returning();
      await recordFiscalEvent(
        actor,
        { action: "review_opened", entityType: "review_case", entityId: created.id, customerId: period.customerId, vehicleId: period.vehicleId, details: { assessmentId: assessment.id, reasons } },
        tx,
      );
    });
    return;
  }

  if (open) {
    await db.transaction(async (tx) => {
      await tx
        .update(fiscalReviewCases)
        .set({
          status: "resolved",
          resolution: "data_completed",
          resolutionNote: `Gegevens compleet bij beoordeling #${assessment.id} (${verdict.status}).`,
          resolvedById: null,
          resolvedByName: SYSTEM_ACTOR.username,
          resolvedAt: new Date(),
          assessmentId: assessment.id,
          updatedAt: new Date(),
        })
        .where(eq(fiscalReviewCases.id, open.id));
      await recordFiscalEvent(
        actor,
        { action: "review_resolved", entityType: "review_case", entityId: open.id, customerId: period.customerId, vehicleId: period.vehicleId, details: { assessmentId: assessment.id, resolution: "data_completed", by: SYSTEM_ACTOR.username } },
        tx,
      );
    });
  }
}

export async function assessUsagePeriod(periodId: number, options: AssessOptions): Promise<{ assessment: FiscalAssessment; created: boolean }> {
  const period = await getUsagePeriod(periodId);
  if (!period) throw new FiscalNotFoundError("Gebruiksperiode niet gevonden");
  const actor = options.actor ?? SYSTEM_ACTOR;
  const reason = options.reason?.trim() || null;
  if (options.trigger === "recalculation" && !reason) {
    throw new FiscalValidationError("Een reden voor de herberekening is verplicht", [{ key: "reason", message: "verplicht" }]);
  }
  const calculationDate = options.calculationDate ?? isoToday();

  const resolution = await resolveForDate(RULE, calculationDate);
  let input: FiscalInput;
  let verdict: Verdict;
  let explanation: string;
  let ruleVersionId: number | null = null;
  if (resolution.status === "ok") {
    const { version, params } = resolution;
    ruleVersionId = version.id;
    input = await buildInput(period, calculationDate, params.integer("ASSESSMENT_LOOKAHEAD_DAYS"), { effectiveFrom: version.effectiveFrom!, effectiveUntil: version.effectiveUntil });
    verdict = evaluatePseudoEindheffing(input, params);
    explanation = explainVerdict(verdict, { title: version.title, versionNumber: version.versionNumber, effectiveFrom: version.effectiveFrom, effectiveUntil: version.effectiveUntil });
  } else {
    input = await buildInput(period, calculationDate, 0, { effectiveFrom: calculationDate, effectiveUntil: null });
    verdict = unavailableVerdict(resolution.status, input);
    explanation = explainVerdict(verdict, null);
    if (resolution.status === "CONFIGURATION_INVALID") {
      explanation += `\n\nConfiguratieproblemen: ${resolution.issues.map((i) => `${i.key}: ${i.message}`).join("; ")}`;
      ruleVersionId = resolution.version?.id ?? null;
    }
  }

  const inputHash = hashOf(input, verdict.parametersUsed, ruleVersionId);
  const latest = await latestAssessmentForPeriod(period.id);
  if (latest && latest.inputHash === inputHash && options.trigger !== "recalculation") {
    return { assessment: latest, created: false };
  }

  const assessment = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(fiscalAssessments)
      .values({
        usagePeriodId: period.id,
        customerId: period.customerId,
        vehicleId: period.vehicleId,
        reservationId: period.reservationId,
        periodStart: input.period.startDate,
        periodEnd: input.period.endDate,
        periodEndEffective: input.period.endDateEffective,
        calculationDate,
        ruleKey: RULE,
        ruleVersionId,
        status: verdict.status,
        amount: verdict.amount,
        monthsCharged: verdict.monthsCharged,
        months: verdict.months,
        dataQuality: verdict.dataQuality,
        explanation,
        missingData: verdict.missingData,
        reviewReasons: verdict.reviewReasons,
        inputs: input as unknown as Record<string, unknown>,
        parameters: verdict.parametersUsed as unknown as Array<Record<string, unknown>>,
        inputHash,
        sequence: (latest?.sequence ?? 0) + 1,
        supersedesId: latest?.id ?? null,
        trigger: options.trigger,
        requestedById: options.trigger === "recalculation" || options.trigger === "manual" ? actor.userId : null,
        requestedByName: options.trigger === "recalculation" || options.trigger === "manual" ? actor.username : null,
        requestReason: reason,
      })
      .returning();
    if (options.trigger === "recalculation") {
      await recordFiscalEvent(
        actor,
        { action: "recalculation_requested", entityType: "assessment", entityId: row.id, ruleKey: RULE, ruleVersionId, customerId: period.customerId, vehicleId: period.vehicleId, reasonText: reason, details: { supersedes: latest?.id ?? null, usagePeriodId: period.id } },
        tx,
      );
    }
    return row;
  });

  await syncReviewCase(period, assessment, verdict, actor);
  return { assessment, created: true };
}

/** Assesses every open period that matches, e.g. all of one customer or one vehicle. */
export async function assessMany(filter: { customerId?: number; vehicleId?: number; usagePeriodId?: number }, options: AssessOptions): Promise<{ assessed: number; created: number }> {
  const conditions = [isNull(vehicleUsagePeriods.closedAt)];
  if (filter.customerId !== undefined) conditions.push(eq(vehicleUsagePeriods.customerId, filter.customerId));
  if (filter.vehicleId !== undefined) conditions.push(eq(vehicleUsagePeriods.vehicleId, filter.vehicleId));
  if (filter.usagePeriodId !== undefined) conditions.push(eq(vehicleUsagePeriods.id, filter.usagePeriodId));
  const rows = await db.select({ id: vehicleUsagePeriods.id }).from(vehicleUsagePeriods).where(and(...conditions));
  let created = 0;
  for (const row of rows) {
    const result = await assessUsagePeriod(row.id, options);
    if (result.created) created += 1;
  }
  return { assessed: rows.length, created };
}
