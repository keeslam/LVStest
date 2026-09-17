/**
 * The nightly run (besluit F-03): assess the open periods of customers with
 * the fiscal check switched on, and send the notifications of besluit F-06 —
 * to staff, and to customers who have warnings switched on — without ever
 * repeating itself.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "../../../db";
import { portalCustomerSettings, portalNotifications, customNotifications, fiscalAssessments, vehicleUsagePeriods } from "../../../../shared/schema";
import { eq, like, inArray } from "drizzle-orm";
import { runNightlyFiscalRun } from "../nightly";
import { createDraft, updateDraft, setParameters, submitVersion, approveVersion, publishVersion } from "../rule-versions";
import { syncUsagePeriodForReservation, confirmUsage } from "../usage-periods";
import { ensureProfile, applyManualOverride } from "../profiles";
import { clearFiscalResolveCache } from "../resolve";
import { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures, FIXTURE_PREFIX } from "../../../__tests__/helpers/fixtures";
import { cleanupFiscalFixtures, FIXTURE_ACTOR, FIXTURE_PARAMETER_VALUES } from "../../../__tests__/helpers/fiscal";

const RULE = "pseudo_eindheffing_fossiel" as const;

async function publish(title: string, effectiveFrom: string) {
  const v = await createDraft({ ruleKey: RULE, title: `${FIXTURE_PREFIX}${title}`, reasonCategory: "legislative_change", reasonText: "nachtelijke run voor de test" }, FIXTURE_ACTOR);
  await updateDraft(v.id, { effectiveFrom, sourceOrganisation: "Rijksoverheid", sourceUrl: "https://ondernemersplein.overheid.nl/", legalReference: "art. 32bc Wet LB 1964" }, FIXTURE_ACTOR);
  await setParameters(v.id, Object.entries(FIXTURE_PARAMETER_VALUES).map(([key, value]) => ({ key, value })), FIXTURE_ACTOR);
  await submitVersion(v.id, FIXTURE_ACTOR);
  await approveVersion(v.id, FIXTURE_ACTOR);
  const p = await publishVersion(v.id, FIXTURE_ACTOR);
  clearFiscalResolveCache();
  return p;
}

async function customer(enabled: boolean, warnings: boolean) {
  const c = await createFixtureCustomer();
  await db.insert(portalCustomerSettings).values({ customerId: c.id, fiscalMobilityEnabled: enabled, fiscalWarningsEnabled: warnings });
  return c;
}

async function vehicleM1(catalog: string | null) {
  const v = await createFixtureVehicle({ fuel: "Gasoline", productionDate: "2024-05-01" });
  await ensureProfile(v.id);
  await applyManualOverride(v.id, { field: "europeanCategory", value: "M1", reason: "kentekenbewijs" }, FIXTURE_ACTOR);
  if (catalog) await applyManualOverride(v.id, { field: "catalogValue", value: catalog, reason: "factuur" }, FIXTURE_ACTOR);
  return v;
}

async function period(customerId: number, vehicleId: number, startDate: string, endDate: string | null, confirm = true, type = "standard") {
  const r = await createFixtureReservation({ customerId, vehicleId, startDate, endDate, type });
  const p = (await syncUsagePeriodForReservation(r.id))!;
  if (confirm) await confirmUsage(r.id, { privateUse: "yes", commuting: "no", providedBeforeCutoff: "no", usageType: "business_private", ...(type === "replacement" ? { replacementReason: "maintenance" as const } : {}) }, { kind: "staff", actor: FIXTURE_ACTOR });
  return p;
}

async function staffNotifications() {
  return db.select().from(customNotifications).where(like(customNotifications.type, "fiscal_%"));
}

beforeAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
  await db.delete(customNotifications).where(like(customNotifications.type, "fiscal_%"));
});
afterAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
  await db.delete(customNotifications).where(like(customNotifications.type, "fiscal_%"));
});
beforeEach(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
  await db.delete(customNotifications).where(like(customNotifications.type, "fiscal_%"));
  clearFiscalResolveCache();
});

describe("nachtelijke run", () => {
  it("assesses the open periods of switched-on customers only, once, and notifies staff and customer of what is missing", async () => {
    await publish("wet", "2027-01-01");
    const on = await customer(true, true);
    const off = await customer(true, false);
    const ignored = await customer(false, true);
    const complete = await period(on.id, (await vehicleM1("36000")).id, "2027-03-01", "2027-03-31");
    const missing = await period(on.id, (await vehicleM1(null)).id, "2027-03-05", "2027-03-20");
    const quiet = await period(off.id, (await vehicleM1(null)).id, "2027-03-05", "2027-03-20");
    const skipped = await period(ignored.id, (await vehicleM1("36000")).id, "2027-03-01", "2027-03-31");

    const first = await runNightlyFiscalRun({ today: "2027-03-15", refreshProfiles: false, actor: FIXTURE_ACTOR });
    expect(first.customers).toBe(2);
    expect(first.periodsAssessed).toBe(3);
    expect(first.assessmentsCreated).toBe(3);
    expect((await db.select().from(fiscalAssessments).where(eq(fiscalAssessments.usagePeriodId, skipped.id))).length).toBe(0);
    expect((await db.select().from(fiscalAssessments).where(eq(fiscalAssessments.usagePeriodId, complete.id)))[0].status).toBe("APPLICABLE");

    // Staff: one "data missing" per period that needs it.
    const staff = await staffNotifications();
    expect(staff.filter((n) => n.type === "fiscal_data_missing")).toHaveLength(2);
    // Customer: only where warnings are on.
    const forOn = await db.select().from(portalNotifications).where(eq(portalNotifications.customerId, on.id));
    expect(forOn.map((n) => n.type)).toEqual(["fiscal_data_missing"]);
    expect(forOn[0].dedupeTag).toBe(`fiscal:${missing.id}:missing`);
    expect(await db.select().from(portalNotifications).where(eq(portalNotifications.customerId, off.id))).toHaveLength(0);
    expect(first.customerNotifications).toBe(1);
    expect(quiet.id).toBeGreaterThan(0);

    // The next night: nothing changed, nothing is written or sent again.
    const second = await runNightlyFiscalRun({ today: "2027-03-16", refreshProfiles: false, actor: FIXTURE_ACTOR });
    expect(second.assessmentsCreated).toBe(0);
    expect(second.staffNotifications).toBe(0);
    expect(second.customerNotifications).toBe(0);
    expect(await staffNotifications()).toHaveLength(2);
  });

  it("warns a customer when a replacement approaches its exemption limit, once", async () => {
    await publish("wet", "2027-01-01");
    const on = await customer(true, true);
    const vehicle = await vehicleM1("36000");
    // A replacement that began 12 days ago, open-ended: the 14-day limit is 2 days away (warn 3 days before).
    const p = await period(on.id, vehicle.id, "2027-03-03", null, true, "replacement");
    const run = await runNightlyFiscalRun({ today: "2027-03-15", refreshProfiles: false, actor: FIXTURE_ACTOR });
    expect(run.periodsAssessed).toBe(1);
    const rows = await db.select().from(portalNotifications).where(eq(portalNotifications.customerId, on.id));
    expect(rows.map((n) => n.type)).toContain("fiscal_limit_warning");
    expect(rows.find((n) => n.type === "fiscal_limit_warning")?.dedupeTag).toBe(`fiscal:${p.id}:limit`);
    await runNightlyFiscalRun({ today: "2027-03-16", refreshProfiles: false, actor: FIXTURE_ACTOR });
    expect((await db.select().from(portalNotifications).where(eq(portalNotifications.customerId, on.id))).filter((n) => n.type === "fiscal_limit_warning")).toHaveLength(1);
  });

  it("tells staff once when a version becomes active today", async () => {
    const v = await publish("nieuw", "2027-01-01");
    await customer(true, true);
    const run = await runNightlyFiscalRun({ today: "2027-01-01", refreshProfiles: false, actor: FIXTURE_ACTOR });
    expect(run.versionsActivated).toBe(1);
    const again = await runNightlyFiscalRun({ today: "2027-01-01", refreshProfiles: false, actor: FIXTURE_ACTOR });
    expect(again.versionsActivated).toBe(0);
    const staff = (await staffNotifications()).filter((n) => n.type === "fiscal_version_active");
    expect(staff).toHaveLength(1);
    expect(staff[0].description).toContain(`${FIXTURE_PREFIX}nieuw`);
    expect(staff[0].link).toContain(String(v.id));
  });

  it("refreshes stale profiles from RDW with the injected fetch", async () => {
    await publish("wet", "2027-01-01");
    const on = await customer(true, false);
    const vehicle = await createFixtureVehicle({ fuel: null });
    await period(on.id, vehicle.id, "2027-03-01", "2027-03-31");
    const fetchImpl = (async (url: string | URL) => {
      const rows = String(url).includes("m9d7-ebf2")
        ? [{ kenteken: "FIXT", catalogusprijs: "25000", europese_voertuigcategorie: "M1", voertuigsoort: "Personenauto", datum_eerste_toelating: "20230101" }]
        : [{ brandstof_omschrijving: "Diesel", emissie_co2_gecombineerd_wltp: "140" }];
      return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    const run = await runNightlyFiscalRun({ today: "2027-03-15", refreshProfiles: true, fetchImpl, pauseMs: 0, actor: FIXTURE_ACTOR });
    expect(run.profilesRefreshed).toBe(1);
    const [assessment] = await db.select().from(fiscalAssessments).where(inArray(fiscalAssessments.vehicleId, [vehicle.id]));
    expect(assessment.status).toBe("APPLICABLE");
    expect(assessment.amount).toBe("250.00");
  });
});

describe("nachtelijke run — herstelronde", () => {
  it("derives the period of a reservation that was written past the storage hooks, then assesses it", async () => {
    await publish("wet-herstel", "2027-01-01");
    const on = await customer(true, false);
    const v = await vehicleM1("36000");
    const r = await createFixtureReservation({ customerId: on.id, vehicleId: v.id, startDate: "2027-03-01", endDate: "2027-03-31" });
    const run = await runNightlyFiscalRun({ today: "2027-03-15", refreshProfiles: false, actor: FIXTURE_ACTOR });
    expect(run.periodsReconciled).toBeGreaterThanOrEqual(1);
    expect(run.periodsAssessed).toBe(1);
    const [period] = await db.select().from(vehicleUsagePeriods).where(eq(vehicleUsagePeriods.reservationId, r.id));
    expect(period).toBeDefined();
    expect((await db.select().from(fiscalAssessments).where(eq(fiscalAssessments.usagePeriodId, period.id))).length).toBe(1);
  });
});
