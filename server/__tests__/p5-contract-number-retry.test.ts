/**
 * Audit remediation P5, A-10-7 - "Het contractnummer wordt verbruikt ook als
 * het contract niet gemaakt wordt".
 *
 * The number is not allocated by the contract. It is typed or suggested in the
 * pickup form (`GET /api/settings/next-contract-number` = highest live number
 * + 1) and written to the reservation by the pickup itself; the contract only
 * prints whatever the reservation carries. So a failed contract cannot burn a
 * number, and "Opnieuw proberen" cannot take a second one: this file pins that,
 * which is the "reuse it on retry" half of the audit's proposal. (A gap such as
 * 1012 -> 1013 appears when the picked-up rental that holds 1012 is cancelled
 * afterwards - decision B-33 keeps the number on it, with its pickup.)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { useTempUploadsDir, removeTempUploadsDir } from "./helpers/uploads";

const uploadsDir = useTempUploadsDir("lvs-p5-contract-");

import { db } from "../db";
import { documents, pdfTemplates, reservations, type Vehicle } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";

const FIELD = { name: "Naam huurder", source: "customer.name", x: 60, y: 120, fontSize: 11 };
const CONTRACT_NUMBER = `FIXT-P5-${Date.now().toString(36)}`;

let admin: TestAgent;
let vehicle: Vehicle;
let customerId: number;

/** Replaces the whole `pdf_templates` table for the length of `fn` (same approach as b-34). */
async function withOnlyTemplates<T>(
  rows: Array<Partial<typeof pdfTemplates.$inferInsert>>,
  fn: () => Promise<T>,
): Promise<T> {
  const original = await db.select().from(pdfTemplates);
  await db.delete(pdfTemplates);
  try {
    if (rows.length > 0) await db.insert(pdfTemplates).values(rows as any);
    return await fn();
  } finally {
    await db.delete(pdfTemplates);
    if (original.length > 0) await db.insert(pdfTemplates).values(original as any);
  }
}

beforeAll(async () => {
  admin = await agentFor("admin");
  vehicle = await createFixtureVehicle();
  customerId = (await createFixtureCustomer("P5")).id;
});

afterAll(async () => {
  await db.delete(documents).where(eq(documents.vehicleId, vehicle.id));
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(uploadsDir);
});

describe("A-10-7 - the contract number belongs to the pickup, not to the contract", () => {
  it("a pickup whose contract fails keeps the number on the rental, and the retry prints that same number", async () => {
    const rental = await createFixtureReservation({
      customerId, vehicleId: vehicle.id, startDate: "2026-01-01", endDate: "2026-12-31", status: "booked",
    });

    // 1. No usable template: the pickup stands, the contract does not exist.
    const pickup = await withOnlyTemplates([], async () =>
      admin.post(`/api/reservations/${rental.id}/pickup`).send({
        contractNumber: CONTRACT_NUMBER, pickupMileage: 1000, fuelLevelPickup: "full", pickupDate: "2026-01-02",
      }),
    );
    expect(pickup.status).toBe(200);
    expect(pickup.body.contractDocument).toBeNull();
    expect(pickup.body.contractNumber).toBe(CONTRACT_NUMBER);

    const [afterFailure] = await db.select().from(reservations).where(eq(reservations.id, rental.id));
    expect(afterFailure.contractNumber).toBe(CONTRACT_NUMBER);

    // 2. The template is fixed; "Opnieuw proberen" makes the document.
    const retry = await withOnlyTemplates([{ name: "FIXT-P5-template", isDefault: true, fields: [FIELD] as any }], async () =>
      admin.post(`/api/reservations/${rental.id}/contract`).send({}),
    );
    expect(retry.status).toBe(200);
    expect(retry.body.contractDocument).toBeTruthy();

    // 3. The retry took no second number and changed none.
    const [afterRetry] = await db.select().from(reservations).where(eq(reservations.id, rental.id));
    expect(afterRetry.contractNumber).toBe(CONTRACT_NUMBER);
    const carrying = await db.select({ id: reservations.id }).from(reservations)
      .where(eq(reservations.contractNumber, CONTRACT_NUMBER));
    expect(carrying.map((r) => r.id)).toEqual([rental.id]);
  }, 40_000);
});
