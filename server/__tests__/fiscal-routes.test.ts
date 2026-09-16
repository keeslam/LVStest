/**
 * The fiscal API: every route behind a permission, the configuration life
 * cycle over HTTP, unauthorized attempts on the audit trail, and an audit
 * trail that no route can change.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { fiscalAuditEvents } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { makeApp, agentFor, anonAgent, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures, FIXTURE_PREFIX } from "./helpers/fixtures";
import { cleanupFiscalFixtures, FIXTURE_ACTOR, FIXTURE_PARAMETER_VALUES } from "./helpers/fiscal";
import { syncUsagePeriodForReservation, confirmUsage } from "../services/fiscal/usage-periods";
import { ensureProfile, applyManualOverride } from "../services/fiscal/profiles";
import { clearFiscalResolveCache } from "../services/fiscal/resolve";

let viewer: TestAgent;
let nobody: TestAgent;
let preparer: TestAgent;
let approver: TestAgent;
let publisher: TestAgent;
let reviewer: TestAgent;
let auditor: TestAgent;

beforeAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
  await cleanupFixtureUsers();
  nobody = await agentFor([]);
  viewer = await agentFor(["view_fiscal"]);
  preparer = await agentFor(["view_fiscal", "manage_fiscal_configuration"]);
  approver = await agentFor(["view_fiscal", "approve_fiscal_configuration"]);
  publisher = await agentFor(["view_fiscal", "publish_fiscal_configuration"]);
  reviewer = await agentFor(["view_fiscal", "manage_fiscal_review"]);
  auditor = await agentFor(["view_fiscal_audit_log"]);
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
  await cleanupFixtureUsers();
});

const parameterBody = () => Object.entries(FIXTURE_PARAMETER_VALUES).map(([key, value]) => ({ key, value }));

describe("fiscale API — toegang", () => {
  it("answers 401 without a session and 403 without the right", async () => {
    const anon = await anonAgent();
    expect((await anon.get("/api/fiscal/configuration")).status).toBe(401);
    expect((await nobody.get("/api/fiscal/configuration")).status).toBe(403);
    expect((await viewer.get("/api/fiscal/configuration")).status).toBe(200);
  });

  it("serves the definitions to a viewer", async () => {
    const res = await viewer.get("/api/fiscal/definitions");
    expect(res.status).toBe(200);
    expect(res.body.parameters).toHaveLength(27);
    expect(res.body.rules[0].key).toBe("pseudo_eindheffing_fossiel");
  });

  it("a viewer cannot create a draft, and the attempt is on the audit trail", async () => {
    const res = await viewer.post("/api/fiscal/rule-versions").send({ ruleKey: "pseudo_eindheffing_fossiel", title: `${FIXTURE_PREFIX}x`, reasonCategory: "other", reasonText: "poging zonder recht" });
    expect(res.status).toBe(403);
    const events = await db.select().from(fiscalAuditEvents).where(and(eq(fiscalAuditEvents.username, viewer.username), eq(fiscalAuditEvents.action, "unauthorized_attempt")));
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].details).toMatchObject({ method: "POST", path: "/api/fiscal/rule-versions" });
  });

  it("no route can change or remove the audit trail", async () => {
    const app: any = await makeApp();
    const mutating: string[] = [];
    for (const layer of app._router.stack) {
      if (!layer.route) continue;
      if (!String(layer.route.path).startsWith("/api/fiscal/audit")) continue;
      for (const method of Object.keys(layer.route.methods)) {
        if (method !== "get") mutating.push(`${method.toUpperCase()} ${layer.route.path}`);
      }
    }
    expect(mutating).toEqual([]);
  });
});

describe("fiscale API — configuratie", () => {
  it("walks a version from draft to published with the separate rights", async () => {
    const created = await preparer.post("/api/fiscal/rule-versions").send({ ruleKey: "pseudo_eindheffing_fossiel", title: `${FIXTURE_PREFIX}api`, reasonCategory: "legislative_change", reasonText: "Belastingplan 2026 via de API" });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect(created.body.status).toBe("draft");

    const patched = await preparer.patch(`/api/fiscal/rule-versions/${id}`).send({ effectiveFrom: "2027-01-01", sourceOrganisation: "Rijksoverheid", sourceUrl: "https://ondernemersplein.overheid.nl/", legalReference: "art. 32bc Wet LB 1964" });
    expect(patched.status).toBe(200);

    const params = await preparer.put(`/api/fiscal/rule-versions/${id}/parameters`).send(parameterBody());
    expect(params.status).toBe(200);
    expect(params.body.validation.ok).toBe(true);
    expect(params.body.values.PSEUDO_ENDHEFFING_RATE).toBe(12);

    const detail = await viewer.get(`/api/fiscal/rule-versions/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.values.REPLACEMENT_VEHICLE_EXEMPTION_DAYS).toBe(14);
    expect(detail.body.validation.ok).toBe(true);

    expect((await preparer.post(`/api/fiscal/rule-versions/${id}/submit`)).body.status).toBe("in_review");
    expect((await preparer.post(`/api/fiscal/rule-versions/${id}/approve`)).status).toBe(403);
    expect((await approver.post(`/api/fiscal/rule-versions/${id}/approve`)).body.status).toBe("approved");
    expect((await approver.post(`/api/fiscal/rule-versions/${id}/publish`).send({ confirm: true })).status).toBe(403);
    expect((await publisher.post(`/api/fiscal/rule-versions/${id}/publish`).send({})).status).toBe(400);
    const published = await publisher.post(`/api/fiscal/rule-versions/${id}/publish`).send({ confirm: true });
    expect(published.status).toBe(200);
    expect(published.body.status).toBe("published");

    // Effective 2027-01-01: "current" once that day has come, "upcoming" before it.
    const config = await viewer.get("/api/fiscal/configuration");
    const rule = config.body.rules[0];
    expect([rule.current, ...rule.upcoming].some((v: any) => v?.id === id)).toBe(true);

    const audit = await auditor.get(`/api/fiscal/audit?ruleVersionId=${id}`);
    expect(audit.status).toBe(200);
    expect(audit.body.map((e: any) => e.action)).toEqual(expect.arrayContaining(["draft_created", "submitted", "approved", "published"]));
    expect((await viewer.get(`/api/fiscal/audit?ruleVersionId=${id}`)).status).toBe(403);

    expect((await preparer.patch(`/api/fiscal/rule-versions/${id}`).send({ title: "x" })).status).toBe(409);
  });

  it("validates bodies and reports problems as fields", async () => {
    const bad = await preparer.post("/api/fiscal/rule-versions").send({ ruleKey: "nope", title: "", reasonCategory: "other", reasonText: "" });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBeTruthy();
    expect((await preparer.get("/api/fiscal/rule-versions/999999")).status).toBe(404);
  });
});

describe("fiscale API — beoordelingen en gegevens", () => {
  async function publishedVersion() {
    const created = await preparer.post("/api/fiscal/rule-versions").send({ ruleKey: "pseudo_eindheffing_fossiel", title: `${FIXTURE_PREFIX}beoordeling`, reasonCategory: "legislative_change", reasonText: "Belastingplan 2026 via de API" });
    const id = created.body.id;
    await preparer.patch(`/api/fiscal/rule-versions/${id}`).send({ effectiveFrom: "2027-01-01", sourceOrganisation: "Rijksoverheid", sourceUrl: "https://ondernemersplein.overheid.nl/", legalReference: "art. 32bc Wet LB 1964" });
    await preparer.put(`/api/fiscal/rule-versions/${id}/parameters`).send(parameterBody());
    await preparer.post(`/api/fiscal/rule-versions/${id}/submit`);
    await approver.post(`/api/fiscal/rule-versions/${id}/approve`);
    await publisher.post(`/api/fiscal/rule-versions/${id}/publish`).send({ confirm: true });
    clearFiscalResolveCache();
    return id;
  }

  it("runs, lists, explains and recalculates assessments; missing data becomes a case that data resolves", async () => {
    await cleanupFiscalFixtures();
    await publishedVersion();
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle({ fuel: "Gasoline", productionDate: "2024-05-01" });
    await ensureProfile(vehicle.id);
    await applyManualOverride(vehicle.id, { field: "europeanCategory", value: "M1", reason: "kentekenbewijs" }, FIXTURE_ACTOR);
    const reservation = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-03-01", endDate: "2027-03-31" });
    const period = (await syncUsagePeriodForReservation(reservation.id))!;
    await confirmUsage(reservation.id, { privateUse: "yes", commuting: "no", providedBeforeCutoff: "no", usageType: "business_private" }, { kind: "staff", actor: FIXTURE_ACTOR });

    expect((await viewer.post("/api/fiscal/assessments/run").send({ usagePeriodId: period.id })).status).toBe(403);
    const run = await reviewer.post("/api/fiscal/assessments/run").send({ usagePeriodId: period.id, calculationDate: "2027-03-15" });
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ assessed: 1, created: 1 });

    const list = await viewer.get(`/api/fiscal/assessments?usagePeriodId=${period.id}&latestOnly=1`);
    expect(list.status).toBe(200);
    expect(list.body[0].status).toBe("DATA_INSUFFICIENT");
    const cases = await reviewer.get("/api/fiscal/review-cases?status=open");
    expect(cases.body.some((c: any) => c.usagePeriodId === period.id)).toBe(true);

    expect((await viewer.patch(`/api/vehicles/${vehicle.id}/fiscal-profile`).send({ field: "catalogValue", value: "36000", reason: "factuur" })).status).toBe(403);
    const profile = await reviewer.patch(`/api/vehicles/${vehicle.id}/fiscal-profile`).send({ field: "catalogValue", value: "36000", reason: "factuur" });
    expect(profile.status).toBe(200);
    expect(profile.body.catalogValue).toBe("36000.00");

    const after = await viewer.get(`/api/fiscal/assessments?usagePeriodId=${period.id}&latestOnly=1`);
    expect(after.body[0].status).toBe("APPLICABLE");
    expect(after.body[0].amount).toBe("360.00");
    const detail = await viewer.get(`/api/fiscal/assessments/${after.body[0].id}`);
    expect(detail.body.explanation).toContain("Status: Van toepassing");
    expect(detail.body.parameters.some((p: any) => p.key === "PSEUDO_ENDHEFFING_RATE")).toBe(true);
    const resolved = await reviewer.get(`/api/fiscal/review-cases?customerId=${customer.id}`);
    expect(resolved.body.find((c: any) => c.usagePeriodId === period.id)?.status).toBe("resolved");

    expect((await reviewer.post("/api/fiscal/assessments/recalculate").send({ usagePeriodId: period.id })).status).toBe(400);
    const recalculated = await reviewer.post("/api/fiscal/assessments/recalculate").send({ usagePeriodId: period.id, reason: "controle" });
    expect(recalculated.status).toBe(200);
    expect(recalculated.body.sequence).toBe(after.body[0].sequence + 1);

    const overview = await viewer.get("/api/fiscal/overview");
    expect(overview.status).toBe(200);
    expect(overview.body.byStatus.APPLICABLE).toBeGreaterThanOrEqual(1);
  });

  it("staff confirm the usage of a reservation through its usage-period route", async () => {
    await publishedVersion();
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle({ fuel: "Gasoline", productionDate: "2024-05-01" });
    const reservation = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-04-01", endDate: "2027-04-10" });
    await syncUsagePeriodForReservation(reservation.id);

    expect((await viewer.get(`/api/reservations/${reservation.id}/usage-period`)).status).toBe(200);
    expect((await viewer.patch(`/api/reservations/${reservation.id}/usage-period`).send({ privateUse: "yes", commuting: "no", providedBeforeCutoff: "no" })).status).toBe(403);
    const confirmed = await reviewer.patch(`/api/reservations/${reservation.id}/usage-period`).send({ privateUse: "yes", commuting: "no", providedBeforeCutoff: "no", usageType: "business_private" });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({ privateUse: "yes", confirmedByKind: "staff", confirmedByName: reviewer.username });
    const events = await db.select().from(fiscalAuditEvents).where(and(eq(fiscalAuditEvents.username, reviewer.username), eq(fiscalAuditEvents.action, "usage_confirmed")));
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect((await reviewer.patch(`/api/reservations/${reservation.id}/usage-period`).send({ privateUse: "maybe", commuting: "no", providedBeforeCutoff: "no" })).status).toBe(400);
  });

  it("assigns and resolves a review case by hand", async () => {
    await publishedVersion();
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle({ fuel: "Gasoline", productionDate: "2024-05-01" });
    const reservation = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-05-01", endDate: "2027-05-10" });
    const period = (await syncUsagePeriodForReservation(reservation.id))!;
    await reviewer.post("/api/fiscal/assessments/run").send({ usagePeriodId: period.id, calculationDate: "2027-05-05" });
    const open = (await reviewer.get(`/api/fiscal/review-cases?customerId=${customer.id}&status=open`)).body[0];
    expect(open).toBeTruthy();

    const assigned = await reviewer.patch(`/api/fiscal/review-cases/${open.id}`).send({ status: "in_progress", assignedToId: reviewer.userId });
    expect(assigned.status).toBe(200);
    expect(assigned.body).toMatchObject({ status: "in_progress", assignedToName: reviewer.username });
    expect((await reviewer.patch(`/api/fiscal/review-cases/${open.id}`).send({ status: "resolved" })).status).toBe(400);
    const resolved = await reviewer.patch(`/api/fiscal/review-cases/${open.id}`).send({ status: "dismissed", resolution: "dismissed", resolutionNote: "geen werknemer, eigenaar rijdt zelf" });
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({ status: "dismissed", resolvedByName: reviewer.username });
    expect((await reviewer.get(`/api/fiscal/review-cases/${open.id}`)).body.resolutionNote).toContain("eigenaar");
  });
});
