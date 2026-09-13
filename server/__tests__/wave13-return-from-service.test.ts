/**
 * PHASE 57 / WAVE 13 item 4 — "Terug van onderhoud" deed maar de helft.
 *
 * The orange "Vervangend voertuig toegewezen" panel's **Terug van onderhoud**
 * button closed the replacement reservation and stopped there: the original
 * car kept `maintenance_status = in_service`, its `availability_status` stayed
 * `needs_fixing`, the open block kept blocking the calendar, and the employee
 * got the English toast "Could not load the data — No active replacement
 * found" on top of it. The manual told people to go and free the car by hand
 * afterwards.
 *
 * The rule lives where every other availability rule lives: the vehicle is
 * recomputed by `deriveVehicleAvailability()` after the workshop job is
 * closed, through `markVehicleForService()`. Only the block that covers the
 * return date closes — a repair planned for next month is not finished by
 * handing today's spare back.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles, type Vehicle } from "../../shared/schema";
import { storage } from "../storage";
import { normalizeReservationStatus } from "../services/lifecycle";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

let admin: TestAgent;
let customerId: number;

/** Fixed days, well away from "today": nothing here may depend on the clock. */
const BLOCK_START = "2026-11-02";
const RETURN_DATE = "2026-11-09";
const FUTURE_BLOCK_START = "2027-03-01";
const FUTURE_BLOCK_END = "2027-03-05";

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("Wave13Rfs")).id;
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

/** A car in the workshop with an open block, and a spare out with the customer. */
async function repairWithSpare(options: { withFutureBlock?: boolean } = {}) {
  const broken: Vehicle = await createFixtureVehicle({
    maintenanceStatus: "in_service",
    availabilityStatus: "needs_fixing",
  });
  const spareVehicle: Vehicle = await createFixtureVehicle();

  const rental = await createFixtureReservation({
    customerId, vehicleId: broken.id, startDate: BLOCK_START, endDate: "2026-12-20", status: "picked_up",
  });
  const block = await createFixtureReservation({
    customerId: null, vehicleId: broken.id, startDate: BLOCK_START, endDate: null,
    status: "booked", type: "maintenance_block",
  });
  await db.update(reservations).set({ maintenanceStatus: "in" }).where(eq(reservations.id, block.id));

  let futureBlock: Awaited<ReturnType<typeof createFixtureReservation>> | null = null;
  if (options.withFutureBlock) {
    futureBlock = await createFixtureReservation({
      customerId: null, vehicleId: broken.id,
      startDate: FUTURE_BLOCK_START, endDate: FUTURE_BLOCK_END,
      status: "booked", type: "maintenance_block",
    });
    await db.update(reservations).set({ maintenanceStatus: "scheduled" })
      .where(eq(reservations.id, futureBlock.id));
  }

  const spare = await createFixtureReservation({
    customerId, vehicleId: spareVehicle.id, startDate: BLOCK_START, endDate: null,
    status: "picked_up", type: "replacement",
  });
  await db.update(reservations)
    .set({ replacementForReservationId: rental.id, spareVehicleStatus: "picked_up" })
    .where(eq(reservations.id, spare.id));

  return { broken, spareVehicle, rental, block, futureBlock, spare };
}

describe("WAVE 13 — 'Terug van onderhoud' geeft de auto echt vrij", () => {
  it("closes the replacement AND puts the original vehicle back in service", async () => {
    const { broken, block, spare } = await repairWithSpare();

    const res = await admin
      .post(`/api/reservations/${spare.id}/return-from-service`)
      .send({ returnDate: RETURN_DATE });

    expect(res.status).toBe(200);

    // Half one: the replacement, which always worked.
    const closedSpare = await reservationRow(spare.id);
    expect(normalizeReservationStatus(closedSpare.status)).toBe("completed");
    expect(closedSpare.endDate).toBe(RETURN_DATE);

    // Half two, the half that was missing: the car itself.
    const car = await vehicleRow(broken.id);
    expect(car.maintenanceStatus).toBe("ok");
    expect(car.availabilityStatus).not.toBe("needs_fixing");

    // ...and the block that was keeping it there.
    const closedBlock = await reservationRow(block.id);
    expect(closedBlock.maintenanceStatus).toBe("out");
    expect(normalizeReservationStatus(closedBlock.status)).toBe("completed");
  });

  it("frees the original car for a new booking", async () => {
    const { broken, spare } = await repairWithSpare();
    await admin.post(`/api/reservations/${spare.id}/return-from-service`).send({ returnDate: RETURN_DATE });

    const verdict = await storage.isVehicleBookable({
      vehicleId: broken.id,
      startDate: "2027-06-01",
      endDate: "2027-06-05",
    } as any);
    expect(verdict.bookable).toBe(true);
  });

  it("leaves a repair planned for next month exactly where it was", async () => {
    const { spare, futureBlock } = await repairWithSpare({ withFutureBlock: true });

    await admin.post(`/api/reservations/${spare.id}/return-from-service`).send({ returnDate: RETURN_DATE });

    const stillPlanned = await reservationRow(futureBlock!.id);
    expect(normalizeReservationStatus(stillPlanned.status)).toBe("booked");
    expect(stillPlanned.maintenanceStatus).toBe("scheduled");
    expect(stillPlanned.startDate).toBe(FUTURE_BLOCK_START);
    expect(stillPlanned.endDate).toBe(FUTURE_BLOCK_END);
  });

  it("says in Dutch, and accurately, what is wrong when there is no replacement", async () => {
    const rentalOnly = await createFixtureReservation({
      customerId,
      vehicleId: (await createFixtureVehicle()).id,
      startDate: BLOCK_START,
      endDate: "2026-12-20",
      status: "picked_up",
    });

    const res = await admin
      .post(`/api/reservations/${rentalOnly.id}/return-from-service`)
      .send({ returnDate: RETURN_DATE });

    expect(res.status).toBe(404);
    // Not "No active replacement found": that sentence is English and it names
    // the wrong thing (nothing was being looked up, the id simply is not a
    // replacement).
    expect(res.body.message).not.toMatch(/No active replacement found/i);
    expect(res.body.message).toMatch(/vervang/i);
  });
});
