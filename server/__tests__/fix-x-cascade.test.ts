/**
 * FIX-X — delete/cancel cascades and orphan prevention.
 *
 * Deleting and cancelling did not propagate, and the recycle bin was not a
 * faithful round trip. This is the cluster closest to the 2026-08-25 incident.
 *
 *   BUG-007 (CRITICAL) — a customer is hard-deleted with no impact check, and a
 *                        `booked` reservation keeps pointing at a row that no
 *                        longer exists (besluiten B-08).
 *   BUG-055 — deleting a reservation leaves the driver assignment open.
 *   BUG-090 — two parallel deletes: one 200, one 500 echoing `error.message`.
 *   BUG-108 — a vehicle in the recycle bin stays bookable, and the restore puts
 *             the snapshotted bookings back with no conflict check.
 *   BUG-110 — the snapshot misses five relationship types, so the restore
 *             silently loses them and `delete-impact` does not count them.
 *   BUG-112 — cancelling touches nothing else (besluiten B-04).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isoDay } from "./helpers/dates";
import { and, eq, isNull, like, sql } from "drizzle-orm";
import { db } from "../db";
import {
  reservations, vehicles as vehiclesTable, customers, deletedRecords,
  reservationDriverAssignments, vehicleTransports, drivers,
} from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
  FIXTURE_PLATE_PREFIX, FIXTURE_PREFIX,
} from "./helpers/fixtures";
import { fireParallel, statusCounts, serverErrors, responsesOf } from "./helpers/parallel";

let admin: TestAgent;

beforeAll(async () => {
  admin = await agentFor("admin");
});

afterAll(async () => {
  await db.delete(deletedRecords).where(like(deletedRecords.label, `${FIXTURE_PLATE_PREFIX}%`));
  await db.delete(deletedRecords).where(like(deletedRecords.label, `${FIXTURE_PREFIX}%`));
  const fixtureVehicles = await db.select({ id: vehiclesTable.id }).from(vehiclesTable)
    .where(like(vehiclesTable.licensePlate, `${FIXTURE_PLATE_PREFIX}%`));
  for (const v of fixtureVehicles) {
    await db.delete(vehicleTransports).where(eq(vehicleTransports.vehicleId, v.id));
    await db.delete(vehicleTransports).where(eq(vehicleTransports.relatedVehicleId, v.id));
  }
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return isoDay(d);
}

async function count(table: any, where: any): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(where);
  return row.n;
}

describe("FIX-X — deleting a customer (besluiten B-08, BUG-007)", () => {
  it("is refused while a current or future reservation exists, and the reservation survives", async () => {
    const customer = await createFixtureCustomer("Blokkeer");
    const vehicle = await createFixtureVehicle();
    const reservation = await createFixtureReservation({
      customerId: customer.id, vehicleId: vehicle.id, startDate: day(10), endDate: day(14),
    });

    const impact = await admin.get(`/api/customers/${customer.id}/delete-impact`);
    expect(impact.status).toBe(200);
    expect(impact.body.blocked).toBe(true);
    expect(impact.body.blockingReservations.map((r: any) => r.id)).toContain(reservation.id);

    const res = await admin.delete(`/api/customers/${customer.id}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CUSTOMER_HAS_LIVE_RESERVATIONS");

    // The customer is still there, so the reservation is not dangling.
    expect(await count(customers, eq(customers.id, customer.id))).toBe(1);
    const [row] = await db.select().from(reservations).where(eq(reservations.id, reservation.id));
    expect(row.customerId).toBe(customer.id);
  });

  it("goes to the recycle bin and comes back, with its drivers", async () => {
    const customer = await createFixtureCustomer("Prullenbak");
    const [driver] = await db.insert(drivers).values({
      customerId: customer.id, displayName: "FIXT Chauffeur",
    } as any).returning();

    const res = await admin.delete(`/api/customers/${customer.id}`);
    expect(res.status).toBe(204);
    expect(await count(customers, eq(customers.id, customer.id))).toBe(0);
    expect(await count(drivers, eq(drivers.id, driver.id))).toBe(0);

    const [record] = await db.select().from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "customer"), eq(deletedRecords.entityId, customer.id)));
    expect(record).toBeDefined();

    const restored = await admin.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(restored.status).toBe(200);
    expect(await count(customers, eq(customers.id, customer.id))).toBe(1);
    // BUG-110's rule, on the customer side: what Postgres cascaded away comes back.
    expect(await count(drivers, eq(drivers.id, driver.id))).toBe(1);
  });
});

describe("FIX-X — cancelling a reservation (besluiten B-04, BUG-112)", () => {
  it("reports the impact and changes nothing without an explicit cascade", async () => {
    const customer = await createFixtureCustomer("Annuleer");
    const vehicle = await createFixtureVehicle();
    const spare = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId: customer.id, vehicleId: vehicle.id, startDate: day(20), endDate: day(25),
    });
    const [assignment] = await db.insert(reservationDriverAssignments).values({
      reservationId: rental.id, driverId: null, assignedFrom: new Date(),
    } as any).returning();
    const spareRes = await admin.post(`/api/reservations/${rental.id}/assign-spare`)
      .send({ spareVehicleId: spare.id, startDate: day(21), endDate: day(23) });
    expect(spareRes.status).toBe(200);
    const spareReservationId = spareRes.body.replacementReservation.id;

    const impact = await admin.get(`/api/reservations/${rental.id}/cancel-impact`);
    expect(impact.status).toBe(200);
    expect(impact.body.spares.map((r: any) => r.id)).toContain(spareReservationId);
    expect(impact.body.drivers.map((d: any) => d.id)).toContain(assignment.id);

    const cancelled = await admin.patch(`/api/reservations/${rental.id}/status`).send({ status: "cancelled" });
    expect(cancelled.status).toBe(200);
    // Default is "ask, do not sweep" — nothing was closed, and the caller is told so.
    expect(cancelled.body.cancelCascade.applied.spares).toBe(0);
    expect(cancelled.body.cancelCascade.remaining.spares).toBe(1);
    const [stillThere] = await db.select().from(reservations).where(eq(reservations.id, spareReservationId));
    expect(stillThere.status).toBe("booked");
  });

  it("closes exactly what the caller asked for", async () => {
    const customer = await createFixtureCustomer("Annuleer2");
    const vehicle = await createFixtureVehicle();
    const spare = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId: customer.id, vehicleId: vehicle.id, startDate: day(40), endDate: day(45),
    });
    const [assignment] = await db.insert(reservationDriverAssignments).values({
      reservationId: rental.id, driverId: null, assignedFrom: new Date(),
    } as any).returning();
    const spareRes = await admin.post(`/api/reservations/${rental.id}/assign-spare`)
      .send({ spareVehicleId: spare.id, startDate: day(41), endDate: day(43) });
    const spareReservationId = spareRes.body.replacementReservation.id;

    const cancelled = await admin.patch(`/api/reservations/${rental.id}/status`)
      .send({ status: "cancelled", cascade: { spares: true, drivers: true } });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.cancelCascade.applied.spares).toBe(1);
    expect(cancelled.body.cancelCascade.applied.drivers).toBe(1);

    const [spareRow] = await db.select().from(reservations).where(eq(reservations.id, spareReservationId));
    expect(spareRow.status).toBe("cancelled");
    const [assignmentRow] = await db.select().from(reservationDriverAssignments)
      .where(eq(reservationDriverAssignments.id, assignment.id));
    expect(assignmentRow.assignedUntil).not.toBeNull();

    // …and the spare vehicle is free again.
    const [spareVehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, spare.id));
    expect(spareVehicle.availabilityStatus).not.toBe("scheduled");
  });
});

describe("FIX-X — deleting a reservation", () => {
  it("closes the open driver assignment (BUG-055)", async () => {
    const customer = await createFixtureCustomer("DelDriver");
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId: customer.id, vehicleId: vehicle.id, startDate: day(60), endDate: day(62),
    });
    const [assignment] = await db.insert(reservationDriverAssignments).values({
      reservationId: rental.id, driverId: null, assignedFrom: new Date(),
    } as any).returning();

    expect((await admin.delete(`/api/reservations/${rental.id}`)).status).toBe(200);

    const [row] = await db.select().from(reservationDriverAssignments)
      .where(eq(reservationDriverAssignments.id, assignment.id));
    expect(row.assignedUntil).not.toBeNull();
  });

  it("two parallel deletes give one 200 and one 4xx, never a 500 (BUG-090)", async () => {
    const customer = await createFixtureCustomer("Race");
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId: customer.id, vehicleId: vehicle.id, startDate: day(70), endDate: day(72),
    });

    const results = await fireParallel(2, () => admin.delete(`/api/reservations/${rental.id}`));
    const counts = statusCounts(results);
    expect(counts[200]).toBe(1);
    expect(serverErrors(results)).toHaveLength(0);
    for (const r of responsesOf(results)) {
      if (r.status === 200) continue;
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(r.body)).not.toContain("error\":\"");
    }
  });
});

describe("FIX-X — the vehicle recycle bin round trip", () => {
  it("a restore reports the conflict instead of double-booking the car (BUG-108)", async () => {
    const customer = await createFixtureCustomer("Restore");
    const other = await createFixtureCustomer("RestoreAnder");
    const vehicle = await createFixtureVehicle();
    // besluiten B-14 (BUG-022) refuses to delete a vehicle with a *live or
    // planned* rental, so the snapshotted booking is one that is over but was
    // never closed — still live for the overlap predicate, which is exactly the
    // row BUG-108 double-booked.
    const original = await createFixtureReservation({
      customerId: customer.id, vehicleId: vehicle.id, startDate: day(-125), endDate: day(-120),
    });

    const deleted = await admin.delete(`/api/vehicles/${vehicle.id}`)
      .send({ confirmLicensePlate: vehicle.licensePlate });
    expect(deleted.status).toBe(200);

    // BUG-108: the vehicle is in the bin, so booking it is refused outright.
    const ghost = await admin.post("/api/reservations").send({
      customerId: other.id, vehicleId: vehicle.id, startDate: day(-124), endDate: day(-122), type: "standard",
    });
    expect(ghost.status).toBe(404);

    // …which is not the only way a row lands on that vehicle id:
    // `reservations.vehicle_id` carries no foreign key (BUG-039), so an import
    // or a direct write can still put one there while the car is in the bin.
    // That is the state the restore has to survive.
    const [taken] = await db.insert(reservations).values({
      customerId: other.id, vehicleId: vehicle.id, startDate: day(-124), endDate: day(-122),
      status: "booked", type: "standard",
    } as any).returning();

    const [record] = await db.select().from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "vehicle"), eq(deletedRecords.entityId, vehicle.id)));
    expect(record).toBeDefined();
    // BUG-110: the snapshot counts more than the seven hand-listed tables.
    expect(record.relatedCounts).toBeTruthy();

    const restored = await admin.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(restored.status).toBe(200);

    // The snapshotted booking came back visible but cancelled, with the reason
    // on it — never as a second live booking on the same days.
    const [restoredOriginal] = await db.select().from(reservations).where(eq(reservations.id, original.id));
    expect(restoredOriginal.status).toBe("cancelled");
    expect(restoredOriginal.notes ?? "").toContain("[RESTORE]");
    expect(restoredOriginal.notes ?? "").toContain(`#${taken.id}`);

    // No overlapping live pair on that vehicle afterwards.
    const overlapResult: any = await db.execute(sql`
      SELECT count(*)::int AS n
      FROM reservations a
      JOIN reservations b ON b.vehicle_id = a.vehicle_id AND b.id <> a.id
      WHERE a.vehicle_id = ${vehicle.id}
        AND a.deleted_at IS NULL AND b.deleted_at IS NULL
        AND a.status NOT IN ('cancelled','completed','returned')
        AND b.status NOT IN ('cancelled','completed','returned')
        AND a.start_date <= COALESCE(b.end_date, '9999-12-31')
        AND COALESCE(a.end_date, '9999-12-31') >= b.start_date
    `);
    const n = Number((overlapResult.rows ?? overlapResult)[0].n);
    expect(n).toBe(0);

    const [back] = await db.select().from(reservations).where(eq(reservations.id, original.id));
    expect(back).toBeDefined();
  });

  it("restores the driver assignment the delete cascaded away (BUG-110)", async () => {
    const customer = await createFixtureCustomer("Roundtrip");
    const vehicle = await createFixtureVehicle();
    // History, not a live booking — besluiten B-14 refuses to delete a vehicle
    // that still has a rental running or planned on it.
    const rental = await createFixtureReservation({
      customerId: customer.id, vehicleId: vehicle.id, startDate: day(-155), endDate: day(-150),
      status: "completed",
    });
    const [assignment] = await db.insert(reservationDriverAssignments).values({
      reservationId: rental.id, driverId: null, assignedFrom: new Date(),
    } as any).returning();

    const impact = await admin.get(`/api/vehicles/${vehicle.id}/delete-impact`);
    expect(impact.status).toBe(200);
    expect(impact.body.counts.reservation_driver_assignments).toBeGreaterThanOrEqual(1);

    expect((await admin.delete(`/api/vehicles/${vehicle.id}`)
      .send({ confirmLicensePlate: vehicle.licensePlate })).status).toBe(200);
    expect(await count(reservationDriverAssignments, eq(reservationDriverAssignments.id, assignment.id))).toBe(0);

    const [record] = await db.select().from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "vehicle"), eq(deletedRecords.entityId, vehicle.id)));
    expect((await admin.post(`/api/deleted-records/${record.id}/restore`).send({})).status).toBe(200);

    expect(await count(reservationDriverAssignments, eq(reservationDriverAssignments.id, assignment.id))).toBe(1);
  });
});
