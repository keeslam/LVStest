/**
 * WAVE 11 — besluit **B-18** (BUG-192): a generated document is Dutch, in
 * Dutch notation, whoever generates it.
 *
 * Phase 36 printed a contract that carried `September 13, 2026`,
 * `September 20, 2026` and `7 days` — English, American notation — right next
 * to `12 september 2026` and `€ 1.234,50`, which were already Dutch. The
 * transport report said "Vehicle Swap" and "Tow" and printed `€0.00` with a
 * point; the damage check mixed `12-09-2026` with `12/09/2026`.
 *
 * One helper module owns date, number and currency formatting and every
 * generator feeds through it. The contract assertions below read the text back
 * out of the produced PDF.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "module";
import { eq, inArray } from "drizzle-orm";

import { db } from "../db";
import { pdfTemplates, documents, reservations, type Customer, type Vehicle } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures,
} from "./helpers/fixtures";
import { useTempUploadsDir, removeTempUploadsDir } from "./helpers/uploads";
import {
  formatDateNL, formatLongDateNL, formatDateTimeNL, formatNumberNL, formatCurrencyNL, formatDaysNL,
} from "../utils/dutch-format";
import { prepareTransportReportData } from "../utils/pdf-generator";

const require_ = createRequire(import.meta.url);
const { inspect } = require_("./helpers/pdfText.cjs") as {
  inspect: (buf: Buffer) => Promise<{ valid: boolean; pages: number; text: string[]; error: string | null }>;
};

const uploadsDir = useTempUploadsDir("wave11-nl-");
const TEMPLATE_NAME = "FIXT-W11-nl-contract";

let admin: TestAgent;
let vehicle: Vehicle;
let customer: Customer;
let templateId: number;
let previousDefaultIds: number[] = [];

const field = (source: string, y: number) => ({ name: source, source, x: 60, y, fontSize: 11 });

beforeAll(async () => {
  admin = await agentFor("admin");
  vehicle = await createFixtureVehicle();
  customer = await createFixtureCustomer("NL");

  const existingDefaults = await db.select({ id: pdfTemplates.id }).from(pdfTemplates).where(eq(pdfTemplates.isDefault, true));
  previousDefaultIds = existingDefaults.map((r) => r.id);
  if (previousDefaultIds.length > 0) {
    await db.update(pdfTemplates).set({ isDefault: false }).where(inArray(pdfTemplates.id, previousDefaultIds));
  }
  const [template] = await db
    .insert(pdfTemplates)
    .values({
      name: TEMPLATE_NAME,
      isDefault: true,
      fields: [
        field("reservation.startDate", 120),
        field("reservation.endDate", 160),
        field("reservation.duration", 200),
        field("reservation.totalPrice", 240),
        field("contractDate", 280),
      ] as any,
    })
    .returning();
  templateId = template.id;
}, 60_000);

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

describe("B-18 — the formatting helper", () => {
  const moment = new Date(2026, 8, 13, 14, 5); // 13 September 2026, 14:05 local

  it("dates are dd-mm-jjjj", () => {
    expect(formatDateNL(moment)).toBe("13-09-2026");
    expect(formatDateNL("2026-09-13")).toBe("13-09-2026");
    expect(formatDateNL(null)).toBe("");
  });

  it("a long date is Dutch, never English", () => {
    expect(formatLongDateNL(moment)).toBe("13 september 2026");
    expect(formatLongDateNL(moment)).not.toMatch(/September/);
  });

  it("a date with a time keeps 24-hour notation", () => {
    expect(formatDateTimeNL(moment)).toBe("13-09-2026 14:05");
  });

  it("numbers use a comma for the decimal and a point for the thousands", () => {
    expect(formatNumberNL(1234.5)).toBe("1.234,5");
    expect(formatNumberNL(1234.5, 2)).toBe("1.234,50");
    expect(formatNumberNL(null)).toBe("");
  });

  it("money is € 1.234,50 — never €1234.50", () => {
    expect(formatCurrencyNL(1234.5).replace(/\s/g, " ")).toBe("€ 1.234,50");
    expect(formatCurrencyNL(0).replace(/\s/g, " ")).toBe("€ 0,00");
    expect(formatCurrencyNL("1234.50").replace(/\s/g, " ")).toBe("€ 1.234,50");
    expect(formatCurrencyNL(null)).toBe("");
  });

  it("a duration is Dutch", () => {
    expect(formatDaysNL(7)).toBe("7 dagen");
    expect(formatDaysNL(1)).toBe("1 dag");
  });
});

describe("B-18 — the generated contract (BUG-192)", () => {
  it("prints Dutch dates, a Dutch duration and a Dutch amount", async () => {
    const reservation = await createFixtureReservation({
      customerId: customer.id,
      vehicleId: vehicle.id,
      startDate: "2026-09-13",
      endDate: "2026-09-20",
    });
    // totalPrice is a numeric column; set it straight so the formatting of a
    // four-figure amount is what the assertion sees.
    await db.update(reservations).set({ totalPrice: "1234.50" } as any).where(eq(reservations.id, reservation.id));

    const res = await admin.get(`/api/contracts/generate/${reservation.id}?templateId=${templateId}`);
    expect(res.status).toBe(200);
    const info = await inspect(Buffer.from(res.body));
    expect(info.valid).toBe(true);
    const text = info.text.join(" ").replace(/ /g, " ");

    expect(text).toContain("13-09-2026");
    expect(text).toContain("20-09-2026");
    expect(text).toContain("7 dagen");
    expect(text.replace(/\s/g, " ")).toMatch(/€ ?1\.234,50/);
    // Dutch month names are lower case; a capital "September" is the English form.
    expect(text).not.toMatch(/September/);
    expect(text).not.toMatch(/[A-Z][a-z]+ \d{1,2}, \d{4}/);
    expect(text).not.toMatch(/\bdays\b/i);
    expect(text).not.toMatch(/To be determined/i);
  }, 60_000);

  it("an open-ended rental says so in Dutch", async () => {
    const reservation = await createFixtureReservation({
      customerId: customer.id,
      vehicleId: vehicle.id,
      startDate: "2026-09-13",
      endDate: null,
    });
    const res = await admin.get(`/api/contracts/generate/${reservation.id}?templateId=${templateId}`);
    expect(res.status).toBe(200);
    const info = await inspect(Buffer.from(res.body));
    const text = info.text.join(" ");
    expect(text).not.toMatch(/To be determined/i);
    expect(text).toMatch(/nader te bepalen/i);
  }, 60_000);
});

describe("B-18 — the transport report", () => {
  const transport = {
    id: 1,
    transportType: "swap",
    status: "scheduled",
    scheduledDate: "2026-09-13",
    completedDate: null,
    tollCost: 0,
    billableAmount: 1234.5,
    billable: true,
    distanceKm: 120,
    vehicle: null,
    relatedVehicle: null,
    customer: null,
    isExternalVehicle: false,
  } as any;

  it("uses Dutch transport type labels", () => {
    const data = prepareTransportReportData(transport);
    expect(data.transportType).not.toMatch(/Vehicle Swap/);
    expect(data.transportType).toBe("Voertuigruil");
    expect(prepareTransportReportData({ ...transport, transportType: "tow" }).transportType).toBe("Sleepopdracht");
  });

  it("prints amounts with a comma", () => {
    const data = prepareTransportReportData(transport);
    expect(data.tollCost.replace(/\s/g, " ")).toBe("€ 0,00");
    expect(data.billableAmount.replace(/\s/g, " ")).toBe("€ 1.234,50");
    expect(data.billableAmount).not.toContain(".50");
  });
});

describe("B-18 — no generator formats in English any more", () => {
  it("no en-GB / en-US / 'MMMM d, yyyy' left in the document generators", () => {
    const fs = require_("fs") as typeof import("fs");
    const path = require_("path") as typeof import("path");
    for (const file of [
      path.join(process.cwd(), "server", "utils", "pdf-generator.ts"),
      path.join(process.cwd(), "server", "pdf-damage-check-generator.ts"),
    ]) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/toLocaleDateString\(\s*['"]en-/);
      expect(source, file).not.toMatch(/'MMMM d, yyyy'/);
    }
  });
});
