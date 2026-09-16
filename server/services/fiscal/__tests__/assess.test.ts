/**
 * Assessing a usage period: the engine's verdict, stored with a snapshot of
 * everything it used, immutable, reproducible, and with a review case for
 * whatever a human must decide.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "../../../db";
import { fiscalAssessments, fiscalReviewCases, fiscalAuditEvents } from "../../../../shared/schema";
import { and, eq } from "drizzle-orm";
import { assessUsagePeriod, latestAssessmentForPeriod } from "../assess";
import { syncUsagePeriodForReservation, confirmUsage } from "../usage-periods";
import { ensureProfile, applyManualOverride } from "../profiles";
import { createDraft, updateDraft, setParameters, submitVersion, approveVersion, publishVersion } from "../rule-versions";
import { clearFiscalResolveCache } from "../resolve";
import { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures, FIXTURE_PREFIX } from "../../../__tests__/helpers/fixtures";
import { cleanupFiscalFixtures, FIXTURE_ACTOR, FIXTURE_PARAMETER_VALUES } from "../../../__tests__/helpers/fiscal";

const RULE = "pseudo_eindheffing_fossiel" as const;

async function publishFixtureVersion(title: string, effectiveFrom: string, overrides: Record<string, unknown> = {}) {
  const v = await createDraft({ ruleKey: RULE, title: `${FIXTURE_PREFIX}${title}`, reasonCategory: "legislative_change", reasonText: "Belastingplan 2026, artikel 32bc" }, FIXTURE_ACTOR);
  await updateDraft(v.id, { effectiveFrom, sourceOrganisation: "Rijksoverheid", sourceUrl: "https://ondernemersplein.overheid.nl/", legalReference: "art. 32bc Wet LB 1964" }, FIXTURE_ACTOR);
  await setParameters(v.id, Object.entries({ ...FIXTURE_PARAMETER_VALUES, ...overrides }).map(([key, value]) => ({ key, value })), FIXTURE_ACTOR);
  await submitVersion(v.id, FIXTURE_ACTOR);
  await approveVersion(v.id, FIXTURE_ACTOR);
  return publishVersion(v.id, FIXTURE_ACTOR);
}

/** A fossil M1 with everything known, on a confirmed private-use rental in March 2027. */
async function readyPeriod(options: { catalog?: string | null; confirm?: boolean; endDate?: string | null } = {}) {
  const customer = await createFixtureCustomer();
  const vehicle = await createFixtureVehicle({ fuel: "Gasoline", productionDate: "2024-05-01" });
  await ensureProfile(vehicle.id);
  await applyManualOverride(vehicle.id, { field: "europeanCategory", value: "M1", reason: "kentekenbewijs" }, FIXTURE_ACTOR);
  if (options.catalog !== null) {
    await applyManualOverride(vehicle.id, { field: "catalogValue", value: options.catalog ?? "36000.00", reason: "factuur" }, FIXTURE_ACTOR);
  }
  const r = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-03-01", endDate: options.endDate === undefined ? "2027-03-31" : options.endDate });
  const period = (await syncUsagePeriodForReservation(r.id))!;
  if (options.confirm !== false) {
    await confirmUsage(r.id, { privateUse: "yes", commuting: "no", providedBeforeCutoff: "no", usageType: "business_private" }, { kind: "staff", actor: FIXTURE_ACTOR });
  }
  return { customer, vehicle, reservation: r, period };
}

beforeAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
});
afterAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
});
beforeEach(async () => {
  await cleanupFiscalFixtures();
  clearFiscalResolveCache();
});

describe("beoordeling — vastleggen", () => {
  it("stores the verdict with explanation, parameter snapshot and inputs", async () => {
    const version = await publishFixtureVersion("wet", "2027-01-01");
    const { period, customer, vehicle } = await readyPeriod();
    const { assessment, created } = await assessUsagePeriod(period.id, { trigger: "manual", calculationDate: "2027-03-15", actor: FIXTURE_ACTOR });
    expect(created).toBe(true);
    expect(assessment).toMatchObject({ status: "APPLICABLE", amount: "360.00", monthsCharged: 1, sequence: 1, ruleVersionId: version.id, customerId: customer.id, vehicleId: vehicle.id, calculationDate: "2027-03-15", dataQuality: "complete" });
    expect(assessment.explanation).toContain("Status: Van toepassing");
    expect(assessment.explanation).toContain(`${FIXTURE_PREFIX}wet`);
    expect(assessment.parameters.find((p: any) => p.key === "PSEUDO_ENDHEFFING_RATE")).toMatchObject({ value: 12, unit: "percent_per_year" });
    expect((assessment.inputs as any).vehicle.catalogValue).toBe("36000.00");
    expect((assessment.inputs as any).period.privateUse).toBe("yes");
    expect(assessment.inputHash).toHaveLength(64);
  });

  it("does not write a second row when nothing changed", async () => {
    await publishFixtureVersion("wet", "2027-01-01");
    const { period } = await readyPeriod();
    const first = await assessUsagePeriod(period.id, { trigger: "nightly", calculationDate: "2027-03-15" });
    const second = await assessUsagePeriod(period.id, { trigger: "nightly", calculationDate: "2027-03-15" });
    expect(second.created).toBe(false);
    expect(second.assessment.id).toBe(first.assessment.id);
    const rows = await db.select().from(fiscalAssessments).where(eq(fiscalAssessments.usagePeriodId, period.id));
    expect(rows).toHaveLength(1);
  });

  it("a changed fact yields a new row that supersedes the old one, which stays exactly as it was", async () => {
    await publishFixtureVersion("wet", "2027-01-01");
    const { period, vehicle } = await readyPeriod();
    const first = (await assessUsagePeriod(period.id, { trigger: "nightly", calculationDate: "2027-03-15" })).assessment;
    await applyManualOverride(vehicle.id, { field: "catalogValue", value: "48000", reason: "correctie" }, FIXTURE_ACTOR);
    const second = (await assessUsagePeriod(period.id, { trigger: "event", calculationDate: "2027-03-15" })).assessment;
    expect(second.id).not.toBe(first.id);
    expect(second).toMatchObject({ sequence: 2, supersedesId: first.id, amount: "480.00" });
    const [old] = await db.select().from(fiscalAssessments).where(eq(fiscalAssessments.id, first.id));
    expect(old).toEqual(first);
    expect((await latestAssessmentForPeriod(period.id))?.id).toBe(second.id);
  });

  it("a recalculation with a reason always writes a new row and is audited", async () => {
    await publishFixtureVersion("wet", "2027-01-01");
    const { period } = await readyPeriod();
    const first = (await assessUsagePeriod(period.id, { trigger: "nightly", calculationDate: "2027-03-15" })).assessment;
    const again = await assessUsagePeriod(period.id, { trigger: "recalculation", calculationDate: "2027-03-15", actor: FIXTURE_ACTOR, reason: "controle na klantvraag" });
    expect(again.created).toBe(true);
    expect(again.assessment).toMatchObject({ sequence: 2, supersedesId: first.id, trigger: "recalculation", requestReason: "controle na klantvraag", requestedByName: FIXTURE_ACTOR.username });
    const events = await db.select().from(fiscalAuditEvents).where(and(eq(fiscalAuditEvents.entityType, "assessment"), eq(fiscalAuditEvents.entityId, again.assessment.id)));
    expect(events.map((e) => e.action)).toContain("recalculation_requested");
    await expect(assessUsagePeriod(period.id, { trigger: "recalculation", calculationDate: "2027-03-15", actor: FIXTURE_ACTOR })).rejects.toThrow(/reden/i);
  });
});

describe("beoordeling — historie en versies", () => {
  it("publishing a later version leaves earlier assessments untouched and is used for later dates", async () => {
    const v1 = await publishFixtureVersion("v1", "2027-01-01");
    const { period } = await readyPeriod();
    const before = (await assessUsagePeriod(period.id, { trigger: "nightly", calculationDate: "2027-03-15" })).assessment;
    const v2 = await publishFixtureVersion("v2", "2028-01-01", { PSEUDO_ENDHEFFING_RATE: 15 });
    const [stillThere] = await db.select().from(fiscalAssessments).where(eq(fiscalAssessments.id, before.id));
    expect(stillThere).toEqual(before);
    expect(stillThere.ruleVersionId).toBe(v1.id);
    // Same period, assessed on a 2028 date: the 2028 version applies (the months of 2027 lie in v1's window and are marked as such).
    const later = (await assessUsagePeriod(period.id, { trigger: "manual", calculationDate: "2028-02-01" })).assessment;
    expect(later.ruleVersionId).toBe(v2.id);
    expect(later.sequence).toBe(2);
  });

  it("records a rule-not-available result when no version is published", async () => {
    const { period } = await readyPeriod();
    const { assessment } = await assessUsagePeriod(period.id, { trigger: "manual", calculationDate: "2027-03-15" });
    expect(assessment.status).toBe("RULE_NOT_AVAILABLE");
    expect(assessment.ruleVersionId).toBeNull();
    expect(assessment.amount).toBeNull();
    expect(assessment.explanation).toContain("Geen regelversie beschikbaar");
  });

  it("assesses an open-ended period up to the configured horizon", async () => {
    await publishFixtureVersion("wet", "2027-01-01");
    const { period } = await readyPeriod({ endDate: null });
    const { assessment } = await assessUsagePeriod(period.id, { trigger: "nightly", calculationDate: "2027-03-15" });
    expect(assessment.periodEnd).toBeNull();
    expect(assessment.periodEndEffective).toBe("2027-04-15");
    expect(assessment.dataQuality).toBe("partial");
    expect(assessment.status).toBe("APPLICABLE");
  });
});

describe("beoordeling — beoordelingszaken", () => {
  it("opens one case for missing data and closes it by itself once the data is complete", async () => {
    await publishFixtureVersion("wet", "2027-01-01");
    const { period, vehicle } = await readyPeriod({ catalog: null });
    const first = (await assessUsagePeriod(period.id, { trigger: "nightly", calculationDate: "2027-03-15", actor: FIXTURE_ACTOR })).assessment;
    expect(first.status).toBe("DATA_INSUFFICIENT");
    let cases = await db.select().from(fiscalReviewCases).where(eq(fiscalReviewCases.usagePeriodId, period.id));
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ status: "open", assessmentId: first.id });
    expect(cases[0].reasons).toContain("catalog_value_missing");

    // Still missing: the same case is kept, not a second one.
    await assessUsagePeriod(period.id, { trigger: "nightly", calculationDate: "2027-03-16", actor: FIXTURE_ACTOR });
    cases = await db.select().from(fiscalReviewCases).where(eq(fiscalReviewCases.usagePeriodId, period.id));
    expect(cases).toHaveLength(1);

    await applyManualOverride(vehicle.id, { field: "catalogValue", value: "36000", reason: "factuur" }, FIXTURE_ACTOR);
    const fixed = (await assessUsagePeriod(period.id, { trigger: "event", calculationDate: "2027-03-16", actor: FIXTURE_ACTOR })).assessment;
    expect(fixed.status).toBe("APPLICABLE");
    cases = await db.select().from(fiscalReviewCases).where(eq(fiscalReviewCases.usagePeriodId, period.id));
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ status: "resolved", resolution: "data_completed", resolvedByName: "systeem" });
  });

  it("opens a case when a human must decide and audits it", async () => {
    await publishFixtureVersion("wet", "2027-01-01");
    const { period, reservation } = await readyPeriod({ confirm: false });
    await confirmUsage(reservation.id, { privateUse: "yes", commuting: "no", providedBeforeCutoff: "no", usageType: "manual_review" }, { kind: "staff", actor: FIXTURE_ACTOR });
    const { assessment } = await assessUsagePeriod(period.id, { trigger: "manual", calculationDate: "2027-03-15", actor: FIXTURE_ACTOR });
    expect(assessment.status).toBe("MANUAL_REVIEW_REQUIRED");
    const [c] = await db.select().from(fiscalReviewCases).where(eq(fiscalReviewCases.usagePeriodId, period.id));
    expect(c.reasons).toContain("usage_manual_review");
    const events = await db.select().from(fiscalAuditEvents).where(and(eq(fiscalAuditEvents.entityType, "review_case"), eq(fiscalAuditEvents.entityId, c.id)));
    expect(events.map((e) => e.action)).toContain("review_opened");
  });
});
