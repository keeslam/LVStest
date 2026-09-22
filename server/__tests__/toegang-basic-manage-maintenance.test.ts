/**
 * Task 4 (docs/superpowers/specs/2026-09-21-toegang-design.md, §5) — the one
 * server-guard widening the spec allows: `PATCH /api/reservations/:id/basic`
 * is called only from `schedule-maintenance-dialog.tsx`'s edit-mode submit,
 * itself only reachable from maintenance-block-editing flows
 * (`pages/maintenance/calendar.tsx`, `components/barcodes/scan-panel.tsx`'s
 * "open maintenance block" action) — grepped, no other client caller exists.
 * Per spec, a maintenance action route reachable only from maintenance
 * screens may additionally accept MANAGE_MAINTENANCE (OR); nothing else about
 * this route changes.
 *
 * Fix round 1, CRITICAL (controller ruling): the widening above had no check
 * on the reservation's own type. `/basic` also writes vehicleId, customerId,
 * dates, driverId, notes and `type` on any reservation, maintenance_block or
 * not, and fires `onRentalVehicleChanged`/`onReservationChangedByStaff` (a
 * customer e-mail) for anything that is not a maintenance_block — so a
 * MANAGE_MAINTENANCE-only account could move ANY customer rental, further
 * than spec §5 allows. A requester who is not admin and does not hold
 * MANAGE_RESERVATIONS may now only use this route on an EXISTING
 * maintenance_block, and may never change `type` through it.
 */
import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, createFixtureCustomer, createFixtureReservation, cleanupFixtures } from "./helpers/fixtures";
import { UserPermission } from "../../shared/schema";

describe("PATCH /api/reservations/:id/basic — MANAGE_MAINTENANCE OR MANAGE_RESERVATIONS", () => {
  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("a user holding only MANAGE_MAINTENANCE can edit a maintenance block", async () => {
    const vehicle = await createFixtureVehicle();
    const block = await createFixtureReservation({ vehicleId: vehicle.id, customerId: null, type: "maintenance_block" });
    const agent: TestAgent = await agentFor([UserPermission.MANAGE_MAINTENANCE, UserPermission.VIEW_VEHICLES]);

    const res = await agent.patch(`/api/reservations/${block.id}/basic`).send({ notes: "onderhoud: bijgewerkt door monteur" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.notes).toBe("onderhoud: bijgewerkt door monteur");
  }, 30_000);

  it("a user holding only MANAGE_RESERVATIONS can still edit it (unchanged behaviour)", async () => {
    const vehicle = await createFixtureVehicle();
    const block = await createFixtureReservation({ vehicleId: vehicle.id, customerId: null, type: "maintenance_block" });
    const agent: TestAgent = await agentFor([UserPermission.MANAGE_RESERVATIONS]);

    const res = await agent.patch(`/api/reservations/${block.id}/basic`).send({ notes: "onderhoud: bijgewerkt" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }, 30_000);

  it("a user holding neither permission is still refused — nothing is narrowed", async () => {
    const vehicle = await createFixtureVehicle();
    const block = await createFixtureReservation({ vehicleId: vehicle.id, customerId: null, type: "maintenance_block" });
    const agent: TestAgent = await agentFor([UserPermission.VIEW_VEHICLES, UserPermission.VIEW_RESERVATIONS]);

    const res = await agent.patch(`/api/reservations/${block.id}/basic`).send({ notes: "should not land" });
    expect(res.status).toBe(403);
  }, 30_000);

  it("CRITICAL — a MANAGE_MAINTENANCE-only agent cannot touch a normal rental, and the row is untouched", async () => {
    const vehicle = await createFixtureVehicle();
    const customer = await createFixtureCustomer("BasicGuard");
    const rental = await createFixtureReservation({ vehicleId: vehicle.id, customerId: customer.id, type: "standard" });
    const agent: TestAgent = await agentFor([UserPermission.MANAGE_MAINTENANCE, UserPermission.VIEW_VEHICLES]);

    const res = await agent.patch(`/api/reservations/${rental.id}/basic`).send({ notes: "should never land", vehicleId: vehicle.id });
    expect(res.status, JSON.stringify(res.body)).toBe(403);

    const [after] = await db.select().from(reservations).where(eq(reservations.id, rental.id));
    expect(after.notes).toBe(rental.notes);
    expect(after.type).toBe("standard");
  }, 30_000);

  it("CRITICAL — a MANAGE_MAINTENANCE-only agent cannot change a maintenance block's own type", async () => {
    const vehicle = await createFixtureVehicle();
    const block = await createFixtureReservation({ vehicleId: vehicle.id, customerId: null, type: "maintenance_block" });
    const agent: TestAgent = await agentFor([UserPermission.MANAGE_MAINTENANCE, UserPermission.VIEW_VEHICLES]);

    const res = await agent.patch(`/api/reservations/${block.id}/basic`).send({ type: "standard", notes: "trying to relabel" });
    expect(res.status, JSON.stringify(res.body)).toBe(403);

    const [after] = await db.select().from(reservations).where(eq(reservations.id, block.id));
    expect(after.type).toBe("maintenance_block");
    expect(after.notes).toBe(block.notes);
  }, 30_000);

  it("a MANAGE_RESERVATIONS agent can still edit a normal rental through this route", async () => {
    const vehicle = await createFixtureVehicle();
    const customer = await createFixtureCustomer("BasicGuardOk");
    const rental = await createFixtureReservation({ vehicleId: vehicle.id, customerId: customer.id, type: "standard" });
    const agent: TestAgent = await agentFor([UserPermission.MANAGE_RESERVATIONS]);

    const res = await agent.patch(`/api/reservations/${rental.id}/basic`).send({ notes: "gewijzigd door de balie" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.notes).toBe("gewijzigd door de balie");
  }, 30_000);
});
