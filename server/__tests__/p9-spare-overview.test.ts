/**
 * A-2-6 (fysieke E2E-audit 2026-10-09, module 2) — the dashboard's spare-vehicle
 * widget downloaded the complete reservation list (2.7 MB in a 800-booking
 * database) only to pick out the handful of replacement reservations. The
 * scoped endpoint returns just those, plus the rentals they stand in for.
 * Same permission as GET /api/reservations; nothing else is widened.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations, UserPermission, type Vehicle } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures } from "./helpers/fixtures";

let admin: TestAgent;
let viewer: TestAgent;
let nobody: TestAgent;
let vehicle: Vehicle;
let spareVehicle: Vehicle;
let customerId: number;
const ids: Record<string, number> = {};

describe("GET /api/reservations/spare-overview", () => {
  beforeAll(async () => {
    admin = await agentFor("admin");
    viewer = await agentFor([UserPermission.VIEW_RESERVATIONS]);
    nobody = await agentFor([]);
    customerId = (await createFixtureCustomer("Spare klant")).id;
    vehicle = await createFixtureVehicle();
    spareVehicle = await createFixtureVehicle();

    const parent = await createFixtureReservation({ customerId, vehicleId: vehicle.id, status: "picked_up" });
    const unrelated = await createFixtureReservation({ customerId, vehicleId: vehicle.id });
    ids.parent = parent.id;
    ids.unrelated = unrelated.id;

    const spare = async (key: string, spareVehicleStatus: string | null, status = "booked") => {
      const row = await createFixtureReservation({ customerId, vehicleId: spareVehicle.id, type: "replacement", status });
      await db.update(reservations)
        .set({ replacementForReservationId: parent.id, spareVehicleStatus } as any)
        .where(eq(reservations.id, row.id));
      ids[key] = row.id;
    };
    await spare("assigned", "assigned");
    await spare("pickedUp", "picked_up", "picked_up");
    await spare("returned", "returned", "completed");
    await spare("cancelled", "assigned", "cancelled");
    // No spare status recorded at all (NULL): still an open spare.
    await spare("noStatus", null);
    // A soft-deleted spare must not show up...
    await spare("deletedSpare", "assigned");
    await db.update(reservations).set({ deletedAt: new Date() } as any).where(eq(reservations.id, ids.deletedSpare));
    // ...and a soft-deleted parent is left out while its live spare stays.
    const deletedParent = await createFixtureReservation({ customerId, vehicleId: vehicle.id });
    await db.update(reservations).set({ deletedAt: new Date() } as any).where(eq(reservations.id, deletedParent.id));
    ids.deletedParent = deletedParent.id;
    const orphan = await createFixtureReservation({ customerId, vehicleId: spareVehicle.id, type: "replacement" });
    await db.update(reservations)
      .set({ replacementForReservationId: deletedParent.id, spareVehicleStatus: "assigned" } as any)
      .where(eq(reservations.id, orphan.id));
    ids.orphanSpare = orphan.id;
  }, 90_000);

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("returns open spares and their parent rental, with vehicle and customer embedded", async () => {
    const res = await admin.get("/api/reservations/spare-overview");
    expect(res.status).toBe(200);
    const byId = new Map<number, any>(res.body.map((r: any) => [r.id, r]));

    expect(byId.has(ids.assigned)).toBe(true);
    expect(byId.has(ids.pickedUp)).toBe(true);
    expect(byId.has(ids.parent)).toBe(true);
    expect(byId.get(ids.assigned).vehicle?.id).toBe(spareVehicle.id);
    expect(byId.get(ids.parent).customer?.id).toBe(customerId);
  });

  it("leaves out returned and cancelled spares and unrelated rentals", async () => {
    const res = await admin.get("/api/reservations/spare-overview");
    const got = new Set<number>(res.body.map((r: any) => r.id));
    expect(got.has(ids.returned)).toBe(false);
    expect(got.has(ids.cancelled)).toBe(false);
    expect(got.has(ids.unrelated)).toBe(false);
  });

  it("keeps a spare with no spare status, and skips soft-deleted spares and parents", async () => {
    const res = await admin.get("/api/reservations/spare-overview");
    const got = new Set<number>(res.body.map((r: any) => r.id));
    expect(got.has(ids.noStatus)).toBe(true);
    expect(got.has(ids.deletedSpare)).toBe(false);
    expect(got.has(ids.deletedParent)).toBe(false);
    expect(got.has(ids.orphanSpare)).toBe(true);
  });

  it("is guarded like /api/reservations", async () => {
    expect((await viewer.get("/api/reservations/spare-overview")).status).toBe(200);
    expect((await nobody.get("/api/reservations/spare-overview")).status).toBe(403);
  });
});
