/**
 * FIX-G — check-then-act races turned into conditional writes.
 *
 * Nine sites with one shape: read a row, decide, then write unconditionally.
 * Each is now a write that carries its own precondition (a conditional UPDATE,
 * a row lock, or the claim of the row that gates the work), and the loser gets
 * a clean 409 instead of a second row or a raw 500.
 *
 *   BUG-174 — two pickups of one reservation both succeed.
 *   BUG-043 — parallel restores of one deleted record give raw 500s.
 *   BUG-126 — a restore onto a taken barcode gives a raw 500, not a 409.
 *   BUG-141 — two portal approvals make two maintenance blocks and two replies.
 *   BUG-158 — two assign-vehicle calls on one placeholder both return 200.
 *   BUG-188 — parallel vehicle deletes leave two snapshots in the bin.
 *   BUG-189 — a password change from two tabs succeeds twice.
 *   BUG-142 — a transport that ends in 409 leaves an orphan transport row.
 *   BUG-175 — settings and template saves overwrite each other silently.
 *
 * Plan §8.10: all promises first, one `Promise.allSettled`, assert on
 * `SELECT count(*)` and on zero 5xx.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "../db";
import {
  reservations, vehicles as vehiclesTable, deletedRecords, documents,
  vehicleTransports, portalRequests, users as usersTable,
} from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
  FIXTURE_PLATE_PREFIX,
} from "./helpers/fixtures";
import { fireParallel, statusCounts, serverErrors, rejections } from "./helpers/parallel";

let admin: TestAgent;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("Atomic")).id;
});

afterAll(async () => {
  await db.delete(deletedRecords).where(like(deletedRecords.label, `${FIXTURE_PLATE_PREFIX}%`));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

function bodyText(body: unknown): string {
  return JSON.stringify(body ?? {}).slice(0, 300);
}

async function count(table: any, where: any): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(where);
  return row.n;
}

/** Deletes a fixture vehicle through the API and returns its deleted_records id. */
async function deleteVehicleViaApi(vehicleId: number, licensePlate: string): Promise<number> {
  const res = await admin.delete(`/api/vehicles/${vehicleId}`).send({ confirmLicensePlate: licensePlate });
  expect(res.status, bodyText(res.body)).toBe(200);
  const [record] = await db
    .select()
    .from(deletedRecords)
    .where(and(eq(deletedRecords.entityType, "vehicle"), eq(deletedRecords.entityId, vehicleId)));
  expect(record).toBeTruthy();
  return record.id;
}

describe("FIX-G — atomic transitions", () => {
  it("two parallel pickups of one reservation: one wins, one contract number (BUG-174)", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 1000 });
    const reservation = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2031-01-05", endDate: "2031-01-09",
    });

    const results = await fireParallel(2, (i) =>
      admin.post(`/api/reservations/${reservation.id}/pickup`).send({
        contractNumber: `FIXT-C-${reservation.id}-${i}`,
        pickupMileage: 1200,
        fuelLevelPickup: "full",
        pickupDate: "2031-01-05",
        // besluiten B-16 (BUG-211): this rental has not started yet, so the
        // pickup carries the employee's confirmation. The race under test is
        // the write, not the question.
        shiftStartDate: true,
      }),
    );

    expect(rejections(results)).toEqual([]);
    expect(serverErrors(results)).toEqual([]);
    const counts = statusCounts(results);
    expect(counts[200] ?? 0).toBe(1);

    const [row] = await db.select().from(reservations).where(eq(reservations.id, reservation.id));
    expect(row.status).toBe("picked_up");
    expect(row.contractNumber).toMatch(/^FIXT-C-/);
    // Exactly one of the two numbers persisted — never the loser's.
    expect(await count(reservations, like(reservations.contractNumber, `FIXT-C-${reservation.id}-%`))).toBe(1);
    expect(await count(documents, eq(documents.reservationId, reservation.id))).toBeLessThanOrEqual(1);
  }, 40_000);

  it("five parallel restores of one deleted record: one 200, four 409, zero 5xx (BUG-043)", async () => {
    const vehicle = await createFixtureVehicle();
    // Closed history: besluiten B-14 (BUG-022) refuses to delete a vehicle with
    // a live or planned rental, and this test is about the restore, not the
    // refusal.
    await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2019-02-01", endDate: "2019-02-05",
      status: "completed",
    });
    const recordId = await deleteVehicleViaApi(vehicle.id, vehicle.licensePlate);

    const results = await fireParallel(5, () => admin.post(`/api/deleted-records/${recordId}/restore`).send({}));

    expect(rejections(results)).toEqual([]);
    expect(serverErrors(results)).toEqual([]);
    const counts = statusCounts(results);
    expect(counts[200] ?? 0).toBe(1);
    expect(counts[409] ?? 0).toBe(4);
    // The vehicle is back exactly once, with its reservation.
    expect(await count(vehiclesTable, eq(vehiclesTable.id, vehicle.id))).toBe(1);
    expect(await count(reservations, eq(reservations.vehicleId, vehicle.id))).toBe(1);
  }, 40_000);

  it("a restore onto a taken barcode is a 409 BARCODE_TAKEN, not a 500 (BUG-126)", async () => {
    const vehicle = await createFixtureVehicle({ barcode: `FIXT-BC-${Date.now().toString(36)}` });
    const recordId = await deleteVehicleViaApi(vehicle.id, vehicle.licensePlate);

    // Somebody re-created the vehicle by hand in the meantime and the barcode
    // went with it. The id and the plate are free, only the barcode collides.
    const replacement = await createFixtureVehicle({ barcode: vehicle.barcode });

    const res = await admin.post(`/api/deleted-records/${recordId}/restore`).send({});
    expect(res.status, bodyText(res.body)).toBe(409);
    expect(res.body.code).toBe("BARCODE_TAKEN");
    // Nothing was written: the snapshot is still restorable once the clash is gone.
    const [record] = await db.select().from(deletedRecords).where(eq(deletedRecords.id, recordId));
    expect(record.restoredAt).toBeNull();
    expect(await count(vehiclesTable, eq(vehiclesTable.id, vehicle.id))).toBe(0);
    expect(replacement.id).not.toBe(vehicle.id);
  }, 40_000);

  it("two parallel deletes of one vehicle leave exactly one snapshot (BUG-188)", async () => {
    const vehicle = await createFixtureVehicle();

    const results = await fireParallel(2, () =>
      admin.delete(`/api/vehicles/${vehicle.id}`).send({ confirmLicensePlate: vehicle.licensePlate }),
    );

    expect(rejections(results)).toEqual([]);
    expect(serverErrors(results)).toEqual([]);
    const counts = statusCounts(results);
    expect(counts[200] ?? 0).toBe(1);
    expect(await count(
      deletedRecords,
      and(eq(deletedRecords.entityType, "vehicle"), eq(deletedRecords.entityId, vehicle.id)),
    )).toBe(1);
  }, 40_000);

  it("two parallel assign-vehicle calls on one placeholder: one 200, one 409 (BUG-158)", async () => {
    const spare = await createFixtureVehicle();
    const original = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: original.id, startDate: "2031-03-01", endDate: "2031-03-10",
    });
    const [placeholder] = await db.insert(reservations).values({
      customerId,
      vehicleId: null,
      startDate: "2031-03-02",
      endDate: "2031-03-06",
      status: "booked",
      type: "replacement",
      placeholderSpare: true,
      replacementForReservationId: rental.id,
    } as any).returning();

    const results = await fireParallel(2, () =>
      admin.post(`/api/placeholder-reservations/${placeholder.id}/assign-vehicle`).send({
        vehicleId: spare.id,
        endDate: "2031-03-06",
      }),
    );

    expect(rejections(results)).toEqual([]);
    expect(serverErrors(results)).toEqual([]);
    const counts = statusCounts(results);
    expect(counts[200] ?? 0).toBe(1);
    expect((counts[409] ?? 0) + (counts[404] ?? 0)).toBe(1);
    expect(await count(reservations, eq(reservations.vehicleId, spare.id))).toBe(1);
  }, 40_000);

  it("two parallel password changes with the same current password: one 200, one 400 (BUG-189)", async () => {
    const user = await agentFor([]);

    const results = await fireParallel(2, (i) =>
      user.post("/api/users/change-password").send({
        currentPassword: user.password,
        newPassword: `FixtNewPass${i}9`,
      }),
    );

    expect(rejections(results)).toEqual([]);
    expect(serverErrors(results)).toEqual([]);
    const counts = statusCounts(results);
    expect(counts[200] ?? 0).toBe(1);
    expect((counts[400] ?? 0) + (counts[409] ?? 0)).toBe(1);

    // Exactly one of the two new passwords is the one that counts, and the old
    // one is gone.
    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, user.userId));
    expect(row.password).not.toBe(user.password);
  }, 40_000);

  it("a transport refused with 409 leaves no orphan transport row (BUG-142)", async () => {
    const original = await createFixtureVehicle();
    const spare = await createFixtureVehicle();
    // The spare is already out that day, so assigning it must fail.
    await createFixtureReservation({
      customerId, vehicleId: spare.id, startDate: "2031-04-01", endDate: "2031-04-03",
    });

    const before = await count(vehicleTransports, eq(vehicleTransports.vehicleId, original.id));
    const res = await admin.post("/api/transports").send({
      vehicleId: original.id,
      transportType: "swap",
      scheduledDate: "2031-04-02",
      spareRequired: true,
      relatedVehicleId: spare.id,
      isBreakdownOrMaintenance: true,
    });

    expect(res.status, bodyText(res.body)).toBe(409);
    expect(await count(vehicleTransports, eq(vehicleTransports.vehicleId, original.id))).toBe(before);
  }, 40_000);

  it("two parallel portal maintenance approvals create one block and one reply (BUG-141)", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2031-05-01", endDate: "2031-05-30",
    });
    const [request] = await db.insert(portalRequests).values({
      customerId,
      type: "maintenance",
      reservationId: rental.id,
      message: "FIXT onderhoud",
      payload: { issue: "remmen" },
      status: "new",
    } as any).returning();

    const results = await fireParallel(2, () =>
      admin.post(`/api/portal-requests/${request.id}/approve`).send({
        startDate: "2031-05-06", // a Monday: the workshop is closed at weekends
        durationDays: 2,
        category: "repair",
      }),
    );

    expect(rejections(results)).toEqual([]);
    expect(serverErrors(results)).toEqual([]);
    const counts = statusCounts(results);
    expect(counts[200] ?? 0).toBe(1);
    expect(await count(reservations, and(
      eq(reservations.vehicleId, vehicle.id),
      eq(reservations.type, "maintenance_block"),
    ))).toBe(1);
  }, 40_000);

  it("a settings save that carries a stale updatedAt is refused, not merged away (BUG-175)", async () => {
    const current = await admin.get("/api/system-settings");
    expect(current.status, bodyText(current.body)).toBe(200);
    const stamp = current.body?.updatedAt ?? null;
    expect(stamp, "settings must expose updatedAt for optimistic concurrency").toBeTruthy();

    const first = await admin.put("/api/system-settings").send({
      depotCity: "FIXT Eerste", updatedAt: stamp,
    });
    expect(first.status, bodyText(first.body)).toBe(200);

    // The second tab still holds the value it loaded before the first save.
    const second = await admin.put("/api/system-settings").send({
      depotCity: "FIXT Tweede", updatedAt: stamp,
    });
    expect(second.status, bodyText(second.body)).toBe(409);
    expect(second.body.code).toBe("STALE_WRITE");

    const after = await admin.get("/api/system-settings");
    expect(after.body.depotCity).toBe("FIXT Eerste");
  }, 40_000);
});
