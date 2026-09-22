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
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, createFixtureReservation, cleanupFixtures } from "./helpers/fixtures";
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
});
