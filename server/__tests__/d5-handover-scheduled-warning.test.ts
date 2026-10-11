/**
 * Sub-project D, D5 (besluiten B-41/B-42) - a planned maintenance block covering
 * the pickup day makes the car 'scheduled', and the pickup dialog only WARNS:
 * the handover gate refuses needs_fixing, not 'scheduled' (the desk decides).
 *
 * The warning is a hint on the handover decision (`warnings: ["MAINTENANCE_SCHEDULED"]`),
 * read before the pickup by `GET /api/reservations/:id/handover-check` and never
 * a reason to refuse. B-09's booking warning is a different thing and unchanged.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles } from "../../shared/schema";
import { decideHandover, isoToday, scheduledMaintenanceOnDay } from "../services/lifecycle";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureReservation, createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";

const today = isoToday();

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe("decideHandover - the MAINTENANCE_SCHEDULED hint", () => {
  const block = (maintenanceStatus: string | null, extra: Record<string, unknown> = {}) =>
    ({ id: 7, type: "maintenance_block", status: "booked", startDate: today, endDate: addDays(today, 2), maintenanceStatus, ...extra }) as any;
  const car = { availabilityStatus: "scheduled", maintenanceStatus: "ok" };

  it("warns, and still allows, when a planned block covers the pickup day", () => {
    const decision = decideHandover(car, {}, { day: today, reservations: [block("scheduled")] });
    expect(decision.allowed).toBe(true);
    expect(decision.refusal).toBeNull();
    expect(decision.warnings).toEqual(["MAINTENANCE_SCHEDULED"]);
  });

  it("has no warning without a context, for a block on other days, a closed block or one the car is in", () => {
    expect(decideHandover(car).warnings).toEqual([]);
    expect(decideHandover(car, {}, { day: today, reservations: [block("scheduled", { startDate: addDays(today, 5), endDate: addDays(today, 6) })] }).warnings).toEqual([]);
    expect(decideHandover(car, {}, { day: today, reservations: [block("scheduled", { status: "cancelled" })] }).warnings).toEqual([]);
    expect(decideHandover(car, {}, { day: today, reservations: [block("scheduled", { deletedAt: new Date() })] }).warnings).toEqual([]);
    expect(decideHandover(car, {}, { day: today, reservations: [block("out", { status: "completed" })] }).warnings).toEqual([]);
    // A car that is "Binnen" is refused by the gate (needs_fixing), it is not a warning.
    expect(decideHandover(car, {}, { day: today, reservations: [block("in", { status: "picked_up" })] }).warnings).toEqual([]);
  });

  it("lists the blocks it warns about", () => {
    const found = scheduledMaintenanceOnDay([block("scheduled"), block("in", { id: 8 })], today);
    expect(found.map((b) => b.id)).toEqual([7]);
  });
});

describe("GET /api/reservations/:id/handover-check and the pickup itself", () => {
  let admin: TestAgent;
  let customerId: number;

  beforeAll(async () => {
    admin = await agentFor("admin");
    customerId = (await createFixtureCustomer("D5")).id;
  });

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  async function planBlockToday(vehicleId: number): Promise<number> {
    const res = await admin.post("/api/reservations").send({
      vehicleId, customerId: null, startDate: today, endDate: addDays(today, 1),
      status: "scheduled", type: "maintenance_block", notes: "FIXT D5 handover", totalPrice: 0,
      maintenanceDuration: 2, maintenanceStatus: "scheduled",
    });
    expect([200, 201]).toContain(res.status);
    return (res.body.id ?? res.body.maintenanceReservationId) as number;
  }

  it("a rental on a car with a planned block today: warning, no refusal, and the pickup goes through", async () => {
    const vehicle = await createFixtureVehicle({ dailyPrice: "50" });
    const rental = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: today, endDate: addDays(today, 3) });
    const blockId = await planBlockToday(vehicle.id);

    const check = await admin.get(`/api/reservations/${rental.id}/handover-check`);
    expect(check.status).toBe(200);
    expect(check.body.canHandOver).toBe(true);
    expect(check.body.warnings).toEqual(["MAINTENANCE_SCHEDULED"]);
    expect(check.body.maintenanceBlocks.map((b: any) => b.id)).toEqual([blockId]);

    const pickup = await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: `FIXT-D5-${Date.now().toString(36)}`, pickupMileage: 1000, fuelLevelPickup: "full",
    });
    expect(pickup.status).toBe(200);
    const [row] = await db.select().from(reservations).where(eq(reservations.id, rental.id));
    expect(row.status).toBe("picked_up");
  });

  it("a car without a block gets no warning", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: today, endDate: addDays(today, 3) });

    const check = await admin.get(`/api/reservations/${rental.id}/handover-check`);
    expect(check.status).toBe(200);
    expect(check.body).toMatchObject({ canHandOver: true, warnings: [], maintenanceBlocks: [] });
  });

  it("a car that is needs_fixing is reported as refused (the existing B-03 gate), with its reason code", async () => {
    const vehicle = await createFixtureVehicle();
    await db.update(vehicles).set({ availabilityStatus: "needs_fixing" }).where(eq(vehicles.id, vehicle.id));
    const rental = await createFixtureReservation({ customerId, vehicleId: vehicle.id, startDate: today, endDate: addDays(today, 3) });

    const check = await admin.get(`/api/reservations/${rental.id}/handover-check`);
    expect(check.status).toBe(200);
    expect(check.body.canHandOver).toBe(false);
    expect(check.body.refusal.reasonCode).toBe("NEEDS_FIXING");
  });

  it("an unknown reservation is 404", async () => {
    const res = await admin.get("/api/reservations/987654321/handover-check");
    expect(res.status).toBe(404);
  });
});
