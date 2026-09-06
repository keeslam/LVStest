import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { onMaintenanceBlockChanged, onReplacementAssigned, canCustomerChangeMaintenance, maintenanceStartsAt } from "../services/portal-maintenance-events";
import { customerNotifications } from "../services/portal-customer-notifications";
import { portalStorage } from "../services/portal-storage";
import { storage } from "../storage";
import { createTestCustomer, createTestVehicle, createTestReservation, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { db } from "../db";
import { reservations, type Reservation } from "../../shared/schema";
import { eq } from "drizzle-orm";

describe("portal maintenance events", () => {
  let customerId: number, userId: number, vehicleId: number, rentalId: number;
  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("ME")).id;
    userId = (await portalStorage.createPortalUser({ customerId, email: `me@${TEST_EMAIL_DOMAIN}`, fullName: "Melder", role: "admin" }, "t")).id;
    vehicleId = (await createTestVehicle()).id;
    rentalId = (await createTestReservation({ customerId, vehicleId, startDate: "2026-09-01", endDate: null, status: "picked_up" })).id;
  });
  afterAll(cleanupPortalTestData);

  const block = async (patch: Partial<Reservation>): Promise<Reservation> => {
    const row = await storage.createMaintenanceBlock(vehicleId, "2026-10-10", "2026-10-11");
    if (Object.keys(patch).length) await db.update(reservations).set(patch).where(eq(reservations.id, row.id));
    return (await storage.getReservation(row.id))!;
  };
  const mine = async (type: string) => (await customerNotifications.listForUser(customerId, userId)).filter((n) => n.type === type);

  it("planned, moved, in, out and cancelled each notify the customer once", async () => {
    const b = await block({});
    expect(await onMaintenanceBlockChanged(null, b)).toBe("maintenance_planned");
    expect(await onMaintenanceBlockChanged(null, b)).toBeNull();
    expect((await mine("maintenance_planned")).filter((n) => n.link === `/voertuigen?block=${b.id}`)).toHaveLength(1);
    const moved = { ...b, startDate: "2026-10-12", endDate: "2026-10-13" };
    expect(await onMaintenanceBlockChanged(b, moved)).toBe("maintenance_moved");
    expect(await onMaintenanceBlockChanged(b, moved)).toBeNull();
    expect(await onMaintenanceBlockChanged(moved, { ...moved, maintenanceStatus: "in" })).toBe("maintenance_in");
    expect(await onMaintenanceBlockChanged({ ...moved, maintenanceStatus: "in" }, { ...moved, maintenanceStatus: "out" })).toBe("maintenance_out");
    const other = await block({});
    expect(await onMaintenanceBlockChanged(other, null)).toBe("maintenance_cancelled");
    expect(sendEmail).toHaveBeenCalled();
  });

  it("does nothing for a vehicle without a portal customer on the road", async () => {
    const lonely = await createTestVehicle();
    const b = await storage.createMaintenanceBlock(lonely.id, "2026-10-10", "2026-10-11");
    expect(await onMaintenanceBlockChanged(null, b)).toBeNull();
  });

  it("counts a block for a picked-up rental even when the rental's startDate is later than the block", async () => {
    const vehicle = await createTestVehicle();
    await createTestReservation({ customerId, vehicleId: vehicle.id, startDate: "2099-01-10", endDate: null, status: "picked_up" });
    const b = await storage.createMaintenanceBlock(vehicle.id, "2098-12-20", "2098-12-21");
    expect(await onMaintenanceBlockChanged(null, b)).toBe("maintenance_planned");
  });

  it("tells the customer when a replacement gets a real vehicle, once", async () => {
    const spare = await createTestVehicle();
    const rep = await createTestReservation({ customerId, vehicleId: spare.id, startDate: "2026-10-10", endDate: "2026-10-11", type: "replacement" });
    await db.update(reservations).set({ replacementForReservationId: rentalId }).where(eq(reservations.id, rep.id));
    const row = (await storage.getReservation(rep.id))!;
    expect(await onReplacementAssigned(row)).toBe(true);
    expect(await onReplacementAssigned(row)).toBe(false);
    expect(await mine("replacement_ready")).toHaveLength(1);
  });

  it("48-hour rule", () => {
    const now = new Date("2026-10-08T07:00:00+02:00");
    expect(maintenanceStartsAt({ startDate: "2026-10-10", startTime: null }).toISOString()).toBe(new Date("2026-10-10T08:00:00+02:00").toISOString());
    expect(canCustomerChangeMaintenance({ startDate: "2026-10-10", startTime: null, maintenanceStatus: "scheduled" }, now)).toBe(true);
    expect(canCustomerChangeMaintenance({ startDate: "2026-10-10", startTime: null, maintenanceStatus: "scheduled" }, new Date("2026-10-08T09:00:00+02:00"))).toBe(false);
    expect(canCustomerChangeMaintenance({ startDate: "2026-10-10", startTime: "12:00", maintenanceStatus: "scheduled" }, new Date("2026-10-08T11:00:00+02:00"))).toBe(true);
    expect(canCustomerChangeMaintenance({ startDate: "2026-10-10", startTime: null, maintenanceStatus: "in" }, now)).toBe(false);
  });
});
