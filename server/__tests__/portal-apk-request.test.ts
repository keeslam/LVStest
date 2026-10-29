/** The customer asks to have the APK planned for a rental that is on the road; staff plan it in the garage's agenda. */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

const { notify } = vi.hoisted(() => ({ notify: vi.fn(async () => undefined) }));
vi.mock("../utils/email-service", () => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../services/portal-notifications", () => ({ notifyStaffOfPortalEvent: notify }));

import { buildPortalTestApp, createTestCustomer, createTestVehicle, createTestReservation, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { hashPassword } from "../auth";
import { portalConfigSchema } from "../services/portal-config";
import { buildCspDirectives } from "../middleware/security/headers";
import { DEFAULT_PORTAL_CONFIG } from "../../shared/portal-types";

const password = "wachtwoord-1234";

describe("APK requests through the portal", () => {
  const app = buildPortalTestApp();
  let a: number, b: number, vehicleId: number;
  const mine = `apk-${Date.now().toString(36)}@${TEST_EMAIL_DOMAIN}`;
  let session: { agent: ReturnType<typeof request.agent>; csrf: string };
  const ask = (reservationId: number, payload: Record<string, unknown> = {}, message = "Graag de APK laten keuren.") =>
    session.agent.post("/api/portal/requests").set("X-CSRF-Token", session.csrf).send({ type: "apk", reservationId, payload, message });

  beforeAll(async () => {
    await cleanupPortalTestData();
    a = (await createTestCustomer("ApkA")).id; b = (await createTestCustomer("ApkB")).id;
    await portalStorage.updateCustomerSettings(a, { canSubmitRequests: true }, "t");
    vehicleId = (await createTestVehicle()).id;
    const u = await portalStorage.createPortalUser({ customerId: a, email: mine, fullName: "APK", role: "admin" }, "t");
    await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword(password) });
    const agent = request.agent(app);
    expect((await agent.post("/api/portal/login").send({ email: mine, password })).status).toBe(200);
    session = { agent, csrf: (await agent.get("/api/portal/csrf-token")).body.token as string };
  });
  afterAll(cleanupPortalTestData);

  it("takes a request for a rental that is in use, with a preferred day, and tells staff", async () => {
    const r = await createTestReservation({ customerId: a, vehicleId, startDate: "2098-01-01", endDate: "2098-12-31", status: "picked_up" });
    const res = await ask(r.id, { preferredDate: "2098-06-15" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: "apk", status: "new", reservationId: r.id, payload: { preferredDate: "2098-06-15" } });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: "portal_request", customerId: a, title: expect.stringContaining("APK inplannen") }));
  });

  it("works without a preferred day, and refuses one in the past or a malformed one", async () => {
    const r = await createTestReservation({ customerId: a, vehicleId, startDate: "2098-02-01", endDate: "2098-12-31", status: "picked_up" });
    expect((await ask(r.id)).status).toBe(201);
    const r2 = await createTestReservation({ customerId: a, vehicleId, startDate: "2098-03-01", endDate: "2098-12-31", status: "picked_up" });
    expect((await ask(r2.id, { preferredDate: "2020-01-01" })).body.code).toBe("PORTAL_REQUEST_INVALID_PERIOD");
    expect((await ask(r2.id, { preferredDate: "morgen" })).body.code).toBe("PORTAL_VALIDATION");
  });

  it("keeps one open request per reservation", async () => {
    const r = await createTestReservation({ customerId: a, vehicleId, startDate: "2098-04-01", endDate: "2098-12-31", status: "picked_up" });
    expect((await ask(r.id)).status).toBe(201);
    const again = await ask(r.id);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("PORTAL_DUPLICATE_REQUEST");
  });

  it("refuses a rental that is not in use, and one of another customer", async () => {
    const booked = await createTestReservation({ customerId: a, vehicleId, startDate: "2098-05-01", endDate: "2098-05-05" });
    const done = await createTestReservation({ customerId: a, vehicleId, startDate: "2098-06-01", endDate: "2098-06-05", status: "completed" });
    const foreign = await createTestReservation({ customerId: b, vehicleId, startDate: "2098-07-01", endDate: "2098-07-05", status: "picked_up" });
    expect((await ask(booked.id)).body.code).toBe("PORTAL_APK_NOT_POSSIBLE");
    expect((await ask(done.id)).body.code).toBe("PORTAL_APK_NOT_POSSIBLE");
    expect((await ask(foreign.id)).status).toBe(404);
  });

  it("gives the portal the garage agenda, and only accepts an https address on the agenda's own host", async () => {
    expect((await session.agent.get("/api/portal/me")).body.info.apkPlannerUrl).toBe(DEFAULT_PORTAL_CONFIG.apkPlannerUrl);
    const parse = (apkPlannerUrl: string) => portalConfigSchema.safeParse({ apkPlannerUrl }).success;
    expect(parse("https://planner.garage.software/#/afspraken/4353313633393035")).toBe(true);
    expect(parse("")).toBe(true);
    expect(parse("https://evil.example/planner")).toBe(false);
    expect(parse("http://planner.garage.software/x")).toBe(false);
    expect(parse("https://planner.garage.software.evil.example/")).toBe(false);
    expect(parse("javascript:alert(1)")).toBe(false);
  });

  it("lets the browser show that host in a frame", () => {
    expect(buildCspDirectives(true).frameSrc).toContain("https://planner.garage.software");
  });
});
