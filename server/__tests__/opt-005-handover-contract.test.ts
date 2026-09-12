/**
 * OPT-005 — "Contract bevestigen en direct afdrukken/mailen in de
 * ophaaldialoog".
 *
 * The pickup route generated the contract inside a `catch` that only logged and
 * answered 200 either way, so a failed contract was indistinguishable from a
 * successful one and the dialog said "Contract is gegenereerd" regardless.
 *
 * The response now carries the outcome, and there is a route that produces the
 * contract again without redoing the handover ("Opnieuw proberen").
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { useTempUploadsDir, removeTempUploadsDir } from "./helpers/uploads";

const uploadsDir = useTempUploadsDir("lvs-opt-005-");

import { db } from "../db";
import { documents, pdfTemplates, type Vehicle } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

const TEMPLATE_NAME = "FIXT-OPT005-contract-template";

let admin: TestAgent;
let vehicle: Vehicle;
let customerId: number;
let templateId: number;
let previousDefaultIds: number[] = [];
let contractCounter = 0;

/** Contract numbers must be unique; keep them out of the other suites' range. */
function nextContract(): string {
  contractCounter += 1;
  return String(880000 + contractCounter);
}

beforeAll(async () => {
  admin = await agentFor("admin");
  vehicle = await createFixtureVehicle();
  customerId = (await createFixtureCustomer("Opt005")).id;

  const existingDefaults = await db.select({ id: pdfTemplates.id }).from(pdfTemplates).where(eq(pdfTemplates.isDefault, true));
  previousDefaultIds = existingDefaults.map((row) => row.id);
  if (previousDefaultIds.length > 0) {
    await db.update(pdfTemplates).set({ isDefault: false }).where(inArray(pdfTemplates.id, previousDefaultIds));
  }
  const [template] = await db.insert(pdfTemplates).values({
    name: TEMPLATE_NAME,
    isDefault: true,
    fields: [{ name: "Naam huurder", source: "customer.name", x: 60, y: 120, fontSize: 11 }] as any,
  }).returning();
  templateId = template.id;
});

afterAll(async () => {
  await db.delete(documents).where(eq(documents.vehicleId, vehicle.id));
  await db.delete(pdfTemplates).where(eq(pdfTemplates.name, TEMPLATE_NAME));
  if (previousDefaultIds.length > 0) {
    await db.update(pdfTemplates).set({ isDefault: true }).where(inArray(pdfTemplates.id, previousDefaultIds));
  }
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(uploadsDir);
});

async function bookedRental() {
  return createFixtureReservation({
    customerId,
    vehicleId: vehicle.id,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    status: "booked",
  });
}

describe("OPT-005 — the pickup response says what happened to the contract", () => {
  it("carries the created document, with an id the dialog can print and mail", async () => {
    const rental = await bookedRental();
    const res = await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(),
      pickupMileage: 1000,
      fuelLevelPickup: "full",
      pickupDate: "2026-01-02",
      templateId,
    });

    expect(res.status).toBe(200);
    expect(res.body.contractDocument).toBeTruthy();
    expect(typeof res.body.contractDocument.id).toBe("number");
    expect(res.body.contractDocument.reservationId).toBe(rental.id);
    expect(res.body.contractError).toBeNull();

    // The id really addresses a document, so "Afdrukken" is not a dead link.
    const stored = await db.select().from(documents).where(eq(documents.id, res.body.contractDocument.id));
    expect(stored).toHaveLength(1);
  });

  it("reports a missing template instead of claiming the contract exists", async () => {
    // No usable template at all: this is the case that used to answer 200 with
    // "Contract is gegenereerd" and nothing on disk.
    await db.update(pdfTemplates).set({ isDefault: false }).where(eq(pdfTemplates.name, TEMPLATE_NAME));
    try {
      const rental = await bookedRental();
      const res = await admin.post(`/api/reservations/${rental.id}/pickup`).send({
        contractNumber: nextContract(),
        pickupMileage: 1200,
        fuelLevelPickup: "full",
        pickupDate: "2026-01-02",
      });

      // The pickup itself still succeeded - the car has left the yard.
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("picked_up");
      // ...and the dialog is told the truth about the contract.
      expect(res.body.contractDocument).toBeNull();
      expect(typeof res.body.contractError).toBe("string");
      expect(res.body.contractError.length).toBeGreaterThan(0);
    } finally {
      await db.update(pdfTemplates).set({ isDefault: true }).where(eq(pdfTemplates.name, TEMPLATE_NAME));
    }
  });

  it('"Opnieuw proberen" produces the contract without redoing the handover', async () => {
    const rental = await bookedRental();
    await admin.post(`/api/reservations/${rental.id}/pickup`).send({
      contractNumber: nextContract(),
      pickupMileage: 1300,
      fuelLevelPickup: "full",
      pickupDate: "2026-01-02",
      templateId,
    });

    const retry = await admin.post(`/api/reservations/${rental.id}/contract`).send({ templateId });
    expect(retry.status).toBe(200);
    expect(retry.body.contractDocument).toBeTruthy();
    expect(retry.body.contractDocument.reservationId).toBe(rental.id);
    // A new version, not an overwrite - decision B-05's rule for documents.
    expect(retry.body.contractDocument.version).toBeGreaterThanOrEqual(2);
  });

  it("the retry route refuses an unknown reservation and an invalid id", async () => {
    expect((await admin.post("/api/reservations/99999999/contract").send({})).status).toBe(404);
    expect((await admin.post("/api/reservations/abc/contract").send({})).status).toBe(400);
  });

  it("the retry route needs the reservation permission", async () => {
    const rental = await bookedRental();
    const viewer = await agentFor(["view_reservations"]);
    const res = await viewer.post(`/api/reservations/${rental.id}/contract`).send({});
    expect(res.status).toBe(403);
  });
});
