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
});
