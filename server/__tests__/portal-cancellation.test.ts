/**
 * Kees, 2026-10-18: a customer asks to cancel a booked reservation in the portal, until 48 hours before
 * it starts; staff approve, like an extension. Never a car already on the road, never a replacement
 * car, never another customer's reservation.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
vi.mock("../services/reservation-pdf-regeneration", () => ({ scheduleContractRegeneration: vi.fn(), scheduleReservationPdfRegeneration: vi.fn() }));

import { buildPortalTestApp, buildStaffTestApp, createTestCustomer, createTestVehicle, createTestReservation, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { registerPortalRequestRoutes } from "../routes/portal-requests";
import { portalStorage } from "../services/portal-storage";
import { cancellationState } from "../services/portal-cancellation";
import { storage } from "../storage";
import { hashPassword } from "../auth";
import { UserPermission } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe("the 48-hour rule", () => {
  const base = { status: "booked", type: "standard", startTime: "10:00", replacementForReservationId: null };
  it("allows until 48 hours before the start on the office clock", () => {
    // 2026-11-10 10:00 in Amsterdam is 09:00 UTC; the deadline is two days earlier.
    const r = { ...base, startDate: "2026-11-10" };
    expect(cancellationState(r, null, new Date("2026-11-08T08:59:00Z"))).toMatchObject({ allowed: true, deadline: "2026-11-08T09:00:00.000Z" });
    expect(cancellationState(r, null, new Date("2026-11-08T09:01:00Z"))).toMatchObject({ allowed: false, reason: "too_late" });
  });
  it("refuses a car on the road and a replacement car", () => {
    expect(cancellationState({ ...base, startDate: "2099-01-01", status: "picked_up" }, null)).toMatchObject({ allowed: false, reason: "not_booked" });
    expect(cancellationState({ ...base, startDate: "2099-01-01", replacementForReservationId: 5 }, null)).toMatchObject({ allowed: false, reason: "replacement" });
  });
});

describe("cancelling a reservation through the portal", () => {
  const app = buildPortalTestApp();
  const deps = { uploadsDir: getUploadsDir(), requireAuth: (_r: any, _s: any, n: any) => n() } as any;
  const staff = buildStaffTestApp([UserPermission.MANAGE_PORTAL], (a) => registerPortalRequestRoutes(a, deps));
  const email = `cancel-${Date.now().toString(36)}@${TEST_EMAIL_DOMAIN}`;
  let customerId: number, later: number, soon: number, running: number, foreign: number;

  const login = async () => {
    const agent = request.agent(app);
    expect((await agent.post("/api/portal/login").send({ email, password: "wachtwoord-1234" })).status).toBe(200);
    const csrf = (await agent.get("/api/portal/csrf-token")).body.token as string;
    return { agent, csrf };
  };
  const ask = (s: Awaited<ReturnType<typeof login>>, reservationId: number) =>
    s.agent.post("/api/portal/requests").set("X-CSRF-Token", s.csrf).send({ type: "cancellation", reservationId, payload: {}, message: "Niet meer nodig" });

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("Annuleren")).id;
    await portalStorage.updateCustomerSettings(customerId, { canSubmitRequests: true }, "t");
    const user = await portalStorage.createPortalUser({ customerId, email, fullName: "Annuleerder", role: "admin" }, "t");
    await portalStorage.updatePortalUser(user.id, { passwordHash: await hashPassword("wachtwoord-1234") });
    later = (await createTestReservation({ customerId, vehicleId: (await createTestVehicle()).id, startDate: day(10), endDate: day(15) })).id;
    soon = (await createTestReservation({ customerId, vehicleId: (await createTestVehicle()).id, startDate: day(1), endDate: day(5) })).id;
    running = (await createTestReservation({ customerId, vehicleId: (await createTestVehicle()).id, startDate: day(-3), endDate: day(5), status: "picked_up" })).id;
    const other = (await createTestCustomer("Ander")).id;
    foreign = (await createTestReservation({ customerId: other, vehicleId: (await createTestVehicle()).id, startDate: day(10), endDate: day(12) })).id;
  });
  afterAll(cleanupPortalTestData);

  it("tells the reservation detail whether cancelling is still possible", async () => {
    const s = await login();
    expect((await s.agent.get(`/api/portal/reservations/${later}`)).body.cancellation).toMatchObject({ allowed: true, openRequestId: null });
    expect((await s.agent.get(`/api/portal/reservations/${soon}`)).body.cancellation).toMatchObject({ allowed: false, reason: "too_late" });
    expect((await s.agent.get(`/api/portal/reservations/${running}`)).body.cancellation).toMatchObject({ allowed: false, reason: "not_booked" });
  });

  it("refuses within 48 hours, a running rental and another customer's reservation", async () => {
    const s = await login();
    const tooLate = await ask(s, soon);
    expect(tooLate.status).toBe(400);
    expect(tooLate.body.code).toBe("PORTAL_CANCEL_TOO_LATE");
    const onRoad = await ask(s, running);
    expect(onRoad.status).toBe(400);
    expect(onRoad.body.code).toBe("PORTAL_CANCEL_NOT_ALLOWED");
    expect((await ask(s, foreign)).status).toBe(404);
    expect((await storage.getReservation(foreign))?.status).toBe("booked");
  });

  it("files one request; staff approval cancels the reservation", async () => {
    const s = await login();
    const created = await ask(s, later);
    expect(created.status).toBe(201);
    expect((await ask(s, later)).status).toBe(409);
    expect((await s.agent.get(`/api/portal/reservations/${later}`)).body.cancellation.openRequestId).toBe(created.body.id);
    // Asking does not cancel anything yet.
    expect((await storage.getReservation(later))?.status).toBe("booked");

    const approved = await request(staff).post(`/api/portal-requests/${created.body.id}/approve`).send({});
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("done");
    expect((await storage.getReservation(later))?.status).toBe("cancelled");
    expect((await request(staff).post(`/api/portal-requests/${created.body.id}/approve`).send({})).status).toBe(400);
  });

  it("does not cancel a car that was picked up after the customer asked", async () => {
    const s = await login();
    const id = (await createTestReservation({ customerId, vehicleId: (await createTestVehicle()).id, startDate: day(20), endDate: day(25) })).id;
    const created = await ask(s, id);
    expect(created.status).toBe(201);
    await storage.updateReservation(id, { status: "picked_up" } as any);
    expect((await request(staff).post(`/api/portal-requests/${created.body.id}/approve`).send({})).status).toBe(409);
    expect((await storage.getReservation(id))?.status).toBe("picked_up");
  });
});
