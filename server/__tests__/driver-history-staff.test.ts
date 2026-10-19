/**
 * Kees, 2026-10-19: the office sees a reservation's whole driver history: main and extra drivers, the
 * period and who set it (an office user, the customer in the portal, or nobody recorded).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { createTestCustomer, createTestVehicle, createTestReservation, createTestDriver, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { addExtraDriver, assignDriverToReservation, getDriverHistoryForStaff } from "../services/driver-assignments";

describe("bestuurdershistorie voor kantoor", () => {
  let reservationId: number, jan: number, piet: number, kim: number, portalUserId: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    const customerId = (await createTestCustomer("Historie")).id;
    jan = (await createTestDriver(customerId, "Jan")).id;
    piet = (await createTestDriver(customerId, "Piet")).id;
    kim = (await createTestDriver(customerId, "Kim")).id;
    reservationId = (await createTestReservation({ customerId, vehicleId: (await createTestVehicle()).id, driverId: jan, status: "picked_up" })).id;
    portalUserId = (await portalStorage.createPortalUser({ customerId, email: `historie@${TEST_EMAIL_DOMAIN}`, fullName: "Klantbeheerder", role: "admin" }, "t")).id;
    await assignDriverToReservation({ reservationId, driverId: jan, note: "created", at: new Date("2026-09-01T08:00:00Z") });
    await addExtraDriver({ reservationId, driverId: piet, byPortalUserId: portalUserId, at: new Date("2026-09-03T08:00:00Z") });
    await assignDriverToReservation({ reservationId, driverId: kim, byPortalUserId: portalUserId, at: new Date("2026-09-05T08:00:00Z") });
  });
  afterAll(cleanupPortalTestData);

  it("lists every driver in order with main/extra, period and who set it", async () => {
    const rows = await getDriverHistoryForStaff(reservationId);
    expect(rows.map((r) => [r.driverName, r.isExtra])).toEqual([["Jan", false], ["Piet", true], ["Kim", false]]);
    expect(rows[0]).toMatchObject({ until: "2026-09-05T08:00:00.000Z", setBy: { kind: "system", name: null }, note: "created" });
    expect(rows[1]).toMatchObject({ until: null, setBy: { kind: "portal", name: "Klantbeheerder" } });
    expect(rows[2]).toMatchObject({ from: "2026-09-05T08:00:00.000Z", until: null, setBy: { kind: "portal" } });
  });
});
