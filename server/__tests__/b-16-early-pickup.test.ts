/**
 * besluiten.md **B-16** — "Ophalen vóór de startdatum: de medewerker krijgt de
 * vraag of de huur eerder ingaat; na bevestiging schuift de startdatum naar
 * vandaag, zodat periode en prijs kloppen (samen met B-07). Weigeren gebeurt
 * alleen als de medewerker de vraag met nee beantwoordt." (BUG-211, B-half)
 *
 * The audit picked up reservation #3544 forty days before its start date, with
 * no warning at all, and the rental then ended before it began (BUG-019). The
 * T-half — a `picked_up` rental makes the vehicle `rented` whatever the dates
 * say — landed in wave 4; this is the half that needed the owner's answer.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles as vehiclesTable } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";
import { isoToday } from "../services/lifecycle";
import { rentalDays } from "../../shared/rental-pricing";

let admin: TestAgent;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("B16")).id;
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

/** Days relative to today — never a weekday dependency. */
function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

let contractCounter = 0;
const nextContract = () => `FIXT-B16-${Date.now().toString(36)}-${++contractCounter}`;

describe("B-16 — picking up before the start date (BUG-211)", () => {
  it("is refused with a code the dialog can turn into the question", async () => {
    const vehicle = await createFixtureVehicle({ dailyPrice: "50" });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(40), endDate: day(50),
    });

    const res = await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 1000, fuelLevelPickup: "full",
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PICKUP_BEFORE_START_DATE");
    expect(res.body.startDate).toBe(day(40));
    expect(res.body.today).toBe(isoToday());

    // Nothing was written: this is a question, not a half-done pickup.
    const [row] = await db.select().from(reservations).where(eq(reservations.id, rental.id));
    expect(row.status).toBe("booked");
    expect(row.startDate).toBe(day(40));
    expect(row.contractNumber).toBeNull();
  });

  it("with the confirmation the start date moves to today and the price follows (B-07)", async () => {
    const vehicle = await createFixtureVehicle({ dailyPrice: "50" });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(40), endDate: day(50),
    });

    const res = await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 1000, fuelLevelPickup: "full",
      shiftStartDate: true,
    });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(reservations).where(eq(reservations.id, rental.id));
    expect(row.status).toBe("picked_up");
    expect(row.startDate).toBe(isoToday());
    // The period is real again, so the total is too — the same inclusive count
    // the booking form has always used.
    const days = rentalDays(isoToday(), day(50))!;
    expect(Number(row.totalPrice)).toBeCloseTo(50 * days, 2);

    // BUG-211's technical half, still true: the car is out, so it is `rented`.
    const [vehicleRow] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, vehicle.id));
    expect(vehicleRow.availabilityStatus).toBe("rented");
  });

  it("leaves the total alone when the vehicle has no daily rate on file", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(20), endDate: day(25),
    });
    await db.update(reservations).set({ totalPrice: "999.00" }).where(eq(reservations.id, rental.id));

    const res = await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 1000, fuelLevelPickup: "full",
      shiftStartDate: true,
    });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(reservations).where(eq(reservations.id, rental.id));
    expect(row.startDate).toBe(isoToday());
    // No rate, no invented price — the agreed total stands.
    expect(Number(row.totalPrice)).toBeCloseTo(999, 2);
  });

  it("an ordinary pickup on or after the start date needs no confirmation at all", async () => {
    const vehicle = await createFixtureVehicle({ dailyPrice: "50" });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-2), endDate: day(5),
    });

    const res = await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(), pickupMileage: 1000, fuelLevelPickup: "full",
    });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(reservations).where(eq(reservations.id, rental.id));
    expect(row.status).toBe("picked_up");
    // The agreed start date is not touched when nothing is early.
    expect(row.startDate).toBe(day(-2));
  });
});
