/**
 * C2 — the rest of the app-settings secrets work (docs/audit/13-app-settings-geheimen.md),
 * rebuilt on main 2026-10-29:
 *  - a read allowlist: without manage_settings only the rows an ordinary screen needs;
 *  - the SMTP password read as a mask and kept when the mask comes back;
 *  - a kept password never follows a changed host or user name — for SMTP, and
 *    (Kees 2026-10-29) for the invoice mailbox and CJIB as well.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";

import { registerAppSettingsRoutes } from "../routes/app-settings";
import { registerSettingsRoutes } from "../routes/settings";
import { registerExpenseInboxRoutes } from "../routes/expense-inbox";
import { registerFineRoutes } from "../routes/fines";
import { storage } from "../storage";
import { saveInvoiceInboxConfig } from "../services/invoice-inbox/config";
import { saveCjibConfig } from "../services/cjib/config";
import { INVOICE_INBOX_CONFIG_KEY, INVOICE_INBOX_PASSWORD_MASK, DEFAULT_INVOICE_INBOX_CONFIG } from "../../shared/invoice-inbox";
import { CJIB_CONFIG_KEY, CJIB_PASSWORD_MASK } from "../../shared/fines";
import { RDW_TYPE_REMAP_PLAN_KEY } from "../../shared/rdw-type-remap";
import {
  canReadAppSettingKey, keptPasswordWouldTravel, PUBLIC_APP_SETTING_KEYS, RETYPE_PASSWORD_CODE,
  RetypePasswordError, SMTP_PASSWORD_MASK,
} from "../utils/security/redactAppSetting";
import { UserPermission, UserRole } from "../../shared/schema";
import { buildStaffTestApp, TEST_PREFIX } from "./portal-helpers";

describe("C2: who may read which app setting", () => {
  it("gives the public keys to everyone and the rest only to manage_settings or an admin", () => {
    const plain = { role: "user", permissions: [] as string[] };
    for (const key of Array.from(PUBLIC_APP_SETTING_KEYS)) expect(canReadAppSettingKey(key, plain), key).toBe(true);
    for (const key of ["email_config", INVOICE_INBOX_CONFIG_KEY, CJIB_CONFIG_KEY, "portal_config", "missing_invoice_mail"]) {
      expect(canReadAppSettingKey(key, plain), key).toBe(false);
      expect(canReadAppSettingKey(key, { permissions: [UserPermission.MANAGE_SETTINGS] }), key).toBe(true);
      expect(canReadAppSettingKey(key, { role: UserRole.ADMIN, permissions: [] }), key).toBe(true);
    }
    expect(canReadAppSettingKey(RDW_TYPE_REMAP_PLAN_KEY, { permissions: [UserPermission.MANAGE_VEHICLES] })).toBe(true);
    expect(canReadAppSettingKey(RDW_TYPE_REMAP_PLAN_KEY, plain)).toBe(false);
    expect(canReadAppSettingKey(undefined, { role: UserRole.ADMIN })).toBe(false);
  });

  it("only refuses a kept password when the host or the user name changes", () => {
    const stored = { host: "smtp.lamgroep.nl", user: "kees", password: "geheim" };
    expect(keptPasswordWouldTravel(stored, { host: "SMTP.lamgroep.nl ", user: "kees" }, true)).toBe(false);
    expect(keptPasswordWouldTravel(stored, { host: "smtp.kaper.nl", user: "kees" }, true)).toBe(true);
    expect(keptPasswordWouldTravel(stored, { host: "smtp.lamgroep.nl", user: "Kees" }, true)).toBe(true);
    // A typed password is not kept, and with nothing stored nothing can travel.
    expect(keptPasswordWouldTravel(stored, { host: "smtp.kaper.nl", user: "kees" }, false)).toBe(false);
    expect(keptPasswordWouldTravel({ ...stored, password: "" }, { host: "smtp.kaper.nl", user: "kees" }, true)).toBe(false);
  });
});

describe("C2: the generic settings routes", () => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-secrets-"));
  const deps = { upload: undefined, uploadsDir, requireAuth: (_r: any, _s: any, n: any) => n() } as any;
  const nobody = buildStaffTestApp([], (a) => registerAppSettingsRoutes(a, deps));
  const admin = buildStaffTestApp(
    [UserPermission.MANAGE_SETTINGS, UserPermission.MANAGE_BACKUPS],
    (a) => { registerAppSettingsRoutes(a, deps); registerSettingsRoutes(a, deps); },
  );

  const key = `${TEST_PREFIX}email_c2`;
  const stored = { fromEmail: "a@b.nl", smtpHost: "smtp.b.nl", smtpPort: "587", smtpUser: "kees", smtpPassword: "smtp-geheim" };
  let id: number;
  const storedPassword = async () => ((await storage.getAppSetting(id))!.value as any).smtpPassword;

  beforeAll(async () => {
    id = (await storage.createAppSetting({ key, value: stored, category: "email", description: "C2 test", createdBy: "test", updatedBy: "test" })).id;
  });
  afterAll(async () => { await storage.deleteAppSetting(id); });

  it("hands an account without manage_settings only the public rows", async () => {
    const list = await request(nobody).get("/api/app-settings");
    expect(list.status).toBe(200);
    for (const row of list.body) expect(PUBLIC_APP_SETTING_KEYS.has(row.key), row.key).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain("smtp.b.nl");

    expect((await request(nobody).get(`/api/app-settings/key/${key}`)).status).toBe(404);
    expect((await request(nobody).get("/api/app-settings/key/business_rules")).status).toBe(200);
    expect((await request(admin).get(`/api/app-settings/key/${key}`)).body.value.smtpHost).toBe("smtp.b.nl");
  });

  it("shows the SMTP password as a mask on every read", async () => {
    for (const url of ["/api/app-settings", "/api/app-settings/email", `/api/app-settings/key/${key}`, "/api/settings", `/api/settings/${id}`]) {
      const res = await request(admin).get(url);
      expect(JSON.stringify(res.body), url).not.toContain("smtp-geheim");
      const row = Array.isArray(res.body) ? res.body.find((s: any) => s.key === key) : res.body;
      expect(row.value.smtpPassword, url).toBe(SMTP_PASSWORD_MASK);
    }
  });

  it("keeps the stored password behind the mask, for the same host and user name only", async () => {
    const same = await request(admin).put(`/api/app-settings/${id}`).send({ key, category: "email", value: { ...stored, smtpHost: "SMTP.B.NL", smtpPassword: SMTP_PASSWORD_MASK } });
    expect(same.status).toBe(200);
    expect(await storedPassword()).toBe("smtp-geheim");

    for (const changed of [{ smtpHost: "smtp.kaper.nl" }, { smtpUser: "iemand" }]) {
      const value = { ...stored, ...changed, smtpPassword: SMTP_PASSWORD_MASK };
      for (const res of [
        await request(admin).put(`/api/app-settings/${id}`).send({ key, category: "email", value }),
        await request(admin).post("/api/app-settings").send({ key, category: "email", value }),
        await request(admin).patch(`/api/settings/${id}`).send({ value }),
        await request(admin).put(`/api/app-settings/${id}`).send({ key, category: "email", value: { ...value, smtpPassword: "" } }),
      ]) {
        expect(res.status).toBe(400);
        expect(res.body.code).toBe(RETYPE_PASSWORD_CODE);
      }
      expect(await storedPassword()).toBe("smtp-geheim");
      expect(((await storage.getAppSetting(id))!.value as any).smtpHost).toBe("SMTP.B.NL");
    }

    // A typed password may go along with a new host.
    const typed = await request(admin).put(`/api/app-settings/${id}`).send({ key, category: "email", value: { ...stored, smtpHost: "smtp.nieuw.nl", smtpPassword: "nieuw-geheim" } });
    expect(typed.status).toBe(200);
    expect(await storedPassword()).toBe("nieuw-geheim");
    await storage.updateAppSetting(id, { value: stored });
  });

  it("keeps the stored password through PATCH /api/settings and never stores the mask", async () => {
    const res = await request(admin).patch(`/api/settings/${id}`).send({ value: { ...stored, fromName: "Lam", smtpPassword: SMTP_PASSWORD_MASK } });
    expect(res.status).toBe(200);
    expect(await storedPassword()).toBe("smtp-geheim");

    const newKey = `${TEST_PREFIX}email_c2_new`;
    const created = await request(admin).post("/api/app-settings").send({ key: newKey, category: "email", value: { ...stored, smtpPassword: SMTP_PASSWORD_MASK } });
    try {
      expect(created.status).toBe(200);
      expect(((await storage.getAppSettingByKey(newKey))!.value as any).smtpPassword).toBe("");
    } finally {
      const row = await storage.getAppSettingByKey(newKey);
      if (row) await storage.deleteAppSetting(row.id);
    }
  });

  it("does not test the stored password against another host", async () => {
    const res = await request(admin).post("/api/app-settings/email/test").send({ id, smtpHost: "smtp.kaper.nl", smtpUser: "kees", smtpPassword: SMTP_PASSWORD_MASK });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(RETYPE_PASSWORD_CODE);
    // Without the id the mask is no password at all.
    const noId = await request(admin).post("/api/app-settings/email/test").send({ smtpHost: "smtp.b.nl", smtpUser: "kees", smtpPassword: SMTP_PASSWORD_MASK });
    expect(noId.status).toBe(400);
  });
});

describe("C2: the invoice mailbox and CJIB keep their password for the same host only", () => {
  const settings = buildStaffTestApp([UserPermission.MANAGE_SETTINGS], (a) => registerExpenseInboxRoutes(a));
  const fines = buildStaffTestApp([UserPermission.MANAGE_FINES], (a) => registerFineRoutes(a, { requireAuth: (_r: any, _s: any, n: any) => n(), uploadsDir: os.tmpdir() } as any));
  let previousInbox: unknown;
  let previousCjib: unknown;

  beforeAll(async () => {
    previousInbox = (await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY))?.value;
    previousCjib = (await storage.getAppSettingByKey(CJIB_CONFIG_KEY))?.value;
    await saveInvoiceInboxConfig({ host: "imap.example.test", username: "fakturenapp@lamgroep.nl", password: "imap-geheim" }, "test");
    await saveCjibConfig({ host: "ftps.cjib.nl", username: "lam", password: "cjib-geheim" }, "test");
  });
  afterAll(async () => {
    await saveInvoiceInboxConfig(previousInbox ?? { ...DEFAULT_INVOICE_INBOX_CONFIG }, "test");
    await saveCjibConfig(previousCjib ?? { enabled: false, host: "", password: "" }, "test");
  });

  const inboxPassword = async () => ((await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY))!.value as any).password;
  const cjibPassword = async () => ((await storage.getAppSettingByKey(CJIB_CONFIG_KEY))!.value as any).password;

  it("refuses the mask with another host or user name, and keeps it otherwise", async () => {
    await expect(saveInvoiceInboxConfig({ host: "imap.kaper.test", username: "fakturenapp@lamgroep.nl", password: INVOICE_INBOX_PASSWORD_MASK }, "test")).rejects.toBeInstanceOf(RetypePasswordError);
    await expect(saveInvoiceInboxConfig({ host: "imap.example.test", username: "iemand", password: INVOICE_INBOX_PASSWORD_MASK }, "test")).rejects.toBeInstanceOf(RetypePasswordError);
    await expect(saveCjibConfig({ host: "ftps.kaper.nl", username: "lam", password: CJIB_PASSWORD_MASK }, "test")).rejects.toBeInstanceOf(RetypePasswordError);
    expect(await inboxPassword()).toBe("imap-geheim");
    expect(await cjibPassword()).toBe("cjib-geheim");

    await saveInvoiceInboxConfig({ host: "imap.example.test", username: "fakturenapp@lamgroep.nl", password: INVOICE_INBOX_PASSWORD_MASK, pollMinutes: 30 }, "test");
    expect(await inboxPassword()).toBe("imap-geheim");
  });

  it("answers the refusal with a 400 and its code on the two screens' routes", async () => {
    const inbox = await request(settings).put("/api/expenses/inbox/config").send({ host: "imap.kaper.test", username: "fakturenapp@lamgroep.nl", password: INVOICE_INBOX_PASSWORD_MASK });
    expect(inbox.status).toBe(400);
    expect(inbox.body.code).toBe(RETYPE_PASSWORD_CODE);

    const cjib = await request(fines).put("/api/fines/cjib-config").send({ host: "ftps.kaper.nl", username: "lam", password: CJIB_PASSWORD_MASK });
    expect(cjib.status).toBe(400);
    expect(cjib.body.code).toBe(RETYPE_PASSWORD_CODE);

    const test = await request(fines).post("/api/fines/cjib-config/test").send({ host: "ftps.kaper.nl", username: "lam", password: CJIB_PASSWORD_MASK });
    expect(test.status).toBe(400);
    expect(test.body.code).toBe(RETYPE_PASSWORD_CODE);
    expect(await cjibPassword()).toBe("cjib-geheim");
  });
});
