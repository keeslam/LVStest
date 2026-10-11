/**
 * D7 follow-up (final-wave review, Minor 2): the scan card's "Terug uit onderhoud" opens Afronden for
 * the block the SERVER names. The barcode lookup returns `binnenBlockId`, computed with the same rule
 * as the 409 USE_COMPLETE_ROUTE of PATCH /api/vehicles/:id/maintenance-status: a block that is Binnen,
 * covers today and is not closed. The payload's `activeMaintenance` (the earliest open block) is not
 * that rule: a planned block before a Binnen one, or a Binnen block that does not cover today, must not
 * be offered for completion.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { isoToday, findBinnenBlockCoveringToday } from "../services/lifecycle";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, createFixtureReservation, cleanupFixtures } from "./helpers/fixtures";

let admin: TestAgent;
beforeAll(async () => { admin = await agentFor("admin"); }, 60_000);
afterAll(async () => { await cleanupFixtures(); await cleanupFixtureUsers(); });

const today = isoToday();
const day = (offset: number): string => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function block(vehicleId: number, startDate: string, endDate: string, maintenanceStatus: string, status = "picked_up") {
  const row = await createFixtureReservation({ vehicleId, startDate, endDate, status, type: "maintenance_block" });
  await db.update(reservations).set({ maintenanceStatus }).where(eq(reservations.id, row.id));
  return row.id;
}
async function scan(vehicleId: number, barcode: string) {
  const res = await admin.get(`/api/barcodes/${encodeURIComponent(barcode)}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(res.body.vehicle.id).toBe(vehicleId);
  return res.body;
}
async function car() {
  const vehicle = await createFixtureVehicle({ maintenanceStatus: "in_service" } as any);
  return { vehicle, code: vehicle.licensePlate }; // a plate scan resolves the vehicle like a barcode
}

describe("the barcode lookup names the block that Afronden finishes", () => {
  it("the Binnen block covering today, even when an earlier planned block is the 'active' one", async () => {
    const { vehicle, code } = await car();
    await block(vehicle.id, day(-20), day(-18), "scheduled", "booked"); // earlier, planned, not covering today
    const binnen = await block(vehicle.id, day(-1), day(1), "in");
    const body = await scan(vehicle.id, code);
    expect(body.binnenBlockId).toBe(binnen);
  });

  it("is null for a Binnen block that does not cover today, and for a planned block covering today", async () => {
    const past = await car();
    await block(past.vehicle.id, day(-10), day(-8), "in");
    expect((await scan(past.vehicle.id, past.code)).binnenBlockId).toBeNull();

    const planned = await car();
    await block(planned.vehicle.id, day(-1), day(1), "scheduled", "booked");
    expect((await scan(planned.vehicle.id, planned.code)).binnenBlockId).toBeNull();
  });

  it("is the id the 409 USE_COMPLETE_ROUTE names", async () => {
    const { vehicle, code } = await car();
    const binnen = await block(vehicle.id, day(-1), day(1), "in");
    const refused = await admin.patch(`/api/vehicles/${vehicle.id}/maintenance-status`).send({ status: "ok" });
    expect(refused.status).toBe(409);
    expect(refused.body.blockId).toBe(binnen);
    expect((await scan(vehicle.id, code)).binnenBlockId).toBe(binnen);
  });
});

describe("findBinnenBlockCoveringToday", () => {
  const base = { type: "maintenance_block", status: "picked_up", maintenanceStatus: "in", startDate: "2026-10-10", endDate: "2026-10-12", deletedAt: null };
  it("applies Binnen, covering today, not closed, not deleted, blocks only", () => {
    expect(findBinnenBlockCoveringToday([base], "2026-10-11")).toBe(base);
    expect(findBinnenBlockCoveringToday([{ ...base, maintenanceStatus: "in_service" }], "2026-10-11")).toBeTruthy();
    expect(findBinnenBlockCoveringToday([{ ...base, endDate: null }], "2026-10-11")).toBeTruthy();
    for (const patch of [{ maintenanceStatus: "scheduled" }, { maintenanceStatus: "out" }, { status: "completed" }, { status: "cancelled" },
      { deletedAt: new Date() }, { type: "standard" }, { startDate: "2026-10-12", endDate: "2026-10-13" }, { endDate: "2026-10-10" }]) {
      expect(findBinnenBlockCoveringToday([{ ...base, ...patch } as any], "2026-10-11"), JSON.stringify(patch)).toBeUndefined();
    }
  });
});
