/**
 * Audit remediation P11 ("Opnieuw genereren" showed the server's English sentence raw): every
 * refusal of POST /api/documents/:id/regenerate carries a stable `code` now, so the client
 * can show the sentence in the user's language. The English message itself is unchanged.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, like } from "drizzle-orm";
import { useTempUploadsDir, removeTempUploadsDir } from "./helpers/uploads";

const uploadsDir = useTempUploadsDir("lvs-p11-regen-");

import { db } from "../db";
import { documents, reservations } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, createFixtureCustomer, createFixtureReservation, cleanupFixtures } from "./helpers/fixtures";

const PREFIX = "FIXT-P11-regen-";
let admin: TestAgent;
let vehicleId: number;
let customerId: number;

async function documentRow(values: { documentType: string; reservationId: number | null }) {
  const [row] = await db
    .insert(documents)
    .values({ vehicleId, reservationId: values.reservationId, documentType: values.documentType, fileName: `${PREFIX}${Date.now()}.pdf`, filePath: "x/none.pdf", fileSize: 1, contentType: "application/pdf" })
    .returning();
  return row;
}

beforeAll(async () => {
  admin = await agentFor("admin");
  vehicleId = (await createFixtureVehicle()).id;
  customerId = (await createFixtureCustomer("P11")).id;
});

afterAll(async () => {
  await db.delete(documents).where(like(documents.fileName, `${PREFIX}%`));
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(uploadsDir);
});

describe("POST /api/documents/:id/regenerate - codes on every refusal", () => {
  it("an unknown document: 404 DOCUMENT_NOT_FOUND", async () => {
    const res = await admin.post("/api/documents/2147483000/regenerate").send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("DOCUMENT_NOT_FOUND");
    expect(res.body.message).toBe("Document not found");
  });

  it("an uploaded document (no generator): 400 NOT_REGENERATABLE", async () => {
    const row = await documentRow({ documentType: "Insurance", reservationId: null });
    const res = await admin.post(`/api/documents/${row.id}/regenerate`).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NOT_REGENERATABLE");
    expect(res.body.message).toMatch(/Only generated documents can be regenerated/);
  });

  it("a generated type that is not linked to a reservation: 400 NO_RESERVATION_LINK", async () => {
    const row = await documentRow({ documentType: "Contract (Unsigned)", reservationId: null });
    const res = await admin.post(`/api/documents/${row.id}/regenerate`).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NO_RESERVATION_LINK");
  });

  it("a damage check of a reservation without vehicle: 400 NO_VEHICLE", async () => {
    const reservation = await createFixtureReservation({ customerId, vehicleId });
    const row = await documentRow({ documentType: "Damage Check (Unsigned)", reservationId: reservation.id });
    // A reservation whose vehicle is gone (a placeholder, or a vehicle removed later).
    await db.update(reservations).set({ vehicleId: null }).where(eq(reservations.id, reservation.id));
    const res = await admin.post(`/api/documents/${row.id}/regenerate`).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NO_VEHICLE");
    await db.delete(documents).where(eq(documents.id, row.id));
  });
});
