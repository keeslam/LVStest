/**
 * BUG-205 (Kees, 2026-10-19): the reservations list a page at a time: filtered by view, searched like
 * the client search (plate with or without dashes, brand/model, customer, contract, id), sorted, counted,
 * and with only the vehicle and customer fields the list shows.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestCustomer, createTestVehicle, createTestReservation, cleanupPortalTestData } from "./portal-helpers";
import { getReservationListPage, getReservationListRowsByIds } from "../services/reservation-list";
import { storage } from "../storage";
import { db } from "../db";
import { reservations, vehicles } from "../../shared/schema";
import { eq } from "drizzle-orm";

describe("reserveringslijst per pagina", () => {
  let plate: string, customerName: string;
  const ids: number[] = [];

  beforeAll(async () => {
    await cleanupPortalTestData();
    const customer = await createTestCustomer("Lijsttest");
    customerName = customer.name;
    const vehicle = await createTestVehicle();
    plate = vehicle.licensePlate;
    await db.update(vehicles).set({ brand: "Zorgvan", model: "Paginator" }).where(eq(vehicles.id, vehicle.id));
    for (let i = 0; i < 7; i++) {
      ids.push((await createTestReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: `2031-01-${String(10 + i).padStart(2, "0")}`, endDate: `2031-02-${String(10 + i).padStart(2, "0")}`, status: i < 5 ? "booked" : "completed" })).id);
    }
    await db.update(reservations).set({ contractNumber: "LIJST-777" }).where(eq(reservations.id, ids[3]));
    // A maintenance block never shows in the list.
    await createTestReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: "2031-01-20", status: "booked", type: "maintenance_block" });
  });
  afterAll(cleanupPortalTestData);

  it("pages, sorts and counts the current view", async () => {
    const first = await getReservationListPage({ view: "current", search: "Paginator", page: 1, pageSize: 2 });
    expect(first.total).toBe(5);
    expect(first.rows.map((r) => r.id)).toEqual([ids[0], ids[1]]);
    const third = await getReservationListPage({ view: "current", search: "Paginator", page: 3, pageSize: 2 });
    expect(third.rows.map((r) => r.id)).toEqual([ids[4]]);
    const desc = await getReservationListPage({ view: "current", search: "Paginator", sort: "pickup", dir: "desc", page: 1, pageSize: 1 });
    expect(desc.rows[0].id).toBe(ids[4]);
    expect(first.counts.current).toBeGreaterThanOrEqual(5);
  });

  it("searches like the client: plate without dashes, brand and model, customer, contract, id", async () => {
    const plain = plate.replace(/-/g, "").toLowerCase();
    expect((await getReservationListPage({ view: "current", search: plain, page: 1, pageSize: 50 })).total).toBe(5);
    expect((await getReservationListPage({ view: "current", search: "zorgvan paginator", page: 1, pageSize: 50 })).total).toBe(5);
    expect((await getReservationListPage({ view: "current", search: customerName, page: 1, pageSize: 50 })).total).toBeGreaterThanOrEqual(5);
    expect((await getReservationListPage({ view: "current", search: "lijst-777", page: 1, pageSize: 50 })).rows.map((r) => r.id)).toEqual([ids[3]]);
    expect((await getReservationListPage({ view: "history", search: "Paginator", page: 1, pageSize: 50 })).total).toBe(2);
    expect((await getReservationListPage({ view: "current", search: "100%_\\", page: 1, pageSize: 50 })).total).toBe(0);
  });

  it("answers only the vehicle and customer fields the list shows", async () => {
    const row = (await getReservationListPage({ view: "current", search: "Paginator", page: 1, pageSize: 1 })).rows[0];
    expect(Object.keys(row.vehicle!).sort()).toEqual(["brand", "id", "licensePlate", "model", "returnMileage"]);
    expect(Object.keys(row.customer!).sort()).toEqual(["companyName", "id", "name"]);
    expect(row.status).toBe("booked");
    // The full row is much bigger than the slim one.
    const full = await storage.getReservation(row.id);
    expect(JSON.stringify(row).length).toBeLessThan(JSON.stringify(full).length / 2);
  });

  it("finds rows by id for lookups", async () => {
    const rows = await getReservationListRowsByIds([ids[1], ids[6], 999999999]);
    expect(rows.map((r) => r.id).sort()).toEqual([ids[1], ids[6]].sort());
  });
});
