/**
 * Lease offertes, task 5: the customer PDF template under Documenten.
 * CRUD behind MANAGE_PDF_TEMPLATES, source whitelist, background upload checks, preview PDF.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const TEMP_UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-lqt-uploads-"));
process.env.UPLOADS_DIR = TEMP_UPLOADS;

const { agentFor, cleanupFixtureUsers } = await import("./helpers/app");
const { db } = await import("../db");
const { leaseQuoteTemplates } = await import("../../shared/schema");
const { templateFieldsSchema } = await import("../../shared/template-fields");
const { LEASE_QUOTE_TEMPLATE_SOURCES } = await import("../../shared/lease-quotes");
const { like, eq } = await import("drizzle-orm");

type Agent = Awaited<ReturnType<typeof agentFor>>;

const NAME = `FIXT-lqt-${Date.now().toString(36)}`;
// 1x1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

describe("lease quote templates API", () => {
  let admin: Agent;
  let nobody: Agent;
  let templateId: number;

  beforeAll(async () => {
    admin = await agentFor("admin");
    nobody = await agentFor([]);
    const res = await admin.post("/api/lease-quote-templates").send({
      name: `${NAME}-main`,
      fields: [{ id: "f1", name: "Prijs", x: 50, y: 100, fontSize: 14, isBold: true, source: "monthlyPriceExclVat" }],
    });
    templateId = res.body.id;
  }, 90_000);

  afterAll(async () => {
    await db.delete(leaseQuoteTemplates).where(like(leaseQuoteTemplates.name, `${NAME}%`));
    await cleanupFixtureUsers();
    fs.rmSync(TEMP_UPLOADS, { recursive: true, force: true });
    delete process.env.UPLOADS_DIR;
  });

  it("the seeded default template parses and only uses allowed sources", async () => {
    const res = await admin.get("/api/lease-quote-templates/default");
    expect(res.status).toBe(200);
    const parsed = templateFieldsSchema.safeParse(res.body.fields);
    expect(parsed.success).toBe(true);
    for (const f of res.body.fields) expect(LEASE_QUOTE_TEMPLATE_SOURCES).toContain(f.source);
  });

  it("a field caption (label) is accepted and round-trips", async () => {
    const fields = [{ id: "f1", name: "Looptijd", label: "Looptijd:", x: 50, y: 100, fontSize: 12, isBold: false, source: "termMonths" }];
    const patched = await admin.patch(`/api/lease-quote-templates/${templateId}`).send({ fields });
    expect(patched.status).toBe(200);
    const one = await admin.get(`/api/lease-quote-templates/${templateId}`);
    expect(one.body.fields[0].label).toBe("Looptijd:");
  });

  it("lists, reads, updates and deletes for MANAGE_PDF_TEMPLATES", async () => {
    const list = await admin.get("/api/lease-quote-templates");
    expect(list.status).toBe(200);
    expect(list.body.some((t: any) => t.id === templateId)).toBe(true);

    const one = await admin.get(`/api/lease-quote-templates/${templateId}`);
    expect(one.status).toBe(200);
    expect(one.body.name).toBe(`${NAME}-main`);

    const patched = await admin.patch(`/api/lease-quote-templates/${templateId}`).send({ name: `${NAME}-renamed` });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe(`${NAME}-renamed`);

    const created = await admin.post("/api/lease-quote-templates").send({ name: `${NAME}-tmp`, fields: [] });
    expect(created.status).toBe(201);
    const del = await admin.delete(`/api/lease-quote-templates/${created.body.id}`);
    expect(del.status).toBe(200);
    expect((await admin.get(`/api/lease-quote-templates/${created.body.id}`)).status).toBe(404);
  });

  it("refuses every route without the right", async () => {
    expect((await nobody.get("/api/lease-quote-templates")).status).toBe(403);
    expect((await nobody.get(`/api/lease-quote-templates/${templateId}`)).status).toBe(403);
    expect((await nobody.post("/api/lease-quote-templates").send({ name: `${NAME}-no`, fields: [] })).status).toBe(403);
    expect((await nobody.patch(`/api/lease-quote-templates/${templateId}`).send({ name: `${NAME}-no` })).status).toBe(403);
    expect((await nobody.delete(`/api/lease-quote-templates/${templateId}`)).status).toBe(403);
    expect((await nobody.get(`/api/lease-quote-templates/${templateId}/preview`)).status).toBe(403);
    expect((await nobody.post(`/api/lease-quote-templates/${templateId}/background`).attach("background", PNG, "a.png")).status).toBe(403);
  });

  it("a field with a source outside the whitelist is a 400 (create and update)", async () => {
    const bad = { id: "x", name: "Rente", x: 10, y: 10, source: "interest" };
    const create = await admin.post("/api/lease-quote-templates").send({ name: `${NAME}-bad`, fields: [bad] });
    expect(create.status).toBe(400);
    const patch = await admin.patch(`/api/lease-quote-templates/${templateId}`).send({ fields: [bad] });
    expect(patch.status).toBe(400);
    const rows = await db.select().from(leaseQuoteTemplates).where(eq(leaseQuoteTemplates.name, `${NAME}-bad`));
    expect(rows.length).toBe(0);
  });

  it("a stored path outside uploads is refused", async () => {
    const res = await admin.patch(`/api/lease-quote-templates/${templateId}`).send({ backgroundPath: "../../canary.txt" });
    expect(res.status).toBe(400);
  });

  it("a script disguised as a PNG is a 400 (single background and library)", async () => {
    const script = Buffer.from("<script>alert(1)</script>");
    const single = await admin.post(`/api/lease-quote-templates/${templateId}/background`).attach("background", script, "evil.png");
    expect(single.status).toBe(400);
    const lib = await admin.post(`/api/lease-quote-templates/${templateId}/backgrounds`).attach("background", script, "evil.png");
    expect(lib.status).toBe(400);
  });

  it("a real PNG is stored, listed in the library, selectable and removable", async () => {
    const up = await admin.post(`/api/lease-quote-templates/${templateId}/background`).attach("background", PNG, "bg.png");
    expect(up.status).toBe(200);
    expect(up.body.backgroundPath).toBeTruthy();

    const lib = await admin.post(`/api/lease-quote-templates/${templateId}/backgrounds`).attach("background", PNG, "lib.png");
    expect(lib.status).toBe(201);
    const list = await admin.get(`/api/lease-quote-templates/${templateId}/backgrounds`);
    expect(list.body.length).toBe(1);
    const sel = await admin.post(`/api/lease-quote-templates/${templateId}/backgrounds/${lib.body.id}/select`);
    expect(sel.status).toBe(200);
    expect(sel.body.backgroundPath).toBe(lib.body.backgroundPath);
    expect((await admin.get("/api/lease-quote-templates/backgrounds/all")).status).toBe(200);
    expect((await admin.delete(`/api/lease-quote-templates/${templateId}/backgrounds/${lib.body.id}`)).status).toBe(200);
    expect((await admin.delete(`/api/lease-quote-templates/${templateId}/background`)).status).toBe(200);
  });

  it("the preview is a PDF drawn with sample data", async () => {
    const res = await admin.get(`/api/lease-quote-templates/${templateId}/preview`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
