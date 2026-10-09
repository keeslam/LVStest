/**
 * Sub-project C, task 2 (besluiten B-30, B-39) - the vehicle's readings from
 * *before* a handover are kept on the reservation.
 *
 *   vehicle_mileage_before_pickup  / vehicle_fuel_before_pickup
 *   vehicle_mileage_before_return  / vehicle_fuel_before_return
 *
 * A pickup or a return overwrites vehicles.currentMileage / currentFuelLevel and
 * there is no mileage history, so a reversal (task 3) could not put the odometer
 * back. The two handover transactions now write the old readings onto the
 * reservation, from the vehicle row they already read, in the same transaction.
 *
 * Spec: docs/superpowers/specs/2026-10-09-terugdraaien-prullenbak-design.md §2.1.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isoDay } from "./helpers/dates";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles as vehiclesTable } from "../../shared/schema";
import { storage } from "../storage";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

let admin: TestAgent;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("C02")).id;
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

/** Days relative to today - never a weekday dependency. */
function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return isoDay(d);
}

let contractCounter = 0;
const nextContract = () => `FIXT-C02-${Date.now().toString(36)}-${++contractCounter}`;

async function rowOf(id: number) {
  const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
  return row;
}
async function vehicleRow(id: number) {
  const [row] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, id));
  return row;
}

describe("C-02 - the vehicle's readings before a handover", () => {
  it("a pickup stores the vehicle's mileage and fuel from before the pickup", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 5000, currentFuelLevel: "1/2" });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-1), endDate: day(3),
    });

    const res = await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 5100, fuelLevelPickup: "full",
    });
    expect(res.status).toBe(200);

    const row = await rowOf(rental.id);
    expect(row.status).toBe("picked_up");
    // The reading *before* the handover, not the one just entered.
    expect(row.vehicleMileageBeforePickup).toBe(5000);
    expect(row.vehicleFuelBeforePickup).toBe("1/2");
    expect(row.pickupMileage).toBe(5100);
    // Nothing has been returned yet.
    expect(row.vehicleMileageBeforeReturn).toBeNull();
    expect(row.vehicleFuelBeforeReturn).toBeNull();

    // The vehicle itself moved on to the new reading, as before.
    const v = await vehicleRow(vehicle.id);
    expect(v.currentMileage).toBe(5100);
    expect(v.currentFuelLevel).toBe("full");
  });

  it("a return stores the vehicle's readings from before the return and leaves the pickup ones alone", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 7000, currentFuelLevel: "3/4" });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-3), endDate: day(-1),
    });
    expect((await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 7010, fuelLevelPickup: "full", pickupDate: day(-3),
    })).status).toBe(200);

    const ret = await admin.post(`/api/reservations/${rental.id}/return`).send({
      returnMileage: 7300, fuelLevelReturn: "1/4", returnDate: day(-1),
    });
    expect(ret.status).toBe(200);

    const row = await rowOf(rental.id);
    expect(row.status).toBe("completed");
    // Before the return the vehicle stood at the pickup reading.
    expect(row.vehicleMileageBeforeReturn).toBe(7010);
    expect(row.vehicleFuelBeforeReturn).toBe("full");
    // The pickup pair is the one written by the pickup, untouched by the return.
    expect(row.vehicleMileageBeforePickup).toBe(7000);
    expect(row.vehicleFuelBeforePickup).toBe("3/4");

    const v = await vehicleRow(vehicle.id);
    expect(v.currentMileage).toBe(7300);
    expect(v.currentFuelLevel).toBe("1/4");
  });

  it("the before-return reading is whatever the vehicle shows at that moment, not the pickup reading", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 100, currentFuelLevel: "full" });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-3), endDate: day(-1),
    });
    expect((await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 110, fuelLevelPickup: "full", pickupDate: day(-3),
    })).status).toBe(200);

    // Someone corrects the odometer on the vehicle card while the car is out.
    await db.update(vehiclesTable)
      .set({ currentMileage: 180, currentFuelLevel: "1/2" })
      .where(eq(vehiclesTable.id, vehicle.id));

    expect((await admin.post(`/api/reservations/${rental.id}/return`).send({
      returnMileage: 400, fuelLevelReturn: "1/4", returnDate: day(-1),
    })).status).toBe(200);

    const row = await rowOf(rental.id);
    expect(row.pickupMileage).toBe(110);
    expect(row.vehicleMileageBeforeReturn).toBe(180);
    expect(row.vehicleFuelBeforeReturn).toBe("1/2");
  });

  it("a vehicle without readings leaves the columns null (nothing invented)", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-3), endDate: day(-1),
    });
    expect((await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 2000, fuelLevelPickup: "full", pickupDate: day(-3),
    })).status).toBe(200);

    const afterPickup = await rowOf(rental.id);
    expect(afterPickup.vehicleMileageBeforePickup).toBeNull();
    expect(afterPickup.vehicleFuelBeforePickup).toBeNull();

    // The vehicle now has readings (the pickup wrote them), so the return does.
    expect((await admin.post(`/api/reservations/${rental.id}/return`).send({
      returnMileage: 2100, fuelLevelReturn: "full", returnDate: day(-1),
    })).status).toBe(200);
    const afterReturn = await rowOf(rental.id);
    expect(afterReturn.vehicleMileageBeforeReturn).toBe(2000);
    expect(afterReturn.vehicleFuelBeforeReturn).toBe("full");
    expect(afterReturn.vehicleMileageBeforePickup).toBeNull();
  });

  it("an authorised mileage decrease still stores the higher reading the vehicle had", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 9000, currentFuelLevel: "empty" });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-1), endDate: day(2),
    });

    // The route needs an account password for this; the storage call is the
    // same transaction the route ends up in.
    await storage.pickupReservation(rental.id, {
      contractNumber: nextContract(), pickupMileage: 8000, fuelLevelPickup: "full",
      allowMileageDecrease: true, mileageDecreaseAuthorizedBy: "fixture",
    });

    const row = await rowOf(rental.id);
    expect(row.vehicleMileageBeforePickup).toBe(9000);
    expect(row.vehicleFuelBeforePickup).toBe("empty");
    expect(row.pickupMileage).toBe(8000);
    const v = await vehicleRow(vehicle.id);
    expect(v.currentMileage).toBe(8000);
    expect(v.previousMileage).toBe(9000);
  });

  it("a pickup refused for a lower mileage stores no readings", async () => {
    // The refusal happens before the transaction writes anything, so this proves
    // "no stray readings after a refusal", not atomicity of a failing write.
    const vehicle = await createFixtureVehicle({ currentMileage: 9000, currentFuelLevel: "1/2" });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-1), endDate: day(2),
    });

    const res = await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 100, fuelLevelPickup: "full",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);

    const row = await rowOf(rental.id);
    expect(row.status).toBe("booked");
    expect(row.vehicleMileageBeforePickup).toBeNull();
    expect(row.vehicleFuelBeforePickup).toBeNull();
    expect(row.vehicleMileageBeforeReturn).toBeNull();
    expect(row.vehicleFuelBeforeReturn).toBeNull();
  });

  it("a rental picked up before this change stays null on the pickup side and still gets the return side", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 3000, currentFuelLevel: "full" });
    // Written the way the old code left it: picked up, the four columns never set.
    const legacy = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-3), endDate: day(-1), status: "picked_up",
    });
    await db.update(reservations).set({
      pickupMileage: 3000, fuelLevelPickup: "full", actualPickupDate: day(-3), contractNumber: nextContract(),
    }).where(eq(reservations.id, legacy.id));

    const before = await rowOf(legacy.id);
    expect(before.vehicleMileageBeforePickup).toBeNull();
    expect(before.vehicleFuelBeforePickup).toBeNull();
    expect(before.vehicleMileageBeforeReturn).toBeNull();
    expect(before.vehicleFuelBeforeReturn).toBeNull();

    expect((await admin.post(`/api/reservations/${legacy.id}/return`).send({
      returnMileage: 3200, fuelLevelReturn: "1/2", returnDate: day(-1),
    })).status).toBe(200);

    const after = await rowOf(legacy.id);
    expect(after.vehicleMileageBeforePickup).toBeNull();
    expect(after.vehicleFuelBeforePickup).toBeNull();
    expect(after.vehicleMileageBeforeReturn).toBe(3000);
    expect(after.vehicleFuelBeforeReturn).toBe("full");
  });

  it("a vehicle at mileage 0 stores 0 before the pickup, not null (0 is a reading)", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 0, currentFuelLevel: "empty" });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-1), endDate: day(3),
    });

    expect((await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 10, fuelLevelPickup: "full",
    })).status).toBe(200);

    const row = await rowOf(rental.id);
    expect(row.vehicleMileageBeforePickup).toBe(0);
    expect(row.vehicleFuelBeforePickup).toBe("empty");
  });

  it("a vehicle at mileage 0 stores 0 before the return, not null", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 50, currentFuelLevel: "full" });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-3), endDate: day(-1),
    });
    expect((await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 60, fuelLevelPickup: "full", pickupDate: day(-3),
    })).status).toBe(200);
    // The odometer is reset on the vehicle card while the car is out.
    await db.update(vehiclesTable).set({ currentMileage: 0 }).where(eq(vehiclesTable.id, vehicle.id));

    expect((await admin.post(`/api/reservations/${rental.id}/return`).send({
      returnMileage: 90, fuelLevelReturn: "1/2", returnDate: day(-1),
    })).status).toBe(200);

    expect((await rowOf(rental.id)).vehicleMileageBeforeReturn).toBe(0);
  });

  it("the return locks the vehicle FOR NO KEY UPDATE: a concurrent FOR KEY SHARE (any row referencing the vehicle) does not stall it", async () => {
    // Inserting or updating a row that references the vehicle takes FOR KEY SHARE
    // on the vehicle row. The return only needs to be the sole writer of the
    // readings (the UPDATE it ends with takes FOR NO KEY UPDATE anyway), so it
    // must not take the stronger FOR UPDATE, which would stall every such write.
    const vehicle = await createFixtureVehicle({ currentMileage: 1000, currentFuelLevel: "full" });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-3), endDate: day(-1),
    });
    expect((await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 1010, fuelLevelPickup: "full", pickupDate: day(-3),
    })).status).toBe(200);

    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => { locked = resolve; });
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM vehicles WHERE id = ${vehicle.id} FOR KEY SHARE`);
      locked();
      await released;
    });
    await lockTaken;

    try {
      const outcome = await Promise.race([
        storage.returnReservation(rental.id, { returnMileage: 1200, fuelLevelReturn: "1/2", returnDate: day(-1) })
          .then(() => "returned" as const),
        new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 4000)),
      ]);
      expect(outcome).toBe("returned");
    } finally {
      release();
      await holder;
    }
  }, 30_000);
});
