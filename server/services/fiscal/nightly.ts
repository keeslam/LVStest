/**
 * The nightly fiscal run (besluit F-03, 03-schema-en-dataflow.md §4.4).
 *
 * 1. Which customers have the check switched on.
 * 2. Tell staff about a rule version that becomes active today.
 * 3. The open periods of those customers in the window
 *    [today − 45 days, today + lookahead].
 * 4. Refresh stale RDW profiles of the vehicles in those periods (at most
 *    one call per 250 ms, like the APK scan).
 * 5. Assess every period; a period whose facts and outcome did not change
 *    writes nothing (assess.ts).
 * 6. Notifications of besluit F-06, deduplicated.
 *
 * Every knob is an argument so the run is testable without a clock or the
 * network. `runNightlyFiscalRun()` with no arguments is what the scheduler calls.
 */
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { portalCustomerSettings, vehicleUsagePeriods, vehicles, type VehicleUsagePeriod, type FiscalAssessment } from "../../../shared/schema";
import { FISCAL_STATUS_LABELS, MISSING_DATA_LABELS, type FiscalRuleKey, type MissingDataCode } from "../../../shared/fiscal-types";
import { dateLabelNl, monthLabelNl } from "../../../shared/fiscal-format";
import { addDays, compareIso, daysInMonth, monthKey } from "./calendar";
import { assessUsagePeriod, SYSTEM_ACTOR } from "./assess";
import { reconcileUsagePeriods } from "./usage-periods";
import { getProfile, ensureProfile, refreshFromRdw } from "./profiles";
import { listVersions } from "./rule-versions";
import { resolveForDate, resolveForPeriod } from "./resolve";
import { notifyCustomerFiscal, notifyStaffFiscal } from "./fiscal-notifications";
import type { Actor } from "./audit";
import { isoToday } from "../lifecycle";

const RULE: FiscalRuleKey = "pseudo_eindheffing_fossiel";
const LOOKBACK_DAYS = 45;
const DEFAULT_LOOKAHEAD_DAYS = 31;
const PROFILE_MAX_AGE_DAYS = 30;
const DEFAULT_PAUSE_MS = 250;

export interface NightlyOptions {
  today?: string;
  refreshProfiles?: boolean;
  fetchImpl?: typeof fetch;
  pauseMs?: number;
  actor?: Actor;
}

export interface NightlyResult {
  today: string;
  customers: number;
  versionsActivated: number;
  periodsReconciled: number;
  profilesRefreshed: number;
  periodsAssessed: number;
  assessmentsCreated: number;
  staffNotifications: number;
  customerNotifications: number;
}

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

async function enabledCustomerIds(): Promise<number[]> {
  const rows = await db.select({ id: portalCustomerSettings.customerId }).from(portalCustomerSettings).where(eq(portalCustomerSettings.fiscalMobilityEnabled, true));
  return rows.map((r) => r.id);
}

async function activatedVersions(today: string): Promise<number> {
  let count = 0;
  for (const v of await listVersions({ status: "published" })) {
    if (v.effectiveFrom !== today) continue;
    const sent = await notifyStaffFiscal({
      type: "fiscal_version_active",
      title: "Fiscale regelversie vandaag van kracht",
      description: `Regelversie ${v.versionNumber} "${v.title}" geldt vanaf ${dateLabelNl(today)} voor alle klanten.`,
      link: `/portal-admin?fiscalVersion=${v.id}`,
      today,
    });
    if (sent) count += 1;
  }
  return count;
}

async function lookaheadFor(today: string): Promise<number> {
  const current = await resolveForDate(RULE, today);
  return current.status === "ok" ? current.params.integer("ASSESSMENT_LOOKAHEAD_DAYS") : DEFAULT_LOOKAHEAD_DAYS;
}

async function periodsInWindow(customerIds: number[], from: string, to: string): Promise<VehicleUsagePeriod[]> {
  if (customerIds.length === 0) return [];
  return db
    .select()
    .from(vehicleUsagePeriods)
    .where(
      and(
        inArray(vehicleUsagePeriods.customerId, customerIds),
        isNull(vehicleUsagePeriods.closedAt),
        lte(vehicleUsagePeriods.startDate, to),
        or(isNull(vehicleUsagePeriods.endDate), gte(vehicleUsagePeriods.endDate, from)),
      ),
    )
    .orderBy(vehicleUsagePeriods.id);
}

async function refreshStaleProfiles(periods: VehicleUsagePeriod[], actor: Actor, fetchImpl: typeof fetch, pauseMs: number): Promise<number> {
  const vehicleIds = [...new Set(periods.map((p) => p.vehicleId).filter((v): v is number => v !== null))];
  if (vehicleIds.length === 0) return 0;
  const existing = await db.select({ id: vehicles.id }).from(vehicles).where(inArray(vehicles.id, vehicleIds));
  const cutoff = Date.now() - PROFILE_MAX_AGE_DAYS * 86_400_000;
  let refreshed = 0;
  for (const { id } of existing) {
    const profile = (await getProfile(id)) ?? (await ensureProfile(id));
    if (profile.rdwRetrievedAt && profile.rdwRetrievedAt.getTime() > cutoff) continue;
    const result = await refreshFromRdw(id, actor, fetchImpl);
    if (result.ok) refreshed += 1;
    await sleep(pauseMs);
  }
  return refreshed;
}

function missingText(codes: string[]): string {
  return codes.map((c) => MISSING_DATA_LABELS[c as MissingDataCode] ?? c).join(", ");
}

/** Notifications that follow from a freshly written assessment. */
async function notifyForAssessment(period: VehicleUsagePeriod, assessment: FiscalAssessment, today: string): Promise<{ staff: number; customer: number }> {
  let staff = 0;
  let customer = 0;
  const staffLink = period.reservationId ? `/reservations/edit/${period.reservationId}` : `/portal-admin?fiscalPeriod=${period.id}`;
  const plate = period.vehicleId ? (await db.select({ plate: vehicles.licensePlate }).from(vehicles).where(eq(vehicles.id, period.vehicleId)))[0]?.plate ?? "?" : "nog geen auto";
  const periodText = `${dateLabelNl(period.startDate)} t/m ${period.endDate ? dateLabelNl(period.endDate) : "open"}`;

  if (assessment.status === "DATA_INSUFFICIENT") {
    if (await notifyStaffFiscal({ type: "fiscal_data_missing", title: `Fiscaal: gegevens ontbreken (${plate})`, description: `${periodText}: ${missingText(assessment.missingData)}.`, link: staffLink, today })) staff += 1;
    if (await notifyCustomerFiscal(period.customerId, { type: "fiscal_data_missing", title: `Fiscale check: gegevens ontbreken (${plate})`, description: `Voor de periode ${periodText} ontbreekt: ${missingText(assessment.missingData)}. Vul het gebruik aan of neem contact op met Lam Groep.`, dedupeTag: `fiscal:${period.id}:missing` })) customer += 1;
  } else if (assessment.status === "MANUAL_REVIEW_REQUIRED") {
    if (await notifyStaffFiscal({ type: "fiscal_review_required", title: `Fiscaal: beoordeling nodig (${plate})`, description: `${periodText}: ${FISCAL_STATUS_LABELS[assessment.status]}.`, link: staffLink, today })) staff += 1;
    if (await notifyCustomerFiscal(period.customerId, { type: "fiscal_review_by_lam", title: `Fiscale check: beoordeling door Lam Groep (${plate})`, description: `De periode ${periodText} wordt door Lam Groep beoordeeld. U hoeft niets te doen tenzij wij contact opnemen.`, dedupeTag: `fiscal:${period.id}:review` })) customer += 1;
  }
  return { staff, customer };
}

/** The customer warnings that depend on the calendar, not on a new assessment. */
async function notifyCalendarWarnings(period: VehicleUsagePeriod, latest: FiscalAssessment | null, today: string): Promise<number> {
  const provisionalEnd = period.endDate ?? (compareIso(today, period.startDate) < 0 ? period.startDate : today);
  const resolution = await resolveForPeriod(RULE, period.startDate, provisionalEnd);
  if (resolution.status !== "ok") return 0;
  const { params } = resolution;
  let sent = 0;
  const plate = period.vehicleId ? (await db.select({ plate: vehicles.licensePlate }).from(vehicles).where(eq(vehicles.id, period.vehicleId)))[0]?.plate ?? "?" : "?";

  // Replacement approaching its exemption limit.
  if (period.isReplacement && params.list("REPLACEMENT_VEHICLE_EXEMPTION_REASONS").includes(period.replacementReason)) {
    const days = params.integer("REPLACEMENT_VEHICLE_EXEMPTION_DAYS");
    const warnDays = params.integer("WARN_DAYS_BEFORE_REPLACEMENT_LIMIT");
    if (days > 0) {
      const lastExempt = addDays(period.startDate, days - 1);
      const warnFrom = addDays(lastExempt, -warnDays);
      const stillRunning = period.endDate === null || compareIso(period.endDate, lastExempt) > 0;
      if (stillRunning && compareIso(today, warnFrom) >= 0 && compareIso(today, lastExempt) <= 0) {
        if (
          await notifyCustomerFiscal(period.customerId, {
            type: "fiscal_limit_warning",
            title: `Fiscale check: vervanging nadert de vrijstellingsgrens (${plate})`,
            description: `De vervangende auto is vanaf ${dateLabelNl(period.startDate)} in gebruik; tot en met ${dateLabelNl(lastExempt)} blijft de vervanging buiten de heffing (${days} kalenderdagen). Daarna telt de heffing per kalendermaand.`,
            dedupeTag: `fiscal:${period.id}:limit`,
            dedupeDays: 60,
          })
        ) sent += 1;
      }
    }
  }

  // A running, chargeable period that is about to enter a new calendar month.
  if (params.boolean("WARN_ON_MONTH_BOUNDARY") && latest && (latest.status === "APPLICABLE" || latest.status === "POSSIBLY_APPLICABLE")) {
    const [y, m] = today.split("-").map(Number);
    const lastDayOfMonth = `${today.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
    const nextMonthFirst = addDays(lastDayOfMonth, 1);
    const withinThreeDays = compareIso(today, addDays(lastDayOfMonth, -3)) >= 0;
    const continues = period.endDate === null || compareIso(period.endDate, nextMonthFirst) >= 0;
    if (withinThreeDays && continues && compareIso(period.startDate, lastDayOfMonth) <= 0) {
      if (
        await notifyCustomerFiscal(period.customerId, {
          type: "fiscal_month_boundary",
          title: `Fiscale check: nieuwe kalendermaand (${plate})`,
          description: `De huur loopt door in ${monthLabelNl(monthKey(nextMonthFirst))}. Elke kalendermaand waarin de auto ter beschikking staat telt mee voor de heffing; inleveren vóór ${dateLabelNl(nextMonthFirst)} voorkomt een extra maand.`,
          dedupeTag: `fiscal:${period.id}:month:${monthKey(nextMonthFirst)}`,
          dedupeDays: 60,
        })
      ) sent += 1;
    }
  }
  return sent;
}

export async function runNightlyFiscalRun(options: NightlyOptions = {}): Promise<NightlyResult> {
  const today = options.today ?? isoToday();
  const actor = options.actor ?? SYSTEM_ACTOR;
  const result: NightlyResult = { today, customers: 0, versionsActivated: 0, periodsReconciled: 0, profilesRefreshed: 0, periodsAssessed: 0, assessmentsCreated: 0, staffNotifications: 0, customerNotifications: 0 };

  const customerIds = await enabledCustomerIds();
  result.customers = customerIds.length;
  result.versionsActivated = await activatedVersions(today);
  // Reservations written past the storage hooks get their period before the window is read.
  result.periodsReconciled = (await reconcileUsagePeriods()).synced;

  const lookahead = await lookaheadFor(today);
  const periods = await periodsInWindow(customerIds, addDays(today, -LOOKBACK_DAYS), addDays(today, lookahead));

  if (options.refreshProfiles !== false) {
    result.profilesRefreshed = await refreshStaleProfiles(periods, actor, options.fetchImpl ?? fetch, options.pauseMs ?? DEFAULT_PAUSE_MS);
  }

  for (const period of periods) {
    try {
      const { assessment, created } = await assessUsagePeriod(period.id, { trigger: "nightly", calculationDate: today, actor });
      result.periodsAssessed += 1;
      if (created) {
        result.assessmentsCreated += 1;
        const sent = await notifyForAssessment(period, assessment, today);
        result.staffNotifications += sent.staff;
        result.customerNotifications += sent.customer;
      }
      result.customerNotifications += await notifyCalendarWarnings(period, assessment, today);
    } catch (error) {
      console.error(`[fiscal] nachtelijke beoordeling van periode ${period.id} mislukt:`, error);
    }
  }
  return result;
}

export { sql };
