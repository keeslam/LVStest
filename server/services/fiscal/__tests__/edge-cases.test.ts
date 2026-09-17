/**
 * Edge cases over month and year boundaries (stap 6). The pure rule is run
 * with the test's own parameter values — nothing here is a claim about the
 * law — and the nightly run is checked for the one thing it must do at a
 * month rollover: fix the month that ended, once.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "../../../db";
import { fiscalAssessments, portalCustomerSettings } from "../../../../shared/schema";
import { eq } from "drizzle-orm";
import { evaluatePseudoEindheffing, type FiscalInput } from "../rules/pseudo-eindheffing";
import { ParameterSet } from "../parameters";
import { definitionsForRule } from "../definitions";
import { runNightlyFiscalRun } from "../nightly";
import { createDraft, updateDraft, setParameters, submitVersion, approveVersion, publishVersion } from "../rule-versions";
import { syncUsagePeriodForReservation, confirmUsage } from "../usage-periods";
import { ensureProfile, applyManualOverride } from "../profiles";
import { clearFiscalResolveCache } from "../resolve";
import { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures, FIXTURE_PREFIX } from "../../../__tests__/helpers/fixtures";
import { cleanupFiscalFixtures, FIXTURE_ACTOR, FIXTURE_PARAMETER_VALUES } from "../../../__tests__/helpers/fiscal";

const RULE = "pseudo_eindheffing_fossiel" as const;

function params(overrides: Record<string, unknown> = {}): ParameterSet {
  return ParameterSet.fromValues(definitionsForRule(RULE), { ...FIXTURE_PARAMETER_VALUES, ...overrides });
}

type PeriodOverrides = Partial<FiscalInput["period"]>;

function input(calculationDate: string, period: PeriodOverrides, extra: Partial<Omit<FiscalInput, "period">> = {}): FiscalInput {
  return {
    calculationDate,
    ruleVersion: { effectiveFrom: "2027-01-01", effectiveUntil: null },
    customer: { id: 1, customerType: "business" },
    vehicle: {
      id: 10,
      licensePlate: "AB-123-C",
      europeanCategory: "M1",
      vehicleKind: "Personenauto",
      fuelCategory: "fossil",
      co2GKm: 120,
      firstAdmissionDate: "2024-05-01",
      catalogValue: "36000.00",
      marketValue: null,
      isDrivingSchoolManual: false,
    },
    priorPeriods: { samePlate: [], sameCustomer: [], sameDriver: [] },
    ...extra,
    period: {
      id: 100,
      startDate: "2027-03-01",
      endDate: "2027-03-31",
      endDateEffective: "2027-03-31",
      usageType: "business_private",
      privateUse: "yes",
      commuting: "no",
      isPool: false,
      driverCount: 1,
      isReplacement: false,
      replacementReason: "unknown",
      providedBeforeCutoff: "no",
      closedReason: null,
      ended: false,
      ...period,
    },
  };
}

describe("randgevallen — maand- en jaargrenzen (zuivere regel)", () => {
  it("an open-ended period across the year end: December settled in the January run, per-year sums split", () => {
    const v = evaluatePseudoEindheffing(input("2028-01-05", { startDate: "2027-12-20", endDate: null, endDateEffective: "2028-01-31" }), params());
    expect(v.months.map((m) => [m.month, m.settled, m.amount])).toEqual([["2027-12", true, "360.00"], ["2028-01", false, "360.00"]]);
    expect(v.settledAmount).toBe("360.00");
    expect(v.provisionalAmount).toBe("360.00");
  });

  it("a booking that starts after the calculation month is assessed on its own start day only, all provisional", () => {
    const v = evaluatePseudoEindheffing(input("2027-03-15", { startDate: "2027-06-10", endDate: null, endDateEffective: "2027-06-10" }), params());
    expect(v.months.map((m) => [m.month, m.settled])).toEqual([["2027-06", false]]);
    expect(v.settledAmount).toBe("0.00");
  });

  it("pro rata in a leap-year February counts 29 days", () => {
    const v = evaluatePseudoEindheffing(input("2028-03-05", { startDate: "2028-02-01", endDate: "2028-02-29", endDateEffective: "2028-02-29", ended: true }), params({ PARTIAL_PERIOD_RULE: "pro_rata" }));
    expect(v.months).toEqual([{ month: "2028-02", days: 29, charged: true, reason: "charged", amount: "360.00", settled: true }]);
    const half = evaluatePseudoEindheffing(input("2028-03-05", { startDate: "2028-02-15", endDate: "2028-02-29", endDateEffective: "2028-02-29", ended: true }), params({ PARTIAL_PERIOD_RULE: "pro_rata" }));
    // 36 000 × 12 % / 12 × 15/29 = 186,21
    expect(half.months[0].amount).toBe("186.21");
  });

  it("a replacement car whose exemption ends inside the next month leaves the rest of that month chargeable", () => {
    const v = evaluatePseudoEindheffing(
      input("2027-04-20", { startDate: "2027-03-25", endDate: "2027-04-15", endDateEffective: "2027-04-15", isReplacement: true, replacementReason: "repair", ended: true }),
      params(),
    );
    // 14 exempt days: 25 Mar – 7 Apr; 8–15 Apr chargeable, so April counts as a whole month.
    expect(v.months.map((m) => [m.month, m.reason, m.amount])).toEqual([["2027-03", "replacement_exempt", null], ["2027-04", "charged", "360.00"]]);
    expect(v.amount).toBe("360.00");
  });

  it("a short rental that spans the year end is handed to a human instead of being exempted", () => {
    const v = evaluatePseudoEindheffing(input("2028-01-10", { startDate: "2027-12-29", endDate: "2028-01-02", endDateEffective: "2028-01-02", ended: true }), params());
    expect(v.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(v.reviewReasons).toContain("short_term_spans_year");
  });

  it("the transition rule ends on its own date: the months after it are charged", () => {
    const v = evaluatePseudoEindheffing(
      input("2030-11-02", { startDate: "2030-08-01", endDate: "2030-10-31", endDateEffective: "2030-10-31", providedBeforeCutoff: "yes", ended: true }),
      params({ TRANSITION_EXEMPT_UNTIL: "2030-09-17" }),
    );
    expect(v.months.map((m) => [m.month, m.reason])).toEqual([["2030-08", "transition_exempt"], ["2030-09", "charged"], ["2030-10", "charged"]]);
    expect(v.amount).toBe("720.00");
  });

  it("a rule version that ends mid-period flags the period, and the days after it are not charged under this version", () => {
    const v = evaluatePseudoEindheffing(
      input("2027-05-02", { startDate: "2027-03-20", endDate: "2027-04-20", endDateEffective: "2027-04-20", ended: true }, { ruleVersion: { effectiveFrom: "2027-01-01", effectiveUntil: "2027-03-31" } }),
      params(),
    );
    expect(v.months.map((m) => [m.month, m.reason])).toEqual([["2027-03", "charged"], ["2027-04", "after_rule"]]);
    expect(v.reviewReasons).toContain("period_spans_rule_versions");
  });
});

describe("randgevallen — nachtelijke run op de maandgrens", () => {
  async function publish() {
    const v = await createDraft({ ruleKey: RULE, title: `${FIXTURE_PREFIX}randgeval`, reasonCategory: "legislative_change", reasonText: "randgevaltest" }, FIXTURE_ACTOR);
    await updateDraft(v.id, { effectiveFrom: "2027-01-01", sourceOrganisation: "Rijksoverheid", sourceUrl: "https://ondernemersplein.overheid.nl/", legalReference: "art. 32bc Wet LB 1964" }, FIXTURE_ACTOR);
    await setParameters(v.id, Object.entries(FIXTURE_PARAMETER_VALUES).map(([key, value]) => ({ key, value })), FIXTURE_ACTOR);
    await submitVersion(v.id, FIXTURE_ACTOR);
    await approveVersion(v.id, FIXTURE_ACTOR);
    await publishVersion(v.id, FIXTURE_ACTOR);
    clearFiscalResolveCache();
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
    await cleanupFixtures();
    await cleanupFiscalFixtures();
    clearFiscalResolveCache();
  });

  it("fixes the month that ended exactly once: nothing on the 31st, one snapshot on the 1st, nothing on the 2nd", async () => {
    await publish();
    const c = await createFixtureCustomer();
    await db.insert(portalCustomerSettings).values({ customerId: c.id, fiscalMobilityEnabled: true });
    const v = await createFixtureVehicle({ fuel: "Gasoline", productionDate: "2024-05-01" });
    await ensureProfile(v.id);
    await applyManualOverride(v.id, { field: "europeanCategory", value: "M1", reason: "kentekenbewijs" }, FIXTURE_ACTOR);
    await applyManualOverride(v.id, { field: "catalogValue", value: "36000.00", reason: "factuur" }, FIXTURE_ACTOR);
    const r = await createFixtureReservation({ customerId: c.id, vehicleId: v.id, startDate: "2027-03-10", endDate: null });
    const period = (await syncUsagePeriodForReservation(r.id))!;
    await confirmUsage(r.id, { privateUse: "yes", commuting: "no", providedBeforeCutoff: "no", usageType: "business_private" }, { kind: "staff", actor: FIXTURE_ACTOR });

    const run = (today: string) => runNightlyFiscalRun({ today, refreshProfiles: false, actor: FIXTURE_ACTOR });
    expect((await run("2027-03-30")).assessmentsCreated).toBe(1);
    expect((await run("2027-03-31")).assessmentsCreated).toBe(0);
    expect((await run("2027-04-01")).assessmentsCreated).toBe(1);
    expect((await run("2027-04-02")).assessmentsCreated).toBe(0);

    const rows = await db.select().from(fiscalAssessments).where(eq(fiscalAssessments.usagePeriodId, period.id)).orderBy(fiscalAssessments.sequence);
    expect(rows.map((a) => [a.periodEndEffective, a.settledAmount, a.provisionalAmount])).toEqual([
      ["2027-03-31", "0.00", "360.00"],
      ["2027-04-30", "360.00", "360.00"],
    ]);
  });
});
