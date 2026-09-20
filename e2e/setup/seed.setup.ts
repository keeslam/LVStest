import { test, expect } from "@playwright/test";
import { authFile } from "../support/roles";
import { SEED } from "../seed/data";

test.use({ storageState: authFile("admin") });

test("the seed is visible through the API", async ({ request }) => {
  const vehicles = await (await request.get("/api/vehicles")).json();
  expect(vehicles.map((v: { licensePlate: string }) => v.licensePlate)).toEqual(expect.arrayContaining(SEED.vehicles.map((v) => v.licensePlate)));
  const customers = await (await request.get("/api/customers")).json();
  expect(customers.length).toBeGreaterThanOrEqual(SEED.customers.length);
  const reservations = await (await request.get("/api/reservations")).json();
  const statuses = new Set(reservations.map((r: { status: string }) => r.status));
  for (const status of ["booked", "picked_up", "returned", "completed", "cancelled"]) expect(statuses, status).toContain(status);

  // A raw insert bypasses server/services/lifecycle.ts's deriveVehicleAvailability,
  // so runSeed() must run the application's own sync afterwards
  // (storage.syncVehicleAvailabilityWithReservations) instead of hand-setting
  // this column. These five are the vehicles that rule actually moves:
  // a live-today booking and a picked-up rental both become "rented", a
  // booking within 30 days becomes "scheduled", and the two manual statuses
  // ("needs_fixing", "not_for_rental") must survive the sync unchanged.
  const byPlate = new Map(vehicles.map((v: { licensePlate: string; availabilityStatus: string }) => [v.licensePlate, v.availabilityStatus]));
  const expectedAvailability: Record<string, string> = {
    "E2E-01-A": "rented", // today-booked: startDate <= today <= endDate
    "E2E-02-B": "scheduled", // next-week: starts within 30 days
    "E2E-03-C": "rented", // picked-up: a picked_up rental is always "rented"
    "E2E-04-D": "needs_fixing", // manual status, no reservation touches it
    "E2E-05-E": "not_for_rental", // manual status, top precedence in the rule
  };
  for (const [plate, status] of Object.entries(expectedAvailability)) expect(byPlate.get(plate), plate).toBe(status);
});
