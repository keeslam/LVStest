/**
 * The impact preview of a draft version (03-schema-en-dataflow.md §4.8).
 *
 * Runs the pure calculation twice over every open period of every customer
 * with the fiscal check switched on: once with the draft's parameters, once
 * with whatever governs the period today. Nothing is stored as an
 * assessment; the result is an estimate and says so. Long runs use the
 * fire-and-forget-plus-status pattern of the APK scan.
 */
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "../../db";
import { portalCustomerSettings, vehicleUsagePeriods, type VehicleUsagePeriod } from "../../../shared/schema";
import { FISCAL_ASSESSMENT_STATUSES, type FiscalAssessmentStatus, type FiscalRuleKey } from "../../../shared/fiscal-types";
import { getVersion, validateVersion } from "./rule-versions";
import { ParameterSet } from "./parameters";
import { definitionsForRule } from "./definitions";
import { buildInput } from "./assess";
import { resolveForDate, resolveForPeriod } from "./resolve";
import { evaluatePseudoEindheffing } from "./rules/pseudo-eindheffing";
import { addDays, calendarDaysInclusive, compareIso } from "./calendar";
import { recordFiscalEvent, type Actor } from "./audit";
import { FiscalNotFoundError, FiscalValidationError } from "./errors";
import { isoToday } from "../lifecycle";

export interface ImpactResult {
  isEstimate: true;
  versionId: number;
  currentVersionId: number | null;
  windowFrom: string;
  windowTo: string;
  computedAt: string;
  customers: number;
  vehicles: number;
  periods: number;
  currentTotal: string;
  draftTotal: string;
  difference: string;
  annualImpact: string;
  monthlyImpact: string;
  manualReview: number;
  dataInsufficient: number;
  byStatus: Record<FiscalAssessmentStatus, number>;
}

export interface ImpactState {
  running: boolean;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  result: ImpactResult | null;
}

const states = new Map<number, ImpactState>();

function cents(amount: string | null): number {
  return amount === null ? 0 : Math.round(Number(amount) * 100);
}

function money(c: number): string {
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export async function runImpactPreview(versionId: number, actor: Actor): Promise<ImpactResult> {
  const version = await getVersion(versionId);
  if (!version) throw new FiscalNotFoundError("Regelversie niet gevonden");
  const validation = await validateVersion(versionId);
  if (!validation.ok) {
    throw new FiscalValidationError("Het concept is niet compleet genoeg voor een impactvoorbeeld (ingangsdatum en parameters)", validation.issues);
  }
  const ruleKey = version.ruleKey as FiscalRuleKey;
  const params = ParameterSet.fromValues(definitionsForRule(ruleKey), version.values, version.sources);
  const windowFrom = version.effectiveFrom!;
  const windowTo = version.effectiveUntil ?? addDays(windowFrom, 365);
  const draftLookahead = params.integer("ASSESSMENT_LOOKAHEAD_DAYS");
  const today = isoToday();

  const rows = await db
    .select({ period: vehicleUsagePeriods })
    .from(vehicleUsagePeriods)
    .innerJoin(portalCustomerSettings, eq(portalCustomerSettings.customerId, vehicleUsagePeriods.customerId))
    .where(
      and(
        eq(portalCustomerSettings.fiscalMobilityEnabled, true),
        isNull(vehicleUsagePeriods.closedAt),
        lte(vehicleUsagePeriods.startDate, windowTo),
        or(isNull(vehicleUsagePeriods.endDate), gte(vehicleUsagePeriods.endDate, windowFrom)),
      ),
    );

  const customers = new Set<number>();
  const vehicles = new Set<number>();
  const byStatus = Object.fromEntries(FISCAL_ASSESSMENT_STATUSES.map((s) => [s, 0])) as Record<FiscalAssessmentStatus, number>;
  let draftCents = 0;
  let currentCents = 0;
  let manualReview = 0;
  let dataInsufficient = 0;

  for (const { period } of rows as Array<{ period: VehicleUsagePeriod }>) {
    customers.add(period.customerId);
    if (period.vehicleId !== null) vehicles.add(period.vehicleId);

    const draftInput = await buildInput(period, today, draftLookahead, { effectiveFrom: windowFrom, effectiveUntil: version.effectiveUntil });
    const draftVerdict = evaluatePseudoEindheffing(draftInput, params);
    byStatus[draftVerdict.status] += 1;
    if (draftVerdict.status === "MANUAL_REVIEW_REQUIRED") manualReview += 1;
    if (draftVerdict.status === "DATA_INSUFFICIENT") dataInsufficient += 1;
    draftCents += cents(draftVerdict.amount);

    const provisionalEnd = period.endDate ?? (compareIso(today, period.startDate) < 0 ? period.startDate : today);
    const current = await resolveForPeriod(ruleKey, period.startDate, provisionalEnd);
    if (current.status === "ok") {
      const input = await buildInput(period, today, current.params.integer("ASSESSMENT_LOOKAHEAD_DAYS"), {
        effectiveFrom: current.version.effectiveFrom!,
        effectiveUntil: current.version.effectiveUntil,
      });
      currentCents += cents(evaluatePseudoEindheffing(input, current.params).amount);
    }
  }

  const differenceCents = draftCents - currentCents;
  const windowDays = calendarDaysInclusive(windowFrom, windowTo);
  const annualCents = Math.round((differenceCents * 365) / windowDays);
  const currentAtStart = await resolveForDate(ruleKey, windowFrom);

  const result: ImpactResult = {
    isEstimate: true,
    versionId,
    currentVersionId: currentAtStart.status === "ok" ? currentAtStart.version.id : null,
    windowFrom,
    windowTo,
    computedAt: new Date().toISOString(),
    customers: customers.size,
    vehicles: vehicles.size,
    periods: rows.length,
    currentTotal: money(currentCents),
    draftTotal: money(draftCents),
    difference: money(differenceCents),
    annualImpact: money(annualCents),
    monthlyImpact: money(Math.round(annualCents / 12)),
    manualReview,
    dataInsufficient,
    byStatus,
  };

  await recordFiscalEvent(actor, {
    action: "impact_previewed",
    entityType: "rule_version",
    entityId: versionId,
    ruleKey,
    ruleVersionId: versionId,
    effectiveFrom: windowFrom,
    effectiveUntil: version.effectiveUntil,
    details: { customers: result.customers, vehicles: result.vehicles, periods: result.periods, currentTotal: result.currentTotal, draftTotal: result.draftTotal, difference: result.difference },
  });
  return result;
}

/** Starts a preview in the background. `started` is false when one is already running for this version. */
export function startImpactPreview(versionId: number, actor: Actor): { started: boolean; done: Promise<void> } {
  const existing = states.get(versionId);
  if (existing?.running) return { started: false, done: Promise.resolve() };
  const state: ImpactState = { running: true, startedAt: new Date().toISOString(), finishedAt: null, error: null, result: null };
  states.set(versionId, state);
  const done = runImpactPreview(versionId, actor)
    .then((result) => {
      state.result = result;
    })
    .catch((error: unknown) => {
      state.error = error instanceof Error ? error.message : String(error);
    })
    .finally(() => {
      state.running = false;
      state.finishedAt = new Date().toISOString();
    });
  return { started: true, done };
}

export function getImpactState(versionId: number): ImpactState | null {
  return states.get(versionId) ?? null;
}
