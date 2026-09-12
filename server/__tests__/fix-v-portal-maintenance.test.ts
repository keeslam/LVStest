/**
 * FIX-V — the portal half of the maintenance cascade.
 *
 *   BUG-117 — approving a maintenance *change* looked only for an unassigned
 *             placeholder, so an already-assigned spare stayed booked on the old
 *             days and a **second** live replacement was created for the same
 *             rental (and the customer was told twice).
 *   BUG-138 — a maintenance request could be approved with a start date in the
 *             past, or onto a rental that had since been cancelled.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
vi.mock("../services/reservation-pdf-regeneration", () => ({ scheduleContractRegeneration: vi.fn() }));

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { registerPortalRequestRoutes } from "../routes/portal-requests";
import { requestsStorage } from "../services/portal-requests-storage";
import { portalStorage } from "../services/portal-storage";
import {
  buildStaffTestApp, createTestCustomer, createTestVehicle, createTestReservation,
  cleanupPortalTestData, TEST_EMAIL_DOMAIN,
} from "./portal-helpers";
import { storage } from "../storage";
import { UserPermission, reservations } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";

const deps = { uploadsDir: getUploadsDir(), requireAuth: (_r: any, _s: any, n: any) => n() } as any;
const manager = buildStaffTestApp([UserPermission.MANAGE_PORTAL], (app) => registerPortalRequestRoutes(app, deps));

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

/** The next weekday at or after `offset` days from today — the workshop is shut at weekends. */
function weekday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

/**
 * The nearest weekday at or before `offset` days from today. The past-date and the weekend check
 * both live in the same guard, so a past date that happens to fall on a Saturday would prove the
 * wrong one — which is exactly what happened when the suite first ran on a Saturday.
 */
function pastWeekday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

async function liveReplacements(rentalId: number) {
  return db.select().from(reservations).where(and(
    eq(reservations.type, "replacement"),
    eq(reservations.replacementForReservationId, rentalId),
    isNull(reservations.deletedAt),
    sql`${reservations.status} NOT IN ('cancelled','completed','returned')`,
  ));
}

describe("FIX-V — portal maintenance approval", () => {
  let customerId: number, vehicleId: number, userId: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("MT")).id;
    vehicleId = (await createTestVehicle()).id;
    userId = (await portalStorage.createPortalUser(
      { customerId, email: `mt@${TEST_EMAIL_DOMAIN}`, fullName: "Aanvrager", role: "admin" }, "t",
    )).id;
  });
  afterAll(cleanupPortalTestData);

  it("refuses a start date in the past and writes nothing (BUG-138a)", async () => {
    const rental = await createTestReservation({
      customerId, vehicleId, startDate: day(-5), endDate: day(20), status: "picked_up",
    });
    const reqId = (await requestsStorage.createRequest({
      customerId, portalUserId: userId, type: "maintenance", reservationId: rental.id,
      payload: { issue: "Ruitenwisser", needsReplacement: true }, message: "Graag inplannen",
    })).id;

    const before = (await db.select({ n: sql<number>`count(*)::int` }).from(reservations))[0].n;
    const res = await request(manager).post(`/api/portal-requests/${reqId}/approve`)
      .send({ startDate: pastWeekday(-7), durationDays: 2 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MAINTENANCE_IN_PAST");
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(reservations))[0].n).toBe(before);
  });

  it("refuses a rental that is no longer active (BUG-138b)", async () => {
    const rental = await createTestReservation({
      customerId, vehicleId, startDate: day(30), endDate: day(40), status: "booked",
    });
    const reqId = (await requestsStorage.createRequest({
      customerId, portalUserId: userId, type: "maintenance", reservationId: rental.id,
      payload: { issue: "Remmen", needsReplacement: true }, message: "Graag inplannen",
    })).id;

    await storage.updateReservation(rental.id, { status: "cancelled" } as any);

    const res = await request(manager).post(`/api/portal-requests/${reqId}/approve`)
      .send({ startDate: weekday(31), durationDays: 1 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("RENTAL_NOT_ACTIVE");
    expect(await liveReplacements(rental.id)).toHaveLength(0);
  });

  it("moves the already-assigned spare instead of adding a second one (BUG-117)", async () => {
    const rental = await createTestReservation({
      customerId, vehicleId, startDate: day(-2), endDate: day(60), status: "picked_up",
    });
    const spare = await createTestVehicle();

    const planId = (await requestsStorage.createRequest({
      customerId, portalUserId: userId, type: "maintenance", reservationId: rental.id,
      payload: { issue: "Grote beurt", needsReplacement: true }, message: "Inplannen graag",
    })).id;
    const planned = await request(manager).post(`/api/portal-requests/${planId}/approve`)
      .send({ startDate: weekday(10), durationDays: 2 });
    expect(planned.status).toBe(200);
    const blockId = planned.body.block.id;

    // Staff assign a real car to the placeholder.
    const [placeholder] = await liveReplacements(rental.id);
    expect(placeholder).toBeDefined();
    const assigned = await storage.assignVehicleToPlaceholder(placeholder.id, spare.id, placeholder.endDate ?? undefined);
    expect(assigned).toBeDefined();

    // The customer asks to move it; the office confirms a new date.
    const newStart = weekday(20);
    const changeId = (await requestsStorage.createRequest({
      customerId, portalUserId: userId, type: "maintenance_change", reservationId: blockId,
      payload: { newDate: newStart, needsReplacement: true }, message: "Kan het later?",
    })).id;
    const moved = await request(manager).post(`/api/portal-requests/${changeId}/approve`)
      .send({ startDate: newStart, durationDays: 2 });
    expect(moved.status).toBe(200);

    // Exactly one live replacement, and it moved with the block.
    const live = await liveReplacements(rental.id);
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(placeholder.id);
    expect(live[0].startDate).toBe(newStart);
  });
});
