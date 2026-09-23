/**
 * B-32 — the booking gate on `POST /api/reservations` counts only picked-up
 * rentals that ran past their end date, the same definition
 * `getAllOverdueReservations` (the dashboard widget) and the pickup worklist
 * already use. Besluiten.md B-32 + the 2026-09-23 aanvulling.
 *
 * Before this fix, `getOverdueReservationsByVehicle` counted every row not
 * `completed`/`cancelled`/`returned` whose end date was 3+ days in the past —
 * including a `booked` reservation nobody ever picked up. On the prodtest
 * copy that was 147 vehicles, each permanently unbookable until someone
 * manually closed a booking that was never a real rental.
 *
 * Nothing here adds a past-date rule: creating a reservation with a start (or
 * end) date in the past stays allowed without a warning, by design.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { day } from "./helpers/dates";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

let admin: TestAgent;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("Overdue")).id;
});

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

describe("B-32 — the booking gate only sees picked-up rentals past their end date", () => {
  it("a booked, never-collected reservation does not block the vehicle (BUG in getOverdueReservationsByVehicle)", async () => {
    const vehicle = await createFixtureVehicle();

    // Booked, ended 6 days ago, never picked up.
    const stale = await admin.post("/api/reservations").send({
      customerId, vehicleId: vehicle.id, startDate: day(-10), endDate: day(-6), type: "standard",
    });
    expect(stale.status).toBe(201);
    expect(stale.body.status).toBe("booked");

    // The app's own sync (POST /api/reservations calls it after create) must
    // have left the vehicle available: nobody ever picked this rental up, so
    // it never occupied the vehicle in the first place.
    const afterCreate = await admin.get(`/api/vehicles/${vehicle.id}`);
    expect(afterCreate.status).toBe(200);
    expect(afterCreate.body.availabilityStatus).toBe("available");

    // A brand-new future booking on the same vehicle must not be blocked by
    // the stale booked row.
    const future = await admin.post("/api/reservations").send({
      customerId, vehicleId: vehicle.id, startDate: day(30), endDate: day(32), type: "standard",
    });
    expect(future.status).toBe(201);
  });

  it("a picked_up rental that ended yesterday still blocks a new booking (409, isOverdueError)", async () => {
    const vehicle = await createFixtureVehicle();
    const overdue = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, status: "picked_up", startDate: day(-5), endDate: day(-1),
    });

    const future = await admin.post("/api/reservations").send({
      customerId, vehicleId: vehicle.id, startDate: day(30), endDate: day(32), type: "standard",
    });
    expect(future.status).toBe(409);
    expect(future.body.isOverdueError).toBe(true);
    expect((future.body.overdueReservations as Array<{ id: number }>).map((r) => r.id)).toContain(overdue.id);

    const list = await admin.get(`/api/reservations/overdue/${vehicle.id}`);
    expect(list.status).toBe(200);
    expect((list.body as Array<{ id: number }>).map((r) => r.id)).toContain(overdue.id);
  });

  it("a booked row that ended 10 days ago is not in the overdue list (it was never picked up)", async () => {
    const vehicle = await createFixtureVehicle();
    const stale = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, status: "booked", startDate: day(-14), endDate: day(-10),
    });

    const list = await admin.get(`/api/reservations/overdue/${vehicle.id}`);
    expect(list.status).toBe(200);
    expect((list.body as Array<{ id: number }>).map((r) => r.id)).not.toContain(stale.id);
  });

  it("a legacy `active`-spelled row past its end date is not overdue (exact parity with the dashboard widget and the pickup worklist)", async () => {
    const vehicle = await createFixtureVehicle();
    // Written directly through the db, bypassing the routes' status
    // normalisation (BUG-129: `active` was the pre-enum spelling for
    // picked-up). `getAllOverdueReservations` and `buildPickupWorklist`
    // match the literal status `picked_up` only, so this row must not show
    // up or block anywhere either — even though it is well past its end date.
    const legacy = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, status: "active", startDate: day(-10), endDate: day(-6),
    });

    const list = await admin.get(`/api/reservations/overdue/${vehicle.id}`);
    expect(list.status).toBe(200);
    expect((list.body as Array<{ id: number }>).map((r) => r.id)).not.toContain(legacy.id);

    const future = await admin.post("/api/reservations").send({
      customerId, vehicleId: vehicle.id, startDate: day(30), endDate: day(32), type: "standard",
    });
    expect(future.status).toBe(201);
  });

  it("a maintenance block past its end date is not overdue, even with status picked_up", async () => {
    const vehicle = await createFixtureVehicle();
    const block = await createFixtureReservation({
      customerId: null, vehicleId: vehicle.id, type: "maintenance_block", status: "picked_up",
      startDate: day(-10), endDate: day(-6),
    });

    const list = await admin.get(`/api/reservations/overdue/${vehicle.id}`);
    expect(list.status).toBe(200);
    expect((list.body as Array<{ id: number }>).map((r) => r.id)).not.toContain(block.id);

    const future = await admin.post("/api/reservations").send({
      customerId, vehicleId: vehicle.id, startDate: day(30), endDate: day(32), type: "standard",
    });
    expect(future.status).toBe(201);
  });

  it("a running booked reservation still makes the vehicle rented, a finished one does not (B-32 unchanged)", async () => {
    const runningVehicle = await createFixtureVehicle();
    await admin.post("/api/reservations").send({
      customerId, vehicleId: runningVehicle.id, startDate: day(-2), endDate: day(2), type: "standard",
    }).then((res) => expect(res.status).toBe(201));
    const running = await admin.get(`/api/vehicles/${runningVehicle.id}`);
    expect(running.body.availabilityStatus).toBe("rented");

    const finishedVehicle = await createFixtureVehicle();
    await admin.post("/api/reservations").send({
      customerId, vehicleId: finishedVehicle.id, startDate: day(-5), endDate: day(-1), type: "standard",
    }).then((res) => expect(res.status).toBe(201));
    const finished = await admin.get(`/api/vehicles/${finishedVehicle.id}`);
    expect(finished.body.availabilityStatus).not.toBe("rented");
  });
});
