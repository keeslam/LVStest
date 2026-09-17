/**
 * The customer's side of the fiscal check (docs/fiscaal §4.6–4.7):
 * every route scoped to the customer of the session, the driver role
 * narrowed to its own rentals and gated by the customer's switch, amounts
 * only behind `fiscal_dashboard_enabled` (besluit F-05), and confirmation of
 * usage by the customer administrator only (besluit F-02).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { db } from "../db";
import { portalCustomerSettings, fiscalAuditEvents } from "../../shared/schema";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "../auth";
import { portalStorage } from "../services/portal-storage";
import { buildPortalTestApp, cleanupPortalTestData, createTestCustomer, createTestDriver, createTestReservation, createTestVehicle, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { createDraft, updateDraft, setParameters, submitVersion, approveVersion, publishVersion } from "../services/fiscal/rule-versions";
import { ensureProfile, applyManualOverride } from "../services/fiscal/profiles";
import { syncUsagePeriodForReservation, confirmUsage } from "../services/fiscal/usage-periods";
import { assessMany } from "../services/fiscal/assess";
import { clearFiscalResolveCache } from "../services/fiscal/resolve";
import { cleanupFiscalFixtures, FIXTURE_ACTOR, FIXTURE_PARAMETER_VALUES } from "./helpers/fiscal";
import { FIXTURE_PREFIX } from "./helpers/fixtures";

const password = "wachtwoord-1234";

async function loginAs(app: any, email: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/portal/login").send({ email, password });
  expect(res.status).toBe(200);
  const { body } = await agent.get("/api/portal/csrf-token");
  return { agent, csrf: body.token as string };
}

async function vehicleM1(catalog: string) {
  const v = await createTestVehicle();
  await ensureProfile(v.id);
  await applyManualOverride(v.id, { field: "europeanCategory", value: "M1", reason: "kentekenbewijs" }, FIXTURE_ACTOR);
  await applyManualOverride(v.id, { field: "catalogValue", value: catalog, reason: "factuur" }, FIXTURE_ACTOR);
  await applyManualOverride(v.id, { field: "firstAdmissionDate", value: "2024-05-01", reason: "kentekenbewijs" }, FIXTURE_ACTOR);
  await applyManualOverride(v.id, { field: "fuelCategory", value: "fossil", reason: "kentekenbewijs" }, FIXTURE_ACTOR);
  return v;
}

describe("portal fiscal routes", () => {
  const app = buildPortalTestApp();
  let a: number, b: number, c: number, driverA: number, rA1: number, rA2: number, rB: number;
  const emailA = `fa@${TEST_EMAIL_DOMAIN}`, emailDriverA = `fda@${TEST_EMAIL_DOMAIN}`, emailB = `fb@${TEST_EMAIL_DOMAIN}`, emailC = `fc@${TEST_EMAIL_DOMAIN}`;

  beforeAll(async () => {
    await cleanupPortalTestData();
    await cleanupFiscalFixtures();
    const v = await createDraft({ ruleKey: "pseudo_eindheffing_fossiel", title: `${FIXTURE_PREFIX}portaal`, reasonCategory: "legislative_change", reasonText: "portaaltest regelversie" }, FIXTURE_ACTOR);
    await updateDraft(v.id, { effectiveFrom: "2027-01-01", sourceOrganisation: "Rijksoverheid", sourceUrl: "https://ondernemersplein.overheid.nl/", legalReference: "art. 32bc Wet LB 1964" }, FIXTURE_ACTOR);
    await setParameters(v.id, Object.entries(FIXTURE_PARAMETER_VALUES).map(([key, value]) => ({ key, value })), FIXTURE_ACTOR);
    await submitVersion(v.id, FIXTURE_ACTOR);
    await approveVersion(v.id, FIXTURE_ACTOR);
    await publishVersion(v.id, FIXTURE_ACTOR);
    clearFiscalResolveCache();

    a = (await createTestCustomer("FA")).id;
    b = (await createTestCustomer("FB")).id;
    c = (await createTestCustomer("FC")).id;
    await db.insert(portalCustomerSettings).values([
      { customerId: a, fiscalMobilityEnabled: true, fiscalDashboardEnabled: false, driverFiscalVisibilityEnabled: false },
      { customerId: b, fiscalMobilityEnabled: true, fiscalDashboardEnabled: true },
      { customerId: c, fiscalMobilityEnabled: false },
    ]);
    driverA = (await createTestDriver(a, "Driver FA")).id;
    const v1 = await vehicleM1("36000");
    const v2 = await vehicleM1("24000");
    rA1 = (await createTestReservation({ customerId: a, vehicleId: v1.id, driverId: driverA, startDate: "2027-03-01", endDate: "2027-03-31" })).id;
    rA2 = (await createTestReservation({ customerId: a, vehicleId: v2.id, startDate: "2027-04-01", endDate: "2027-04-10" })).id;
    rB = (await createTestReservation({ customerId: b, vehicleId: v1.id, startDate: "2027-05-01", endDate: "2027-05-31" })).id;
    for (const id of [rA1, rA2, rB]) await syncUsagePeriodForReservation(id);
    await confirmUsage(rA1, { privateUse: "yes", commuting: "no", providedBeforeCutoff: "no", usageType: "business_private" }, { kind: "staff", actor: FIXTURE_ACTOR });
    await confirmUsage(rB, { privateUse: "yes", commuting: "no", providedBeforeCutoff: "no", usageType: "business_private" }, { kind: "staff", actor: FIXTURE_ACTOR });
    await assessMany({ customerId: a }, { trigger: "manual", calculationDate: "2027-03-15", actor: FIXTURE_ACTOR });
    await assessMany({ customerId: b }, { trigger: "manual", calculationDate: "2027-05-15", actor: FIXTURE_ACTOR });

    for (const [cid, email, role, driverId] of [[a, emailA, "admin", null], [a, emailDriverA, "driver", driverA], [b, emailB, "admin", null], [c, emailC, "admin", null]] as const) {
      const u = await portalStorage.createPortalUser({ customerId: cid, email, fullName: "U", role, driverId }, "t");
      await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword(password) });
    }
  });

  afterAll(async () => {
    await cleanupPortalTestData();
    await cleanupFiscalFixtures();
  });

  it("lists the customer's own periods with Dutch statuses, without amounts unless the dashboard is on", async () => {
    const { agent } = await loginAs(app, emailA);
    const res = await agent.get("/api/portal/fiscal/vehicles");
    expect(res.status).toBe(200);
    const periods = res.body.flatMap((v: any) => v.periods);
    expect(periods.map((p: any) => p.reservationId).sort()).toEqual([rA1, rA2].sort());
    const confirmed = periods.find((p: any) => p.reservationId === rA1);
    expect(confirmed.status).toBe("APPLICABLE");
    expect(confirmed.statusLabel).toBe("Van toepassing");
    expect(confirmed).not.toHaveProperty("amount");
    expect(confirmed.explanation).not.toContain("€");
    expect(confirmed.explanation).toContain("Status: Van toepassing");
    const open = periods.find((p: any) => p.reservationId === rA2);
    expect(open.status).toBe("POSSIBLY_APPLICABLE");
    expect(open.needsInput).toBe(true);

    const bAgent = (await loginAs(app, emailB)).agent;
    const bRes = await bAgent.get("/api/portal/fiscal/vehicles");
    const bPeriod = bRes.body.flatMap((v: any) => v.periods)[0];
    expect(bPeriod.reservationId).toBe(rB);
    expect(bPeriod.amount).toBe("360.00");
    expect(bPeriod.explanation).toContain("€ 360,00");
  });

  it("never shows another customer's reservation", async () => {
    const { agent } = await loginAs(app, emailA);
    expect((await agent.get(`/api/portal/fiscal/reservations/${rB}`)).status).toBe(404);
    expect((await agent.get(`/api/portal/fiscal/reservations/${rA1}`)).status).toBe(200);
  });

  it("is closed for a customer without the switch", async () => {
    const { agent } = await loginAs(app, emailC);
    const res = await agent.get("/api/portal/fiscal/vehicles");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PORTAL_FEATURE_DISABLED");
    expect((await agent.get("/api/portal/fiscal/summary")).status).toBe(403);
  });

  it("a driver sees nothing until the customer allows it, and then only their own rentals", async () => {
    const { agent } = await loginAs(app, emailDriverA);
    expect((await agent.get("/api/portal/fiscal/vehicles")).status).toBe(403);
    await db.update(portalCustomerSettings).set({ driverFiscalVisibilityEnabled: true }).where(eq(portalCustomerSettings.customerId, a));
    const res = await agent.get("/api/portal/fiscal/vehicles");
    expect(res.status).toBe(200);
    const periods = res.body.flatMap((v: any) => v.periods);
    expect(periods.map((p: any) => p.reservationId)).toEqual([rA1]);
    await db.update(portalCustomerSettings).set({ driverFiscalVisibilityEnabled: false }).where(eq(portalCustomerSettings.customerId, a));
  });

  it("the customer administrator confirms usage; a driver may not; another customer cannot reach it", async () => {
    const admin = await loginAs(app, emailA);
    const body = { privateUse: "yes", commuting: "yes", providedBeforeCutoff: "no", usageType: "business_commuting" };
    const res = await admin.agent.patch(`/api/portal/fiscal/reservations/${rA2}/usage`).set("X-CSRF-Token", admin.csrf).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reservationId: rA2, privateUse: "yes", commuting: "yes", confirmedByKind: "portal", status: "APPLICABLE" });
    const events = await db.select().from(fiscalAuditEvents).where(and(eq(fiscalAuditEvents.username, emailA), eq(fiscalAuditEvents.action, "usage_confirmed")));
    expect(events).toHaveLength(1);
    expect(events[0].role).toBe("portal_admin");

    const driver = await loginAs(app, emailDriverA);
    expect((await driver.agent.patch(`/api/portal/fiscal/reservations/${rA1}/usage`).set("X-CSRF-Token", driver.csrf).send(body)).status).toBe(403);
    expect((await admin.agent.patch(`/api/portal/fiscal/reservations/${rB}/usage`).set("X-CSRF-Token", admin.csrf).send(body)).status).toBe(404);
    expect((await admin.agent.patch(`/api/portal/fiscal/reservations/${rA1}/usage`).set("X-CSRF-Token", admin.csrf).send({ ...body, privateUse: "maybe" })).status).toBe(400);
  });

  it("summarises the customer's periods per status", async () => {
    const { agent } = await loginAs(app, emailB);
    const res = await agent.get("/api/portal/fiscal/summary");
    expect(res.status).toBe(200);
    expect(res.body.periods).toBe(1);
    expect(res.body.byStatus.APPLICABLE).toBe(1);
    expect(res.body.dashboardEnabled).toBe(true);
  });
});
