/**
 * B-34 — a stable reason code for every way contract generation can fail, and
 * an archive that refuses non-PDF bytes.
 *
 * Every contract-generating route already had its own English `message` (kept
 * unchanged everywhere below); what it lacked was anything the client could
 * translate reliably without matching that English text. From here on every
 * failure also carries a `code` from `shared/contract-error-codes.ts` — the
 * client (task 6) maps that to nl/en copy.
 *
 * This file also proves the picker rule decided alongside this (BUG-181a):
 * exactly one template is used whether or not it is marked default; two or
 * more with none marked default is refused instead of guessed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { useTempUploadsDir, removeTempUploadsDir } from "./helpers/uploads";

const uploadsDir = useTempUploadsDir("lvs-b34-");

import { db } from "../db";
import { documents, pdfTemplates, reservations, type Vehicle } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";
import { registerGeneratedDocument, generatedDocumentDir, DOCUMENT_TYPE_CONTRACT_UNSIGNED } from "../services/document-registry";

const FIELD = { name: "Naam huurder", source: "customer.name", x: 60, y: 120, fontSize: 11 };

let admin: TestAgent;
let vehicle: Vehicle;
let customerId: number;
let placeholderReservationId: number | null = null;

let contractCounter = 0;
const nextContract = () => `FIXT-B34-${Date.now().toString(36)}-${++contractCounter}`;

async function bookedRental(overrides: Partial<Parameters<typeof createFixtureReservation>[0]> = {}) {
  return createFixtureReservation({
    customerId,
    vehicleId: vehicle.id,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    status: "booked",
    ...overrides,
  });
}

async function pickup(reservationId: number, templateId?: number) {
  return admin.post(`/api/reservations/${reservationId}/pickup`).send({
    contractNumber: nextContract(),
    pickupMileage: 1000,
    fuelLevelPickup: "full",
    pickupDate: "2026-01-02",
    ...(templateId ? { templateId } : {}),
  });
}

/**
 * Runs `fn` with the *entire* `pdf_templates` table replaced by `rows`, then
 * restores exactly what was there before — every scenario below cares about
 * the total count and which row (if any) is marked default, and the test
 * database always carries one baseline template ("gffg") that would otherwise
 * make "zero templates" or "exactly one template" impossible to set up.
 * Wiping the *whole* table (not just rows this file inserts) is only safe
 * because `vitest.config.ts` sets `fileParallelism: false`, so no other test
 * file's `pdf_templates` rows can be touched concurrently.
 */
async function withOnlyTemplates<T>(
  rows: Array<Partial<typeof pdfTemplates.$inferInsert>>,
  fn: (ids: number[]) => Promise<T>,
): Promise<T> {
  const original = await db.select().from(pdfTemplates);
  await db.delete(pdfTemplates);
  try {
    let ids: number[] = [];
    if (rows.length > 0) {
      const inserted = await db.insert(pdfTemplates).values(rows as any).returning({ id: pdfTemplates.id });
      ids = inserted.map((r) => r.id);
    }
    return await fn(ids);
  } finally {
    await db.delete(pdfTemplates);
    if (original.length > 0) {
      await db.insert(pdfTemplates).values(original as any);
    }
  }
}

beforeAll(async () => {
  admin = await agentFor("admin");
  vehicle = await createFixtureVehicle();
  customerId = (await createFixtureCustomer("B34")).id;
});

afterAll(async () => {
  if (placeholderReservationId !== null) {
    await db.delete(documents).where(eq(documents.reservationId, placeholderReservationId));
    await db.delete(reservations).where(eq(reservations.id, placeholderReservationId));
  }
  await db.delete(documents).where(eq(documents.vehicleId, vehicle.id));
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(uploadsDir);
});

describe("B-34 — registerGeneratedDocument refuses non-PDF bytes", () => {
  it("throws, writes no file and inserts no row", async () => {
    const junkVehicle = await createFixtureVehicle();
    const dir = generatedDocumentDir(junkVehicle.id, DOCUMENT_TYPE_CONTRACT_UNSIGNED);

    await expect(
      registerGeneratedDocument({
        documentType: DOCUMENT_TYPE_CONTRACT_UNSIGNED,
        bytes: Buffer.from("this is not a pdf at all"),
        vehicleId: junkVehicle.id,
      }),
    ).rejects.toThrow(/PDF/i);

    expect(fs.existsSync(dir)).toBe(false);
    const rows = await db.select().from(documents).where(eq(documents.vehicleId, junkVehicle.id));
    expect(rows).toEqual([]);
  });
});

describe("B-34 — the picker rule (BUG-181a)", () => {
  it("zero templates: pickup gives 200, contractDocument null, contractErrorCode NO_TEMPLATE", async () => {
    await withOnlyTemplates([], async () => {
      const rental = await bookedRental();
      const res = await pickup(rental.id);
      expect(res.status).toBe(200);
      expect(res.body.contractDocument).toBeNull();
      expect(res.body.contractErrorCode).toBe("NO_TEMPLATE");
      expect(typeof res.body.contractError).toBe("string");
      expect(res.body.contractError.length).toBeGreaterThan(0);
    });
  });

  it("exactly one template, not marked default: it is used (200, document created)", async () => {
    await withOnlyTemplates(
      [{ name: "FIXT-B34-solo", isDefault: false, fields: [FIELD] as any }],
      async () => {
        const rental = await bookedRental();
        const res = await pickup(rental.id);
        expect(res.status).toBe(200);
        expect(res.body.contractError).toBeNull();
        expect(res.body.contractDocument).toBeTruthy();
        expect(res.body.contractDocument.reservationId).toBe(rental.id);
      },
    );
  });

  it("two templates, neither default: NO_DEFAULT_TEMPLATE, 409 on the direct route", async () => {
    await withOnlyTemplates(
      [
        { name: "FIXT-B34-a", isDefault: false, fields: [FIELD] as any },
        { name: "FIXT-B34-b", isDefault: false, fields: [FIELD] as any },
      ],
      async () => {
        const rental = await bookedRental();
        const res = await admin.get(`/api/contracts/generate/${rental.id}`);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe("NO_DEFAULT_TEMPLATE");

        // Same code, same 200-embedded shape, on the pickup route.
        const rental2 = await bookedRental();
        const pickupRes = await pickup(rental2.id);
        expect(pickupRes.status).toBe(200);
        expect(pickupRes.body.contractErrorCode).toBe("NO_DEFAULT_TEMPLATE");

        // ...and on the retry route, with its own existing 500.
        const rental3 = await bookedRental();
        await pickup(rental3.id);
        const retryRes = await admin.post(`/api/reservations/${rental3.id}/contract`).send({});
        expect(retryRes.body.code).toBe("NO_DEFAULT_TEMPLATE");
      },
    );
  });

  it("a template with no fields: TEMPLATE_WITHOUT_FIELDS, 409", async () => {
    await withOnlyTemplates(
      [{ name: "FIXT-B34-empty", isDefault: true, fields: [] as any }],
      async (ids) => {
        const rental = await bookedRental();
        const res = await admin.get(`/api/contracts/generate/${rental.id}`);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe("TEMPLATE_WITHOUT_FIELDS");

        // Explicit templateId hits the same code through the same function.
        const rental2 = await bookedRental();
        const explicit = await admin.get(`/api/contracts/generate/${rental2.id}?templateId=${ids[0]}`);
        expect(explicit.status).toBe(409);
        expect(explicit.body.code).toBe("TEMPLATE_WITHOUT_FIELDS");
      },
    );
  });

  it("an unknown templateId: 404 TEMPLATE_NOT_FOUND", async () => {
    const rental = await bookedRental();
    const res = await admin.get(`/api/contracts/generate/${rental.id}?templateId=987654321`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TEMPLATE_NOT_FOUND");
  });
});

describe("B-34 — a template whose configured background cannot be read", () => {
  it("TEMPLATE_BACKGROUND_MISSING, reported on the pickup route (200) and the direct route (500)", async () => {
    await withOnlyTemplates(
      [{
        name: "FIXT-B34-missing-bg",
        isDefault: true,
        fields: [FIELD] as any,
        backgroundPath: "templates/b34-this-file-was-deleted.pdf",
      }],
      async () => {
        const rental = await bookedRental();
        const res = await pickup(rental.id);
        expect(res.status).toBe(200);
        expect(res.body.contractDocument).toBeNull();
        expect(res.body.contractErrorCode).toBe("TEMPLATE_BACKGROUND_MISSING");
        expect(res.body.contractError).toMatch(/background/i);

        const rental2 = await bookedRental();
        const direct = await admin.get(`/api/contracts/generate/${rental2.id}`);
        expect(direct.status).toBe(500);
        expect(direct.body.code).toBe("TEMPLATE_BACKGROUND_MISSING");
        // The existing generic message is unchanged — only `code` was added.
        expect(direct.body.message).toBe("Failed to generate contract");
      },
    );
  });
});

describe("B-34 — a renderer throw that is not a known refusal", () => {
  it("RENDER_FAILED, 500 on the direct route", async () => {
    const templatesDir = path.join(uploadsDir, "templates");
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(path.join(templatesDir, "b34-junk.pdf"), Buffer.from("plain text, not a pdf"));

    await withOnlyTemplates(
      [{
        name: "FIXT-B34-junk-bg",
        isDefault: true,
        fields: [FIELD] as any,
        backgroundPath: "templates/b34-junk.pdf",
      }],
      async () => {
        const rental = await bookedRental();
        const res = await admin.get(`/api/contracts/generate/${rental.id}`);
        expect(res.status).toBe(500);
        expect(res.body.code).toBe("RENDER_FAILED");
        expect(res.body.message).toBe("Failed to generate contract");

        // Same code, embedded in the pickup route's 200.
        const rental2 = await bookedRental();
        const pickupRes = await pickup(rental2.id);
        expect(pickupRes.status).toBe(200);
        expect(pickupRes.body.contractErrorCode).toBe("RENDER_FAILED");
      },
    );
  });
});

describe("B-34 — reservations that are not a printable rental", () => {
  it("no customer: NO_CUSTOMER, 400", async () => {
    await withOnlyTemplates(
      [{ name: "FIXT-B34-nc", isDefault: true, fields: [FIELD] as any }],
      async () => {
        const rental = await bookedRental({ customerId: null });
        const res = await admin.get(`/api/contracts/generate/${rental.id}`);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("NO_CUSTOMER");
      },
    );
  });

  it("a maintenance block: MAINTENANCE_BLOCK, 400", async () => {
    // A dedicated vehicle: an open maintenance block on the shared fixture
    // vehicle would make every later pickup in this file fail as "needs
    // fixing" (workshop block) instead of exercising what this test is for.
    const mbVehicle = await createFixtureVehicle();
    await withOnlyTemplates(
      [{ name: "FIXT-B34-mb", isDefault: true, fields: [FIELD] as any }],
      async () => {
        const block = await createFixtureReservation({
          vehicleId: mbVehicle.id,
          customerId: null,
          type: "maintenance_block",
        });
        const res = await admin.get(`/api/contracts/generate/${block.id}`);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("MAINTENANCE_BLOCK");
      },
    );
  });

  it("a placeholder spare (no vehicle assigned yet): PLACEHOLDER_RESERVATION, 400", async () => {
    await withOnlyTemplates(
      [{ name: "FIXT-B34-ph", isDefault: true, fields: [FIELD] as any }],
      async () => {
        const [placeholder] = await db.insert(reservations).values({
          customerId: null,
          vehicleId: null,
          placeholderSpare: true,
          type: "replacement",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          status: "booked",
        } as any).returning();
        placeholderReservationId = placeholder.id;

        const res = await admin.get(`/api/contracts/generate/${placeholder.id}`);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("PLACEHOLDER_RESERVATION");
      },
    );
  });
});

// Characterisation tests: added after the recorded RED run (task-5-report.md
// records RED/GREEN for the 13 cases above; these two were written once the
// implementation already existed, so they were never shown failing against
// the pre-change code). They assert real, currently-passing behaviour.
describe("B-34 — POST /api/documents/:id/regenerate carries the same codes", () => {
  it("a missing background on regenerate: 500 TEMPLATE_BACKGROUND_MISSING, existing message unchanged", async () => {
    await withOnlyTemplates(
      [{ name: "FIXT-B34-regen-ok", isDefault: true, fields: [FIELD] as any }],
      async () => {
        const rental = await bookedRental();
        const pickupRes = await pickup(rental.id);
        expect(pickupRes.body.contractDocument).toBeTruthy();
        const documentId = pickupRes.body.contractDocument.id as number;

        await withOnlyTemplates(
          [{
            name: "FIXT-B34-regen-missing-bg",
            isDefault: true,
            fields: [FIELD] as any,
            backgroundPath: "templates/b34-regen-missing.pdf",
          }],
          async () => {
            const res = await admin.post(`/api/documents/${documentId}/regenerate`).send({});
            expect(res.status).toBe(500);
            expect(res.body.code).toBe("TEMPLATE_BACKGROUND_MISSING");
            expect(res.body.message).toBe("Failed to regenerate document");
          },
        );
      },
    );
  });

  it("no default template on regenerate: 409 NO_DEFAULT_TEMPLATE", async () => {
    const rental = await bookedRental();
    let documentId!: number;
    await withOnlyTemplates(
      [{ name: "FIXT-B34-regen-ok2", isDefault: true, fields: [FIELD] as any }],
      async () => {
        const pickupRes = await pickup(rental.id);
        documentId = pickupRes.body.contractDocument.id;
      },
    );

    await withOnlyTemplates(
      [
        { name: "FIXT-B34-regen-a", isDefault: false, fields: [FIELD] as any },
        { name: "FIXT-B34-regen-b", isDefault: false, fields: [FIELD] as any },
      ],
      async () => {
        const res = await admin.post(`/api/documents/${documentId}/regenerate`).send({});
        expect(res.status).toBe(409);
        expect(res.body.code).toBe("NO_DEFAULT_TEMPLATE");
      },
    );
  });
});

describe("B-34 — every /api/contracts/* route answers { message, code }", () => {
  it("generate-versioned and generate-default carry the same codes as generate", async () => {
    await withOnlyTemplates([], async () => {
      const rental = await bookedRental();

      const versioned = await admin
        .post(`/api/contracts/generate-versioned/${rental.id}`)
        .send({ vehicleId: vehicle.id, customerId });
      expect(versioned.status).toBe(409);
      expect(versioned.body.code).toBe("NO_TEMPLATE");

      const byDefault = await admin.get(`/api/contracts/generate-default/${rental.id}`);
      expect(byDefault.status).toBe(409);
      expect(byDefault.body.code).toBe("NO_TEMPLATE");

      // B-34 fix round 1: preview now goes through the shared picker, whose
      // "zero templates" status is 409 (was 404, from preview's own inline
      // lookup) — see the dedicated describe block below for the full matrix.
      const preview = await admin
        .post("/api/contracts/preview")
        .send({ vehicleId: vehicle.id, customerId });
      expect(preview.status).toBe(409);
      expect(preview.body.code).toBe("NO_TEMPLATE");
    });
  });

  it("preview names an explicit unknown templateId with TEMPLATE_NOT_FOUND", async () => {
    const preview = await admin
      .post("/api/contracts/preview?templateId=987654321")
      .send({ vehicleId: vehicle.id, customerId });
    expect(preview.status).toBe(404);
    expect(preview.body.code).toBe("TEMPLATE_NOT_FOUND");
  });
});

/**
 * B-34 fix round 1 (review finding, Important #2): `POST /api/contracts/preview`
 * used to have its own inline template lookup instead of `selectContractTemplate()`,
 * so "several templates, none marked default" answered 200 with an arbitrary,
 * unrequested template instead of refusing like every other contract route.
 * These are the tests the review found missing.
 */
describe("B-34 fix round 1 — preview goes through the shared picker", () => {
  it("one template, not marked default: preview still succeeds", async () => {
    await withOnlyTemplates(
      [{ name: "FIXT-B34-preview-solo", isDefault: false, fields: [FIELD] as any }],
      async () => {
        const res = await admin
          .post("/api/contracts/preview")
          .send({ vehicleId: vehicle.id, customerId });
        expect(res.status).toBe(200);
        expect(typeof res.body.token).toBe("string");
        expect(res.body.downloadUrl).toContain(res.body.token);
      },
    );
  });

  it("two templates, neither default: 409 NO_DEFAULT_TEMPLATE (was 200 with the first template)", async () => {
    await withOnlyTemplates(
      [
        { name: "FIXT-B34-preview-a", isDefault: false, fields: [FIELD] as any },
        { name: "FIXT-B34-preview-b", isDefault: false, fields: [FIELD] as any },
      ],
      async () => {
        const res = await admin
          .post("/api/contracts/preview")
          .send({ vehicleId: vehicle.id, customerId });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe("NO_DEFAULT_TEMPLATE");
      },
    );
  });

  it("zero templates: 409 NO_TEMPLATE", async () => {
    await withOnlyTemplates([], async () => {
      const res = await admin
        .post("/api/contracts/preview")
        .send({ vehicleId: vehicle.id, customerId });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("NO_TEMPLATE");
    });
  });

  it("an explicit valid templateId still works even with several templates and none default", async () => {
    await withOnlyTemplates(
      [
        { name: "FIXT-B34-preview-explicit-a", isDefault: false, fields: [FIELD] as any },
        { name: "FIXT-B34-preview-explicit-b", isDefault: false, fields: [FIELD] as any },
      ],
      async (ids) => {
        const res = await admin
          .post(`/api/contracts/preview?templateId=${ids[1]}`)
          .send({ vehicleId: vehicle.id, customerId });
        expect(res.status).toBe(200);
        expect(typeof res.body.token).toBe("string");
      },
    );
  });
});

/**
 * B-34 fix round 1 (review finding, Minor #2): `GET /api/pdf-templates/default`
 * used `storage.getDefaultPdfTemplate()` directly, so it silently 404'd as
 * soon as nothing was marked default even when exactly one template existed.
 * It now shares `resolveDefaultTemplateRow()` with the contract picker
 * (marked default wins; exactly one resolves regardless; several with none
 * marked default is refused) but keeps its own pre-existing 404 status.
 */
describe("B-34 fix round 1 — GET /api/pdf-templates/default follows the same picker rule", () => {
  it("exactly one template, not marked default: it is returned", async () => {
    await withOnlyTemplates(
      [{ name: "FIXT-B34-default-solo", isDefault: false, fields: [FIELD] as any }],
      async (ids) => {
        const res = await admin.get("/api/pdf-templates/default");
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(ids[0]);
      },
    );
  });

  it("two templates, neither default: 404 NO_DEFAULT_TEMPLATE", async () => {
    await withOnlyTemplates(
      [
        { name: "FIXT-B34-default-a", isDefault: false, fields: [FIELD] as any },
        { name: "FIXT-B34-default-b", isDefault: false, fields: [FIELD] as any },
      ],
      async () => {
        const res = await admin.get("/api/pdf-templates/default");
        expect(res.status).toBe(404);
        expect(res.body.code).toBe("NO_DEFAULT_TEMPLATE");
      },
    );
  });

  it("zero templates: 404 NO_TEMPLATE", async () => {
    await withOnlyTemplates([], async () => {
      const res = await admin.get("/api/pdf-templates/default");
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NO_TEMPLATE");
    });
  });
});
