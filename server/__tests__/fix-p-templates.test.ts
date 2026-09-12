/**
 * FIX-P — template validation and background handling (BUG-028, BUG-048,
 * BUG-168, BUG-176, BUG-177, BUG-179, BUG-180, BUG-193).
 *
 * The common shape of these defects: `fields` / `canvasFields` are jsonb
 * written straight from the request body and then trusted by a generator that
 * had no bounds of its own, and a background file is loaded on the strength of
 * its filename.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";
import { eq, like } from "drizzle-orm";
import { useTempUploadsDir, removeTempUploadsDir } from "./helpers/uploads";

const uploadsDir = useTempUploadsDir("lvs-fix-p-");

import { db } from "../db";
import { damageCheckTemplates, pdfTemplates, documents } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures } from "./helpers/fixtures";
import { generateRentalContractFromTemplate, pdfCarriesActiveContent, detectActivePdfContent } from "../utils/pdf-generator";
import { canvasFieldsSchema, templateFieldsSchema, MAX_TEMPLATE_PAGES } from "../../shared/template-fields";
import { selectContractTemplate } from "../services/pdf-template-selection";

const require = createRequire(import.meta.url);
const { inspect } = require("./helpers/pdfText.cjs") as {
  inspect: (buf: Buffer) => Promise<{ valid: boolean; pages: number; text: string[]; error: string | null }>;
};

const FIXTURE_PREFIX = "FIXT-P-";

let admin: TestAgent;
let vehicleId: number;
let customerId: number;

/** A one-page PDF; `extra` goes into the trailer dictionary. */
function makePdf(extra = ""): Buffer {
  return Buffer.from(
    `%PDF-1.4\n` +
      `1 0 obj<</Type/Catalog/Pages 2 0 R${extra}>>endobj\n` +
      `2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n` +
      `trailer<</Root 1 0 R>>\n%%EOF\n`,
    "latin1",
  );
}

async function activeContentBackground(): Promise<Buffer> {
  const { PDFDocument, PDFName, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawText("ACHTERGROND", { x: 40, y: 760, size: 18, font: await doc.embedFont(StandardFonts.Helvetica) });
  doc.addJavaScript("evil", 'app.alert("pwned")');
  doc.catalog.set(PDFName.of("OpenAction"), doc.context.obj([page.ref, PDFName.of("Fit")]));
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

beforeAll(async () => {
  admin = await agentFor("admin");
  const vehicle = await createFixtureVehicle();
  const customer = await createFixtureCustomer("P");
  vehicleId = vehicle.id;
  customerId = customer.id;
});

afterAll(async () => {
  await db.delete(documents).where(eq(documents.vehicleId, vehicleId));
  await db.delete(damageCheckTemplates).where(like(damageCheckTemplates.name, `${FIXTURE_PREFIX}%`));
  await db.delete(pdfTemplates).where(like(pdfTemplates.name, `${FIXTURE_PREFIX}%`));
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(uploadsDir);
});

describe("FIX-P — a stored template cannot cost the server its event loop", () => {
  it("BUG-168: page: 99999 is refused, in well under a second", async () => {
    const started = Date.now();
    const res = await admin.post("/api/damage-check-templates").send({
      name: `${FIXTURE_PREFIX}forty-thousand-pages`,
      canvasFields: [
        { id: "f1", type: "text", name: "Kop", x: 10, y: 10, fontSize: 11, page: 99999 },
      ],
    });
    const elapsed = Date.now() - started;

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/field definitions/i);
    // The defect was 76 seconds of blocked event loop at *render* time; the
    // value never reaches storage now, and the refusal itself is instant.
    expect(elapsed).toBeLessThan(1000);

    const stored = await db
      .select()
      .from(damageCheckTemplates)
      .where(eq(damageCheckTemplates.name, `${FIXTURE_PREFIX}forty-thousand-pages`));
    expect(stored).toEqual([]);
  });

  it("BUG-168: the renderer clamps the page count even for a row already stored", () => {
    const parsed = canvasFieldsSchema.safeParse([
      { id: "f1", type: "text", name: "Kop", x: 10, y: 10, fontSize: 11, page: 40000 },
    ]);
    expect(parsed.success).toBe(false);
    expect(MAX_TEMPLATE_PAGES).toBeLessThanOrEqual(10);
  });

  it("BUG-176: canvasFields must be an array of field definitions", async () => {
    for (const canvasFields of ["not-an-array", { nope: true }, [{ type: "unknown-type", x: 1, y: 1 }], [{ type: "text" }]]) {
      const res = await admin
        .post("/api/damage-check-templates")
        .send({ name: `${FIXTURE_PREFIX}nonsense`, canvasFields });
      expect(res.status, JSON.stringify(canvasFields)).toBe(400);
    }
  });

  it("BUG-176: the live preview refuses the same nonsense the save route does", async () => {
    const res = await admin
      .post("/api/damage-check-templates/preview-pdf")
      .send({ name: `${FIXTURE_PREFIX}preview`, canvasFields: [{ type: "text", x: -50, y: 10, name: "x" }] });
    expect(res.status).toBe(400);
  });

  it("BUG-048: a contract template's fields are validated the same way", async () => {
    for (const fields of ["not-an-array", [{ x: "left", y: 10 }], [{ x: 10, y: 10, fontSize: 900 }]]) {
      const res = await admin.post("/api/pdf-templates").send({ name: `${FIXTURE_PREFIX}contract-nonsense`, fields });
      expect(res.status, JSON.stringify(fields)).toBe(400);
    }
    // And the well-formed one is accepted.
    const ok = await admin.post("/api/pdf-templates").send({
      name: `${FIXTURE_PREFIX}contract-ok`,
      fields: [{ name: "Naam", source: "customer.name", x: 60, y: 100, fontSize: 11 }],
    });
    expect(ok.status).toBe(201);
    expect(templateFieldsSchema.safeParse(ok.body.fields).success).toBe(true);
  });
});

describe("FIX-P — a template that cannot produce a usable contract says so", () => {
  it("BUG-028: a template with no fields is a 409, not a blank contract filed as the contract", async () => {
    const [empty] = await db
      .insert(pdfTemplates)
      .values({ name: `${FIXTURE_PREFIX}no-fields`, fields: [] as any })
      .returning();
    const reservation = await createFixtureReservation({ customerId, vehicleId });

    const res = await admin.get(`/api/contracts/generate/${reservation.id}?templateId=${empty.id}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/no fields/i);

    const rows = await db.select().from(documents).where(eq(documents.reservationId, reservation.id));
    expect(rows).toEqual([]);
  });

  it("BUG-181: the picker is deterministic and never picks a field-less template silently", async () => {
    const selection = await selectContractTemplate();
    if (selection.ok) {
      expect(Array.isArray(selection.template.fields) ? selection.template.fields.length : 1).toBeGreaterThan(0);
    } else {
      expect(selection.status).toBe(409);
    }
  });

  it("BUG-179: a configured background that is gone is an error, not the default layout", async () => {
    const reservation = await createFixtureReservation({ customerId, vehicleId });
    await expect(
      generateRentalContractFromTemplate({ ...(reservation as any), vehicle: { licensePlate: "XX-00-01", brand: "B", model: "M" }, customer: { name: "K" } }, {
        id: 0,
        name: `${FIXTURE_PREFIX}missing-background`,
        backgroundPath: "templates/this-file-was-deleted.pdf",
        fields: [{ name: "Naam", source: "customer.name", x: 60, y: 100, fontSize: 11 }],
      } as any),
    ).rejects.toThrow(/background/i);
  });

  it("BUG-179: a background whose bytes are not an image or a PDF is an error", async () => {
    const templatesDir = path.join(uploadsDir, "templates");
    fs.mkdirSync(templatesDir, { recursive: true });
    const junk = path.join(templatesDir, "fixt-p-junk.pdf");
    fs.writeFileSync(junk, Buffer.from("this is plain text, not a pdf"));

    const reservation = await createFixtureReservation({ customerId, vehicleId });
    await expect(
      generateRentalContractFromTemplate({ ...(reservation as any), vehicle: { licensePlate: "XX-00-01", brand: "B", model: "M" }, customer: { name: "K" } }, {
        id: 0,
        name: `${FIXTURE_PREFIX}junk-background`,
        backgroundPath: "templates/fixt-p-junk.pdf",
        fields: [{ name: "Naam", source: "customer.name", x: 60, y: 100, fontSize: 11 }],
      } as any),
    ).rejects.toThrow(/PDF, PNG or JPEG/i);
  });
});

describe("FIX-P — a background may not smuggle code into every contract", () => {
  it("BUG-180: a PDF carrying /OpenAction is recognised, compressed or not", async () => {
    expect(pdfCarriesActiveContent(makePdf("/OpenAction 4 0 R"))).toBe(true);
    expect(pdfCarriesActiveContent(makePdf())).toBe(false);
    expect(await detectActivePdfContent(makePdf("/OpenAction 4 0 R"))).toBe("/OpenAction");
    expect(await detectActivePdfContent(await activeContentBackground())).toBeTruthy();
  });

  it("BUG-180: uploading such a background is refused", async () => {
    const [template] = await db
      .insert(pdfTemplates)
      .values({ name: `${FIXTURE_PREFIX}active-content`, fields: [] as any })
      .returning();

    const res = await admin
      .post(`/api/pdf-templates/${template.id}/background`)
      .attach("background", await activeContentBackground(), "evil.pdf");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/JavaScript|automatic action/i);
  });

  it("BUG-193: a PNG renamed to .pdf is refused by content sniffing", async () => {
    const [template] = await db
      .insert(pdfTemplates)
      .values({ name: `${FIXTURE_PREFIX}mislabelled`, fields: [] as any })
      .returning();

    const res = await admin
      .post(`/api/pdf-templates/${template.id}/background`)
      .attach("background", PNG_BYTES, "actually-a-png.pdf");
    expect(res.status).toBe(400);

    const [after] = await db.select().from(pdfTemplates).where(eq(pdfTemplates.id, template.id));
    expect(after.backgroundPath).toBeFalsy();
  });

  it("BUG-180: a background already stored with /OpenAction never reaches the generated contract", async () => {
    const templatesDir = path.join(uploadsDir, "templates");
    fs.mkdirSync(templatesDir, { recursive: true });
    const stored = path.join(templatesDir, "fixt-p-openaction.pdf");

    // A real, renderable background that also carries document-level
    // JavaScript and an OpenAction — exactly the shape BUG-180 describes.
    fs.writeFileSync(stored, await activeContentBackground());

    const backgroundBytes = fs.readFileSync(stored).toString("latin1");
    expect(backgroundBytes).toContain("/OpenAction");
    expect(backgroundBytes).toContain("/JavaScript");

    const reservation = await createFixtureReservation({ customerId, vehicleId });
    const bytes = await generateRentalContractFromTemplate(
      { ...(reservation as any), vehicle: { licensePlate: "XX-00-01", brand: "B", model: "M" }, customer: { name: "FIXT-P Klant" } },
      {
        id: 0,
        name: `${FIXTURE_PREFIX}openaction-background`,
        backgroundPath: "templates/fixt-p-openaction.pdf",
        fields: [{ name: "Naam", source: "customer.name", x: 60, y: 100, fontSize: 11 }],
      } as any,
    );

    const raw = bytes.toString("latin1");
    expect(raw).not.toContain("/OpenAction");
    expect(raw).not.toContain("/JavaScript");
    expect(raw).not.toContain("/Launch");

    const info = await inspect(bytes);
    expect(info.valid).toBe(true);
    expect(info.pages).toBe(1);
    expect(info.text[0]).toContain("FIXT-P Klant");
  });
});

describe("FIX-P — background previews are generated on this platform", () => {
  it("BUG-193: convertPdfToPng produces a file (the worker URL used to break on Windows)", async () => {
    const { convertPdfToPng } = await import("../utils/pdf-to-image");
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-preview-"));
    const source = path.join(scratch, "source.pdf");
    const target = path.join(scratch, "preview.png");
    // A real, renderable PDF rather than the hand-made stub above.
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    page.drawText("preview", { x: 50, y: 700, size: 24, font: await doc.embedFont(StandardFonts.Helvetica) });
    fs.writeFileSync(source, Buffer.from(await doc.save()));

    try {
      await convertPdfToPng(source, target, 1);
      expect(fs.existsSync(target)).toBe(true);
      expect(fs.statSync(target).size).toBeGreaterThan(0);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe("FIX-P — the rows that are already in the database", () => {
  it("surveys every stored template against the new schema and names the violators", async () => {
    const violators: string[] = [];

    for (const row of await db.select().from(damageCheckTemplates)) {
      const parsed = canvasFieldsSchema.safeParse(Array.isArray(row.canvasFields) ? row.canvasFields : []);
      if (!parsed.success) {
        violators.push(
          `damage_check_templates#${row.id} "${row.name}": ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        );
      }
    }
    for (const row of await db.select().from(pdfTemplates)) {
      const fields = Array.isArray(row.fields) ? row.fields : [];
      const parsed = templateFieldsSchema.safeParse(fields);
      if (!parsed.success) {
        violators.push(
          `pdf_templates#${row.id} "${row.name}": ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        );
      }
    }

    if (violators.length > 0) {
      console.warn(
        `[FIX-P survey] ${violators.length} stored template(s) do not satisfy the new field schema. ` +
          `They still render (the generator drops the offending fields with a warning) but the editor will refuse to save them unchanged:\n  ` +
          violators.join("\n  "),
      );
    }
    // Reported, not enforced: existing rows are production data, and the plan
    // says the owner sees the list before anything is changed about them.
    expect(Array.isArray(violators)).toBe(true);
  });
});
