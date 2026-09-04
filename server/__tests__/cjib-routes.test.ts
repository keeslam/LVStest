import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import os from "os";

vi.mock("../utils/email-service", () => ({ sendEmail: vi.fn(async () => true) }));

import { registerFineRoutes } from "../routes/fines";
import { setCjibFtpsClient } from "../services/cjib/poller";
import { saveCjibConfig } from "../services/cjib/config";
import { storage } from "../storage";
import { CJIB_CONFIG_KEY, CJIB_PASSWORD_MASK } from "../../shared/fines";
import { buildStaffTestApp, createTestCustomer, createTestVehicle, cleanupPortalTestData, TEST_PREFIX } from "./portal-helpers";
import { UserPermission } from "../../shared/schema";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", "cjib", name));

describe("cjib routes", () => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cjib-routes-"));
  const app = buildStaffTestApp([UserPermission.MANAGE_FINES], (a) => registerFineRoutes(a, { requireAuth: (_r: any, _s: any, n: any) => n(), uploadsDir } as any));
  const rawPaths: string[] = [];
  let previousConfig: unknown;

  beforeAll(async () => {
    await cleanupPortalTestData();
    previousConfig = (await storage.getAppSettingByKey(CJIB_CONFIG_KEY))?.value;
    await createTestCustomer("CjibR");
    await createTestVehicle("PTCJ03");
  });
  afterAll(async () => {
    await cleanupPortalTestData();
    for (const p of rawPaths) fs.rmSync(p, { force: true });
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    if (previousConfig) await saveCjibConfig(previousConfig, "test"); else await saveCjibConfig({ enabled: false, host: "", password: "" }, "test");
    const notes = await storage.getCustomNotificationsByType("portal_fine_import");
    for (const n of notes) if (n.description.includes(TEST_PREFIX) || n.title.includes(TEST_PREFIX)) await storage.deleteCustomNotification(n.id);
  });

  it("imports an uploaded CSV and lists it", async () => {
    const res = await request(app).post("/api/fines/imports/upload").attach("file", fixture("beschikkingen.csv"), `${TEST_PREFIX}upload.csv`);
    expect(res.status).toBe(201);
    expect(res.body.skipped).toBe(false);
    expect(res.body.file).toMatchObject({ source: "cjib_upload", recordsTotal: 2, recordsCreated: 2 });
    rawPaths.push(res.body.file.rawPath);

    const again = await request(app).post("/api/fines/imports/upload").attach("file", fixture("beschikkingen.csv"), `${TEST_PREFIX}upload.csv`);
    expect(again.status).toBe(200);
    expect(again.body.skipped).toBe(true);

    const list = await request(app).get("/api/fines/imports");
    expect(list.status).toBe(200);
    expect(list.body.some((f: any) => f.id === res.body.file.id)).toBe(true);

    const fines = await request(app).get(`/api/fines?importFileId=${res.body.file.id}`);
    expect(fines.body).toHaveLength(2);

    const raw = await request(app).get(`/api/fines/imports/${res.body.file.id}/file`);
    expect(raw.status).toBe(200);
  });

  it("rejects a non CJIB file", async () => {
    const res = await request(app).post("/api/fines/imports/upload").attach("file", Buffer.from("x"), "brief.pdf");
    expect(res.status).toBe(400);
  });

  it("stores the config with a masked password and keeps it on re-save", async () => {
    const put = await request(app).put("/api/fines/cjib-config").send({ enabled: false, host: "ftps.example.test", port: 990, username: "lam", password: "geheim", inboxDir: "/out", pollMinutes: 30 });
    expect(put.status).toBe(200);
    expect(put.body.password).toBe(CJIB_PASSWORD_MASK);

    const get = await request(app).get("/api/fines/cjib-config");
    expect(get.body).toMatchObject({ host: "ftps.example.test", password: CJIB_PASSWORD_MASK, pollMinutes: 30 });

    await request(app).put("/api/fines/cjib-config").send({ ...get.body, pollMinutes: 45 });
    const setting = await storage.getAppSettingByKey(CJIB_CONFIG_KEY);
    expect((setting!.value as any).password).toBe("geheim");
    expect((setting!.value as any).pollMinutes).toBe(45);

    const bad = await request(app).put("/api/fines/cjib-config").send({ ...get.body, filePattern: "[" });
    expect(bad.status).toBe(400);
  });

  it("runs the poller with a fake FTPS server, imports matching files and moves them", async () => {
    const moved: string[] = [];
    setCjibFtpsClient({
      listInbox: async () => [{ name: `${TEST_PREFIX}run.xml`, size: 1, modifiedAt: null }, { name: "readme.txt", size: 1, modifiedAt: null }],
      download: async (_c, name) => (name.endsWith(".xml") ? fixture("beschikkingen.xml") : Buffer.from("no")),
      moveToProcessed: async (_c, name) => { moved.push(name); },
    });
    const res = await request(app).post("/api/fines/imports/run");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ trigger: "manual", files: 1, created: 2, errors: [] });
    expect(moved).toEqual([`${TEST_PREFIX}run.xml`]);
    const list = await request(app).get("/api/fines/imports");
    const row = list.body.find((f: any) => f.fileName === `${TEST_PREFIX}run.xml`);
    expect(row.source).toBe("cjib_ftps");
    rawPaths.push(row.rawPath);

    const status = await request(app).get("/api/fines/imports/status");
    expect(status.body.lastRun.files).toBe(1);
  });

  it("reports a connection failure in the run summary", async () => {
    setCjibFtpsClient({ listInbox: async () => { throw new Error("ECONNREFUSED"); }, download: async () => Buffer.alloc(0), moveToProcessed: async () => undefined });
    const res = await request(app).post("/api/fines/imports/run");
    expect(res.status).toBe(200);
    expect(res.body.errors[0]).toContain("ECONNREFUSED");
  });
});
