/**
 * OPT-001 — `GET /api/today`, the work-day screen's one request.
 *
 * Two things are asserted here and they are equally load-bearing:
 *
 *   **Content** — `docs/audit/besluiten.md` B-17 decides exactly three groups:
 *   today's pickups and returns, today's maintenance and transport plus the
 *   spares still to be assigned, and the new portal requests. B-17 rejected a
 *   "te laat terug" list by name, so a row that is merely late must *not*
 *   appear anywhere in this payload.
 *
 *   **Cost** — this screen exists because the morning cost five pages and
 *   ~20 MB (workflow F, `docs/audit/wip/p21-workflows.md`), of which the 8 MB
 *   reservation list was downloaded twice (BUG-203/BUG-204). A "Vandaag"
 *   screen built on top of those loads would make that worse, not better. So,
 *   in the manner of `fix-t-query-counts.test.ts`, the statement count and the
 *   payload size are assertions rather than hopes.
 *
 * Nothing here depends on the day the suite runs: every row is written on a
 * fixed, far-future date and the endpoint is asked for that date.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  customers,
  portalRequests,
  reservations,
  vehicleTransports,
  UserPermission,
} from "../../shared/schema";
import { countSql } from "./helpers/sqlCounter";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer,
  createFixtureVehicle,
  createFixtureReservation,
  cleanupFixtures,
} from "./helpers/fixtures";
import { isoToday } from "../services/lifecycle";

/**
 * The day this whole file is about. Far enough away that no real row in the
 * fixture database can land on it, so the assertions are about what this test
 * wrote and nothing else.
 */
const TODAY = "2032-06-15";
const YESTERDAY = "2032-06-14";
const TOMORROW = "2032-06-16";
/** Well before TODAY — the "te laat terug" population B-17 refused. */
const LONG_AGO = "2032-01-10";

let admin: TestAgent;
let customerId: number;

const created = {
  pickupId: 0,
  returnId: 0,
  maintenanceId: 0,
  transportId: 0,
  spareId: 0,
  requestId: 0,
  overdueRentalId: 0,
  overdueNeverCollectedId: 0,
  tomorrowId: 0,
  closedBlockId: 0,
};

async function insertReservation(values: Record<string, unknown>): Promise<number> {
  const [row] = await db
    .insert(reservations)
    .values(values as typeof reservations.$inferInsert)
    .returning({ id: reservations.id });
  return row.id;
}

beforeAll(async () => {
  admin = await agentFor("admin");
  const customer = await createFixtureCustomer("Vandaag");
  customerId = customer.id;

  const pickupVehicle = await createFixtureVehicle({ brand: "FIXT-Opel", model: "Vivaro" });
  const returnVehicle = await createFixtureVehicle({ brand: "FIXT-Ford", model: "Transit" });
  const blockVehicle = await createFixtureVehicle({ brand: "FIXT-Fiat", model: "Ducato" });
  const transportVehicle = await createFixtureVehicle({ brand: "FIXT-Man", model: "TGE" });
  const noiseVehicle = await createFixtureVehicle();

  // --- group 1: what must go out and come back today -----------------------
  created.pickupId = (
    await createFixtureReservation({
      customerId,
      vehicleId: pickupVehicle.id,
      startDate: TODAY,
      endDate: TOMORROW,
      status: "booked",
    })
  ).id;
  created.returnId = await insertReservation({
    customerId,
    vehicleId: returnVehicle.id,
    startDate: YESTERDAY,
    endDate: TODAY,
    status: "picked_up",
    type: "standard",
  });

  // --- group 2: today's maintenance, transport and unassigned spares -------
  created.maintenanceId = await insertReservation({
    customerId: null,
    vehicleId: blockVehicle.id,
    startDate: YESTERDAY,
    endDate: TOMORROW,
    status: "booked",
    type: "maintenance_block",
    maintenanceStatus: "in",
    maintenanceCategory: "repair",
  });
  // A block that OPT-015's "onderhoud afronden" already closed: not work.
  created.closedBlockId = await insertReservation({
    customerId: null,
    vehicleId: blockVehicle.id,
    startDate: YESTERDAY,
    endDate: TOMORROW,
    status: "booked",
    type: "maintenance_block",
    maintenanceStatus: "out",
  });
  const [transport] = await db
    .insert(vehicleTransports)
    .values({
      vehicleId: transportVehicle.id,
      transportType: "tow",
      status: "scheduled",
      scheduledDate: TODAY,
      originCity: "Waalwijk",
      destinationCity: "Tilburg",
      driverName: "FIXT-chauffeur",
      spareRequired: true,
      relatedVehicleId: null,
    })
    .returning({ id: vehicleTransports.id });
  created.transportId = transport.id;
  created.spareId = await insertReservation({
    customerId,
    vehicleId: null,
    startDate: YESTERDAY,
    endDate: TOMORROW,
    status: "booked",
    type: "replacement",
    placeholderSpare: true,
  });

  // --- group 3: a portal request nobody has taken yet ----------------------
  const [request] = await db
    .insert(portalRequests)
    .values({
      customerId,
      type: "extension",
      message: `FIXT-verzoek ${"x".repeat(400)}`,
      status: "new",
    })
    .returning({ id: portalRequests.id });
  created.requestId = request.id;

  // --- the noise B-17 deliberately keeps off the screen --------------------
  // A rental that is weeks late back. This is the "te laat terug" list the
  // owner refused; it must not surface here under any name.
  created.overdueRentalId = await insertReservation({
    customerId,
    vehicleId: noiseVehicle.id,
    startDate: LONG_AGO,
    endDate: LONG_AGO,
    status: "picked_up",
    type: "standard",
  });
  // A booking that was never collected — the other half of the invisible
  // backlog (BUG-040). Also not today's work.
  created.overdueNeverCollectedId = await insertReservation({
    customerId,
    vehicleId: noiseVehicle.id,
    startDate: LONG_AGO,
    endDate: LONG_AGO,
    status: "booked",
    type: "standard",
  });
  created.tomorrowId = await insertReservation({
    customerId,
    vehicleId: noiseVehicle.id,
    startDate: TOMORROW,
    endDate: TOMORROW,
    status: "booked",
    type: "standard",
  });

  // Bulk, so the payload and statement-count assertions are about a realistic
  // table rather than an empty one: 80 rows on other days, on their own cars.
  for (let i = 0; i < 8; i++) {
    const vehicle = await createFixtureVehicle();
    for (let d = 1; d <= 10; d++) {
      const day = String(d).padStart(2, "0");
      await insertReservation({
        customerId,
        vehicleId: vehicle.id,
        startDate: `2032-03-${day}`,
        endDate: `2032-03-${day}`,
        status: "booked",
        type: "standard",
      });
    }
  }
}, 180_000);

afterAll(async () => {
  await db.delete(portalRequests).where(eq(portalRequests.customerId, customerId));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

describe("OPT-001 — B-17's three groups, and nothing else", () => {
  it("group 1: today's pickup and today's return, each with its reservation id", async () => {
    const res = await admin.get(`/api/today?date=${TODAY}`);
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(TODAY);

    expect(res.body.pickups.map((r: any) => r.id)).toContain(created.pickupId);
    expect(res.body.returns.map((r: any) => r.id)).toContain(created.returnId);
    // A row is in exactly one of the two: the status says which.
    expect(res.body.returns.map((r: any) => r.id)).not.toContain(created.pickupId);
    expect(res.body.pickups.map((r: any) => r.id)).not.toContain(created.returnId);

    const pickup = res.body.pickups.find((r: any) => r.id === created.pickupId);
    expect(pickup.handover).toBe("pickup");
    expect(pickup.licensePlate).toMatch(/^FIXT/);
    expect(pickup.vehicleLabel).toBe("FIXT-Opel Vivaro");
    expect(pickup.customerName).toContain("FIXT-");
  });

  it("group 2: the open maintenance block, the transport and the unassigned spare", async () => {
    const res = await admin.get(`/api/today?date=${TODAY}`);

    expect(res.body.maintenance.map((r: any) => r.id)).toContain(created.maintenanceId);
    // A block already closed by "onderhoud afronden" is finished work.
    expect(res.body.maintenance.map((r: any) => r.id)).not.toContain(created.closedBlockId);

    const transport = res.body.transports.find((r: any) => r.id === created.transportId);
    expect(transport).toBeDefined();
    expect(transport.route).toBe("Waalwijk → Tilburg");
    // "inclusief vervangers die nog toegewezen moeten worden" (B-17): the
    // transport that still has no spare says so.
    expect(transport.spareTbd).toBe(true);

    expect(res.body.spareAssignments.map((r: any) => r.id)).toContain(created.spareId);
  });

  it("group 3: the new portal request, with a preview rather than the whole message", async () => {
    const res = await admin.get(`/api/today?date=${TODAY}`);
    const request = res.body.portalRequests.find((r: any) => r.id === created.requestId);
    expect(request).toBeDefined();
    expect(request.type).toBe("extension");
    expect(request.status).toBe("new");
    expect(request.message.length).toBeLessThanOrEqual(160);
  });

  it("B-17: no overdue list, under any name", async () => {
    const res = await admin.get(`/api/today?date=${TODAY}`);
    // The contract has no such field...
    expect(Object.keys(res.body)).toEqual([
      "date",
      "pickups",
      "returns",
      "maintenance",
      "transports",
      "spareAssignments",
      "portalRequests",
      "counts",
    ]);
    // ...and the rows that would fill one are nowhere in the payload.
    const everyId = JSON.stringify(res.body);
    expect(everyId).not.toContain(`"id":${created.overdueRentalId}`);
    expect(everyId).not.toContain(`"id":${created.overdueNeverCollectedId}`);
    // Tomorrow's booking is not today's work either.
    expect(everyId).not.toContain(`"id":${created.tomorrowId}`);
  });

  it("the counts add up to what the groups hold", async () => {
    const res = await admin.get(`/api/today?date=${TODAY}`);
    const { counts } = res.body;
    expect(counts.pickups).toBe(res.body.pickups.length);
    expect(counts.returns).toBe(res.body.returns.length);
    expect(counts.maintenance).toBe(res.body.maintenance.length);
    expect(counts.transports).toBe(res.body.transports.length);
    expect(counts.spareAssignments).toBe(res.body.spareAssignments.length);
    expect(counts.portalRequests).toBe(res.body.portalRequests.length);
    expect(counts.total).toBe(
      counts.pickups +
        counts.returns +
        counts.maintenance +
        counts.transports +
        counts.spareAssignments +
        counts.portalRequests,
    );
    expect(counts.total).toBeGreaterThan(0);
  });

  it("a quiet day has nothing in the four date-scoped groups", async () => {
    // Two of B-17's six lists are deliberately *not* date-scoped: a spare that
    // still has no vehicle and a request nobody has answered are open until
    // somebody acts, not until midnight. The other four are about the day.
    const res = await admin.get("/api/today?date=2032-09-09");
    expect(res.status).toBe(200);
    expect(res.body.pickups).toEqual([]);
    expect(res.body.returns).toEqual([]);
    expect(res.body.maintenance).toEqual([]);
    expect(res.body.transports).toEqual([]);
  });

  it("a quiet day is answered with empty lists and a count, not with an error", async () => {
    // The screen's "er staat niets open" state is `counts.total === 0`; this
    // fixture database carries older rows of its own, so what is asserted here
    // is that the arithmetic is honest — the count is the sum of what the
    // lists hold, whatever that is. The empty rendering itself is pinned in
    // the jsdom test.
    const res = await admin.get("/api/today?date=2032-09-09");
    expect(res.status).toBe(200);
    const { counts } = res.body;
    expect(counts.pickups).toBe(0);
    expect(counts.returns).toBe(0);
    expect(counts.maintenance).toBe(0);
    expect(counts.transports).toBe(0);
    expect(counts.total).toBe(counts.spareAssignments + counts.portalRequests);
  });

  it("without ?date it answers for the server's own today", async () => {
    const res = await admin.get("/api/today");
    expect(res.status).toBe(200);
    // Not "today is the 15th" — "the default is today", whenever that is.
    expect(res.body.date).toBe(isoToday());
  });

  it("a date that is not a date is refused", async () => {
    for (const bad of ["gisteren", "2032-13-40", "2032-6-1", "'; drop table reservations; --"]) {
      const res = await admin.get(`/api/today?date=${encodeURIComponent(bad)}`);
      expect(res.status).toBe(400);
    }
  });
});

describe("OPT-001 — permissions", () => {
  it("a user without portal permission still gets their own morning, minus group 3", async () => {
    const counterStaff = await agentFor([UserPermission.VIEW_RESERVATIONS]);
    const res = await counterStaff.get(`/api/today?date=${TODAY}`);
    expect(res.status).toBe(200);
    expect(res.body.pickups.map((r: any) => r.id)).toContain(created.pickupId);
    expect(res.body.portalRequests).toEqual([]);
    expect(res.body.counts.portalRequests).toBe(0);
  });

  it("a user with the portal permission sees group 3", async () => {
    const portalStaff = await agentFor([
      UserPermission.VIEW_RESERVATIONS,
      UserPermission.VIEW_PORTAL,
    ]);
    const res = await portalStaff.get(`/api/today?date=${TODAY}`);
    expect(res.status).toBe(200);
    expect(res.body.portalRequests.map((r: any) => r.id)).toContain(created.requestId);
  });

  it("a user with none of the three permissions is refused", async () => {
    const outsider = await agentFor([UserPermission.MANAGE_EXPENSES]);
    const res = await outsider.get(`/api/today?date=${TODAY}`);
    expect(res.status).toBe(403);
  });
});

describe("OPT-001 — the cost of one screen load", () => {
  it("costs a small, constant number of statements", async () => {
    const { statements } = await countSql(async () => {
      const res = await admin.get(`/api/today?date=${TODAY}`);
      expect(res.status).toBe(200);
    });
    // Five domain SELECTs (handovers, blocks, transports, spares, requests)
    // on top of this app's 3-4 statement baseline for any authenticated
    // request. The five pages it replaces cost 900+ for the calendar alone.
    expect(statements.length).toBeLessThanOrEqual(12);
  });

  it("the statement count does not grow with the number of rows", async () => {
    const busy = await countSql(async () => {
      await admin.get(`/api/today?date=${TODAY}`);
    });
    const quiet = await countSql(async () => {
      await admin.get("/api/today?date=2032-09-09");
    });
    expect(busy.statements.length).toBe(quiet.statements.length);
  });

  it("it never reads the whole reservation table", async () => {
    const { statements } = await countSql(async () => {
      await admin.get(`/api/today?date=${TODAY}`);
    });
    const reservationSelects = statements.filter(
      (s) => /^\s*select/i.test(s) && /from "reservations"/i.test(s),
    );
    // Three: today's handovers, today's blocks, the unassigned spares.
    expect(reservationSelects.length).toBeLessThanOrEqual(3);
    // Every one of them is narrowed. An unfiltered read of this table is the
    // 8 MB download this screen exists to avoid (BUG-203/BUG-204).
    for (const statement of reservationSelects) {
      expect(statement).toMatch(/where/i);
    }
  });

  it("one screen load is a fraction of the reservation list it replaces", async () => {
    const today = await admin.get(`/api/today?date=${TODAY}`);
    const wholeList = await admin.get("/api/reservations");
    expect(wholeList.status).toBe(200);

    const todayBytes = Buffer.byteLength(JSON.stringify(today.body), "utf8");
    const listBytes = Buffer.byteLength(JSON.stringify(wholeList.body), "utf8");

    // In production that list is ~8 MB and the reservations page fetched it
    // twice. Here it is whatever the fixture table holds — the property is the
    // ratio, and it must be an order of magnitude.
    expect(listBytes).toBeGreaterThan(todayBytes * 10);
    // And in absolute terms a morning must fit in a few tens of kilobytes.
    expect(todayBytes).toBeLessThan(64 * 1024);
  });

  it("the rows are flat: no nested vehicle, customer or notes travel with them", async () => {
    const res = await admin.get(`/api/today?date=${TODAY}`);
    const rows = [
      ...res.body.pickups,
      ...res.body.returns,
      ...res.body.maintenance,
      ...res.body.transports,
      ...res.body.spareAssignments,
      ...res.body.portalRequests,
    ];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.vehicle).toBeUndefined();
      expect(row.customer).toBeUndefined();
      expect(row.notes).toBeUndefined();
      expect(row.attachments).toBeUndefined();
      expect(row.messages).toBeUndefined();
      for (const [field, value] of Object.entries(row)) {
        // A flat row: strings, numbers, booleans and nulls only.
        expect(`${field}:${value === null || typeof value !== "object"}`).toBe(`${field}:true`);
      }
      // Small enough that a hundred of them is still nothing.
      expect(Buffer.byteLength(JSON.stringify(row), "utf8")).toBeLessThan(600);
    }
  });
});

describe("OPT-001 — the groups keep to their own population", () => {
  it("a maintenance block is never offered as a pickup or a return", async () => {
    const res = await admin.get(`/api/today?date=${TODAY}`);
    const handoverIds = [...res.body.pickups, ...res.body.returns].map((r: any) => r.id);
    expect(handoverIds).not.toContain(created.maintenanceId);
  });

  it("a cancelled row is not today's work", async () => {
    const vehicle = await createFixtureVehicle();
    const cancelled = await insertReservation({
      customerId,
      vehicleId: vehicle.id,
      startDate: TODAY,
      endDate: TODAY,
      status: "cancelled",
      type: "standard",
    });
    const res = await admin.get(`/api/today?date=${TODAY}`);
    expect(JSON.stringify(res.body)).not.toContain(`"id":${cancelled}`);
    await db.delete(reservations).where(eq(reservations.id, cancelled));
  });

  it("a soft-deleted row (B-15's recycle bin) is not today's work either", async () => {
    const vehicle = await createFixtureVehicle();
    const binned = await insertReservation({
      customerId,
      vehicleId: vehicle.id,
      startDate: TODAY,
      endDate: TODAY,
      status: "booked",
      type: "standard",
      deletedAt: new Date(),
    });
    const res = await admin.get(`/api/today?date=${TODAY}`);
    expect(JSON.stringify(res.body)).not.toContain(`"id":${binned}`);
    await db.delete(reservations).where(eq(reservations.id, binned));
  });

  it("a completed transport is not on the list", async () => {
    const vehicle = await createFixtureVehicle();
    const [done] = await db
      .insert(vehicleTransports)
      .values({
        vehicleId: vehicle.id,
        transportType: "delivery",
        status: "completed",
        scheduledDate: TODAY,
      })
      .returning({ id: vehicleTransports.id });
    const res = await admin.get(`/api/today?date=${TODAY}`);
    expect(res.body.transports.map((r: any) => r.id)).not.toContain(done.id);
    await db.delete(vehicleTransports).where(eq(vehicleTransports.id, done.id));
  });

  it("a portal request somebody already took is not waiting to be reviewed", async () => {
    const [taken] = await db
      .insert(portalRequests)
      .values({
        customerId,
        type: "other",
        message: "FIXT-in behandeling",
        status: "in_progress",
      })
      .returning({ id: portalRequests.id });
    const res = await admin.get(`/api/today?date=${TODAY}`);
    expect(res.body.portalRequests.map((r: any) => r.id)).not.toContain(taken.id);
    await db.delete(portalRequests).where(eq(portalRequests.id, taken.id));
  });

  it("legacy status spellings (BUG-129) are read as what they mean", async () => {
    const vehicle = await createFixtureVehicle();
    // 'confirmed' means booked, 'active' means picked_up — lifecycle.ts owns
    // that mapping, and this screen must honour it or the rows written before
    // the enum existed vanish from the morning.
    const confirmed = await insertReservation({
      customerId,
      vehicleId: vehicle.id,
      startDate: TODAY,
      endDate: TOMORROW,
      status: "confirmed",
      type: "standard",
    });
    const active = await insertReservation({
      customerId,
      vehicleId: vehicle.id,
      startDate: YESTERDAY,
      endDate: TODAY,
      status: "active",
      type: "standard",
    });
    const res = await admin.get(`/api/today?date=${TODAY}`);
    expect(res.body.pickups.map((r: any) => r.id)).toContain(confirmed);
    expect(res.body.returns.map((r: any) => r.id)).toContain(active);
    await db.delete(reservations).where(inArray(reservations.id, [confirmed, active]));
  });
});
