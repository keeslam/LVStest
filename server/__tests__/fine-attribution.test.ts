import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { findCandidates, driverAt, attributeFine, linkFineManually, unlinkFine } from "../services/fine-attribution";
import { assignDriverToReservation } from "../services/driver-assignments";
import { createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, createTestFine, cleanupPortalTestData } from "./portal-helpers";

describe("fine attribution", () => {
  let plate: string, customerA: number, customerB: number, vehicleId: number, resA: number, d1: number, d2: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    plate = `PT${Date.now().toString().slice(-6)}`;
    vehicleId = (await createTestVehicle(plate)).id;
    customerA = (await createTestCustomer("FA")).id;
    customerB = (await createTestCustomer("FB")).id;
    d1 = (await createTestDriver(customerA, "Eerste")).id;
    d2 = (await createTestDriver(customerA, "Tweede")).id;
    resA = (await createTestReservation({ customerId: customerA, vehicleId, startDate: "2026-09-01", endDate: "2026-09-10", status: "picked_up" })).id;
    await assignDriverToReservation({ reservationId: resA, driverId: d1, at: new Date("2026-09-01T08:00:00Z") });
    await assignDriverToReservation({ reservationId: resA, driverId: d2, at: new Date("2026-09-05T12:00:00Z") });
    await createTestReservation({ customerId: customerB, vehicleId, startDate: "2026-09-12", endDate: "2026-09-14" });
  });
  afterAll(cleanupPortalTestData);

  it("finds the covering reservation and the driver at that moment", async () => {
    const { covering, near } = await findCandidates(plate, new Date("2026-09-03T10:00:00Z"));
    expect(covering.map((c) => c.id)).toEqual([resA]);
    expect(near.length).toBeGreaterThanOrEqual(0);
    expect(await driverAt(resA, new Date("2026-09-03T10:00:00Z"))).toBe(d1);
    expect(await driverAt(resA, new Date("2026-09-06T10:00:00Z"))).toBe(d2);
  });

  it("auto-links with one covering reservation", async () => {
    const fine = await createTestFine({ licensePlate: plate, offenceAt: new Date("2026-09-06T10:00:00Z") });
    const { fine: linked } = await attributeFine(fine.id);
    expect(linked.status).toBe("linked");
    expect(linked.customerId).toBe(customerA);
    expect(linked.reservationId).toBe(resA);
    expect(linked.driverId).toBe(d2);
    expect(linked.linkedBy).toBe("system");
  });

  it("stays new with zero covering reservations and offers near candidates", async () => {
    const fine = await createTestFine({ licensePlate: plate, offenceAt: new Date("2026-09-11T10:00:00Z") });
    const { fine: after, candidates } = await attributeFine(fine.id);
    expect(after.status).toBe("new");
    expect(candidates.covering).toEqual([]);
    expect(candidates.near.map((c) => c.customerId).sort()).toEqual([customerA, customerB].sort());
  });

  it("stays new with two covering reservations", async () => {
    await createTestReservation({ customerId: customerB, vehicleId, startDate: "2026-09-02", endDate: "2026-09-04" });
    const fine = await createTestFine({ licensePlate: plate, offenceAt: new Date("2026-09-03T10:00:00Z") });
    const { fine: after, candidates } = await attributeFine(fine.id);
    expect(after.status).toBe("new");
    expect(candidates.covering).toHaveLength(2);
  });

  it("manual link validates ownership and unlink returns to new", async () => {
    const fine = await createTestFine({ licensePlate: plate, offenceAt: new Date("2026-09-20T10:00:00Z") });
    await expect(linkFineManually(fine.id, { customerId: customerB, reservationId: resA }, "staff")).rejects.toThrow(/Reservation/);
    await expect(linkFineManually(fine.id, { customerId: customerB, driverId: d1 }, "staff")).rejects.toThrow(/Driver/);
    const linked = await linkFineManually(fine.id, { customerId: customerA, reservationId: resA, driverId: d1 }, "staff");
    expect(linked.status).toBe("linked");
    expect(linked.linkedBy).toBe("staff");
    const back = await unlinkFine(fine.id, "staff");
    expect(back.status).toBe("new");
    expect(back.customerId).toBeNull();
  });
});
