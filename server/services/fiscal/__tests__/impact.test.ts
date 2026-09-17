/**
 * The impact preview: what a draft version would do to every customer with
 * the fiscal check switched on, against what the published configuration
 * does today. An estimate, never stored as an assessment, always labelled.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "../../../db";
import { portalCustomerSettings, fiscalAssessments, fiscalAuditEvents } from "../../../../shared/schema";
import { eq, and } from "drizzle-orm";
import { runImpactPreview, startImpactPreview, getImpactState } from "../impact";
import { createDraft, updateDraft, setParameters, submitVersion, approveVersion, publishVersion } from "../rule-versions";
import { syncUsagePeriodForReservation, confirmUsage } from "../usage-periods";
import { ensureProfile, applyManualOverride } from "../profiles";
import { clearFiscalResolveCache } from "../resolve";
import { agentFor, cleanupFixtureUsers } from "../../../__tests__/helpers/app";
import { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures, FIXTURE_PREFIX } from "../../../__tests__/helpers/fixtures";
import { cleanupFiscalFixtures, FIXTURE_ACTOR, FIXTURE_PARAMETER_VALUES } from "../../../__tests__/helpers/fiscal";

const RULE = "pseudo_eindheffing_fossiel" as const;

async function draft(title: string, effectiveFrom: string, overrides: Record<string, unknown> = {}) {
  const v = await createDraft({ ruleKey: RULE, title: `${FIXTURE_PREFIX}${title}`, reasonCategory: "legislative_change", reasonText: "impact voor de test" }, FIXTURE_ACTOR);
  await updateDraft(v.id, { effectiveFrom, sourceOrganisation: "Rijksoverheid", sourceUrl: "https://ondernemersplein.overheid.nl/", legalReference: "art. 32bc Wet LB 1964" }, FIXTURE_ACTOR);
  await setParameters(v.id, Object.entries({ ...FIXTURE_PARAMETER_VALUES, ...overrides }).map(([key, value]) => ({ key, value })), FIXTURE_ACTOR);
  return v;
}

async function publish(title: string, effectiveFrom: string, overrides: Record<string, unknown> = {}) {
  const v = await draft(title, effectiveFrom, overrides);
  await submitVersion(v.id, FIXTURE_ACTOR);
  await approveVersion(v.id, FIXTURE_ACTOR);
  const p = await publishVersion(v.id, FIXTURE_ACTOR);
  clearFiscalResolveCache();
  return p;
}

async function customerWithPeriod(enabled: boolean, startDate = "2027-03-01", endDate = "2027-03-31") {
  const customer = await createFixtureCustomer();
  await db.insert(portalCustomerSettings).values({ customerId: customer.id, fiscalMobilityEnabled: enabled });
  const vehicle = await createFixtureVehicle({ fuel: "Gasoline", productionDate: "2024-05-01" });
  await ensureProfile(vehicle.id);
  await applyManualOverride(vehicle.id, { field: "europeanCategory", value: "M1", reason: "kentekenbewijs" }, FIXTURE_ACTOR);
  await applyManualOverride(vehicle.id, { field: "catalogValue", value: "36000", reason: "factuur" }, FIXTURE_ACTOR);
  const r = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate, endDate });
  await syncUsagePeriodForReservation(r.id);
  await confirmUsage(r.id, { privateUse: "yes", commuting: "no", providedBeforeCutoff: "no", usageType: "business_private" }, { kind: "staff", actor: FIXTURE_ACTOR });
  return { customer, vehicle, reservation: r };
}

beforeAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
  await cleanupFixtureUsers();
});
afterAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
  await cleanupFixtureUsers();
});
beforeEach(async () => {
  // Every case builds its own population: the counts below are exact.
  await cleanupFixtures();
  await cleanupFiscalFixtures();
  clearFiscalResolveCache();
});

describe("impactvoorbeeld", () => {
  it("compares a draft against the published configuration over the customers that have the check switched on", async () => {
    await publish("wet", "2027-01-01");
    await customerWithPeriod(true);
    await customerWithPeriod(true);
    await customerWithPeriod(false);
    const d = await draft("hoger", "2027-01-01", { PSEUDO_ENDHEFFING_RATE: 15 });

    const result = await runImpactPreview(d.id, FIXTURE_ACTOR);
    expect(result).toMatchObject({ isEstimate: true, versionId: d.id, customers: 2, vehicles: 2, periods: 2, currentTotal: "720.00", draftTotal: "900.00", difference: "180.00", manualReview: 0, dataInsufficient: 0 });
    expect(result.byStatus.APPLICABLE).toBe(2);
    expect(result.windowFrom).toBe("2027-01-01");
    // Nothing was stored as an assessment.
    expect(await db.select().from(fiscalAssessments)).toHaveLength(0);
    const events = await db.select().from(fiscalAuditEvents).where(and(eq(fiscalAuditEvents.ruleVersionId, d.id), eq(fiscalAuditEvents.action, "impact_previewed")));
    expect(events).toHaveLength(1);
  });

  it("counts the cases a human would have to look at, and reports zero current when nothing is published", async () => {
    const { vehicle } = await customerWithPeriod(true);
    await applyManualOverride(vehicle.id, { field: "catalogValue", value: "1", reason: "x" }, FIXTURE_ACTOR);
    // A second customer whose vehicle has no catalogue value at all.
    const customer = await createFixtureCustomer();
    await db.insert(portalCustomerSettings).values({ customerId: customer.id, fiscalMobilityEnabled: true });
    const bare = await createFixtureVehicle({ fuel: "Gasoline", productionDate: "2024-05-01" });
    await ensureProfile(bare.id);
    await applyManualOverride(bare.id, { field: "europeanCategory", value: "M1", reason: "kentekenbewijs" }, FIXTURE_ACTOR);
    const r = await createFixtureReservation({ customerId: customer.id, vehicleId: bare.id, startDate: "2027-04-01", endDate: "2027-04-10" });
    await syncUsagePeriodForReservation(r.id);
    const d = await draft("concept", "2027-01-01");

    const result = await runImpactPreview(d.id, FIXTURE_ACTOR);
    expect(result.currentTotal).toBe("0.00");
    expect(result.currentVersionId).toBeNull();
    expect(result.dataInsufficient).toBe(1);
    expect(result.periods).toBe(2);
  });

  it("refuses a draft that is not complete enough to calculate with", async () => {
    const v = await createDraft({ ruleKey: RULE, title: `${FIXTURE_PREFIX}leeg`, reasonCategory: "other", reasonText: "leeg concept voor de test" }, FIXTURE_ACTOR);
    await expect(runImpactPreview(v.id, FIXTURE_ACTOR)).rejects.toThrow(/ingangsdatum|parameter/i);
  });

  it("runs in the background with a status to poll, over the API", async () => {
    await publish("wet", "2027-01-01");
    await customerWithPeriod(true);
    const d = await draft("api", "2027-01-01", { PSEUDO_ENDHEFFING_RATE: 15 });
    const preparer = await agentFor(["view_fiscal", "manage_fiscal_configuration"]);
    const viewer = await agentFor(["view_fiscal"]);

    expect((await viewer.post(`/api/fiscal/rule-versions/${d.id}/impact`)).status).toBe(403);
    const started = await preparer.post(`/api/fiscal/rule-versions/${d.id}/impact`);
    expect(started.status).toBe(202);
    let state = getImpactState(d.id);
    for (let i = 0; i < 50 && (!state || state.running); i++) {
      await new Promise((r) => setTimeout(r, 100));
      state = getImpactState(d.id);
    }
    const polled = await preparer.get(`/api/fiscal/rule-versions/${d.id}/impact`);
    expect(polled.status).toBe(200);
    expect(polled.body.running).toBe(false);
    expect(polled.body.result).toMatchObject({ isEstimate: true, draftTotal: "450.00", currentTotal: "360.00" });
    expect((await preparer.get(`/api/fiscal/rule-versions/999999/impact`)).status).toBe(404);
  });

  it("does not start twice at the same time", async () => {
    await publish("wet", "2027-01-01");
    await customerWithPeriod(true);
    const d = await draft("twee", "2027-01-01");
    const first = startImpactPreview(d.id, FIXTURE_ACTOR);
    expect(first.started).toBe(true);
    expect(startImpactPreview(d.id, FIXTURE_ACTOR).started).toBe(false);
    await first.done;
    expect(getImpactState(d.id)?.running).toBe(false);
  });
});
