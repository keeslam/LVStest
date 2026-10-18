/**
 * Portal notifications carry what they are about (`params`), so the portal can word them in the
 * reader's language (Kees, 2026-10-18). The Dutch title and description stay as they were.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../utils/email-service", () => ({ sendEmail: vi.fn(async () => true) }));

import { db } from "../db";
import { portalNotifications } from "../../shared/schema";
import { and, eq } from "drizzle-orm";
import { storage } from "../storage";
import { portalStorage } from "../services/portal-storage";
import { onReservationChangedByStaff } from "../services/portal-reservation-events";
import { onMaintenanceBlockChanged } from "../services/portal-maintenance-events";
import { createTestCustomer, createTestVehicle, createTestReservation, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";

let customerId: number;

beforeAll(async () => {
  await cleanupPortalTestData();
  customerId = (await createTestCustomer("NotifParams")).id;
  await portalStorage.createPortalUser({ customerId, email: `params@${TEST_EMAIL_DOMAIN}`, fullName: "Params", role: "admin" }, "t");
}, 60_000);
afterAll(cleanupPortalTestData);

const notice = async (type: string) =>
  (await db.select().from(portalNotifications).where(and(eq(portalNotifications.customerId, customerId), eq(portalNotifications.type, type))))[0];

describe("portal notification params", () => {
  it("stores the dates and cars of a changed reservation next to the Dutch text", async () => {
    const vehicle = await createTestVehicle();
    const row = await createTestReservation({ customerId, vehicleId: vehicle.id, startDate: "2026-10-10", endDate: "2026-10-15" });
    const before = (await storage.getReservation(row.id))!;
    expect(await onReservationChangedByStaff(before, { ...before, startDate: "2026-10-12", endDate: "2026-10-17" })).toBe("reservation_changed");
    const n = await notice("reservation_changed");
    expect(n.description).toContain("De periode is nu 12-10-2026 t/m 17-10-2026");
    expect(n.params).toMatchObject({
      plate: vehicle.licensePlate, startDate: "2026-10-12", endDate: "2026-10-17", oldStartDate: "2026-10-10", oldEndDate: "2026-10-15",
      datesChanged: true, vehicleChanged: false,
    });
  });

  it("stores the plate, car and dates of planned maintenance", async () => {
    const vehicle = await createTestVehicle();
    await createTestReservation({ customerId, vehicleId: vehicle.id, startDate: "2026-10-01", endDate: null, status: "picked_up" });
    const block = await createTestReservation({ customerId, vehicleId: vehicle.id, startDate: "2026-11-02", endDate: "2026-11-03", status: "booked", type: "maintenance_block" });
    expect(await onMaintenanceBlockChanged(null, { ...block, maintenanceStatus: "scheduled" } as any)).toBe("maintenance_planned");
    const n = await notice("maintenance_planned");
    expect(n.title).toBe(`Onderhoud gepland: ${vehicle.licensePlate}`);
    expect(n.params).toMatchObject({ plate: vehicle.licensePlate, date: "2026-11-02", endDate: "2026-11-03" });
    expect(typeof n.params?.company).toBe("string");
  });
});
