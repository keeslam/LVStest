/**
 * Audit coverage of the staff routers that server/index.ts mounts itself.
 *
 * `auditMutations` used to be registered inside `registerRoutes()`, while the
 * e-mail template, e-mail log, notification and APK date change routers were
 * mounted in server/index.ts *before* that call. Express runs middleware in
 * registration order, so a template saved or an APK date confirmed through one
 * of those routers never produced an audit_logs row: "who changed the APK
 * reminder text" had no answer. The middleware now goes in ahead of every
 * router (server/middleware/staff-routers.ts); these tests pin that.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "../db";
import { apkDateChanges, auditLogs, emailTemplates, vehicles as vehiclesTable } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";

const TEMPLATE_PREFIX = "FIXT-audit-template-";

let admin: TestAgent;

beforeAll(async () => {
  admin = await agentFor("admin");
});

afterAll(async () => {
  await db.delete(emailTemplates).where(like(emailTemplates.name, `${TEMPLATE_PREFIX}%`));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

async function rowsFor(resourceType: string, resourceId: number | string) {
  return db.select().from(auditLogs).where(and(
    eq(auditLogs.resourceType, resourceType),
    eq(auditLogs.resourceId, String(resourceId)),
  ));
}

/** The middleware writes from the response's finish event; poll briefly. */
async function waitForAction(resourceType: string, resourceId: number | string, action: string) {
  for (let i = 0; i < 40; i += 1) {
    const rows = await rowsFor(resourceType, resourceId);
    const hit = rows.find((r) => r.action === action);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 50));
  }
  return (await rowsFor(resourceType, resourceId)).find((r) => r.action === action) ?? null;
}

describe("audit coverage — routers mounted outside registerRoutes()", () => {
  it("logs who created and who deleted an e-mail template", async () => {
    const name = `${TEMPLATE_PREFIX}${Date.now()}`;
    const created = await admin.post("/api/email-templates").send({
      name, subject: "Onderwerp", content: "Inhoud", category: "custom",
    });
    expect(created.status).toBe(201);
    const id: number = created.body.id;

    const createRow = await waitForAction("email-template", id, "email-template.create");
    expect(createRow).not.toBeNull();
    expect(createRow!.username).toBe(admin.username);
    expect(createRow!.details?.request).toMatchObject({ name, subject: "Onderwerp" });

    const deleted = await admin.delete(`/api/email-templates/${id}`);
    expect(deleted.status).toBe(200);

    const deleteRow = await waitForAction("email-template", id, "email-template.delete");
    expect(deleteRow).not.toBeNull();
    expect(deleteRow!.username).toBe(admin.username);
  });

  it("logs who confirmed an APK date change, and names them on the vehicle", async () => {
    const vehicle = await createFixtureVehicle({ apkDate: "2026-01-15" });
    const [change] = await db.insert(apkDateChanges).values({
      vehicleId: vehicle.id,
      previousApkDate: "2026-01-15",
      newApkDate: "2027-01-15",
      status: "pending",
    }).returning();

    const res = await admin.post(`/api/apk-date-changes/${change.id}/confirm`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");

    const row = await waitForAction("apk-date-change", change.id, "apk-date-change.confirm");
    expect(row).not.toBeNull();
    expect(row!.username).toBe(admin.username);

    const [after] = await db.select({ apkDate: vehiclesTable.apkDate, updatedBy: vehiclesTable.updatedBy })
      .from(vehiclesTable).where(eq(vehiclesTable.id, vehicle.id));
    expect(after.apkDate).toBe("2027-01-15");
    expect(after.updatedBy).toBe(admin.username);
  });

  it("logs who dismissed an APK date change", async () => {
    const vehicle = await createFixtureVehicle({ apkDate: "2026-02-01" });
    const [change] = await db.insert(apkDateChanges).values({
      vehicleId: vehicle.id,
      previousApkDate: "2026-02-01",
      newApkDate: "2027-02-01",
      status: "pending",
    }).returning();

    const res = await admin.post(`/api/apk-date-changes/${change.id}/dismiss`);
    expect(res.status).toBe(200);

    const row = await waitForAction("apk-date-change", change.id, "apk-date-change.dismiss");
    expect(row).not.toBeNull();
    expect(row!.username).toBe(admin.username);
  });
});
