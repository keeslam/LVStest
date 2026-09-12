/**
 * besluiten.md **B-15** — "Prullenbak voor reserveringen en transporten: ja,
 * allebei herstelbaar, met dezelfde impactcontrole als bij voertuigen."
 * (BUG-140, BUG-151)
 *
 * BUG-151: a soft-deleted reservation was filtered out everywhere and surfaced
 * nowhere; the only way back was `update reservations set deleted_at = null`,
 * which the audit did — and immediately produced a double booking.
 * BUG-140: deleting a transport was a bare `db.delete`, with the replacement's
 * origin gone with it.
 *
 * The impact check is wave 3's BUG-108 pattern: a restore goes through the
 * bookability predicate, so it can never re-create a double booking.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicleTransports, deletedRecords } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
  FIXTURE_PLATE_PREFIX, FIXTURE_PREFIX,
} from "./helpers/fixtures";

let admin: TestAgent;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("B15")).id;
});

afterAll(async () => {
  const rows = await db.select({ id: vehicleTransports.id }).from(vehicleTransports);
  void rows;
  await db.delete(deletedRecords).where(like(deletedRecords.label, `${FIXTURE_PLATE_PREFIX}%`));
  await db.delete(deletedRecords).where(like(deletedRecords.label, `${FIXTURE_PREFIX}%`));
  await db.delete(deletedRecords).where(like(deletedRecords.label, "Reservering #%"));
  await db.delete(deletedRecords).where(like(deletedRecords.label, "Transport #%"));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

/** Fixed far-future dates: never a dependency on today or on the weekday. */
const START = "2030-02-01";
const END = "2030-02-05";

async function binEntryFor(entityType: string, entityId: number) {
  const [record] = await db.select().from(deletedRecords)
    .where(and(eq(deletedRecords.entityType, entityType), eq(deletedRecords.entityId, entityId)));
  return record;
}

describe("B-15 — a deleted reservation is in the recycle bin (BUG-151)", () => {
  it("shows up in the bin and comes back with a restore", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: START, endDate: END,
    });

    expect((await admin.delete(`/api/reservations/${rental.id}`)).status).toBe(200);
    const [deletedRow] = await db.select().from(reservations).where(eq(reservations.id, rental.id));
    expect(deletedRow.deletedAt).not.toBeNull();

    // The bin is what BUG-151 said did not exist.
    const list = await admin.get("/api/deleted-records");
    expect(list.status).toBe(200);
    const entry = list.body.find((r: any) => r.entityType === "reservation" && r.entityId === rental.id);
    expect(entry).toBeDefined();
    expect(entry.label).toContain(String(rental.id));

    const record = await binEntryFor("reservation", rental.id);
    const restored = await admin.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(restored.status).toBe(200);

    const [back] = await db.select().from(reservations).where(eq(reservations.id, rental.id));
    expect(back.deletedAt).toBeNull();
  });

  it("a restore that would re-create a double booking is a 409, not a second booking (BUG-108's rule)", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2030-03-01", endDate: "2030-03-10",
    });
    expect((await admin.delete(`/api/reservations/${rental.id}`)).status).toBe(200);

    // The days are free again, so of course someone books them.
    const replacement = await admin.post("/api/reservations").send({
      customerId, vehicleId: vehicle.id, startDate: "2030-03-03", endDate: "2030-03-06",
      type: "standard", status: "booked",
    });
    expect(replacement.status).toBe(201);

    const record = await binEntryFor("reservation", rental.id);
    const restored = await admin.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(restored.status).toBe(409);
    expect(restored.body.code).toBe("RESERVATION_CONFLICT");

    // Refused means refused: the row stays deleted and the bin entry is still
    // usable once the clash is cleared up.
    const [stillDeleted] = await db.select().from(reservations).where(eq(reservations.id, rental.id));
    expect(stillDeleted.deletedAt).not.toBeNull();
    const after = await binEntryFor("reservation", rental.id);
    expect(after.restoredAt).toBeNull();
  });

  it("restoring twice is a clean 409, never a second row", async () => {
    const vehicle = await createFixtureVehicle();
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2030-04-01", endDate: "2030-04-03",
    });
    await admin.delete(`/api/reservations/${rental.id}`);
    const record = await binEntryFor("reservation", rental.id);

    expect((await admin.post(`/api/deleted-records/${record.id}/restore`).send({})).status).toBe(200);
    const second = await admin.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("ALREADY_RESTORED");
  });
});

describe("B-15 — a deleted transport is in the recycle bin (BUG-140)", () => {
  it("is snapshotted before the delete and restored with its spare link", async () => {
    const vehicle = await createFixtureVehicle();
    const spare = await createFixtureVehicle();
    const spareReservation = await createFixtureReservation({
      customerId, vehicleId: spare.id, startDate: START, endDate: END, type: "replacement",
    });
    const [transport] = await db.insert(vehicleTransports).values({
      vehicleId: vehicle.id, transportType: "breakdown", scheduledDate: START,
      status: "scheduled", spareRequired: true, relatedVehicleId: spare.id,
      spareReservationId: spareReservation.id, isBreakdownOrMaintenance: true,
    } as any).returning();

    expect((await admin.delete(`/api/transports/${transport.id}`)).status).toBe(204);
    expect((await db.select().from(vehicleTransports).where(eq(vehicleTransports.id, transport.id))).length).toBe(0);

    const record = await binEntryFor("transport", transport.id);
    expect(record).toBeDefined();
    expect(record.label).toContain(String(transport.id));

    const restored = await admin.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(restored.status).toBe(200);

    const [back] = await db.select().from(vehicleTransports).where(eq(vehicleTransports.id, transport.id));
    expect(back).toBeDefined();
    // BUG-140's own acceptance: the replacement keeps its origin.
    expect(back.spareReservationId).toBe(spareReservation.id);
    expect(back.relatedVehicleId).toBe(spare.id);

    // The spare reservation the delete closed comes back with it.
    const [spareRow] = await db.select().from(reservations).where(eq(reservations.id, spareReservation.id));
    expect(spareRow.deletedAt).toBeNull();
  });

  it("a transport whose id was taken again is a clean 409, not a 500", async () => {
    const vehicle = await createFixtureVehicle();
    const [transport] = await db.insert(vehicleTransports).values({
      vehicleId: vehicle.id, transportType: "delivery", scheduledDate: START, status: "scheduled",
    } as any).returning();

    expect((await admin.delete(`/api/transports/${transport.id}`)).status).toBe(204);
    const record = await binEntryFor("transport", transport.id);

    // Somebody re-used the id in the meantime (the sequence was reset by hand).
    await db.insert(vehicleTransports).values({
      id: transport.id, vehicleId: vehicle.id, transportType: "delivery",
      scheduledDate: START, status: "scheduled",
    } as any);

    const restored = await admin.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(restored.status).toBe(409);
    expect(restored.body.code).toBe("ID_TAKEN");

    await db.delete(vehicleTransports).where(eq(vehicleTransports.id, transport.id));
  });
});
