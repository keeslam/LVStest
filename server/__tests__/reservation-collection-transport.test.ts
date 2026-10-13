/**
 * "Ophaalservice bij inleveren": a reservation that we collect from the customer at the end gets its own
 * transport, like the delivery service does at the start, and the transport follows the reservation.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { vehicleTransports } from "../../shared/schema";
import { COLLECTION_LEG_REASON } from "../../shared/portal-handover";
import { createTestCustomer, createTestVehicle, cleanupPortalTestData } from "./portal-helpers";

describe("collection service creates a transport", () => {
  let customerId: number, vehicleId: number;
  const legs = async (reservationId: number) => db.select().from(vehicleTransports).where(eq(vehicleTransports.reservationId, reservationId));
  const collectionLeg = async (reservationId: number) => (await legs(reservationId)).find((t) => t.reason === COLLECTION_LEG_REASON);

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("Ophaal")).id;
    vehicleId = (await createTestVehicle()).id;
  });
  afterAll(cleanupPortalTestData);

  const base = () => ({ customerId, vehicleId, startDate: "2098-03-01", endDate: "2098-03-10", status: "booked", type: "standard" } as any);

  it("creates a repossession (Terughalen) from the collection address on the end date, not billable", async () => {
    const r = await storage.createReservation({ ...base(), collectionRequired: true, collectionAddress: "Havenweg 9", collectionCity: "Rotterdam", collectionPostalCode: "3011 AD" });
    const leg = await collectionLeg(r.id);
    expect(leg).toMatchObject({ transportType: "repossession", status: "scheduled", originAddress: "Havenweg 9", originCity: "Rotterdam", scheduledDate: "2098-03-10", billable: false, vehicleId, customerId });
  });

  it("follows the reservation: a new address or end date is mirrored, turning the service off cancels it", async () => {
    const r = await storage.createReservation({ ...base(), collectionRequired: true, collectionAddress: "Kade 1", collectionCity: "Utrecht" });
    await storage.updateReservation(r.id, { collectionAddress: "Kade 2", collectionCity: "Delft", endDate: "2098-03-12" } as any);
    expect(await collectionLeg(r.id)).toMatchObject({ originAddress: "Kade 2", originCity: "Delft", scheduledDate: "2098-03-12", status: "scheduled" });
    await storage.updateReservation(r.id, { collectionRequired: false } as any);
    expect((await collectionLeg(r.id))?.status).toBe("cancelled");
    // Back on: the cancelled one stays cancelled history; nothing is resurrected or duplicated silently.
    const before = (await legs(r.id)).length;
    await storage.updateReservation(r.id, { collectionRequired: true } as any);
    expect((await legs(r.id)).length).toBe(before);
  });

  it("is independent of the delivery: two transports, each following its own service", async () => {
    const r = await storage.createReservation({ ...base(), deliveryRequired: true, deliveryAddress: "Dorpsstraat 1", deliveryCity: "Utrecht", collectionRequired: true, collectionAddress: "Havenweg 9", collectionCity: "Rotterdam" });
    let all = await legs(r.id);
    expect(all).toHaveLength(2);
    expect(all.find((t) => t.transportType === "delivery")).toMatchObject({ destinationAddress: "Dorpsstraat 1", scheduledDate: "2098-03-01" });
    expect(all.find((t) => t.reason === COLLECTION_LEG_REASON)).toMatchObject({ originAddress: "Havenweg 9", scheduledDate: "2098-03-10" });

    // Changing only the delivery address must not touch the collection transport, and the other way round.
    await storage.updateReservation(r.id, { deliveryAddress: "Dorpsstraat 2" } as any);
    all = await legs(r.id);
    expect(all).toHaveLength(2);
    expect(all.find((t) => t.transportType === "delivery")?.destinationAddress).toBe("Dorpsstraat 2");
    expect(all.find((t) => t.reason === COLLECTION_LEG_REASON)?.originAddress).toBe("Havenweg 9");
    await storage.updateReservation(r.id, { collectionRequired: false } as any);
    all = await legs(r.id);
    expect(all.find((t) => t.transportType === "delivery")?.status).toBe("scheduled");
    expect(all.find((t) => t.reason === COLLECTION_LEG_REASON)?.status).toBe("cancelled");
  });

  it("leaves a repossession that someone linked by hand alone, whatever the service does", async () => {
    const r = await storage.createReservation({ ...base(), collectionRequired: true, collectionAddress: "Kade 1", collectionCity: "Utrecht" });
    const [manual] = await db.insert(vehicleTransports).values({ vehicleId, customerId, reservationId: r.id, transportType: "repossession", status: "scheduled", scheduledDate: "2098-03-05", reason: "Handmatig terughalen", billable: true, isExternalVehicle: false, spareRequired: false, isBreakdownOrMaintenance: false, invoiced: false }).returning();
    await storage.updateReservation(r.id, { collectionAddress: "Kade 9", collectionRequired: false } as any);
    const after = (await legs(r.id)).find((t) => t.id === manual.id)!;
    expect(after).toMatchObject({ status: "scheduled", scheduledDate: "2098-03-05", reason: "Handmatig terughalen", billable: true });
    expect((await collectionLeg(r.id))?.status).toBe("cancelled");
  });

  it("waits for an end date: an open-ended rental gets no collection transport until it has one", async () => {
    const r = await storage.createReservation({ ...base(), endDate: null, collectionRequired: true, collectionAddress: "Kade 1", collectionCity: "Utrecht" });
    expect(await collectionLeg(r.id)).toBeUndefined();
    await storage.updateReservation(r.id, { endDate: "2098-04-01" } as any);
    expect(await collectionLeg(r.id)).toMatchObject({ scheduledDate: "2098-04-01", status: "scheduled" });
  });

  it("does not resurrect or overwrite a transport that is already done", async () => {
    const r = await storage.createReservation({ ...base(), collectionRequired: true, collectionAddress: "Kade 1", collectionCity: "Utrecht" });
    const leg = (await collectionLeg(r.id))!;
    await db.update(vehicleTransports).set({ status: "completed", completedDate: "2098-03-10" }).where(eq(vehicleTransports.id, leg.id));
    await storage.updateReservation(r.id, { collectionAddress: "Elders 5" } as any);
    expect(await collectionLeg(r.id)).toMatchObject({ status: "completed", originAddress: "Kade 1" });
    expect((await legs(r.id)).filter((t) => t.reason === COLLECTION_LEG_REASON)).toHaveLength(1);
  });

  it("cancels the transport when the reservation is deleted, like the delivery one", async () => {
    const r = await storage.createReservation({ ...base(), collectionRequired: true, collectionAddress: "Kade 1", collectionCity: "Utrecht" });
    const leg = (await collectionLeg(r.id))!;
    await storage.deleteReservation(r.id);
    const [after] = await db.select().from(vehicleTransports).where(and(eq(vehicleTransports.id, leg.id)));
    expect(after.status).toBe("cancelled");
  });
});
