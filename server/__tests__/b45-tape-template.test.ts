/**
 * B-45 — a barcode label template can be marked as a label maker's tape (tape_print).
 *
 * The desk's DYMO prints its tape portrait, so a template marked this way is turned a quarter at
 * print time (client). The server only has to store the mark: default false, settable on create
 * and on update, same permission as the other template fields.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import { barcodeLabelTemplates } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";

describe("B-45 — tape_print on barcode label templates", () => {
  let admin: TestAgent;

  beforeAll(async () => {
    admin = await agentFor("admin");
  }, 90_000);

  afterAll(async () => {
    await db.delete(barcodeLabelTemplates).where(like(barcodeLabelTemplates.name, "FIXT-b45-%"));
    await cleanupFixtureUsers();
  });

  it("defaults to false and is stored on create and update", async () => {
    const created = await admin.post("/api/barcode-label-templates").send({
      name: "FIXT-b45-sheet", labelWidthMm: 62, labelHeightMm: 29, fields: [],
    });
    expect(created.status).toBe(201);
    expect(created.body.tapePrint).toBe(false);

    const tape = await admin.post("/api/barcode-label-templates").send({
      name: "FIXT-b45-tape", labelWidthMm: 48, labelHeightMm: 12, tapePrint: true,
      fields: [{ id: "k", name: "Sleutel", x: 3, y: 8, fontSize: 7, isBold: false, source: "keyKind", textAlign: "right" }],
    });
    expect(tape.status).toBe(201);
    expect(tape.body.tapePrint).toBe(true);
    const [row] = await db.select().from(barcodeLabelTemplates).where(eq(barcodeLabelTemplates.id, tape.body.id));
    expect(row.tapePrint).toBe(true);
    expect(row.labelWidthMm).toBe(48);
    expect(row.labelHeightMm).toBe(12);

    const off = await admin.patch(`/api/barcode-label-templates/${tape.body.id}`).send({ tapePrint: false });
    expect(off.status).toBe(200);
    expect(off.body.tapePrint).toBe(false);

    const bad = await admin.patch(`/api/barcode-label-templates/${tape.body.id}`).send({ tapePrint: "yes" });
    expect(bad.status).toBe(400);
  });
});
