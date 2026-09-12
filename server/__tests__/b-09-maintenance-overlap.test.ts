/**
 * besluiten.md **B-09** — "Verhuring op een auto met een onderhoudsblok:
 * waarschuwen, de medewerker mag doorgaan." (BUG-013, BUG-037)
 *
 * Two halves, and both have to be true at once:
 *
 *   - the write is **allowed** — a rental over an active maintenance block, and
 *     a second maintenance block overlapping the first — but it comes back with
 *     a machine-readable warning naming the maintenance period, so the desk can
 *     be told before the save;
 *   - "in onderhoud" still does **not** count as available (**B-01**). The two
 *     rules live next to each other and must not be unified by accident: the
 *     booking is allowed, the availability derivation is untouched.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";
import { BOOKING_WARNING_MAINTENANCE_OVERLAP } from "../../shared/booking-warnings";
import { deriveVehicleAvailability } from "../services/lifecycle";

let admin: TestAgent;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("B09")).id;
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

/** Fixed far-future dates: nothing in this file may depend on today or on the weekday. */
const BLOCK_START = "2029-03-10";
const BLOCK_END = "2029-03-20";

function warningsOf(body: any): any[] {
  return Array.isArray(body?.warnings) ? body.warnings : [];
}

describe("B-09 — a rental over an active maintenance block (BUG-013)", () => {
  it("is accepted, and the response carries the maintenance warning with the period", async () => {
    const vehicle = await createFixtureVehicle();
    const block = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: BLOCK_START, endDate: BLOCK_END,
      type: "maintenance_block",
    });

    const res = await admin.post("/api/reservations").send({
      customerId, vehicleId: vehicle.id, startDate: "2029-03-12", endDate: "2029-03-15",
      status: "booked", type: "standard",
    });

    expect(res.status).toBe(201);
    const warning = warningsOf(res.body).find((w) => w.code === BOOKING_WARNING_MAINTENANCE_OVERLAP);
    expect(warning).toBeDefined();
    expect(warning.maintenanceBlocks.map((b: any) => b.id)).toContain(block.id);
    // The period has to be *in the message* (B-09), not only in the payload.
    expect(warning.message).toContain("10-03-2029");
    expect(warning.message).toContain("20-03-2029");
  });

  it("the pre-save check the form runs gives the same warning, with no conflict", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: BLOCK_START, endDate: BLOCK_END,
      type: "maintenance_block",
    });

    const res = await admin.get(
      `/api/reservations/booking-check?vehicleId=${vehicle.id}&startDate=2029-03-11&endDate=2029-03-13`,
    );

    expect(res.status).toBe(200);
    expect(res.body.bookable).toBe(true);
    expect(res.body.conflicts).toEqual([]);
    const warning = warningsOf(res.body).find((w) => w.code === BOOKING_WARNING_MAINTENANCE_OVERLAP);
    expect(warning).toBeDefined();
    expect(warning.message).toContain("10-03-2029");
  });

  it("a rental that does not touch the block gets no warning at all", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: BLOCK_START, endDate: BLOCK_END,
      type: "maintenance_block",
    });

    const res = await admin.get(
      `/api/reservations/booking-check?vehicleId=${vehicle.id}&startDate=2029-04-01&endDate=2029-04-03`,
    );
    expect(res.status).toBe(200);
    expect(res.body.bookable).toBe(true);
    expect(warningsOf(res.body)).toEqual([]);
  });

  it("an ordinary double booking is still refused — a warning is not a conflict", async () => {
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2029-05-01", endDate: "2029-05-10",
    });

    const res = await admin.post("/api/reservations").send({
      customerId, vehicleId: vehicle.id, startDate: "2029-05-03", endDate: "2029-05-05",
      status: "booked", type: "standard",
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
  });
});

describe("B-09 — two overlapping maintenance blocks on one vehicle (BUG-037)", () => {
  it("is accepted and warns about the block that was already there", async () => {
    const vehicle = await createFixtureVehicle();
    const first = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: BLOCK_START, endDate: BLOCK_END,
      type: "maintenance_block",
    });

    const res = await admin.post("/api/reservations").send({
      vehicleId: vehicle.id, startDate: "2029-03-15", endDate: "2029-03-25",
      type: "maintenance_block", status: "booked", maintenanceStatus: "scheduled",
    });

    expect(res.status).toBe(201);
    const second = res.body.id ?? res.body.maintenanceReservationId;
    expect(second).toBeTruthy();
    const [row] = await db.select().from(reservations).where(eq(reservations.id, second));
    expect(row.type).toBe("maintenance_block");

    const warning = warningsOf(res.body).find((w) => w.code === BOOKING_WARNING_MAINTENANCE_OVERLAP);
    expect(warning).toBeDefined();
    expect(warning.maintenanceBlocks.map((b: any) => b.id)).toContain(first.id);
  });
});

describe("B-09 next to B-01 — allowed to book, still not 'available'", () => {
  it("an open maintenance block keeps the vehicle out of the available count", () => {
    const today = "2029-03-12";
    const status = deriveVehicleAvailability({
      today,
      currentStatus: "available",
      maintenanceStatus: null,
      reservations: [
        {
          id: 1, type: "maintenance_block", status: "booked", startDate: BLOCK_START,
          endDate: BLOCK_END, deletedAt: null, maintenanceStatus: "scheduled",
        } as any,
      ],
    });
    // B-01: in onderhoud telt niet mee als beschikbaar, ook al mag er geboekt worden.
    expect(status).not.toBe("available");
  });
});
