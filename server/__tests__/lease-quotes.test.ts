/**
 * Lease offertes, task 3: quote service and API.
 * Numbers per year, settings copied at creation, server-side price calculation,
 * copy with/without attachments, search, expired filter, recycle bin and history.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { eq, like, and } from "drizzle-orm";
import { db } from "../db";
import { leaseQuotes, leaseQuoteFiles, leaseQuoteVariants, deletedRecords } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";

const PREFIX = "FIXT-lq-";
const THIS_YEAR = new Date().getFullYear();

/** The Excel case: total 466.23 per month. */
const excelPayload = (over: Record<string, unknown> = {}) => ({
  prospectName: `${PREFIX}excel`,
  purchasePrice: 17318,
  interestRatePercent: 9,
  robPerYear: 275,
  otherCostsPerYear: 350,
  insurancePerMonth: 97.8,
  roadTaxPerMonth: 34,
  marginPerMonth: 0,
  variants: [{ termMonths: 48, kmPerYear: 20000, residualValue: 10000, isChosen: true }],
  ...over,
});

describe("lease quotes API", () => {
  let admin: TestAgent;
  let nobody: TestAgent;
  let originalSettings: any;
  const dirsToRemove: string[] = [];

  beforeAll(async () => {
    admin = await agentFor("admin");
    nobody = await agentFor([]);
    originalSettings = (await admin.get("/api/lease-quotes/settings")).body;
  }, 90_000);

  afterAll(async () => {
    if (originalSettings && originalSettings.interestRatePercent !== undefined) {
      await admin.put("/api/lease-quotes/settings").send(originalSettings);
    }
    const rows = await db.select({ id: leaseQuotes.id }).from(leaseQuotes).where(like(leaseQuotes.prospectName, `${PREFIX}%`));
    for (const r of rows) dirsToRemove.push(path.join(getUploadsDir(), "lease-quotes", String(r.id)));
    await db.delete(leaseQuotes).where(like(leaseQuotes.prospectName, `${PREFIX}%`));
    for (const dir of dirsToRemove) fs.rmSync(dir, { recursive: true, force: true });
    await cleanupFixtureUsers();
  });

  it("a user without the right gets 403", async () => {
    expect((await nobody.get("/api/lease-quotes")).status).toBe(403);
    expect((await nobody.post("/api/lease-quotes").send({})).status).toBe(403);
    expect((await nobody.get("/api/lease-quotes/settings")).status).toBe(403);
  });

  it("create copies the settings and numbers per year", async () => {
    const put = await admin.put("/api/lease-quotes/settings").send({ ...originalSettings, interestRatePercent: 7.5, validityDays: 10 });
    expect(put.status).toBe(200);

    const a = await admin.post("/api/lease-quotes").send({});
    const b = await admin.post("/api/lease-quotes").send({});
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const re = new RegExp(`^LO-${THIS_YEAR}-(\\d{4})$`);
    const seqA = Number(re.exec(a.body.quoteNumber)![1]);
    const seqB = Number(re.exec(b.body.quoteNumber)![1]);
    expect(seqB).toBe(seqA + 1);
    expect(Number(a.body.interestRatePercent)).toBe(7.5);
    expect(a.body.status).toBe("concept");
    expect(a.body.variants).toHaveLength(1);
    expect(a.body.variants[0]).toMatchObject({ termMonths: 48, kmPerYear: 20000, isChosen: true });
    // validUntil = quoteDate + 10 days
    const diff = (Date.parse(a.body.validUntil) - Date.parse(a.body.quoteDate)) / 86_400_000;
    expect(diff).toBe(10);

    // A quote dated in another year numbers on its own sequence.
    const other = await admin.post("/api/lease-quotes").send(excelPayload({ quoteDate: "2031-03-01", validUntil: "2031-04-01" }));
    expect(other.status).toBe(201);
    expect(other.body.quoteNumber).toMatch(/^LO-2031-\d{4}$/);

    // Parallel creates never share a number.
    const many = await Promise.all([1, 2, 3, 4].map(() => admin.post("/api/lease-quotes").send({})));
    const numbers = many.map((r) => r.body.quoteNumber);
    expect(new Set(numbers).size).toBe(4);
    for (const r of [a, b, ...many]) await db.update(leaseQuotes).set({ prospectName: `${PREFIX}num` }).where(eq(leaseQuotes.id, r.body.id));
  });

  it("changing settings leaves existing quotes alone", async () => {
    await admin.put("/api/lease-quotes/settings").send({ ...originalSettings, interestRatePercent: 6 });
    const q = await admin.post("/api/lease-quotes").send({});
    await db.update(leaseQuotes).set({ prospectName: `${PREFIX}settings` }).where(eq(leaseQuotes.id, q.body.id));
    await admin.put("/api/lease-quotes/settings").send({ ...originalSettings, interestRatePercent: 12 });
    const again = await admin.get(`/api/lease-quotes/${q.body.id}`);
    expect(Number(again.body.interestRatePercent)).toBe(6);
  });

  it("server recalculates and ignores a forged total", async () => {
    const q = await admin.post("/api/lease-quotes").send({});
    const patched = await admin.patch(`/api/lease-quotes/${q.body.id}`).send(excelPayload({
      variants: [{ termMonths: 48, kmPerYear: 20000, residualValue: 10000, isChosen: true, totalPerMonth: 1 }],
    }));
    expect(patched.status).toBe(200);
    expect(Number(patched.body.variants[0].totalPerMonth)).toBe(466.23);
    const stored = await db.select().from(leaseQuoteVariants).where(eq(leaseQuoteVariants.quoteId, q.body.id));
    expect(Number(stored[0].totalPerMonth)).toBe(466.23);
  });

  it("chosen variant with term 0 is refused", async () => {
    const q = await admin.post("/api/lease-quotes").send({});
    await db.update(leaseQuotes).set({ prospectName: `${PREFIX}term0` }).where(eq(leaseQuotes.id, q.body.id));
    const res = await admin.patch(`/api/lease-quotes/${q.body.id}`).send(excelPayload({
      variants: [{ termMonths: 0, kmPerYear: 20000, residualValue: 10000, isChosen: true }],
    }));
    expect(res.status).toBe(400);
  });

  it("copy asks about attachments", async () => {
    const q = await admin.post("/api/lease-quotes").send({});
    await admin.patch(`/api/lease-quotes/${q.body.id}`).send(excelPayload({ prospectName: `${PREFIX}copy` }));
    const dir = path.join(getUploadsDir(), "lease-quotes", String(q.body.id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "dealer.pdf"), "dealer");
    fs.writeFileSync(path.join(dir, "generated.pdf"), "generated");
    dirsToRemove.push(dir);
    await db.insert(leaseQuoteFiles).values([
      { quoteId: q.body.id, kind: "dealer", fileName: "dealer.pdf", filePath: `lease-quotes/${q.body.id}/dealer.pdf`, fileSize: 6, contentType: "application/pdf" },
      { quoteId: q.body.id, kind: "generated", fileName: "generated.pdf", filePath: `lease-quotes/${q.body.id}/generated.pdf`, fileSize: 9, contentType: "application/pdf" },
    ]);

    const without = await admin.post(`/api/lease-quotes/${q.body.id}/copy`).send({ withAttachments: false });
    expect(without.status).toBe(201);
    expect(without.body.quoteNumber).not.toBe(q.body.quoteNumber);
    expect(without.body.status).toBe("concept");
    expect(without.body.files).toHaveLength(0);
    expect(without.body.variants).toHaveLength(1);
    expect(Number(without.body.variants[0].totalPerMonth)).toBe(466.23);
    dirsToRemove.push(path.join(getUploadsDir(), "lease-quotes", String(without.body.id)));

    const withFiles = await admin.post(`/api/lease-quotes/${q.body.id}/copy`).send({ withAttachments: true });
    expect(withFiles.status).toBe(201);
    dirsToRemove.push(path.join(getUploadsDir(), "lease-quotes", String(withFiles.body.id)));
    expect(withFiles.body.files).toHaveLength(1);
    const copied = withFiles.body.files[0];
    expect(copied.kind).toBe("dealer");
    expect(copied.filePath).not.toBe(`lease-quotes/${q.body.id}/dealer.pdf`);
    expect(copied.filePath.startsWith(`lease-quotes/${withFiles.body.id}/`)).toBe(true);
    expect(fs.readFileSync(path.join(getUploadsDir(), copied.filePath), "utf8")).toBe("dealer");
    // the original keeps both of its files
    const original = await db.select().from(leaseQuoteFiles).where(eq(leaseQuoteFiles.quoteId, q.body.id));
    expect(original).toHaveLength(2);
  });

  it("search finds by plate without dashes", async () => {
    const q = await admin.post("/api/lease-quotes").send({});
    await admin.patch(`/api/lease-quotes/${q.body.id}`).send(excelPayload({
      prospectName: `${PREFIX}plate`, licensePlate: "AB-123-C", vehicleMake: "Zzmake", vehicleModel: "Zzmodel",
    }));
    for (const term of ["ab123c", "AB-123-C", "Zzmodel", "FIXT-lq-plate", q.body.quoteNumber]) {
      const res = await admin.get(`/api/lease-quotes?search=${encodeURIComponent(term)}`);
      expect(res.status).toBe(200);
      expect(res.body.rows.map((r: any) => r.id), term).toContain(q.body.id);
    }
    const row = (await admin.get("/api/lease-quotes?search=ab123c")).body.rows.find((r: any) => r.id === q.body.id);
    expect(row).toMatchObject({ licensePlate: "AB-123-C", status: "concept", displayStatus: "concept" });
    expect(row.vehicle).toContain("Zzmake");
    expect(Number(row.monthlyPrice)).toBe(466.23);
    expect(row.customerName).toBe(`${PREFIX}plate`);
  });

  it("expired filter", async () => {
    const q = await admin.post("/api/lease-quotes").send({});
    await admin.patch(`/api/lease-quotes/${q.body.id}`).send(excelPayload({
      prospectName: `${PREFIX}expired`, status: "sent", quoteDate: "2020-01-01", validUntil: "2020-01-31",
    }));
    const expired = await admin.get(`/api/lease-quotes?status=expired&search=${PREFIX}expired`);
    expect(expired.body.rows.map((r: any) => r.id)).toContain(q.body.id);
    expect(expired.body.rows.find((r: any) => r.id === q.body.id).displayStatus).toBe("expired");
    const sent = await admin.get(`/api/lease-quotes?status=sent&search=${PREFIX}expired`);
    expect(sent.body.rows.map((r: any) => r.id)).not.toContain(q.body.id);
    const accepted = await admin.patch(`/api/lease-quotes/${q.body.id}`).send(excelPayload({
      prospectName: `${PREFIX}expired`, status: "accepted", quoteDate: "2020-01-01", validUntil: "2020-01-31",
    }));
    expect(accepted.status).toBe(200);
    const after = await admin.get(`/api/lease-quotes?status=expired&search=${PREFIX}expired`);
    expect(after.body.rows.map((r: any) => r.id)).not.toContain(q.body.id);
  });

  it("delete puts it in the recycle bin and restore brings variants back", async () => {
    const q = await admin.post("/api/lease-quotes").send({});
    const saved = await admin.patch(`/api/lease-quotes/${q.body.id}`).send(excelPayload({
      prospectName: `${PREFIX}bin`,
      variants: [
        { termMonths: 48, kmPerYear: 20000, residualValue: 10000, isChosen: true },
        { termMonths: 60, kmPerYear: 15000, residualValue: 8000, isChosen: false },
      ],
    }));
    const variantIds = saved.body.variants.map((v: any) => v.id).sort();
    expect(variantIds).toHaveLength(2);

    const del = await admin.delete(`/api/lease-quotes/${q.body.id}`);
    expect(del.status).toBe(200);
    expect((await admin.get(`/api/lease-quotes/${q.body.id}`)).status).toBe(404);
    const [bin] = await db.select().from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "lease_quote"), eq(deletedRecords.entityId, q.body.id)));
    expect(bin).toBeDefined();
    expect(bin.label).toContain(q.body.quoteNumber);
    expect((bin.payload as any).variants).toHaveLength(2);

    const restore = await admin.post(`/api/deleted-records/${bin.id}/restore`).send({});
    expect(restore.status).toBe(200);
    const back = await admin.get(`/api/lease-quotes/${q.body.id}`);
    expect(back.status).toBe(200);
    expect(back.body.quoteNumber).toBe(q.body.quoteNumber);
    expect(back.body.variants.map((v: any) => v.id).sort()).toEqual(variantIds);
  });

  it("numbers only go up: a deleted number is not reused and its restore succeeds", async () => {
    const mk = async () => {
      const q = await admin.post("/api/lease-quotes").send({});
      await db.update(leaseQuotes).set({ prospectName: `${PREFIX}monotone` }).where(eq(leaseQuotes.id, q.body.id));
      return q.body;
    };
    const seqOf = (n: string) => Number(n.split("-")[2]);
    const latest = await mk();
    expect((await admin.delete(`/api/lease-quotes/${latest.id}`)).status).toBe(200);
    const next = await mk();
    expect(seqOf(next.quoteNumber)).toBeGreaterThan(seqOf(latest.quoteNumber));
    const [bin] = await db.select().from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "lease_quote"), eq(deletedRecords.entityId, latest.id)));
    const restore = await admin.post(`/api/deleted-records/${bin.id}/restore`).send({});
    expect(restore.status).toBe(200);
    expect((await admin.get(`/api/lease-quotes/${latest.id}`)).body.quoteNumber).toBe(latest.quoteNumber);
  });

  it("restore refuses with QUOTE_NUMBER_TAKEN when another quote holds the number", async () => {
    const q = await admin.post("/api/lease-quotes").send({});
    await db.update(leaseQuotes).set({ prospectName: `${PREFIX}taken` }).where(eq(leaseQuotes.id, q.body.id));
    expect((await admin.delete(`/api/lease-quotes/${q.body.id}`)).status).toBe(200);
    await db.insert(leaseQuotes).values({
      quoteNumber: q.body.quoteNumber, quoteDate: q.body.quoteDate, validUntil: q.body.validUntil, prospectName: `${PREFIX}thief`,
    });
    const [bin] = await db.select().from(deletedRecords)
      .where(and(eq(deletedRecords.entityType, "lease_quote"), eq(deletedRecords.entityId, q.body.id)));
    const res = await admin.post(`/api/deleted-records/${bin.id}/restore`).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("QUOTE_NUMBER_TAKEN");
  });

  it("history lists the update", async () => {
    const q = await admin.post("/api/lease-quotes").send({});
    await db.update(leaseQuotes).set({ prospectName: `${PREFIX}history` }).where(eq(leaseQuotes.id, q.body.id));
    const res = await admin.patch(`/api/lease-quotes/${q.body.id}`).send(excelPayload({ prospectName: `${PREFIX}history`, internalNotes: "changed" }));
    expect(res.status).toBe(200);
    let actions: string[] = [];
    for (let i = 0; i < 20; i++) {
      const hist = await admin.get(`/api/audit-logs/resource/lease_quote/${q.body.id}`);
      expect(hist.status).toBe(200);
      const list = Array.isArray(hist.body) ? hist.body : hist.body.logs ?? hist.body.rows ?? [];
      actions = list.map((l: any) => l.action);
      if (actions.includes("lease_quote.update")) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(actions).toContain("lease_quote.update");
  });
});
