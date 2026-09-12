/**
 * WAVE 11 — BUG-070 (HIGH), the half that phase 36 found still open.
 *
 * The *delete* half was fixed in an earlier wave: a file outside the uploads
 * root survives the removal of a template background. The *accept* half was
 * not: `PATCH /api/pdf-templates/2` with
 * `backgroundPath: "../../AUDIT-P36B-canary.txt"` answered **200** and stored
 * that value, and `PUT /api/damage-check-templates/1` did the same. A stored
 * path that points outside the uploads root is a loaded gun aimed at whatever
 * code path picks it up next.
 *
 * Rule: a client may not hand any of the four template families a stored-file
 * path that does not resolve inside the uploads root. Clearing (null/"") stays
 * allowed — that is how a background is removed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const TEMP_UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), "lvs-tplpaths-uploads-"));
process.env.UPLOADS_DIR = TEMP_UPLOADS;

const { agentFor, cleanupFixtureUsers } = await import("./helpers/app");
const { isSafeStoredPathValue } = await import("../middleware/stored-path-guard");
const { db } = await import("../db");
const {
  pdfTemplates, damageCheckTemplates, transportReportTemplates, vehicleDiagramTemplates,
} = await import("../../shared/schema");
const { eq, like } = await import("drizzle-orm");

type Agent = Awaited<ReturnType<typeof agentFor>>;

const NAME = `FIXT-tplpath-${Date.now().toString(36)}`;
const ESCAPE = "../../WAVE11-canary.txt";

describe("WAVE 11 / BUG-070 — a stored path from a request body", () => {
  let admin: Agent;
  const created: Array<() => Promise<unknown>> = [];

  beforeAll(async () => {
    admin = await agentFor("admin");
  }, 60_000);

  afterAll(async () => {
    for (const undo of created) {
      try { await undo(); } catch { /* best effort */ }
    }
    await cleanupFixtureUsers();
    fs.rmSync(TEMP_UPLOADS, { recursive: true, force: true });
    delete process.env.UPLOADS_DIR;
  });

  it("the rule itself: only paths inside the uploads root are acceptable", () => {
    expect(isSafeStoredPathValue(null)).toBe(true);
    expect(isSafeStoredPathValue("")).toBe(true);
    expect(isSafeStoredPathValue("templates/background.pdf")).toBe(true);
    expect(isSafeStoredPathValue("uploads/templates/background.pdf")).toBe(true);
    expect(isSafeStoredPathValue(ESCAPE)).toBe(false);
    expect(isSafeStoredPathValue("..\\..\\WAVE11-canary.txt")).toBe(false);
    expect(isSafeStoredPathValue("/etc/passwd")).toBe(false);
    expect(isSafeStoredPathValue("C:\\Windows\\win.ini")).toBe(false);
    expect(isSafeStoredPathValue(42 as any)).toBe(false);
  });

  it("PATCH /api/pdf-templates/:id refuses a backgroundPath outside uploads", async () => {
    const create = await admin.post("/api/pdf-templates").send({ name: `${NAME}-pdf`, fields: [] });
    expect([200, 201]).toContain(create.status);
    const id = create.body.id as number;
    created.push(() => db.delete(pdfTemplates).where(eq(pdfTemplates.id, id)));

    const res = await admin.patch(`/api/pdf-templates/${id}`).send({ backgroundPath: ESCAPE });
    expect(res.status).toBe(400);

    const [row] = await db.select().from(pdfTemplates).where(eq(pdfTemplates.id, id));
    expect(row.backgroundPath ?? "").not.toContain("WAVE11-canary");
  });

  it("POST /api/pdf-templates refuses one too", async () => {
    const res = await admin
      .post("/api/pdf-templates")
      .send({ name: `${NAME}-pdf-create`, fields: [], backgroundPath: ESCAPE });
    expect(res.status).toBe(400);
    const rows = await db.select().from(pdfTemplates).where(like(pdfTemplates.name, `${NAME}-pdf-create%`));
    expect(rows.length).toBe(0);
  });

  it("PUT /api/damage-check-templates/:id refuses one", async () => {
    const create = await admin
      .post("/api/damage-check-templates")
      .send({ name: `${NAME}-dmg`, canvasFields: [] });
    expect([200, 201]).toContain(create.status);
    const id = create.body.id as number;
    created.push(() => db.delete(damageCheckTemplates).where(eq(damageCheckTemplates.id, id)));

    const res = await admin
      .put(`/api/damage-check-templates/${id}`)
      .send({ name: `${NAME}-dmg`, canvasFields: [], backgroundPath: ESCAPE });
    expect(res.status).toBe(400);

    const [row] = await db.select().from(damageCheckTemplates).where(eq(damageCheckTemplates.id, id));
    expect((row as any).backgroundPath ?? "").not.toContain("WAVE11-canary");
  });

  it("PATCH /api/transport-report-templates/:id refuses one", async () => {
    const create = await admin
      .post("/api/transport-report-templates")
      .send({ name: `${NAME}-transport`, fields: [] });
    expect([200, 201]).toContain(create.status);
    const id = create.body.id as number;
    created.push(() => db.delete(transportReportTemplates).where(eq(transportReportTemplates.id, id)));

    const res = await admin
      .patch(`/api/transport-report-templates/${id}`)
      .send({ backgroundPath: ESCAPE });
    expect(res.status).toBe(400);

    const [row] = await db.select().from(transportReportTemplates).where(eq(transportReportTemplates.id, id));
    expect((row as any).backgroundPath ?? "").not.toContain("WAVE11-canary");
  });

  it("PATCH /api/vehicle-diagram-templates/:id refuses a diagramPath", async () => {
    const [row] = await db
      .insert(vehicleDiagramTemplates)
      .values({ make: "FIXT", model: `${NAME}-diagram`, diagramPath: "diagrams/ok.png" } as any)
      .returning();
    created.push(() => db.delete(vehicleDiagramTemplates).where(eq(vehicleDiagramTemplates.id, row.id)));

    const res = await admin
      .patch(`/api/vehicle-diagram-templates/${row.id}`)
      .send({ diagramPath: ESCAPE });
    expect(res.status).toBe(400);

    const [after] = await db
      .select()
      .from(vehicleDiagramTemplates)
      .where(eq(vehicleDiagramTemplates.id, row.id));
    expect((after as any).diagramPath).toBe("diagrams/ok.png");
  });

  it("a legitimate relative path still goes through", async () => {
    const create = await admin.post("/api/pdf-templates").send({ name: `${NAME}-ok`, fields: [] });
    const id = create.body.id as number;
    created.push(() => db.delete(pdfTemplates).where(eq(pdfTemplates.id, id)));

    const res = await admin
      .patch(`/api/pdf-templates/${id}`)
      .send({ backgroundPath: "templates/background.pdf" });
    expect(res.status).toBe(200);

    const clear = await admin.patch(`/api/pdf-templates/${id}`).send({ backgroundPath: null });
    expect(clear.status).toBe(200);
  });
});
