/**
 * Lease offertes, task 6: customer PDF data, drawing and the stored generated copies.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const TEMP_UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-lqp-uploads-"));
process.env.UPLOADS_DIR = TEMP_UPLOADS;

const { agentFor, cleanupFixtureUsers } = await import("./helpers/app");
const { db } = await import("../db");
const { leaseQuotes, leaseQuoteFiles, leaseQuoteTemplates } = await import("../../shared/schema");
const { LEASE_QUOTE_TEMPLATE_SOURCES } = await import("../../shared/lease-quotes");
const { prepareLeaseQuoteData, generateLeaseQuotePdf } = await import("../utils/lease-quote-pdf");
const { extractPdfTextRows } = await import("../utils/invoice-text-rows");
const { storage } = await import("../storage");
const { like, eq } = await import("drizzle-orm");

const PREFIX = `FIXT-lqp-${Date.now().toString(36)}`;
const EURO = "€";

// The Excel case, as the serialized quote the service returns.
const excelQuote: any = {
  quoteNumber: "LO-2026-0007", quoteDate: "2026-10-27", validUntil: "2026-11-26",
  prospectName: "Piet Prospect", prospectCompany: null, prospectEmail: "piet@example.nl",
  vehicleMake: "Volkswagen", vehicleModel: "Transporter", vehicleTrim: "2.0 TDI", licensePlate: "VB-123-X",
  deliveryTime: "8 weken", purchasePrice: 17318, interestRatePercent: 9, robPerYear: 275, otherCostsPerYear: 350,
  insurancePerMonth: 97.8, roadTaxPerMonth: 34, marginPerMonth: 0, excessKmPrice: 0.085, shortfallKmPrice: 0.04,
};
const chosen: any = { termMonths: 48, kmPerYear: 20000, residualValue: 10000, isChosen: true, totalPerMonth: 466.23 };

describe("prepareLeaseQuoteData", () => {
  it("formats the Excel case in Dutch and leaks no cost build-up", () => {
    const data = prepareLeaseQuoteData(excelQuote, chosen, null, { companyName: "Lam Groep" });
    expect(data.monthlyPriceExclVat).toBe(`${EURO} 466,23`);
    expect(data.kmPerYear).toBe("20.000 km");
    expect(data.termMonths).toBe("48 maanden");
    expect(data.quoteDate).toBe("27-10-2026");
    expect(data.validUntil).toBe("26-11-2026");
    expect(data.excessKmPrice).toBe(`${EURO} 0,085 per km`);
    expect(data.shortfallKmPrice).toBe(`${EURO} 0,04 per km`);
    expect(data.companyName).toBe("Lam Groep");
    for (const key of Object.keys(data)) expect(LEASE_QUOTE_TEMPLATE_SOURCES).toContain(key);
    const values = Object.values(data);
    expect(values).not.toContain(`${EURO} 129,89`);
    expect(values).not.toContain(`${EURO} 10.000,00`);
  });

  it("a prospect without customer uses the prospect company, else the name", () => {
    expect(prepareLeaseQuoteData({ ...excelQuote, prospectCompany: "Prospect B.V." }, chosen, null, { companyName: "X" }).customerName).toBe("Prospect B.V.");
    const plain = prepareLeaseQuoteData(excelQuote, chosen, null, { companyName: "X" });
    expect(plain.customerName).toBe("Piet Prospect");
    expect(plain.customerContact).toBe("");
    expect(plain.customerEmail).toBe("piet@example.nl");
  });

  it("a prospect with both company and name: company is the customer, the name the contact", () => {
    const data = prepareLeaseQuoteData({ ...excelQuote, prospectCompany: "Prospect B.V." }, chosen, null, { companyName: "X" });
    expect(data.customerName).toBe("Prospect B.V.");
    expect(data.customerContact).toBe("Piet Prospect");
  });

  it("a linked customer gives display name, contact, street + number and postcode", () => {
    const data = prepareLeaseQuoteData(excelQuote, chosen, {
      name: "Jan Jansen", companyName: "Jansen Transport", contactPerson: "Jan", email: "info@jansen.nl",
      streetName: "Kerkweg", address: "47a", city: "Zuidland", postalCode: "3214ab",
    } as any, { companyName: "X" });
    expect(data.customerName).toBe("Jansen Transport");
    expect(data.customerContact).toBe("Jan");
    expect(data.customerAddress).toBe("Kerkweg 47A");
    expect(data.customerPostalCode).toBe("3214 AB");
    expect(data.customerCity).toBe("Zuidland");
    expect(data.customerEmail).toBe("info@jansen.nl");
  });

  it("an unset km price draws nothing", () => {
    const data = prepareLeaseQuoteData({ ...excelQuote, excessKmPrice: 0, shortfallKmPrice: null }, chosen, null, { companyName: "X" });
    expect(data.excessKmPrice).toBe("");
    expect(data.shortfallKmPrice).toBe("");
  });
});

const fields = [
  { id: "a", name: "Prijs", x: 50, y: 100, fontSize: 14, isBold: true, source: "monthlyPriceExclVat" },
  { id: "b", name: "Rente", x: 50, y: 200, fontSize: 14, isBold: false, source: "interest" },
];

describe("generateLeaseQuotePdf", () => {
  it("draws allowed sources and nothing for a source outside the list (interest)", async () => {
    const tmp = path.join(TEMP_UPLOADS, "text.pdf");
    const data = { ...prepareLeaseQuoteData(excelQuote, chosen, null, { companyName: "Lam Groep" }), interest: `${EURO} 129,89` };
    fs.writeFileSync(tmp, await generateLeaseQuotePdf(data, { name: "t", fields }));
    const text = (await extractPdfTextRows(tmp)).join("\n");
    expect(text).toContain("466,23");
    expect(text).not.toContain("129");
  });
});

describe("field captions", () => {
  const tmp = () => path.join(TEMP_UPLOADS, `caption-${Math.random().toString(36).slice(2)}.pdf`);

  it("draws caption and value on one line; a field without caption stays bare; an empty value draws nothing", async () => {
    const file = tmp();
    const data = prepareLeaseQuoteData({ ...excelQuote, excessKmPrice: 0 }, chosen, null, { companyName: "Lam Groep" });
    const captioned = [
      { id: "a", name: "Prijs", label: "Leaseprijs per maand excl. btw:", x: 50, y: 100, fontSize: 14, isBold: true, source: "monthlyPriceExclVat" },
      { id: "b", name: "Looptijd", label: "Looptijd:", x: 50, y: 200, fontSize: 12, isBold: false, source: "termMonths" },
      { id: "c", name: "Plaats", x: 50, y: 300, fontSize: 12, isBold: false, source: "licensePlate" },
      { id: "d", name: "Meer", label: "Meerkilometerprijs:", x: 50, y: 400, fontSize: 12, isBold: false, source: "excessKmPrice" },
    ];
    fs.writeFileSync(file, await generateLeaseQuotePdf(data, { name: "t", fields: captioned }));
    const text = (await extractPdfTextRows(file)).join("\n");
    expect(text).toContain("Leaseprijs per maand excl. btw: ");
    expect(text).toMatch(/Leaseprijs per maand excl\. btw:\s*€ 466,23/);
    expect(text).toMatch(/Looptijd:\s*48 maanden/);
    expect(text).toContain("VB-123-X");
    expect(text).not.toMatch(/:\s*VB-123-X/);
    expect(text).not.toContain("Meerkilometerprijs");
  });

  it("the seeded default template prints captions with the values and still no cost build-up", async () => {
    const [tpl] = await db.select().from(leaseQuoteTemplates).where(eq(leaseQuoteTemplates.isDefault, true)).limit(1);
    expect(tpl).toBeDefined();
    const data = prepareLeaseQuoteData(excelQuote, chosen, null, { companyName: "Lam Groep" });
    const file = tmp();
    fs.writeFileSync(file, await generateLeaseQuotePdf(data, tpl));
    const text = (await extractPdfTextRows(file)).join("\n");
    expect(text).toContain("Leaseprijs per maand excl. btw");
    expect(text).toContain("466,23");
    for (const secret of ["129,89", "152,46", "10.000", "17.318"]) expect(text).not.toContain(secret);
  });
});

describe("POST /api/lease-quotes/:id/pdf", () => {
  let admin: Awaited<ReturnType<typeof agentFor>>;
  let quoteId: number;

  beforeAll(async () => {
    admin = await agentFor("admin");
    quoteId = (await admin.post("/api/lease-quotes").send({})).body.id;
    await db.update(leaseQuotes).set({ prospectName: `${PREFIX}-a`, purchasePrice: "17318" }).where(eq(leaseQuotes.id, quoteId));
    // A template row inserted directly (not default, so no other template is touched) and served as the default.
    const [tpl] = await db.insert(leaseQuoteTemplates).values({ name: `${PREFIX}-tpl`, isDefault: false, fields }).returning();
    vi.spyOn(storage, "getDefaultLeaseQuoteTemplate").mockResolvedValue(tpl);
  }, 90_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await db.delete(leaseQuoteTemplates).where(like(leaseQuoteTemplates.name, `${PREFIX}%`));
    await db.delete(leaseQuotes).where(like(leaseQuotes.prospectName, `${PREFIX}%`));
    await cleanupFixtureUsers();
    fs.rmSync(TEMP_UPLOADS, { recursive: true, force: true });
    delete process.env.UPLOADS_DIR;
  });

  it("stores a generated file per call and serves it through the file route", async () => {
    const first = await admin.post(`/api/lease-quotes/${quoteId}/pdf`).send({});
    expect(first.status).toBe(201);
    expect(first.body.kind).toBe("generated");
    expect(first.body.fileName).toMatch(/^LO-\d{4}-\d{4}-\d{4}-\d{2}-\d{2}-\d{4}\.pdf$/);
    expect(first.body.contentType).toBe("application/pdf");
    expect(first.body.filePath.startsWith(`lease-quotes/${quoteId}/`)).toBe(true);
    const second = await admin.post(`/api/lease-quotes/${quoteId}/pdf`).send({});
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
    expect(second.body.filePath).not.toBe(first.body.filePath);
    const rows = await db.select().from(leaseQuoteFiles).where(eq(leaseQuoteFiles.quoteId, quoteId));
    expect(rows.filter((r) => r.kind === "generated")).toHaveLength(2);
    const dl = await admin.get(`/api/lease-quotes/${quoteId}/files/${first.body.id}`).buffer(true).parse((res: any, cb: any) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(dl.status).toBe(200);
    expect(Buffer.from(dl.body).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("409 LEASE_NO_TEMPLATE when there is no template", async () => {
    vi.mocked(storage.getDefaultLeaseQuoteTemplate).mockResolvedValueOnce(undefined);
    const res = await admin.post(`/api/lease-quotes/${quoteId}/pdf`).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LEASE_NO_TEMPLATE");
  });

  it("404 for an unknown quote and 403 without the right", async () => {
    expect((await admin.post("/api/lease-quotes/999999999/pdf").send({})).status).toBe(404);
    const nobody = await agentFor([]);
    expect((await nobody.post(`/api/lease-quotes/${quoteId}/pdf`).send({})).status).toBe(403);
  });
});
