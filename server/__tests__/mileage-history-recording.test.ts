/**
 * Rapporten fase 1, taak 4 - elke km-stand komt in vehicle_mileage_readings.
 *
 * Elke plek die vandaag een kilometerstand schrijft (ophalen, inleveren,
 * schadecheck, handmatig, portaal, onderhoud) legt nu ook een regel in de
 * historie vast; terugdraaien en een schadecheck verwijderen laten die regel
 * vervallen. Echte database, echte routes.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "../db";
import {
  deletedRecords, interactiveDamageChecks, portalRequests, portalUsers, reservations, vehicleMileageReadings, vehicles,
} from "../../shared/schema";
import { day, weekday } from "./helpers/dates";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures, FIXTURE_PLATE_PREFIX,
} from "./helpers/fixtures";
import { getMileageHistory } from "../services/mileage-history";
import { requestsStorage } from "../services/portal-requests-storage";
import { portalStorage } from "../services/portal-storage";

let admin: TestAgent;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("KMH")).id;
}, 60_000);

afterAll(async () => {
  // A failed damage-check test can leave its check behind; it blocks the fixture cleanup.
  const fixtureVehicles = db.select({ id: vehicles.id }).from(vehicles)
    .where(like(vehicles.licensePlate, `${FIXTURE_PLATE_PREFIX}%`));
  await db.delete(interactiveDamageChecks).where(inArray(interactiveDamageChecks.vehicleId, fixtureVehicles));
  await db.delete(portalRequests).where(eq(portalRequests.customerId, customerId));
  await db.delete(portalUsers).where(eq(portalUsers.customerId, customerId));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

let contractCounter = 0;
const nextContract = () => `FIXT-KMH-${Date.now().toString(36)}-${++contractCounter}`;

async function readingsOf(vehicleId: number) {
  return db.select().from(vehicleMileageReadings)
    .where(eq(vehicleMileageReadings.vehicleId, vehicleId))
    .orderBy(vehicleMileageReadings.id);
}

async function pickedUp(mileage = 5000, pickupMileage = 5100) {
  const vehicle = await createFixtureVehicle({ currentMileage: mileage, currentFuelLevel: "1/2" });
  const rental = await createFixtureReservation({
    customerId, vehicleId: vehicle.id, startDate: day(-3), endDate: day(3),
  });
  const res = await admin.post(`/api/reservations/${rental.id}/pickup`).send({
    contractNumber: nextContract(), pickupMileage, fuelLevelPickup: "full", pickupDate: day(-3),
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return { vehicle, rental };
}

async function revert(id: number) {
  const preview = await admin.get(`/api/reservations/${id}/revert-preview`);
  expect(preview.status, JSON.stringify(preview.body)).toBe(200);
  return admin.post(`/api/reservations/${id}/revert`).send({
    planHash: preview.body.planHash, confirmMileageDecrease: true,
  });
}

describe("km-historie - ophalen, inleveren, terugdraaien", () => {
  it("ophalen legt precies een pickup-regel vast op de reservering", async () => {
    const { vehicle, rental } = await pickedUp(5000, 5100);
    const rows = await readingsOf(vehicle.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "pickup", sourceTable: "reservations", sourceId: rental.id,
      mileage: 5100, actorName: admin.username, voidedAt: null,
    });
  });

  it("inleveren legt een return-regel vast", async () => {
    const { vehicle, rental } = await pickedUp(7000, 7010);
    const ret = await admin.post(`/api/reservations/${rental.id}/return`).send({
      returnMileage: 7300, fuelLevelReturn: "1/4", returnDate: day(-1),
    });
    expect(ret.status, JSON.stringify(ret.body)).toBe(200);
    const rows = (await readingsOf(vehicle.id)).filter((r) => r.source === "return");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceTable: "reservations", sourceId: rental.id, mileage: 7300, actorName: admin.username });
  });

  it("terugdraaien van de inlevering laat die regel vervallen, zonder daling-waarschuwing", async () => {
    const { vehicle, rental } = await pickedUp(8000, 8010);
    expect((await admin.post(`/api/reservations/${rental.id}/return`).send({
      returnMileage: 8500, fuelLevelReturn: "1/4", returnDate: day(-1),
    })).status).toBe(200);

    const res = await revert(rental.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const ret = (await readingsOf(vehicle.id)).find((r) => r.source === "return")!;
    expect(ret.voidedAt).not.toBeNull();
    expect(ret.voidedBy).toBe(admin.username);
    const pickup = (await readingsOf(vehicle.id)).find((r) => r.source === "pickup")!;
    expect(pickup.voidedAt).toBeNull();

    const h = await getMileageHistory(vehicle.id, day(-10), day(1));
    expect(h!.rows.some((r) => r.warning === "decrease")).toBe(false);
  });
});

describe("km-historie - schadecheck", () => {
  it("aanmaken, wijzigen en verwijderen: een damage_check-regel, geen extra pickup-regel", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 9000 });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(0), endDate: day(3),
    });

    const created = await admin.post("/api/interactive-damage-checks").send({
      vehicleId: vehicle.id, reservationId: rental.id, checkType: "pickup",
      checkDate: new Date().toISOString(), mileage: 9050,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const checkId = created.body.id as number;

    let rows = await readingsOf(vehicle.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "damage_check", sourceTable: "interactive_damage_checks", sourceId: checkId,
      mileage: 9050, actorName: admin.username,
    });

    const updated = await admin.put(`/api/interactive-damage-checks/${checkId}`).send({ mileage: 9060 });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    rows = await readingsOf(vehicle.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].mileage).toBe(9060);
    expect(rows[0].voidedAt).toBeNull();

    const del = await admin.delete(`/api/interactive-damage-checks/${checkId}`);
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    rows = await readingsOf(vehicle.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].voidedAt).not.toBeNull();
  }, 60_000);
});

describe("km-historie - handmatig, portaal, onderhoud", () => {
  it("PATCH /api/vehicles/:id met een nieuwe stand legt een manual-regel vast met de gebruikersnaam", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 10_000 });
    const res = await admin.patch(`/api/vehicles/${vehicle.id}`).send({ currentMileage: 10_250 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rows = await readingsOf(vehicle.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "manual", sourceId: null, mileage: 10_250, actorName: admin.username });

    // Dezelfde stand nog eens opslaan is geen nieuwe meting.
    expect((await admin.patch(`/api/vehicles/${vehicle.id}`).send({ currentMileage: 10_250 })).status).toBe(200);
    expect(await readingsOf(vehicle.id)).toHaveLength(1);
  });

  it("portaal: km-stand overnemen legt een portal-regel vast met de naam van de klant", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 20_000 });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-5), endDate: day(5), status: "picked_up",
    });
    const user = await portalStorage.createPortalUser({
      customerId, email: `kmh-${Date.now().toString(36)}@portal-test.invalid`, fullName: "Jan Klant", role: "admin",
    }, "t");
    const reqRow = await requestsStorage.createRequest({
      customerId, portalUserId: user.id, type: "mileage", reservationId: rental.id,
      payload: { mileage: 20_400 }, message: "Stand doorgeven",
    });
    // Sent three days ago, taken over now: the reading is dated at the take-over.
    await db.update(portalRequests).set({ createdAt: new Date(Date.now() - 3 * 86_400_000) }).where(eq(portalRequests.id, reqRow.id));

    const before = Date.now();
    const res = await admin.post(`/api/portal-requests/${reqRow.id}/apply-mileage`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rows = await readingsOf(vehicle.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "portal", sourceTable: "portal_requests", sourceId: reqRow.id,
      mileage: 20_400, actorName: "Jan Klant",
    });
    expect(rows[0].recordedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("portaal: onderhoud goedkeuren met een hogere stand dateert de regel op het moment van overnemen", async () => {
    const vehicle = await createFixtureVehicle({ currentMileage: 30_000 });
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: day(-5), endDate: day(30), status: "picked_up",
    });
    const user = await portalStorage.createPortalUser({
      customerId, email: `kmh-m-${Date.now().toString(36)}@portal-test.invalid`, fullName: "Jan Klant", role: "admin",
    }, "t");
    const reqRow = await requestsStorage.createRequest({
      customerId, portalUserId: user.id, type: "maintenance", reservationId: rental.id,
      payload: { issue: "Ruitenwisser", mileage: 30_500 }, message: "Graag inplannen",
    });
    await db.update(portalRequests).set({ createdAt: new Date(Date.now() - 3 * 86_400_000) }).where(eq(portalRequests.id, reqRow.id));

    const before = Date.now();
    const res = await admin.post(`/api/portal-requests/${reqRow.id}/approve`).send({ startDate: weekday(14), durationDays: 1 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rows = (await readingsOf(vehicle.id)).filter((r) => r.source === "portal");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceTable: "portal_requests", sourceId: reqRow.id, mileage: 30_500, actorName: "systeem" });
    expect(rows[0].recordedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  }, 60_000);

  it("onderhoud afronden met een stand legt een service-regel vast", async () => {
    const vehicle = await createFixtureVehicle({
      maintenanceStatus: "in_service", availabilityStatus: "needs_fixing", currentMileage: 40_000,
    });
    const block = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, startDate: day(-2), endDate: null,
      status: "booked", type: "maintenance_block",
    });
    await db.update(reservations).set({ maintenanceStatus: "in" }).where(eq(reservations.id, block.id));

    const res = await admin.post(`/api/reservations/${block.id}/complete-maintenance`).send({
      completionDate: day(0), maintenanceCategory: "scheduled_maintenance", currentMileage: 41_000,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rows = await db.select().from(vehicleMileageReadings).where(and(
      eq(vehicleMileageReadings.vehicleId, vehicle.id), eq(vehicleMileageReadings.source, "service"),
    ));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceTable: "reservations", sourceId: block.id, mileage: 41_000, actorName: admin.username });
  });
});

describe("km-historie - terugdraaien, verwisselen, verwijderen (fix-ronde 1)", () => {
  it("terugdraaien van het ophalen laat ook de stand van de ophaal-schadecheck vervallen", async () => {
    const { vehicle, rental } = await pickedUp(5000, 5100);
    const check = await admin.post("/api/interactive-damage-checks").send({
      vehicleId: vehicle.id, reservationId: rental.id, checkType: "pickup",
      checkDate: new Date().toISOString(), mileage: 5100,
    });
    expect(check.status, JSON.stringify(check.body)).toBe(201);

    const res = await revert(rental.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const rows = await readingsOf(vehicle.id);
    expect(rows.find((r) => r.source === "pickup")!.voidedAt).not.toBeNull();
    expect(rows.find((r) => r.source === "damage_check")!.voidedAt).not.toBeNull();

    // The vehicle is back at 5000; a later, lower-than-5100 reading is no decrease.
    expect((await admin.patch(`/api/vehicles/${vehicle.id}`).send({ currentMileage: 5050 })).status).toBe(200);
    const h = await getMileageHistory(vehicle.id, day(-10), day(1));
    expect(h!.rows.some((r) => r.warning === "decrease")).toBe(false);

    await admin.delete(`/api/interactive-damage-checks/${check.body.id}`);
  }, 60_000);

  it("een andere auto op de reservering of de schadecheck neemt de stand mee", async () => {
    const { vehicle, rental } = await pickedUp(6000, 6100);
    const other = await createFixtureVehicle({ currentMileage: 6000 });
    const swap = await admin.patch(`/api/reservations/${rental.id}`).send({ vehicleId: other.id });
    expect(swap.status, JSON.stringify(swap.body)).toBe(200);
    expect(await readingsOf(vehicle.id)).toHaveLength(0);
    const moved = await readingsOf(other.id);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ source: "pickup", sourceId: rental.id, mileage: 6100 });

    const third = await createFixtureVehicle({ currentMileage: 100 });
    const check = await admin.post("/api/interactive-damage-checks").send({
      vehicleId: third.id, checkType: "pickup", checkDate: new Date().toISOString(), mileage: 150,
    });
    expect(check.status, JSON.stringify(check.body)).toBe(201);
    const fourth = await createFixtureVehicle({ currentMileage: 100 });
    const put = await admin.put(`/api/interactive-damage-checks/${check.body.id}`).send({ vehicleId: fourth.id, mileage: 160 });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect((await readingsOf(third.id)).filter((r) => r.source === "damage_check")).toHaveLength(0);
    expect((await readingsOf(fourth.id)).filter((r) => r.source === "damage_check")).toHaveLength(1);
    await admin.delete(`/api/interactive-damage-checks/${check.body.id}`);
  }, 60_000);

  it("verwijderen laat de standen vervallen, herstellen uit de prullenbak maakt ze weer geldig", async () => {
    const { vehicle, rental } = await pickedUp(30_000, 30_010);
    expect((await admin.post(`/api/reservations/${rental.id}/return`).send({
      returnMileage: 30_300, fuelLevelReturn: "1/4", returnDate: day(-1),
    })).status).toBe(200);
    const check = await admin.post("/api/interactive-damage-checks").send({
      vehicleId: vehicle.id, reservationId: rental.id, checkType: "return",
      checkDate: new Date().toISOString(), mileage: 30_300,
    });
    expect(check.status, JSON.stringify(check.body)).toBe(201);
    expect((await readingsOf(vehicle.id)).filter((r) => r.voidedAt == null)).toHaveLength(3);

    const del = await admin.delete(`/api/reservations/${rental.id}`);
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    expect((await readingsOf(vehicle.id)).filter((r) => r.voidedAt == null)).toHaveLength(0);
    expect((await getMileageHistory(vehicle.id, day(-10), day(1)))!.summary.readings).toBe(0);

    const [record] = await db.select().from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "reservation"), eq(deletedRecords.entityId, rental.id)));
    const restored = await admin.post(`/api/deleted-records/${record.id}/restore`).send({});
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    expect((await readingsOf(vehicle.id)).filter((r) => r.voidedAt == null)).toHaveLength(3);
    expect((await getMileageHistory(vehicle.id, day(-10), day(1)))!.summary.readings).toBe(3);

    await admin.delete(`/api/interactive-damage-checks/${check.body.id}`);
  }, 60_000);
});
