/**
 * Kees, 2026-10-18: several drivers on one car. An admin adds extra drivers in the portal; the main
 * driver (and the contract) stay; one car per driver still holds. A fine on a car that several drivers
 * shared at that moment gets no driver; the admin chooses one of them and the office is told.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
const { notifyStaffOfPortalEvent } = vi.hoisted(() => ({ notifyStaffOfPortalEvent: vi.fn(async () => {}) }));
vi.mock("../services/portal-notifications", () => ({ notifyStaffOfPortalEvent }));

import { buildPortalTestApp, createTestCustomer, createTestVehicle, createTestReservation, createTestDriver, createTestFine, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { finesStorage } from "../services/fines-storage";
import { assignDriverToReservation, getDriverAssignments } from "../services/driver-assignments";
import { driverAt } from "../services/fine-attribution";
import { storage } from "../storage";
import { hashPassword } from "../auth";

describe("several drivers on one car", () => {
  const app = buildPortalTestApp();
  const stamp = Date.now().toString(36);
  const mail = (who: string) => `extra-${who}-${stamp}@${TEST_EMAIL_DOMAIN}`;
  let customerId: number, carA: number, carB: number, plateA: string;
  let jan: number, piet: number, kim: number, foreignDriver: number;

  const login = async (who: string) => {
    const agent = request.agent(app);
    expect((await agent.post("/api/portal/login").send({ email: mail(who), password: "wachtwoord-1234" })).status).toBe(200);
    const csrf = (await agent.get("/api/portal/csrf-token")).body.token as string;
    return { agent, csrf };
  };
  type S = Awaited<ReturnType<typeof login>>;
  const add = (s: S, res: number, driverId: number) => s.agent.post(`/api/portal/reservations/${res}/drivers`).set("X-CSRF-Token", s.csrf).send({ driverId });

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("Gedeeld")).id;
    jan = (await createTestDriver(customerId, "Jan")).id;
    piet = (await createTestDriver(customerId, "Piet")).id;
    kim = (await createTestDriver(customerId, "Kim")).id;
    foreignDriver = (await createTestDriver((await createTestCustomer("Ander")).id, "Vreemd")).id;
    const vehicleA = await createTestVehicle();
    plateA = vehicleA.licensePlate;
    carA = (await createTestReservation({ customerId, vehicleId: vehicleA.id, driverId: jan, status: "picked_up", startDate: "2026-09-01", endDate: null })).id;
    carB = (await createTestReservation({ customerId, vehicleId: (await createTestVehicle()).id, driverId: kim, status: "picked_up", startDate: "2026-09-01", endDate: null })).id;
    await assignDriverToReservation({ reservationId: carA, driverId: jan, at: new Date("2026-09-01T08:00:00Z") });
    await assignDriverToReservation({ reservationId: carB, driverId: kim, at: new Date("2026-09-01T08:00:00Z") });
    for (const [who, role, driverId] of [["beheer", "admin", null], ["piet", "driver", piet]] as const) {
      const u = await portalStorage.createPortalUser({ customerId, email: mail(who), fullName: who, role, driverId } as any, "t");
      await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword("wachtwoord-1234") });
    }
  });
  afterAll(cleanupPortalTestData);

  it("an admin adds an extra driver; the main driver stays and the office is told", async () => {
    const s = await login("beheer");
    const res = await add(s, carA, piet);
    expect(res.status).toBe(201);
    expect(res.body.driver).toMatchObject({ id: jan });
    expect(res.body.extraDrivers).toEqual([{ id: piet, displayName: "Piet" }]);
    expect((await storage.getReservation(carA))?.driverId).toBe(jan);
    expect(notifyStaffOfPortalEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: "portal_driver_change", title: expect.stringContaining("Extra bestuurder") }));
    const list = (await s.agent.get("/api/portal/reservations")).body as Array<{ id: number; extraDrivers: unknown[] }>;
    expect(list.find((r) => r.id === carA)?.extraDrivers).toHaveLength(1);
    // The extra driver's own account sees the car.
    const p = await login("piet");
    expect((await p.agent.get(`/api/portal/reservations/${carA}`)).status).toBe(200);
  });

  it("one car per driver still holds, also for extra drivers", async () => {
    const s = await login("beheer");
    // Kim drives car B, so cannot be an extra driver on car A.
    const busy = await add(s, carA, kim);
    expect(busy.status).toBe(400);
    expect(busy.body.code).toBe("PORTAL_DRIVER_BUSY");
    // Piet is an extra driver on car A, so cannot become the main driver of car B.
    const main = await s.agent.post(`/api/portal/reservations/${carB}/driver`).set("X-CSRF-Token", s.csrf).send({ driverId: piet });
    expect(main.status).toBe(400);
    expect(main.body.code).toBe("PORTAL_DRIVER_BUSY");
    expect((await add(s, carA, piet)).status).toBe(409);
    expect((await add(s, carA, jan)).status).toBe(409);
    expect((await add(s, carA, foreignDriver)).status).toBe(404);
  });

  it("a driver account cannot add drivers", async () => {
    const p = await login("piet");
    expect((await add(p, carA, kim)).status).toBe(403);
  });

  it("a fine at a moment the car was shared gets no driver; the admin chooses and the office is told", async () => {
    // Now: Piet has been an extra driver on car A since the first test.
    const at = new Date();
    expect(await driverAt(carA, at)).toBeNull();
    expect(await driverAt(carB, at)).toBe(kim);

    const fine = await createTestFine({ licensePlate: plateA, offenceAt: at, description: "Snelheid" });
    await finesStorage.updateFine(fine.id, { customerId, reservationId: carA, driverId: null, status: "linked", linkedAt: new Date(), linkedBy: "system" });
    const s = await login("beheer");
    const dto = (await s.agent.get(`/api/portal/fines/${fine.id}`)).body;
    expect(dto.driver).toBeNull();
    expect(dto.driverOptions.map((d: { id: number }) => d.id).sort()).toEqual([jan, piet].sort());

    const set = (driverId: number) => s.agent.post(`/api/portal/fines/${fine.id}/driver`).set("X-CSRF-Token", s.csrf).send({ driverId });
    expect((await set(kim)).status).toBe(400);
    const ok = await set(piet);
    expect(ok.status).toBe(200);
    expect(ok.body.driver).toMatchObject({ id: piet });
    expect((await finesStorage.getFine(fine.id))?.driverId).toBe(piet);
    expect(notifyStaffOfPortalEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: "portal_fine_driver", link: `/fines?bekeuring=${fine.id}` }));
    // Once named, only the office changes it.
    expect((await set(jan)).status).toBe(409);
    // Now Piet's own account sees the fine.
    const p = await login("piet");
    expect((await p.agent.get(`/api/portal/fines/${fine.id}`)).status).toBe(200);
  });

  it("removing an extra driver keeps the history; making an extra driver the main driver ends the extra row", async () => {
    const s = await login("beheer");
    const removed = await s.agent.delete(`/api/portal/reservations/${carA}/drivers/${piet}`).set("X-CSRF-Token", s.csrf);
    expect(removed.status).toBe(200);
    expect(removed.body.extraDrivers).toEqual([]);
    expect((await s.agent.delete(`/api/portal/reservations/${carA}/drivers/${piet}`).set("X-CSRF-Token", s.csrf)).status).toBe(404);
    expect((await getDriverAssignments(carA)).some((a) => a.driverId === piet && a.isExtra && a.assignedUntil)).toBe(true);

    expect((await add(s, carA, piet)).status).toBe(201);
    const promote = await s.agent.post(`/api/portal/reservations/${carA}/driver`).set("X-CSRF-Token", s.csrf).send({ driverId: piet });
    expect(promote.status).toBe(200);
    expect(promote.body.driver).toMatchObject({ id: piet });
    expect(promote.body.extraDrivers).toEqual([]);
    const open = (await getDriverAssignments(carA)).filter((a) => !a.assignedUntil);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ driverId: piet, isExtra: false });
  });
});
