/**
 * D17 review (DG fix round 1): the stored RDW type plan (plates + types) is readable only for
 * an account that may manage vehicles, and none of the generic settings routes may write it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { appSettings, UserPermission } from "../../shared/schema";
import { RDW_TYPE_REMAP_PLAN_KEY, type RdwTypeRemapPlan } from "../../shared/rdw-type-remap";
import { MANAGED_SETTING_MESSAGE } from "../utils/security/redactAppSetting";
import { registerAppSettingsRoutes } from "../routes/app-settings";
import { registerSettingsRoutes } from "../routes/settings";
import { buildStaffTestApp } from "./portal-helpers";

const plan: RdwTypeRemapPlan = {
  createdAt: "2026-10-11T09:00:00.000Z",
  rows: [{ id: 999001, plate: "ZZ99ZZ", from: "SUV", to: "Van" }],
  notFound: [],
  failed: [],
  checked: 1,
};

describe("rdw_type_remap_plan - read access and generic writes", () => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "remap-plan-visibility-"));
  const deps = { upload: undefined, uploadsDir, requireAuth: (_r: any, _s: any, n: any) => n() } as any;
  const register = (a: express.Express) => { registerAppSettingsRoutes(a, deps); registerSettingsRoutes(a, deps); };

  const nobody = buildStaffTestApp([], register);
  const vehicleManager = buildStaffTestApp([UserPermission.MANAGE_VEHICLES], register);
  const settingsAdmin = buildStaffTestApp([UserPermission.MANAGE_SETTINGS, UserPermission.MANAGE_BACKUPS], register);
  const realAdmin = (() => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { id: 1, username: "admin-test", role: "admin", permissions: [] };
      (req as any).isAuthenticated = () => true;
      next();
    });
    register(app);
    return app;
  })();

  let previous: unknown;
  let planId: number;

  beforeAll(async () => {
    const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, RDW_TYPE_REMAP_PLAN_KEY));
    previous = existing?.value;
    if (existing) await db.delete(appSettings).where(eq(appSettings.id, existing.id));
    const [row] = await db.insert(appSettings).values({
      key: RDW_TYPE_REMAP_PLAN_KEY, value: plan as unknown as Record<string, any>, category: "vehicles", description: "visibility test",
    }).returning();
    planId = row.id;
  });

  afterAll(async () => {
    await db.delete(appSettings).where(eq(appSettings.key, RDW_TYPE_REMAP_PLAN_KEY));
    if (previous !== undefined) {
      await db.insert(appSettings).values({
        key: RDW_TYPE_REMAP_PLAN_KEY, value: previous as Record<string, any>, category: "vehicles", description: "restored after test",
      });
    }
  });

  const keys = (body: any) => (Array.isArray(body) ? body.map((s: any) => s.key) : []);

  it("is not in the list and answers 404 by key for an account without MANAGE_VEHICLES", async () => {
    const list = await request(nobody).get("/api/app-settings");
    expect(list.status).toBe(200);
    expect(keys(list.body)).not.toContain(RDW_TYPE_REMAP_PLAN_KEY);
    expect(JSON.stringify(list.body)).not.toContain("ZZ99ZZ");

    const byKey = await request(nobody).get(`/api/app-settings/key/${RDW_TYPE_REMAP_PLAN_KEY}`);
    expect(byKey.status).toBe(404);
    expect(JSON.stringify(byKey.body)).not.toContain("ZZ99ZZ");

    // The category route needs MANAGE_SETTINGS; holding that alone does not open the plan either.
    const category = await request(settingsAdmin).get("/api/app-settings/vehicles");
    expect(category.status).toBe(200);
    expect(keys(category.body)).not.toContain(RDW_TYPE_REMAP_PLAN_KEY);
  });

  it("is readable with MANAGE_VEHICLES and for the role admin", async () => {
    for (const app of [vehicleManager, realAdmin]) {
      const list = await request(app).get("/api/app-settings");
      expect(keys(list.body)).toContain(RDW_TYPE_REMAP_PLAN_KEY);
      const byKey = await request(app).get(`/api/app-settings/key/${RDW_TYPE_REMAP_PLAN_KEY}`);
      expect(byKey.status).toBe(200);
      expect(byKey.body.value.rows[0].plate).toBe("ZZ99ZZ");
    }
  });

  it("refuses POST, PUT and DELETE of the key on both generic route families (403), changing nothing", async () => {
    const writes: Array<[string, string, any]> = [
      ["post", "/api/app-settings", { key: RDW_TYPE_REMAP_PLAN_KEY, value: { rows: [{ id: 1, plate: "EV11IL", from: null, to: "Van" }] }, category: "vehicles" }],
      ["put", `/api/app-settings/${planId}`, { value: { rows: [] } }],
      ["delete", `/api/app-settings/${planId}`, {}],
      ["post", "/api/settings", { key: RDW_TYPE_REMAP_PLAN_KEY, value: { rows: [] } }],
      ["patch", `/api/settings/${planId}`, { value: { rows: [] } }],
      ["delete", `/api/settings/${planId}`, {}],
    ];
    for (const [method, url, body] of writes) {
      const res = await (request(settingsAdmin) as any)[method](url).send(body);
      expect(res.status, `${method} ${url}`).toBe(403);
      expect(res.body.error, `${method} ${url}`).toBe(MANAGED_SETTING_MESSAGE);
    }
    const [stored] = await db.select().from(appSettings).where(eq(appSettings.key, RDW_TYPE_REMAP_PLAN_KEY));
    expect((stored.value as RdwTypeRemapPlan).rows).toEqual(plan.rows);
  });
});
