/**
 * OPT-012 — the global search bar: the contract-number half.
 *
 * "Elke telefonische vraag die met een contractnummer begint is een doodlopende
 * weg": the search box matched vehicles, customers, dates and statuses, and the
 * indexed `find-by-contract` lookup was wired only to the duplicate check in
 * the pickup dialog.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

let admin: TestAgent;
let customerId: number;
let rentalId: number;
let otherRentalId: number;
const CONTRACT = "870042";

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("Opt012")).id;

  const vehicle = await createFixtureVehicle();
  const rental = await createFixtureReservation({
    customerId, vehicleId: vehicle.id, startDate: "2026-03-01", endDate: "2026-03-05",
  });
  rentalId = rental.id;
  await db.update(reservations).set({ contractNumber: CONTRACT }).where(eq(reservations.id, rentalId));

  // A second booking on another vehicle, with no contract number, so "only
  // that one" has something to exclude.
  const otherVehicle = await createFixtureVehicle();
  otherRentalId = (await createFixtureReservation({
    customerId, vehicleId: otherVehicle.id, startDate: "2026-04-01", endDate: "2026-04-05",
  })).id;
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

describe("OPT-012 — zoeken op contractnummer", () => {
  it("finds the reservation by its contract number", async () => {
    const res = await admin.get(`/api/reservations?search=${CONTRACT}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((r: any) => r.id);
    expect(ids).toContain(rentalId);
    expect(ids).not.toContain(otherRentalId);
  });

  it("returns the row with its vehicle and customer, so the dropdown can render it", async () => {
    const res = await admin.get(`/api/reservations?search=${CONTRACT}`);
    const row = res.body.find((r: any) => r.id === rentalId);
    expect(row.contractNumber).toBe(CONTRACT);
    expect(row.vehicle).toBeTruthy();
    expect(row.customer).toBeTruthy();
  });

  it("an unknown contract number is an empty result, not everything", async () => {
    const res = await admin.get("/api/reservations?search=870999");
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id)).not.toContain(rentalId);
  });

  it("still finds the same booking by license plate", async () => {
    const [row] = await db.select().from(reservations).where(eq(reservations.id, rentalId));
    const vehicleRes = await admin.get(`/api/vehicles/${row.vehicleId}`);
    const plate = vehicleRes.body.licensePlate as string;

    const res = await admin.get(`/api/reservations?search=${encodeURIComponent(plate)}`);
    expect(res.body.map((r: any) => r.id)).toContain(rentalId);
  });

  it("the find-by-contract route the dialog uses still answers", async () => {
    const res = await admin.get(`/api/reservations/find-by-contract/${CONTRACT}`);
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(true);
    expect(res.body.reservation.id).toBe(rentalId);
  });
});
