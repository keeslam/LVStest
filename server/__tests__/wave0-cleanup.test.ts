/**
 * Wave 0 — BUG-145: the portal test cleanup left maintenance blocks behind.
 *
 * `cleanupPortalTestData` deleted reservations by *test-customer id* only and
 * then hard-deleted the `PT%` vehicles, so every reservation with
 * `customer_id IS NULL` (a maintenance block) survived its vehicle and became
 * an orphan. 258 of them had accumulated in the dev database.
 */
import { describe, it, expect, afterAll } from "vitest";
import { db } from "../db";
import { reservations, vehicles } from "../../shared/schema";
import { sql, eq } from "drizzle-orm";
import { cleanupPortalTestData, createTestVehicle } from "./portal-helpers";

async function orphanReservationCount(): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM reservations r
    LEFT JOIN vehicles v ON v.id = r.vehicle_id
    WHERE r.vehicle_id IS NOT NULL AND v.id IS NULL
  `);
  return Number((result as any).rows[0].n);
}

describe("cleanupPortalTestData (BUG-145)", () => {
  afterAll(async () => {
    await cleanupPortalTestData();
  });

  it("removes maintenance blocks on test vehicles, not just customer reservations", async () => {
    const orphansBefore = await orphanReservationCount();
    const vehicle = await createTestVehicle();

    // A maintenance block: no customer at all, which is precisely the row the
    // old customer-id-only cleanup could never see.
    const [block] = await db.insert(reservations).values({
      customerId: null,
      vehicleId: vehicle.id,
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      status: "booked",
      type: "maintenance_block",
    } as any).returning();

    await cleanupPortalTestData();

    const vehicleRows = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, vehicle.id));
    expect(vehicleRows).toHaveLength(0);

    const blockRows = await db.select({ id: reservations.id }).from(reservations).where(eq(reservations.id, block.id));
    expect(blockRows).toHaveLength(0);

    expect(await orphanReservationCount()).toBe(orphansBefore);
  });
});
