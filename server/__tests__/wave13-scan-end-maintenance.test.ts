/**
 * PHASE 57 / WAVE 13 item 5 — "Terug uit onderhoud" (scanscherm) sloot ook
 * toekomstig onderhoud.
 *
 * Scanning a car and pressing **Terug uit onderhoud** ran
 * `PATCH /api/vehicles/:id/maintenance-status {status:'ok'}`, which closed
 * *every* open block whose end date had not yet passed. On the HANDLEIDING
 * fixture that silently completed a repair planned for October: it went to
 * `out`, vanished from the maintenance calendar, and nobody was told. On top of
 * that the car stayed on "Reparatie nodig", because the availability was
 * derived *before* the blocks were closed, so the derivation still saw an open
 * block and kept the vehicle at `needs_fixing`.
 *
 * Both halves are asserted here. Dates are derived from the server's own
 * `isoToday()` so the fixture covers "today" on whatever day this runs, in
 * whatever zone — nothing is pinned to a calendar day or a weekday.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isoDay } from "./helpers/dates";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles, type Vehicle } from "../../shared/schema";
import { isoToday, normalizeReservationStatus, selectMaintenanceBlocksToClose } from "../services/lifecycle";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

let admin: TestAgent;

function shiftDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

beforeAll(async () => {
  admin = await agentFor("admin");
  await createFixtureCustomer("Wave13Scan");
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

async function reservationRow(id: number) {
  const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
  return row;
}

async function vehicleRow(id: number) {
  const [row] = await db.select().from(vehicles).where(eq(vehicles.id, id));
  return row;
}

/** A car in the workshop today, with a second repair planned well ahead. */
async function carInWorkshopWithFutureBlock() {
  const today = isoToday();
  const car: Vehicle = await createFixtureVehicle({
    maintenanceStatus: "in_service",
    availabilityStatus: "needs_fixing",
  });

  const todayBlock = await createFixtureReservation({
    customerId: null, vehicleId: car.id,
    startDate: shiftDays(today, -2), endDate: shiftDays(today, 1),
    status: "booked", type: "maintenance_block",
  });
  await db.update(reservations).set({ maintenanceStatus: "in" }).where(eq(reservations.id, todayBlock.id));

  const futureBlock = await createFixtureReservation({
    customerId: null, vehicleId: car.id,
    startDate: shiftDays(today, 30), endDate: shiftDays(today, 34),
    status: "booked", type: "maintenance_block",
  });
  await db.update(reservations).set({ maintenanceStatus: "scheduled" })
    .where(eq(reservations.id, futureBlock.id));

  return { car, todayBlock, futureBlock, today };
}

describe("WAVE 13 — 'Terug uit onderhoud' raakt alleen het onderhoud van vandaag", () => {
  it("closes the block that covers today and leaves the planned one alone", async () => {
    const { car, todayBlock, futureBlock } = await carInWorkshopWithFutureBlock();

    const res = await admin.patch(`/api/vehicles/${car.id}/maintenance-status`).send({ status: "ok" });
    expect(res.status).toBe(200);

    const closed = await reservationRow(todayBlock.id);
    expect(closed.maintenanceStatus).toBe("out");

    // The October block on the fixture: still planned, still on the calendar,
    // still with its own dates.
    const planned = await reservationRow(futureBlock.id);
    expect(planned.maintenanceStatus).toBe("scheduled");
    expect(normalizeReservationStatus(planned.status)).toBe("booked");
  });

  it("leaves the car in a rentable state instead of on 'Reparatie nodig'", async () => {
    const { car } = await carInWorkshopWithFutureBlock();

    await admin.patch(`/api/vehicles/${car.id}/maintenance-status`).send({ status: "ok" });

    const row = await vehicleRow(car.id);
    expect(row.maintenanceStatus).toBe("ok");
    expect(row.availabilityStatus).not.toBe("needs_fixing");
  });

  it("closes exactly the block the caller names, when one is named", async () => {
    const { car, todayBlock, futureBlock } = await carInWorkshopWithFutureBlock();

    await admin.patch(`/api/vehicles/${car.id}/maintenance-status`)
      .send({ status: "ok", blockId: futureBlock.id });

    expect((await reservationRow(futureBlock.id)).maintenanceStatus).toBe("out");
    // The one covering today was not the one asked for.
    expect((await reservationRow(todayBlock.id)).maintenanceStatus).toBe("in");
  });
});

describe("selectMaintenanceBlocksToClose — de regel zelf", () => {
  const blocks = [
    { id: 1, type: "maintenance_block", status: "booked", startDate: "2026-10-01", endDate: "2026-10-03", maintenanceStatus: "in" },
    { id: 2, type: "maintenance_block", status: "booked", startDate: "2026-11-20", endDate: "2026-11-25", maintenanceStatus: "scheduled" },
    { id: 3, type: "maintenance_block", status: "booked", startDate: "2026-09-01", endDate: null, maintenanceStatus: "scheduled" },
    { id: 4, type: "maintenance_block", status: "completed", startDate: "2026-10-01", endDate: "2026-10-03", maintenanceStatus: "out" },
    { id: 5, type: "standard", status: "booked", startDate: "2026-10-01", endDate: "2026-10-03", maintenanceStatus: null },
  ];

  it("takes only the open blocks that cover the day, never one still to come", () => {
    const picked = selectMaintenanceBlocksToClose(blocks, "2026-10-02").map((b) => b.id);
    // 1 covers the day; 3 is open-ended and started before it. 2 is still to
    // come, 4 is already closed and 5 is a rental, not a block.
    expect(picked.sort()).toEqual([1, 3]);
  });

  it("takes exactly the named block when the caller names one", () => {
    expect(selectMaintenanceBlocksToClose(blocks, "2026-10-02", 2).map((b) => b.id)).toEqual([2]);
    // ...and refuses to hand back one that is already closed.
    expect(selectMaintenanceBlocksToClose(blocks, "2026-10-02", 4)).toEqual([]);
  });
});
