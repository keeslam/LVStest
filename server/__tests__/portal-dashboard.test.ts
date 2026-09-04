import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { registerPortalAdminRoutes } from "../routes/portal-admin";
import { createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, createTestFine, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { requestsStorage } from "../services/portal-requests-storage";
import { storage } from "../storage";
import { UserPermission } from "../../shared/schema";
import { getPortalDashboard, type PortalDashboard } from "../services/portal-dashboard";

function staffApp(permissions: string[]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 1, username: "staff-test", role: "manager", permissions };
    (req as any).isAuthenticated = () => true;
    next();
  });
  registerPortalAdminRoutes(app, { requireAuth: (_r: any, _s: any, n: any) => n() } as any);
  return app;
}

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe("portal dashboard", () => {
  const app = staffApp([UserPermission.VIEW_PORTAL]);
  let customerId: number, vehicleId: number, driverId: number;
  let pickupId: number, returnId: number, fineId: number, requestId: number, notificationId: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    const customer = await createTestCustomer("Dash");
    customerId = customer.id;
    driverId = (await createTestDriver(customerId, "Dash Driver")).id;
    vehicleId = (await createTestVehicle()).id;
    const vehicle2 = await createTestVehicle();
    await portalStorage.createPortalUser({ customerId, email: `dash@${TEST_EMAIL_DOMAIN}`, fullName: "Dash", role: "admin" } as any, "test");

    // Pickup in 3 days, return in 10 days, one far in the future (outside the window), one cancelled.
    pickupId = (await createTestReservation({ customerId, vehicleId, driverId, startDate: isoDay(3), endDate: isoDay(20) })).id;
    returnId = (await createTestReservation({ customerId, vehicleId: vehicle2.id, startDate: isoDay(-5), endDate: isoDay(10), status: "picked_up" })).id;
    await createTestReservation({ customerId, vehicleId, startDate: isoDay(30), endDate: isoDay(40) });
    await createTestReservation({ customerId, vehicleId, startDate: isoDay(2), endDate: isoDay(4), status: "cancelled" });

    fineId = (await createTestFine({ licensePlate: "PTDASH1", offenceAt: new Date(), description: "__portal_test__ dash" })).id;
    requestId = (await requestsStorage.createRequest({
      customerId, type: "question", status: "new", payload: {}, message: "__portal_test__ dash",
    } as any)).id;
    notificationId = (await storage.createCustomNotification({
      title: "__portal_test__ dash notification", description: "d", date: isoDay(0), type: "portal_test_dash",
      link: "/portal-admin", icon: "Users", priority: "normal", isRead: false,
    })).id;
  });
  afterAll(async () => {
    await storage.deleteCustomNotification(notificationId);
    await cleanupPortalTestData();
  });

  it("collects counts, attention items, notifications and upcoming pickups/returns", async () => {
    const d: PortalDashboard = await getPortalDashboard();
    expect(d.counts.newRequests).toBeGreaterThanOrEqual(1);
    expect(d.counts.unlinkedFines).toBeGreaterThanOrEqual(1);

    expect(d.attention.requests.some((r) => r.id === requestId && r.status === "new")).toBe(true);
    expect(d.attention.fines.some((f) => f.id === fineId && f.licensePlate === "PTDASH1")).toBe(true);
    expect(d.notifications.some((n) => n.id === notificationId && n.isRead === false)).toBe(true);

    const pickup = d.upcoming.find((u) => u.reservationId === pickupId);
    expect(pickup).toMatchObject({ kind: "pickup", date: isoDay(3), customerId, driverName: "Dash Driver" });
    const ret = d.upcoming.find((u) => u.reservationId === returnId);
    expect(ret).toMatchObject({ kind: "return", date: isoDay(10), status: "picked_up" });
    // Sorted by date: the pickup (day 3) comes before the return (day 10).
    expect(d.upcoming.indexOf(pickup!)).toBeLessThan(d.upcoming.indexOf(ret!));
    // Outside the window or cancelled: not listed.
    expect(d.upcoming.filter((u) => u.customerId === customerId)).toHaveLength(2);
  });

  it("serves the dashboard to viewers and marks one notification read", async () => {
    const res = await request(app).get("/api/portal-admin/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.counts).toBeDefined();
    expect(res.body.notifications.some((n: any) => n.id === notificationId)).toBe(true);

    const mark = await request(app).post(`/api/portal-admin/notifications/${notificationId}/read`);
    expect(mark.status).toBe(200);
    const after = await getPortalDashboard();
    expect(after.notifications.find((n) => n.id === notificationId)?.isRead).toBe(true);
  });
});
