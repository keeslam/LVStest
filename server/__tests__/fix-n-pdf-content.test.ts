/**
 * FIX-N — PDF content correctness (BUG-119, BUG-156, BUG-162, BUG-163,
 * BUG-164, BUG-166, BUG-178, BUG-191).
 *
 * Every assertion here reads the **text** back out of the produced PDF with
 * `helpers/pdfText.cjs` (the phase-14 extractor, plan §8.7). Byte counts and
 * file sizes prove nothing: the contract that lost its tenant's name to a
 * single non-WinAnsi character was exactly the same size as a correct one.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "module";
import { eq, inArray } from "drizzle-orm";
import { useTempUploadsDir, removeTempUploadsDir } from "./helpers/uploads";

const uploadsDir = useTempUploadsDir("lvs-fix-n-");

import { db } from "../db";
import {
  documents,
  pdfTemplates,
  customers,
  vehicleTransports,
  type Vehicle,
  type Customer,
} from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer,
  createFixtureVehicle,
  createFixtureReservation,
  cleanupFixtures,
} from "./helpers/fixtures";
import { generateRentalContractFromTemplate } from "../utils/pdf-generator";
import { buildDamageCheckReservationData, customerDisplayName } from "../services/damage-check-data";
import { sanitizeForWinAnsi } from "../utils/pdf-text";

const require = createRequire(import.meta.url);
const { inspect } = require("./helpers/pdfText.cjs") as {
  inspect: (buf: Buffer) => Promise<{
    valid: boolean;
    pages: number;
    text: string[];
    items: Array<Array<{ str: string; x: number; y: number; w: number; h: number }>>;
    outOfBounds: Array<{ page: number; str: string; reason: string }>;
    error: string | null;
  }>;
};

const TEMPLATE_NAME = "FIXT-N-contract-template";
/** x/y are the template editor's top-left coordinates. */
const NAME_FIELD = { name: "Naam huurder", source: "customer.name", x: 60, y: 120, fontSize: 11 };
const END_DATE_FIELD = { name: "Einddatum", source: "reservation.endDate", x: 300, y: 200, fontSize: 11 };
const ADDRESS_FIELD = {
  name: "Adres",
  source: "customer.address",
  x: 60,
  y: 300,
  width: 240,
  height: 120,
  fontSize: 9,
};
const UNKNOWN_FIELD = { name: "Bedrag inclusief BTW", source: "totalPriceInclusiveVat", x: 60, y: 500, fontSize: 11 };

let admin: TestAgent;
let vehicle: Vehicle;
let templateId: number;
let previousDefaultIds: number[] = [];

const EMOJI_NAME = "FIXT-Jørgen 😀 Ångström";
const TURKISH_NAME = "FIXT-Şahin Güneş";
const LONG_ADDRESS = `Zeer lange straatnaam ${"herhaald ".repeat(55)}nummer 42`;

beforeAll(async () => {
  admin = await agentFor("admin");
  vehicle = await createFixtureVehicle();

  const existingDefaults = await db.select({ id: pdfTemplates.id }).from(pdfTemplates).where(eq(pdfTemplates.isDefault, true));
  previousDefaultIds = existingDefaults.map((row) => row.id);
  if (previousDefaultIds.length > 0) {
    await db.update(pdfTemplates).set({ isDefault: false }).where(inArray(pdfTemplates.id, previousDefaultIds));
  }
  const [template] = await db
    .insert(pdfTemplates)
    .values({
      name: TEMPLATE_NAME,
      isDefault: true,
      fields: [NAME_FIELD, END_DATE_FIELD, ADDRESS_FIELD, UNKNOWN_FIELD] as any,
    })
    .returning();
  templateId = template.id;
});

afterAll(async () => {
  await db.delete(documents).where(eq(documents.vehicleId, vehicle.id));
  await db.delete(vehicleTransports).where(eq(vehicleTransports.vehicleId, vehicle.id));
  await db.delete(pdfTemplates).where(eq(pdfTemplates.name, TEMPLATE_NAME));
  if (previousDefaultIds.length > 0) {
    await db.update(pdfTemplates).set({ isDefault: true }).where(inArray(pdfTemplates.id, previousDefaultIds));
  }
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(uploadsDir);
});

async function contractFor(customer: Customer): Promise<Buffer> {
  const reservation = await createFixtureReservation({
    customerId: customer.id,
    vehicleId: vehicle.id,
    startDate: "2026-10-01",
    endDate: "2026-10-05",
  });
  const res = await admin.get(`/api/contracts/generate/${reservation.id}?templateId=${templateId}`);
  expect(res.status).toBe(200);
  return Buffer.from(res.body);
}

async function customerWith(fields: Partial<typeof customers.$inferInsert>): Promise<Customer> {
  const base = await createFixtureCustomer("N");
  const [row] = await db.update(customers).set(fields).where(eq(customers.id, base.id)).returning();
  return row;
}

describe("FIX-N — what actually ends up on the paper", () => {
  it("BUG-162: a name with an emoji and a diacritic still prints the name", async () => {
    const customer = await customerWith({ name: EMOJI_NAME, address: "Kerkweg 47a" });
    const info = await inspect(await contractFor(customer));

    expect(info.valid).toBe(true);
    expect(info.error).toBeNull();
    const page1 = info.text[0].replace(/\s+/g, " ");
    // Before the fix the per-field try/catch threw the WHOLE field away, so
    // the contract printed with no tenant name at all.
    expect(page1).toContain("Jørgen");
    expect(page1).toContain("Ångström");
    // The emoji itself cannot be encoded; it is dropped, not "?"-ed, and it
    // certainly does not take the name with it.
    expect(page1).not.toContain("😀");
  });

  it("BUG-162: a Turkish name is transliterated, not blanked", async () => {
    const customer = await customerWith({ name: TURKISH_NAME, address: "Kerkweg 47a" });
    const info = await inspect(await contractFor(customer));
    const page1 = info.text[0].replace(/\s+/g, " ");
    expect(page1).toContain("Sahin");
    expect(page1).toContain("Günes");
  });

  it("BUG-163: the produced bytes are always a real PDF", async () => {
    const customer = await customerWith({ name: "FIXT-Gewone Klant", address: "Kerkweg 47a" });
    const bytes = await contractFor(customer);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const info = await inspect(bytes);
    expect(info.valid).toBe(true);
    expect(info.pages).toBe(1);
  });

  it("BUG-164: the end date lands inside its own field box, not mirrored", async () => {
    const customer = await customerWith({ name: "FIXT-Positie", address: "Kerkweg 47a" });
    const info = await inspect(await contractFor(customer));

    const items = info.items[0];
    const dateItem = items.find((item) => item.str.includes("October") || item.str.includes("2026"));
    expect(dateItem, `no date item in ${JSON.stringify(items.map((i) => i.str))}`).toBeTruthy();

    // Editor coordinates are top-left; the renderer flips with 842 - y. Without
    // the flip the value landed at y ≈ 200 instead of y ≈ 630 — the wrong box,
    // near the top of the sheet upside-down from where the editor showed it.
    expect(dateItem!.y).toBeGreaterThan(842 - END_DATE_FIELD.y - 22);
    expect(dateItem!.y).toBeLessThanOrEqual(842 - END_DATE_FIELD.y);
    expect(dateItem!.x).toBeGreaterThanOrEqual(END_DATE_FIELD.x);
    expect(dateItem!.x).toBeLessThan(END_DATE_FIELD.x + 20);
  });

  it("BUG-178: a 500-character address stays inside the page", async () => {
    expect(LONG_ADDRESS.length).toBeGreaterThan(500);
    const customer = await customerWith({ name: "FIXT-Lang Adres", address: LONG_ADDRESS });
    const info = await inspect(await contractFor(customer));

    expect(info.pages).toBe(1);
    expect(info.outOfBounds, JSON.stringify(info.outOfBounds)).toEqual([]);
    // It wrapped rather than printing one endless line off the right edge.
    const addressLines = info.items[0].filter((item) => item.str.includes("herhaald"));
    expect(addressLines.length).toBeGreaterThan(1);
    for (const line of addressLines) {
      expect(line.x + line.w).toBeLessThanOrEqual(595.5);
    }
  });

  it("BUG-191: a field whose source does not resolve prints nothing, not its own name", async () => {
    const customer = await customerWith({ name: "FIXT-Onbekend Veld", address: "Kerkweg 47a" });
    const info = await inspect(await contractFor(customer));
    const page1 = info.text[0];
    expect(page1).not.toContain(UNKNOWN_FIELD.name);
    expect(page1).not.toContain(UNKNOWN_FIELD.source);
  });

  it("BUG-191: absurd geometry is rejected instead of drawn off the page", async () => {
    const customer = await customerWith({ name: "FIXT-Absurde Geometrie", address: "Kerkweg 47a" });
    const reservation = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id });
    const bytes = await generateRentalContractFromTemplate(
      { ...(reservation as any), vehicle, customer },
      {
        id: 0,
        name: "absurd",
        fields: [
          { name: "Naam", source: "customer.name", x: 1e9, y: -4000, fontSize: 11 },
          { name: "Kenteken", source: "vehicle.licensePlate", x: 60, y: 100, fontSize: 11 },
        ],
      } as any,
    );
    const info = await inspect(bytes);
    expect(info.outOfBounds).toEqual([]);
    expect(info.text[0]).not.toContain("Absurde Geometrie");
  });
});

describe("FIX-N — what may not be generated at all", () => {
  it("BUG-119: a maintenance block has no contract, and leaves no document behind", async () => {
    const block = await createFixtureReservation({
      customerId: null,
      vehicleId: vehicle.id,
      type: "maintenance_block",
      status: "booked",
    });
    const res = await admin.get(`/api/contracts/generate/${block.id}?templateId=${templateId}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/maintenance/i);

    const rows = await db.select().from(documents).where(eq(documents.reservationId, block.id));
    expect(rows).toEqual([]);
  });

  it("BUG-119: generate-default refuses a reservation without a customer", async () => {
    const orphan = await createFixtureReservation({ customerId: null, vehicleId: vehicle.id });
    const res = await admin.get(`/api/contracts/generate-default/${orphan.id}`);
    expect(res.status).toBe(400);
    const rows = await db.select().from(documents).where(eq(documents.reservationId, orphan.id));
    expect(rows).toEqual([]);
  });

  it("BUG-156: an unknown contract templateId is a 404, not somebody else's layout", async () => {
    const customer = await customerWith({ name: "FIXT-Onbekend Sjabloon", address: "Kerkweg 47a" });
    const reservation = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id });
    const res = await admin.get(`/api/contracts/generate/${reservation.id}?templateId=999999`);
    expect(res.status).toBe(404);
    const rows = await db.select().from(documents).where(eq(documents.reservationId, reservation.id));
    expect(rows).toEqual([]);
  });

  it("BUG-156: an unknown transport-report templateId is a 404", async () => {
    const [transport] = await db
      .insert(vehicleTransports)
      .values({
        vehicleId: vehicle.id,
        transportType: "delivery",
        status: "scheduled",
        scheduledDate: new Date(),
      } as any)
      .returning();

    const res = await admin
      .post("/api/delivery/transports/generate-report")
      .send({ transportIds: [transport.id], templateId: 999999 });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/template/i);
  });
});

describe("FIX-N — the damage check knows who the customer is", () => {
  it("BUG-166: a customer with only `name` is not printed as 'null null'", () => {
    const data = buildDamageCheckReservationData(
      { id: 7, contractNumber: "C-7", startDate: "2026-10-01", endDate: "2026-10-05" },
      { name: "FIXT-Alleen Naam", firstName: null, lastName: null },
    );
    expect(data.customerName).toBe("FIXT-Alleen Naam");
    expect(data.customerName).not.toContain("null");
  });

  it("BUG-166: a customer with no name at all yields an empty string, not a placeholder", () => {
    expect(customerDisplayName({ name: "", firstName: null, lastName: null })).toBe("");
    expect(customerDisplayName(null)).toBe("");
    expect(customerDisplayName({ name: null, firstName: "Jan", lastName: "Jansen" })).toBe("Jan Jansen");
  });

  it("BUG-166: the rendered damage check prints the name, not 'null null'", async () => {
    const { generateDamageCheckPDFWithTemplate } = await import("../pdf-damage-check-generator");
    const bytes = await generateDamageCheckPDFWithTemplate(
      { brand: vehicle.brand, model: vehicle.model, licensePlate: vehicle.licensePlate },
      {
        id: 0,
        name: "FIXT-N damage check",
        canvasFields: [
          { id: "f1", type: "dynamic", source: "customerName", name: "Huurder", x: 40, y: 120, fontSize: 11 },
          { id: "f2", type: "dynamic", source: "contractNumber", name: "Contract", x: 40, y: 150, fontSize: 11 },
        ],
      } as any,
      buildDamageCheckReservationData(
        { id: 7, contractNumber: "C-7", startDate: "2026-10-01", endDate: "2026-10-05" },
        { name: "FIXT-Schadecheck Klant", firstName: null, lastName: null },
      ),
    );

    const info = await inspect(bytes);
    expect(info.valid).toBe(true);
    const text = info.text.join(" ").replace(/\s+/g, " ");
    expect(text).not.toContain("null null");
    expect(text).toContain("FIXT-Schadecheck Klant");
  });

  it("BUG-166: the damage-check endpoint never prints 'null null'", async () => {
    const customer = await customerWith({ name: "FIXT-Schadecheck Endpoint", firstName: null, lastName: null });
    const reservation = await createFixtureReservation({ customerId: customer.id, vehicleId: vehicle.id });
    const res = await admin.get(`/api/damage-checks/generate/${reservation.id}`);
    expect(res.status).toBe(200);

    const info = await inspect(Buffer.from(res.body));
    expect(info.valid).toBe(true);
    expect(info.text.join(" ")).not.toContain("null null");
  });
});

describe("FIX-N — the WinAnsi sanitizer itself", () => {
  it("keeps everything WinAnsi can express", () => {
    expect(sanitizeForWinAnsi("Jørgen Ångström")).toBe("Jørgen Ångström");
    expect(sanitizeForWinAnsi("Jérôme ë ü ç €")).toBe("Jérôme ë ü ç €");
  });

  it("transliterates what it can and drops only what it cannot", () => {
    expect(sanitizeForWinAnsi("Şahin")).toBe("Sahin");
    expect(sanitizeForWinAnsi("Łukasz")).toBe("Lukasz");
    expect(sanitizeForWinAnsi("A → B")).toBe("A -> B");
    expect(sanitizeForWinAnsi("naam 😀 hier")).toBe("naam  hier");
  });
});
