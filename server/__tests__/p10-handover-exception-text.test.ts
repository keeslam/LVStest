/**
 * Final wave B, item 2 (P10 review Minor 5): the pickup, return, spare and
 * placeholder routes turned ANY Error into a 400 carrying `error.message`, so a
 * database error ("duplicate key ... already exists") reached the screen. A
 * sentence storage throws on purpose still goes out as it was (clients match
 * 409 + "already exists" on the placeholder route); a raw exception is logged
 * and answered with a fixed message plus a stable code.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const { agentFor, cleanupFixtureUsers } = await import("./helpers/app");
const { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures } = await import("./helpers/fixtures");
const { storage } = await import("../storage");
const { isoDay } = await import("./helpers/dates");

const SECRET = 'SECRET-PG duplicate key value violates unique constraint "reservations_pkey" Key (id)=(7) already exists.';

describe("handover routes - exception text stays on the server", () => {
  let admin: Awaited<ReturnType<typeof agentFor>>;
  let reservationId: number;
  beforeAll(async () => {
    admin = await agentFor("admin");
    const customer = await createFixtureCustomer("HOX");
    const vehicle = await createFixtureVehicle({ dailyPrice: "50" });
    reservationId = (await createFixtureReservation({
      customerId: customer.id, vehicleId: vehicle.id, startDate: isoDay(new Date(Date.now() - 86_400_000)), endDate: isoDay(new Date(Date.now() + 5 * 86_400_000)),
    })).id;
  }, 60_000);
  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  type Site = {
    name: string;
    send: () => Promise<{ status: number; body: any }>;
    method: "pickupReservation" | "returnReservation" | "createReplacementReservation" | "createPlaceholderReservation" | "assignVehicleToPlaceholder";
    code: string;
    refusals: Array<[string, number]>;
  };
  const sites: Site[] = [
    {
      name: "pickup",
      method: "pickupReservation",
      code: "RESERVATION_PICKUP_FAILED",
      send: () => admin.post(`/api/reservations/${reservationId}/pickup`).send({ contractNumber: `FIXT-HOX-${Date.now()}`, pickupMileage: 1000, fuelLevelPickup: "full" }),
      refusals: [
        ["Pickup mileage (5) cannot be less than vehicle's current mileage (10)", 409],
        ["Cannot pickup reservation with status: picked_up. Only 'booked' reservations can be picked up.", 400],
        ["Reservation not found", 400],
      ],
    },
    {
      name: "return",
      method: "returnReservation",
      code: "RESERVATION_RETURN_FAILED",
      send: () => admin.post(`/api/reservations/${reservationId}/return`).send({ returnMileage: 1200, fuelLevelReturn: "full" }),
      refusals: [
        ["Return mileage (5) cannot be less than pickup mileage (10)", 409],
        ["Cannot return reservation with status: booked. Only 'picked_up' reservations can be returned.", 400],
      ],
    },
    {
      name: "assign spare",
      method: "createReplacementReservation",
      code: "SPARE_ASSIGN_FAILED",
      send: () => admin.post(`/api/reservations/${reservationId}/assign-spare`).send({ spareVehicleId: 1, startDate: "2026-10-10" }),
      refusals: [
        ["Spare vehicle cannot be the same as original vehicle", 400],
        ["Vehicle not found", 400],
      ],
    },
    {
      name: "create placeholder",
      method: "createPlaceholderReservation",
      code: "PLACEHOLDER_CREATE_FAILED",
      send: () => admin.post("/api/placeholder-reservations").send({ originalReservationId: reservationId, customerId: 1, startDate: "2026-10-10" }),
      refusals: [
        ["Original reservation not found", 404],
        ["A placeholder spare reservation already exists for this original reservation", 409],
      ],
    },
    {
      name: "assign vehicle to placeholder",
      method: "assignVehicleToPlaceholder",
      code: "PLACEHOLDER_ASSIGN_FAILED",
      send: () => admin.post(`/api/placeholder-reservations/${reservationId}/assign-vehicle`).send({ vehicleId: 1 }),
      refusals: [
        ["Vehicle is currently in service and not available", 409],
        ["Vehicle not found", 404],
      ],
    },
  ];

  for (const site of sites) {
    it(`${site.name}: a raw exception is ${site.code} with a fixed message, not the exception text`, async () => {
      const spy = vi.spyOn(storage, site.method as any).mockRejectedValue(new Error(SECRET));
      const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const res = await site.send();
        expect(res.status).toBe(500);
        expect(res.body.code).toBe(site.code);
        expect(typeof res.body.message).toBe("string");
        const wire = JSON.stringify(res.body);
        expect(wire).not.toContain("SECRET-PG");
        expect(wire).not.toContain("duplicate key");
        expect(wire).not.toContain("already exists");
        expect(quiet).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
        quiet.mockRestore();
      }
    });

    for (const [sentence, status] of site.refusals) {
      it(`${site.name}: the deliberate refusal "${sentence.slice(0, 40)}" keeps its message and status ${status}`, async () => {
        const spy = vi.spyOn(storage, site.method as any).mockRejectedValue(new Error(sentence));
        const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
          const res = await site.send();
          expect(res.status).toBe(status);
          expect(res.body.message).toBe(sentence);
        } finally {
          spy.mockRestore();
          quiet.mockRestore();
        }
      });
    }
  }
});
