/**
 * OPT-015 — "Onderhoud afronden" als één handeling.
 *
 * Closing one repair cost three actions across two screens: put the block on
 * `out`, put the vehicle's `maintenance_status` back to `ok`, and run
 * `return-from-service` on the spare. Nothing enforced the order and nothing
 * warned when one was skipped — skip the second and the car stays "in de
 * werkplaats" forever; skip the first and the block keeps blocking the
 * calendar (44 vehicles with an unclosed block in the clone). The two closing
 * paths also wrote different dates.
 *
 * The plan's acceptance criteria, both asserted here:
 *   - the single call leaves block closed, vehicle flag cleared and spare
 *     returned;
 *   - a forced failure halfway leaves **none** of the three changed.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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

/** Well away from "today": no assertion here may depend on the date. */
const BLOCK_START = "2026-11-02";
const COMPLETION = "2026-11-09";

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("Opt015")).id;
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

/** A car in the workshop, with an open block and a spare out with the customer. */
async function repairInProgress() {
  const broken: Vehicle = await createFixtureVehicle({ maintenanceStatus: "in_service" });
  const spareVehicle: Vehicle = await createFixtureVehicle();

  const rental = await createFixtureReservation({
    customerId, vehicleId: broken.id, startDate: BLOCK_START, endDate: "2026-12-20", status: "picked_up",
  });
  const block = await createFixtureReservation({
    customerId: null, vehicleId: broken.id, startDate: BLOCK_START, endDate: null,
    status: "booked", type: "maintenance_block",
  });
  await db.update(reservations).set({ maintenanceStatus: "in" }).where(eq(reservations.id, block.id));

  const spare = await createFixtureReservation({
    customerId, vehicleId: spareVehicle.id, startDate: BLOCK_START, endDate: null,
    status: "picked_up", type: "replacement",
  });
  await db.update(reservations)
    .set({ replacementForReservationId: rental.id, spareVehicleStatus: "picked_up" })
    .where(eq(reservations.id, spare.id));

  return { broken, spareVehicle, rental, block, spare };
}

describe("OPT-015 — de reparatie is klaar, in één handeling", () => {
  it("closes the block, clears the vehicle flag and returns the spare in one call", async () => {
    const { broken, block, spare } = await repairInProgress();

    const res = await admin.post(`/api/reservations/${block.id}/complete-maintenance`)
      .send({ completionDate: COMPLETION, maintenanceCategory: "repair" });

    expect(res.status).toBe(200);

    const closedBlock = await reservationRow(block.id);
    expect(closedBlock.maintenanceStatus).toBe("out");
    expect(normalizeReservationStatus(closedBlock.status)).toBe("completed");

    const car = await vehicleRow(broken.id);
    expect(car.maintenanceStatus).toBe("ok");

    const closedSpare = await reservationRow(spare.id);
    expect(normalizeReservationStatus(closedSpare.status)).toBe("completed");
    expect(closedSpare.spareVehicleStatus).toBe("returned");
  });

  it("has one date convention: the completion date is the end date, the start is never rewritten", async () => {
    const { block } = await repairInProgress();

    await admin.post(`/api/reservations/${block.id}/complete-maintenance`).send({ completionDate: COMPLETION });

    const closedBlock = await reservationRow(block.id);
    expect(closedBlock.endDate).toBe(COMPLETION);
    // The old calendar path overwrote both, destroying when the repair began.
    expect(closedBlock.startDate).toBe(BLOCK_START);
  });

  it("frees the car for booking again", async () => {
    const { broken, block } = await repairInProgress();
    await admin.post(`/api/reservations/${block.id}/complete-maintenance`).send({ completionDate: COMPLETION });

    const verdict = await storage.isVehicleBookable({
      vehicleId: broken.id,
      startDate: "2027-02-01",
      endDate: "2027-02-05",
    } as any);
    expect(verdict.bookable).toBe(true);
  });

  it("a failure halfway leaves none of the three changed", async () => {
    const { broken, block, spare } = await repairInProgress();

    // Force the *last* write of the transaction to throw, which is the case
    // that would leave a half state without one.
    const spy = vi.spyOn(storage as any, "markVehicleForService")
      .mockRejectedValueOnce(new Error("FIXT-forced failure"));

    let threw = false;
    try {
      await storage.completeMaintenance(block.id, { completionDate: COMPLETION });
    } catch {
      threw = true;
    } finally {
      spy.mockRestore();
    }
    expect(threw).toBe(true);

    // Nothing moved.
    const untouchedBlock = await reservationRow(block.id);
    expect(untouchedBlock.maintenanceStatus).toBe("in");
    expect(normalizeReservationStatus(untouchedBlock.status)).toBe("booked");
    expect(untouchedBlock.endDate).toBeNull();

    expect((await vehicleRow(broken.id)).maintenanceStatus).toBe("in_service");

    const untouchedSpare = await reservationRow(spare.id);
    expect(normalizeReservationStatus(untouchedSpare.status)).toBe("picked_up");
    expect(untouchedSpare.spareVehicleStatus).toBe("picked_up");
  });

  it("works for a repair without a spare", async () => {
    const broken = await createFixtureVehicle({ maintenanceStatus: "in_service" });
    const block = await createFixtureReservation({
      customerId: null, vehicleId: broken.id, startDate: BLOCK_START, endDate: null,
      status: "booked", type: "maintenance_block",
    });

    const res = await admin.post(`/api/reservations/${block.id}/complete-maintenance`)
      .send({ completionDate: COMPLETION });

    expect(res.status).toBe(200);
    expect(res.body.spareReservation).toBeNull();
    expect((await vehicleRow(broken.id)).maintenanceStatus).toBe("ok");
  });

  it("refuses an ordinary rental, an unknown id and an unreadable date", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: BLOCK_START, endDate: "2026-12-01", status: "booked",
    });

    const notABlock = await admin.post(`/api/reservations/${rental.id}/complete-maintenance`).send({});
    expect(notABlock.status).toBe(400);
    // The rental is untouched.
    expect(normalizeReservationStatus((await reservationRow(rental.id)).status)).toBe("booked");

    expect((await admin.post("/api/reservations/99999999/complete-maintenance").send({})).status).toBe(404);
    expect((await admin.post("/api/reservations/abc/complete-maintenance").send({})).status).toBe(400);

    const block = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: BLOCK_START, endDate: null,
      status: "booked", type: "maintenance_block",
    });
    const badDate = await admin.post(`/api/reservations/${block.id}/complete-maintenance`)
      .send({ completionDate: "geen datum" });
    expect(badDate.status).toBe(400);
  });

  it("needs the maintenance or reservation permission", async () => {
    const vehicle = await createFixtureVehicle();
    const block = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: BLOCK_START, endDate: null,
      status: "booked", type: "maintenance_block",
    });
    const outsider = await agentFor(["view_vehicles"]);
    const res = await outsider.post(`/api/reservations/${block.id}/complete-maintenance`).send({});
    expect(res.status).toBe(403);
  });
});
