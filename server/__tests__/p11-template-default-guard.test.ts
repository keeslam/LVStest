/**
 * Audit remediation P11 / A-10-2 (docs/audit/fysieke-e2e-audit-2026-10-09.md, module 10):
 * a contract template without fields could be made the default, and from then on every
 * pickup answered "contract failed" (module 6). The save and the "set as default" step now
 * refuse that, by a stable code the client translates.
 *
 * What stays allowed: a new template starts empty (it is how the editor creates one), and an
 * already-empty default can still be renamed - only the transitions that CREATE the trap are
 * refused (becoming the default while empty, emptying the default, creating an empty default
 * next to other templates). The very first template of an installation is created as the
 * default with no fields; refusing that would make the editor unusable on a fresh install, so
 * the editor warns there instead.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, like } from "drizzle-orm";
import { useTempUploadsDir, removeTempUploadsDir } from "./helpers/uploads";

const uploadsDir = useTempUploadsDir("lvs-p11-template-");

import { db } from "../db";
import { pdfTemplates } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { defaultWithoutFieldsViolation } from "../services/pdf-template-default-guard";

const PREFIX = "FIXT-P11-";
const ONE_FIELD = [{ name: "Naam", source: "customerName", x: 60, y: 100, fontSize: 11 }];

let admin: TestAgent;
let formerDefaultIds: number[] = [];

beforeAll(async () => {
  admin = await agentFor("admin");
  // The default flag is exclusive: remember who held it so the shared test database is left as found.
  formerDefaultIds = (await db.select({ id: pdfTemplates.id }).from(pdfTemplates).where(eq(pdfTemplates.isDefault, true))).map((r) => r.id);
});

afterAll(async () => {
  await db.delete(pdfTemplates).where(like(pdfTemplates.name, `${PREFIX}%`));
  for (const id of formerDefaultIds) await db.update(pdfTemplates).set({ isDefault: true }).where(eq(pdfTemplates.id, id));
  await cleanupFixtureUsers();
  removeTempUploadsDir(uploadsDir);
});

describe("A-10-2 - the rule", () => {
  const empty = { fieldCount: 0 };
  it("is only about a default without fields", () => {
    expect(defaultWithoutFieldsViolation({ resultingIsDefault: false, resultingFieldCount: 0, before: null, otherTemplatesExist: true })).toBe(false);
    expect(defaultWithoutFieldsViolation({ resultingIsDefault: true, resultingFieldCount: 3, before: { isDefault: false, ...empty }, otherTemplatesExist: true })).toBe(false);
  });
  it("refuses becoming the default while empty", () => {
    expect(defaultWithoutFieldsViolation({ resultingIsDefault: true, resultingFieldCount: 0, before: { isDefault: false, fieldCount: 0 }, otherTemplatesExist: true })).toBe(true);
  });
  it("refuses emptying the default", () => {
    expect(defaultWithoutFieldsViolation({ resultingIsDefault: true, resultingFieldCount: 0, before: { isDefault: true, fieldCount: 4 }, otherTemplatesExist: true })).toBe(true);
  });
  it("lets an already-empty default be saved again (rename)", () => {
    expect(defaultWithoutFieldsViolation({ resultingIsDefault: true, resultingFieldCount: 0, before: { isDefault: true, fieldCount: 0 }, otherTemplatesExist: true })).toBe(false);
  });
  it("lets the first template of an installation be created as an empty default, but not a second one", () => {
    expect(defaultWithoutFieldsViolation({ resultingIsDefault: true, resultingFieldCount: 0, before: null, otherTemplatesExist: false })).toBe(false);
    expect(defaultWithoutFieldsViolation({ resultingIsDefault: true, resultingFieldCount: 0, before: null, otherTemplatesExist: true })).toBe(true);
  });
});

describe("A-10-2 - the routes", () => {
  let templateId: number;

  it("creates an empty template that is not the default (how the editor starts one)", async () => {
    const res = await admin.post("/api/pdf-templates").send({ name: `${PREFIX}a`, fields: [], isDefault: false });
    expect(res.status).toBe(201);
    templateId = res.body.id;
  });

  it("refuses 'set as default' on a template without fields, with a code, and changes nothing", async () => {
    const res = await admin.patch(`/api/pdf-templates/${templateId}`).send({ isDefault: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TEMPLATE_DEFAULT_WITHOUT_FIELDS");
    expect(res.body.templateName).toBe(`${PREFIX}a`);
    const [row] = await db.select().from(pdfTemplates).where(eq(pdfTemplates.id, templateId));
    expect(row.isDefault).toBe(false);
    // The previous default is still the default.
    const defaults = await db.select({ id: pdfTemplates.id }).from(pdfTemplates).where(eq(pdfTemplates.isDefault, true));
    expect(defaults.map((r) => r.id).sort()).toEqual([...formerDefaultIds].sort());
  });

  it("refuses to create a second template as an empty default", async () => {
    const res = await admin.post("/api/pdf-templates").send({ name: `${PREFIX}b`, fields: [], isDefault: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TEMPLATE_DEFAULT_WITHOUT_FIELDS");
    const rows = await db.select().from(pdfTemplates).where(eq(pdfTemplates.name, `${PREFIX}b`));
    expect(rows).toEqual([]);
  });

  it("accepts 'set as default' once the template has a field", async () => {
    const res = await admin.patch(`/api/pdf-templates/${templateId}`).send({ isDefault: true, fields: ONE_FIELD });
    expect(res.status).toBe(200);
    expect(res.body.isDefault ?? res.body.is_default).toBe(true);
  });

  it("refuses to save the default with all its fields removed", async () => {
    const res = await admin.patch(`/api/pdf-templates/${templateId}`).send({ fields: [] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TEMPLATE_DEFAULT_WITHOUT_FIELDS");
    const [row] = await db.select().from(pdfTemplates).where(eq(pdfTemplates.id, templateId));
    expect(Array.isArray(row.fields) ? row.fields.length : JSON.parse(String(row.fields)).length).toBe(1);
  });

  it("still lets a default with fields be renamed", async () => {
    const res = await admin.patch(`/api/pdf-templates/${templateId}`).send({ name: `${PREFIX}a2` });
    expect(res.status).toBe(200);
  });

  it("still lets an already-empty default be renamed (the trap exists; this save does not make it worse)", async () => {
    await db.update(pdfTemplates).set({ fields: [] as any }).where(eq(pdfTemplates.id, templateId));
    const res = await admin.patch(`/api/pdf-templates/${templateId}`).send({ name: `${PREFIX}a3`, fields: [] });
    expect(res.status).toBe(200);
  });
});

describe("the editor sends `fields` as a JSON string", () => {
  it("creates an empty template from \"[]\" (a new template always starts empty; this used to answer 400)", async () => {
    const res = await admin.post("/api/pdf-templates").send({ name: `${PREFIX}string-empty`, fields: "[]", isDefault: false });
    expect(res.status).toBe(201);
    expect(res.body.fields).toEqual([]);
  });

  it("still refuses a string that is not a list of fields", async () => {
    for (const fields of ["not json", "{}", "\"[\"", "42"]) {
      const res = await admin.post("/api/pdf-templates").send({ name: `${PREFIX}string-bad`, fields });
      expect(res.status, fields).toBe(400);
    }
  });

  it("accepts a string with fields in it, as before", async () => {
    const res = await admin.post("/api/pdf-templates").send({ name: `${PREFIX}string-one`, fields: JSON.stringify(ONE_FIELD) });
    expect(res.status).toBe(201);
    expect(res.body.fields).toHaveLength(1);
  });
});
