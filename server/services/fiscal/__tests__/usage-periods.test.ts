/**
 * Usage periods ("terbeschikkingstellingsperioden") are derived from
 * reservations — automatically, on every write — and enriched by people.
 * Derived facts follow the reservation; what a person entered is never
 * overwritten; nothing is ever deleted.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../../db";
import { reservations, reservationDriverAssignments, vehicleUsagePeriods, drivers } from "../../../../shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../../../storage";
import { syncUsagePeriodForReservation, confirmUsage, getUsagePeriodByReservation, reconcileUsagePeriods } from "../usage-periods";
import { assignDriverToReservation } from "../../driver-assignments";
import { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures } from "../../../__tests__/helpers/fixtures";
import { cleanupFiscalFixtures, FIXTURE_ACTOR } from "../../../__tests__/helpers/fiscal";

beforeAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
});
afterAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
});

async function periodOf(reservationId: number) {
  const [row] = await db.select().from(vehicleUsagePeriods).where(eq(vehicleUsagePeriods.reservationId, reservationId));
  return row ?? null;
}

describe("gebruiksperioden — afleiding", () => {
  it("derives a period from a rental that starts on or after the derivation start", async () => {
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-03-01", endDate: "2027-03-10" });
    const p = await syncUsagePeriodForReservation(r.id);
    expect(p).toMatchObject({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-03-01", endDate: "2027-03-10", dateBasis: "planned", usageType: "unknown", privateUse: "unknown", driverCount: 0, isReplacement: false, source: "derived", confirmedByKind: "none" });
    expect(p!.derivedAt).not.toBeNull();
  });

  it("derives nothing for rentals before the start, maintenance blocks, or rows without a customer", async () => {
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle();
    const early = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2026-12-20", endDate: "2027-01-05" });
    expect(await syncUsagePeriodForReservation(early.id)).toBeNull();
    const block = await createFixtureReservation({ customerId: null, vehicleId: vehicle.id, startDate: "2027-02-01", endDate: "2027-02-03", type: "maintenance_block" });
    expect(await syncUsagePeriodForReservation(block.id)).toBeNull();
    const noCustomer = await createFixtureReservation({ customerId: null, vehicleId: vehicle.id, startDate: "2027-02-10", endDate: "2027-02-12" });
    expect(await syncUsagePeriodForReservation(noCustomer.id)).toBeNull();
  });

  it("uses the actual pickup and return dates when they are known", async () => {
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-03-01", endDate: "2027-03-10" });
    await db.update(reservations).set({ actualPickupDate: "2027-03-02", actualReturnDate: "2027-03-12", status: "completed" }).where(eq(reservations.id, r.id));
    const p = await syncUsagePeriodForReservation(r.id);
    expect(p).toMatchObject({ startDate: "2027-03-02", endDate: "2027-03-12", dateBasis: "actual" });
  });

  it("recognises a replacement and takes the reason from the maintenance block", async () => {
    const customer = await createFixtureCustomer();
    const brokenCar = await createFixtureVehicle();
    const spare = await createFixtureVehicle();
    const original = await createFixtureReservation({ customerId: customer.id, vehicleId: brokenCar.id, startDate: "2027-03-01", endDate: "2027-03-31" });
    const [block] = await db.insert(reservations).values({ customerId: null, vehicleId: brokenCar.id, startDate: "2027-03-10", endDate: "2027-03-12", status: "booked", type: "maintenance_block", maintenanceCategory: "repair" }).returning();
    const [replacement] = await db.insert(reservations).values({ customerId: customer.id, vehicleId: spare.id, startDate: "2027-03-10", endDate: "2027-03-12", status: "booked", type: "replacement", replacementForReservationId: original.id, maintenanceBlockId: block.id }).returning();
    const p = await syncUsagePeriodForReservation(replacement.id);
    expect(p).toMatchObject({ isReplacement: true, replacementReason: "repair", replacedReservationId: original.id, usageType: "replacement" });
  });

  it("counts every driver that was assigned to the reservation", async () => {
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle();
    const [d1] = await db.insert(drivers).values({ customerId: customer.id, displayName: "FIXT-Een" }).returning();
    const [d2] = await db.insert(drivers).values({ customerId: customer.id, displayName: "FIXT-Twee" }).returning();
    const r = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-04-01", endDate: "2027-04-30" });
    await assignDriverToReservation({ reservationId: r.id, driverId: d1.id });
    await assignDriverToReservation({ reservationId: r.id, driverId: d2.id });
    const p = await periodOf(r.id);
    expect(p?.driverCount).toBe(2);
    expect(p?.primaryDriverId).toBe(d2.id);
  });

  it("hints at the transition rule when the same car was with the same customer without a gap before the start", async () => {
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle();
    await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2026-11-01", endDate: "2026-12-31" });
    const r = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-01-01", endDate: "2027-01-31" });
    expect((await syncUsagePeriodForReservation(r.id))?.providedBeforeCutoffHint).toBe(true);
    const gap = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-03-01", endDate: "2027-03-31" });
    expect((await syncUsagePeriodForReservation(gap.id))?.providedBeforeCutoffHint).toBe(false);
  });
});

describe("gebruiksperioden — mensen en veranderingen", () => {
  it("keeps what a person confirmed when the reservation is derived again, and asks for reconfirmation when the facts moved", async () => {
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-05-01", endDate: "2027-05-10" });
    await syncUsagePeriodForReservation(r.id);
    const confirmed = await confirmUsage(r.id, { privateUse: "yes", commuting: "no", providedBeforeCutoff: "no", usageType: "business_private" }, { kind: "staff", actor: FIXTURE_ACTOR });
    expect(confirmed).toMatchObject({ privateUse: "yes", commuting: "no", confirmedByKind: "staff", confirmedByName: FIXTURE_ACTOR.username, reconfirmRequired: false });

    // Same dates: nothing to reconfirm.
    expect((await syncUsagePeriodForReservation(r.id))?.reconfirmRequired).toBe(false);
    // Dates moved: the confirmation stands but is flagged.
    await db.update(reservations).set({ endDate: "2027-05-20" }).where(eq(reservations.id, r.id));
    const moved = await syncUsagePeriodForReservation(r.id);
    expect(moved).toMatchObject({ endDate: "2027-05-20", privateUse: "yes", reconfirmRequired: true });
  });

  it("a replacement reason is required once someone confirms the usage of a replacement", async () => {
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle();
    const [r] = await db.insert(reservations).values({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-06-01", endDate: "2027-06-05", status: "booked", type: "replacement" }).returning();
    await syncUsagePeriodForReservation(r.id);
    await expect(confirmUsage(r.id, { privateUse: "yes", commuting: "no", providedBeforeCutoff: "no" }, { kind: "staff", actor: FIXTURE_ACTOR })).rejects.toThrow(/reden/i);
    const ok = await confirmUsage(r.id, { privateUse: "yes", commuting: "no", providedBeforeCutoff: "no", replacementReason: "accident", replacedVehicleText: "eigen auto AB-12-CD" }, { kind: "staff", actor: FIXTURE_ACTOR });
    expect(ok.replacementReason).toBe("accident");
  });

  it("closes a period when the reservation is cancelled or deleted, and reopens it when restored", async () => {
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-07-01", endDate: "2027-07-05" });
    await syncUsagePeriodForReservation(r.id);
    await db.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, r.id));
    expect(await syncUsagePeriodForReservation(r.id)).toMatchObject({ closedReason: "cancelled" });
    await db.update(reservations).set({ status: "booked", deletedAt: new Date() }).where(eq(reservations.id, r.id));
    expect(await syncUsagePeriodForReservation(r.id)).toMatchObject({ closedReason: "deleted" });
    await db.update(reservations).set({ deletedAt: null }).where(eq(reservations.id, r.id));
    const back = await syncUsagePeriodForReservation(r.id);
    expect(back?.closedAt).toBeNull();
    expect(back?.closedReason).toBeNull();
  });
});

describe("gebruiksperioden — via de reserveringsopslag", () => {
  it("every write path of the storage layer keeps the period in step", async () => {
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle();
    const created = await storage.createReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-08-01", endDate: "2027-08-10", status: "booked", type: "standard" } as any);
    expect(await periodOf(created.id)).toMatchObject({ startDate: "2027-08-01", endDate: "2027-08-10" });

    await storage.updateReservation(created.id, { endDate: "2027-08-15" } as any);
    expect(await periodOf(created.id)).toMatchObject({ endDate: "2027-08-15" });

    await storage.softDeleteReservation(created.id, { username: FIXTURE_ACTOR.username, userId: null });
    expect(await periodOf(created.id)).toMatchObject({ closedReason: "deleted" });
  });

  it("a reservation that is hard-deleted takes its period with it", async () => {
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle();
    const created = await storage.createReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-09-01", endDate: "2027-09-02", status: "booked", type: "standard" } as any);
    expect(await periodOf(created.id)).not.toBeNull();
    await storage.deleteReservation(created.id);
    expect(await periodOf(created.id)).toBeNull();
    expect(await getUsagePeriodByReservation(created.id)).toBeNull();
  });
});

describe("gebruiksperioden — elke schrijfroute van de opslag", () => {
  it("the checked create and update, the handover, and the replacement keep the period in step", async () => {
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle();
    const created = await storage.createReservationChecked({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-10-01", endDate: "2027-10-10", status: "booked", type: "standard" } as any);
    expect(await periodOf(created.id)).toMatchObject({ startDate: "2027-10-01", endDate: "2027-10-10" });

    await storage.updateReservationChecked(created.id, { endDate: "2027-10-12" } as any, null);
    expect(await periodOf(created.id)).toMatchObject({ endDate: "2027-10-12" });

    await storage.pickupReservation(created.id, { contractNumber: "FIXT-C1", pickupMileage: 100, fuelLevelPickup: "1/2", pickupDate: "2027-10-02" });
    expect(await periodOf(created.id)).toMatchObject({ startDate: "2027-10-02", dateBasis: "actual" });

    const spare = await createFixtureVehicle();
    const replacement = await storage.createReplacementReservation(created.id, spare.id, "2027-10-03", "2027-10-05");
    expect(await periodOf(replacement.id)).toMatchObject({ isReplacement: true, startDate: "2027-10-03", endDate: "2027-10-05" });
    await storage.closeReplacementReservation(replacement.id, "2027-10-04");
    expect(await periodOf(replacement.id)).toMatchObject({ endDate: "2027-10-04" });

    await storage.returnReservation(created.id, { returnMileage: 200, fuelLevelReturn: "1/2", returnDate: "2027-10-08" });
    expect(await periodOf(created.id)).toMatchObject({ endDate: "2027-10-08" });
  });

  it("reconcileUsagePeriods catches reservations that were written past the storage layer", async () => {
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle();
    const r = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2027-12-01", endDate: "2027-12-10" });
    expect(await periodOf(r.id)).toBeNull();
    expect((await reconcileUsagePeriods()).synced).toBeGreaterThanOrEqual(1);
    expect(await periodOf(r.id)).toMatchObject({ startDate: "2027-12-01", endDate: "2027-12-10" });

    await db.update(reservations).set({ endDate: "2027-12-12", updatedAt: new Date() }).where(eq(reservations.id, r.id));
    await reconcileUsagePeriods();
    expect(await periodOf(r.id)).toMatchObject({ endDate: "2027-12-12" });

    await db.update(reservations).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(reservations.id, r.id));
    await reconcileUsagePeriods();
    expect(await periodOf(r.id)).toMatchObject({ closedReason: "deleted" });
    // A second pass has nothing left to do.
    expect((await reconcileUsagePeriods()).synced).toBe(0);
  });
});

describe("gebruiksperioden — einde gepland, werkelijk of open", () => {
  it("knows whether the end is planned, actual, or still open", async () => {
    const customer = await createFixtureCustomer();
    const vehicle = await createFixtureVehicle();
    const open = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2028-05-01", endDate: null });
    expect((await syncUsagePeriodForReservation(open.id))!.endBasis).toBeNull();
    const planned = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2028-06-01", endDate: "2028-06-10" });
    expect((await syncUsagePeriodForReservation(planned.id))!.endBasis).toBe("planned");
    await db.update(reservations).set({ actualReturnDate: "2028-06-08" }).where(eq(reservations.id, planned.id));
    expect(await syncUsagePeriodForReservation(planned.id)).toMatchObject({ endDate: "2028-06-08", endBasis: "actual", dateBasis: "actual" });
  });
});
