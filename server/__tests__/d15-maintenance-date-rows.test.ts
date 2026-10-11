/**
 * D15 follow-up (df-review Minor 1): the communication preview and the mail must agree on
 * `{maintenanceDate}`. The server fills it from the vehicle's last service date, else the
 * maintenance block that covers today, else the next one (`maintenanceDateForVehicle`); the preview
 * only knew the vehicle row. The rows of GET /api/vehicles/with-reservations and /filtered now carry
 * that answer as one field, `maintenanceDate`, and the preview reads it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import { customers, emailLogs } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures } from "./helpers/fixtures";
import { withSmtpStub, decodeBody } from "./helpers/smtpStub";
import { isoDay } from "./helpers/dates";
import filteredVehiclesRouter from "../routes/filtered-vehicles";
import vehiclesWithReservationsRouter from "../routes/vehicles-with-reservations";

const PREFIX = "FIXT-d15md";
// The two routers are mounted by server/index.ts (behind requireAuth + a permission), which the shared
// test app does not load; the guards are not what is tested here, so they are mounted bare.
const lists = express();
lists.use("/with-reservations", vehiclesWithReservationsRouter);
lists.use("/filtered", filteredVehiclesRouter);
let admin: TestAgent;

beforeAll(async () => {
  admin = await agentFor("admin");
}, 60_000);
afterAll(async () => {
  await db.delete(emailLogs).where(like(emailLogs.subject, `${PREFIX}%`));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

const day = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return isoDay(d);
};

/** A car on the road today with a customer who has an e-mail address. */
async function carOnTheRoad(overrides: Parameters<typeof createFixtureVehicle>[0] = {}) {
  const vehicle = await createFixtureVehicle(overrides);
  const customer = await createFixtureCustomer("D15md");
  await db.update(customers).set({ email: `d15md-${customer.id}@fixture-test.invalid` }).where(eq(customers.id, customer.id));
  await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id, startDate: day(-2), endDate: day(2), status: "picked_up" });
  return { vehicle, customer };
}

const rowOf = (rows: any[], vehicleId: number) => rows.find((r) => r.vehicle?.id === vehicleId);

describe("rows of the vehicle lists carry maintenanceDate", () => {
  it("the last service date wins, then the block covering today, then the next block, else null", async () => {
    const withService = await carOnTheRoad({ lastServiceDate: "2026-03-04" });
    const coveringBlock = await carOnTheRoad();
    await createFixtureReservation({ vehicleId: coveringBlock.vehicle.id, startDate: day(-1), endDate: day(1), status: "booked", type: "maintenance_block" });
    const nextBlock = await carOnTheRoad();
    await createFixtureReservation({ vehicleId: nextBlock.vehicle.id, startDate: day(5), endDate: day(6), status: "booked", type: "maintenance_block" });
    const nothing = await carOnTheRoad();

    for (const url of ["/with-reservations", "/filtered?filterType=maintenance"]) {
      const res = await request(lists).get(url);
      expect(res.status, url).toBe(200);
      expect(rowOf(res.body, withService.vehicle.id)?.maintenanceDate, `${url} last service`).toBe("2026-03-04");
      expect(rowOf(res.body, coveringBlock.vehicle.id)?.maintenanceDate, `${url} covering block`).toBe(day(-1));
      expect(rowOf(res.body, nextBlock.vehicle.id)?.maintenanceDate, `${url} next block`).toBe(day(5));
      expect(rowOf(res.body, nothing.vehicle.id)?.maintenanceDate, `${url} nothing`).toBeNull();
    }
  });

  it("is the date the mail carries for that vehicle", async () => {
    const { vehicle } = await carOnTheRoad();
    await createFixtureReservation({ vehicleId: vehicle.id, startDate: day(-1), endDate: day(1), status: "booked", type: "maintenance_block" });
    const rows = (await request(lists).get("/with-reservations")).body;
    const shown = rowOf(rows, vehicle.id).maintenanceDate as string;

    const sent = await withSmtpStub("ok", async (stub) => {
      const res = await admin.post("/api/notifications/send").send({
        template: "custom", category: "maintenance", vehicleIds: [vehicle.id],
        customSubject: `${PREFIX} onderhoud`, customMessage: "Onderhoud=[{maintenanceDate}]",
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return decodeBody(stub.state.messages[0].raw);
    });

    expect(sent).toContain(`Onderhoud=[${shown.split("-").reverse().join("-")}]`);
  });
});
