/**
 * Lease offertes, task 4: dealer quote upload, scan (stub scanner, never Gemini), view and delete.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import { leaseQuotes, leaseQuoteFiles } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";
import { suggestedPurchasePrice, type ParsedDealerQuote } from "../../shared/lease-quotes";
import { setDealerQuoteScanner } from "../utils/dealer-quote-scanner";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";

const PREFIX = "FIXT-lqf-";
// Smallest valid PDF the upload validator accepts.
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

const empty: ParsedDealerQuote = {
  dealerName: null, make: null, model: null, trim: null, catalogPrice: null, options: null, discount: null, bpm: null,
  deliveryCosts: null, totalExclVat: null, totalInclVat: null, deliveryTime: null, quoteDate: null, validUntil: null,
};

describe("suggestedPurchasePrice", () => {
  it("uses the total excl. VAT when present", () => {
    expect(suggestedPurchasePrice({ ...empty, totalExclVat: 17318, totalInclVat: 20954.78 })).toEqual({ amount: 17318, onlyInclVat: false });
  });
  it("only an incl. VAT total gives no amount", () => {
    expect(suggestedPurchasePrice({ ...empty, totalInclVat: 20954.78 })).toEqual({ amount: null, onlyInclVat: true });
  });
  it("nothing printed gives nothing", () => {
    expect(suggestedPurchasePrice(empty)).toEqual({ amount: null, onlyInclVat: false });
  });
});

describe("lease quote files API", () => {
  let admin: TestAgent;
  let nobody: TestAgent;
  let quoteId: number;
  let otherId: number;

  beforeAll(async () => {
    admin = await agentFor("admin");
    nobody = await agentFor([]);
    quoteId = (await admin.post("/api/lease-quotes").send({})).body.id;
    otherId = (await admin.post("/api/lease-quotes").send({})).body.id;
    await db.update(leaseQuotes).set({ prospectName: `${PREFIX}a` }).where(eq(leaseQuotes.id, quoteId));
    await db.update(leaseQuotes).set({ prospectName: `${PREFIX}b` }).where(eq(leaseQuotes.id, otherId));
  }, 90_000);

  afterEach(() => setDealerQuoteScanner(null));

  afterAll(async () => {
    await db.delete(leaseQuotes).where(like(leaseQuotes.prospectName, `${PREFIX}%`));
    for (const id of [quoteId, otherId]) fs.rmSync(path.join(getUploadsDir(), "lease-quotes", String(id)), { recursive: true, force: true });
    await cleanupFixtureUsers();
  });

  const upload = (id: number, buf = PDF, name = "offerte.pdf") => admin.post(`/api/lease-quotes/${id}/files`).attach("file", buf, name);

  it("stores a dealer file under uploads/lease-quotes/<id>/", async () => {
    const res = await upload(quoteId);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ quoteId, kind: "dealer", fileName: "offerte.pdf" });
    expect(res.body.filePath.replace(/\\/g, "/")).toMatch(new RegExp(`^lease-quotes/${quoteId}/`));
    expect(fs.existsSync(path.join(getUploadsDir(), res.body.filePath))).toBe(true);
    const rows = await db.select().from(leaseQuoteFiles).where(eq(leaseQuoteFiles.quoteId, quoteId));
    expect(rows.map((r) => r.kind)).toContain("dealer");
  });

  it("needs the right and an existing quote", async () => {
    expect((await nobody.post(`/api/lease-quotes/${quoteId}/files`).attach("file", PDF, "x.pdf")).status).toBe(403);
    const res = await upload(999999);
    expect(res.status).toBe(404);
  });

  it("refuses an .exe renamed .pdf and removes the temp file", async () => {
    const dir = path.join(getUploadsDir(), "lease-quotes", String(quoteId));
    fs.mkdirSync(dir, { recursive: true });
    const before = fs.readdirSync(dir).length;
    const res = await upload(quoteId, Buffer.from("MZ\x90\x00\x03\x00\x00\x00 not a pdf"), "evil.pdf");
    expect(res.status).toBe(400);
    expect(fs.readdirSync(dir)).toHaveLength(before);
  });

  it("scan returns the stub's values and leaves the quote alone", async () => {
    const file = (await upload(quoteId)).body;
    const before = (await admin.get(`/api/lease-quotes/${quoteId}`)).body;
    setDealerQuoteScanner(async () => ({ ...empty, make: "Volkswagen", model: "Golf", totalExclVat: 17318 }));
    const res = await admin.post(`/api/lease-quotes/${quoteId}/files/${file.id}/scan`);
    expect(res.status).toBe(200);
    expect(res.body.parsed).toMatchObject({ make: "Volkswagen", totalExclVat: 17318 });
    expect(res.body.suggestion).toEqual({ amount: 17318, onlyInclVat: false });
    const after = (await admin.get(`/api/lease-quotes/${quoteId}`)).body;
    expect(after.purchasePrice).toEqual(before.purchasePrice);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it("scanner failure is 502 LEASE_SCAN_FAILED without its text, file kept", async () => {
    const file = (await upload(quoteId)).body;
    setDealerQuoteScanner(async () => { throw new Error("GEMINI_API_KEY is not configured"); });
    const res = await admin.post(`/api/lease-quotes/${quoteId}/files/${file.id}/scan`);
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("LEASE_SCAN_FAILED");
    expect(JSON.stringify(res.body)).not.toContain("GEMINI");
    expect(await db.select().from(leaseQuoteFiles).where(eq(leaseQuoteFiles.id, file.id))).toHaveLength(1);
  });

  it("viewing a file shows up in the quote's own history as lease_quote.file-view", async () => {
    const file = (await upload(quoteId)).body;
    expect((await admin.get(`/api/lease-quotes/${quoteId}/files/${file.id}`)).status).toBe(200);
    let actions: string[] = [];
    for (let i = 0; i < 20; i++) {
      const hist = await admin.get(`/api/audit-logs/resource/lease_quote/${quoteId}`);
      expect(hist.status).toBe(200);
      const list = Array.isArray(hist.body) ? hist.body : hist.body.logs ?? hist.body.rows ?? [];
      actions = list.map((l: any) => l.action);
      if (actions.includes("lease_quote.file-view")) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(actions).toContain("lease_quote.file-view");
  });

  it("a file that vanished from disk answers 404 instead of crashing", async () => {
    const file = (await upload(quoteId)).body;
    fs.rmSync(path.join(getUploadsDir(), file.filePath), { force: true });
    expect((await admin.get(`/api/lease-quotes/${quoteId}/files/${file.id}`)).status).toBe(404);
  });

  it("streams the file inline and refuses a file id of another quote", async () => {
    const file = (await upload(quoteId)).body;
    const res = await admin.get(`/api/lease-quotes/${quoteId}/files/${file.id}`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toBe('inline; filename="offerte.pdf"');
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect((res.body as Buffer).equals(PDF)).toBe(true);
    expect((await admin.get(`/api/lease-quotes/${otherId}/files/${file.id}`)).status).toBe(404);
    expect((await admin.post(`/api/lease-quotes/${otherId}/files/${file.id}/scan`)).status).toBe(404);
    expect((await admin.delete(`/api/lease-quotes/${otherId}/files/${file.id}`)).status).toBe(404);
    expect((await nobody.get(`/api/lease-quotes/${quoteId}/files/${file.id}`)).status).toBe(403);
  });

  it("deletes a dealer file with its disk file; a generated file gets 409", async () => {
    const file = (await upload(quoteId)).body;
    const abs = path.join(getUploadsDir(), file.filePath);
    expect((await admin.delete(`/api/lease-quotes/${quoteId}/files/${file.id}`)).status).toBe(200);
    expect(fs.existsSync(abs)).toBe(false);
    expect(await db.select().from(leaseQuoteFiles).where(eq(leaseQuoteFiles.id, file.id))).toHaveLength(0);

    const [gen] = await db.insert(leaseQuoteFiles).values({
      quoteId, kind: "generated", fileName: "g.pdf", filePath: `lease-quotes/${quoteId}/g.pdf`, contentType: "application/pdf",
    }).returning();
    const res = await admin.delete(`/api/lease-quotes/${quoteId}/files/${gen.id}`);
    expect(res.status).toBe(409);
    expect(await db.select().from(leaseQuoteFiles).where(eq(leaseQuoteFiles.id, gen.id))).toHaveLength(1);
  });
});
