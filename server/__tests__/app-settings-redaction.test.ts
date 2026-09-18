/**
 * C1 — the IMAP password of the invoice mailbox (and the CJIB one) used to be
 * readable through the *generic* settings routes: `GET
 * /api/app-settings/key/invoice_inbox_config` needs only a session and returned
 * the row verbatim, password and all. Both keys are now masked on every GET
 * that hands out app settings, and refused on every generic write, so their own
 * screens stay the only writers (validation, masking and audit included).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";

import { registerAppSettingsRoutes } from "../routes/app-settings";
import { registerSettingsRoutes } from "../routes/settings";
import { storage } from "../storage";
import { saveInvoiceInboxConfig } from "../services/invoice-inbox/config";
import { saveCjibConfig } from "../services/cjib/config";
import { INVOICE_INBOX_CONFIG_KEY, INVOICE_INBOX_PASSWORD_MASK, DEFAULT_INVOICE_INBOX_CONFIG } from "../../shared/invoice-inbox";
import { CJIB_CONFIG_KEY, CJIB_PASSWORD_MASK } from "../../shared/fines";
import { MANAGED_SETTING_MESSAGE } from "../utils/security/redactAppSetting";
import { UserPermission } from "../../shared/schema";
import { buildStaffTestApp, TEST_PREFIX } from "./portal-helpers";

const SECRET = "geheim-imap";
const CJIB_SECRET = "geheim-cjib";
const UNRELATED_KEY = `${TEST_PREFIX}redaction_probe`;

describe("app settings redaction", () => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-redaction-"));
  const deps = { upload: undefined, uploadsDir, requireAuth: (_r: any, _s: any, n: any) => n() } as any;

  // The two requireAuth-only routes get an account with no permission at all;
  // everything else needs manage_settings (and manage_backups for the
  // /api/settings writes, which is what guards those today).
  const nobody = buildStaffTestApp([], (a) => registerAppSettingsRoutes(a, deps));
  const admin = buildStaffTestApp(
    [UserPermission.MANAGE_SETTINGS, UserPermission.MANAGE_BACKUPS],
    (a) => { registerAppSettingsRoutes(a, deps); registerSettingsRoutes(a, deps); },
  );

  let previousInbox: unknown;
  let previousCjib: unknown;
  let inboxId: number;
  let cjibId: number;
  let unrelatedId: number;

  beforeAll(async () => {
    previousInbox = (await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY))?.value;
    previousCjib = (await storage.getAppSettingByKey(CJIB_CONFIG_KEY))?.value;
    await saveInvoiceInboxConfig({ host: "imap.example.test", username: "fakturenapp@lamgroep.nl", password: SECRET }, "test");
    await saveCjibConfig({ host: "ftps.cjib.nl", username: "lam", password: CJIB_SECRET }, "test");
    inboxId = (await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY))!.id;
    cjibId = (await storage.getAppSettingByKey(CJIB_CONFIG_KEY))!.id;
    const unrelated = await storage.createAppSetting({
      key: UNRELATED_KEY, value: { greeting: "hallo" }, category: "expenses",
      description: "redaction test", createdBy: "test", updatedBy: "test",
    });
    unrelatedId = unrelated.id;
  });

  afterAll(async () => {
    await storage.deleteAppSetting(unrelatedId);
    await saveInvoiceInboxConfig(previousInbox ?? { ...DEFAULT_INVOICE_INBOX_CONFIG }, "test");
    await saveCjibConfig(previousCjib ?? { enabled: false, host: "", password: "" }, "test");
  });

  const rowFor = (body: any, key: string) => (Array.isArray(body) ? body.find((s: any) => s.key === key) : body);

  it("masks both managed passwords on every GET that hands out app settings", async () => {
    const gets: Array<[string, any]> = [
      ["/api/app-settings", nobody],
      [`/api/app-settings/key/${INVOICE_INBOX_CONFIG_KEY}`, nobody],
      [`/api/app-settings/key/${CJIB_CONFIG_KEY}`, nobody],
      ["/api/app-settings/expenses", admin],
      ["/api/app-settings/portal", admin],
      ["/api/settings", admin],
      ["/api/settings/category/expenses", admin],
      ["/api/settings/category/portal", admin],
      [`/api/settings/key/${INVOICE_INBOX_CONFIG_KEY}`, admin],
      [`/api/settings/key/${CJIB_CONFIG_KEY}`, admin],
      [`/api/settings/${inboxId}`, admin],
      [`/api/settings/${cjibId}`, admin],
    ];
    for (const [url, app] of gets) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(200);
      expect(JSON.stringify(res.body), url).not.toContain(SECRET);
      expect(JSON.stringify(res.body), url).not.toContain(CJIB_SECRET);
    }

    const list = await request(nobody).get("/api/app-settings");
    expect(rowFor(list.body, INVOICE_INBOX_CONFIG_KEY).value.password).toBe(INVOICE_INBOX_PASSWORD_MASK);
    expect(rowFor(list.body, CJIB_CONFIG_KEY).value.password).toBe(CJIB_PASSWORD_MASK);
    const byKey = await request(nobody).get(`/api/app-settings/key/${INVOICE_INBOX_CONFIG_KEY}`);
    expect(byKey.body.value.password).toBe(INVOICE_INBOX_PASSWORD_MASK);
    expect(byKey.body.value.host).toBe("imap.example.test");
  });

  it("leaves an empty password empty instead of inventing a mask", async () => {
    await saveInvoiceInboxConfig({ host: "imap.example.test", username: "u", password: "" }, "test");
    const res = await request(nobody).get(`/api/app-settings/key/${INVOICE_INBOX_CONFIG_KEY}`);
    expect(res.body.value.password).toBe("");
    await saveInvoiceInboxConfig({ host: "imap.example.test", username: "fakturenapp@lamgroep.nl", password: SECRET }, "test");
  });

  it("refuses every generic write to the two managed keys, and changes nothing", async () => {
    const writes: Array<[string, string, any]> = [
      ["post", "/api/app-settings", { key: INVOICE_INBOX_CONFIG_KEY, value: { password: "kaper" }, category: "expenses" }],
      ["post", "/api/app-settings", { key: CJIB_CONFIG_KEY, value: { password: "kaper" }, category: "portal" }],
      ["put", `/api/app-settings/${inboxId}`, { value: { password: "kaper" } }],
      ["put", `/api/app-settings/${cjibId}`, { value: { password: "kaper" } }],
      ["delete", `/api/app-settings/${inboxId}`, {}],
      ["delete", `/api/app-settings/${cjibId}`, {}],
      ["post", "/api/settings", { key: INVOICE_INBOX_CONFIG_KEY, value: { password: "kaper" } }],
      ["patch", `/api/settings/${inboxId}`, { value: { password: "kaper" } }],
      ["patch", `/api/settings/${cjibId}`, { value: { password: "kaper" } }],
      ["delete", `/api/settings/${inboxId}`, {}],
      ["delete", `/api/settings/${cjibId}`, {}],
    ];
    for (const [method, url, body] of writes) {
      const res = await (request(admin) as any)[method](url).send(body);
      expect(res.status, `${method} ${url}`).toBe(403);
      expect(res.body.error, `${method} ${url}`).toBe(MANAGED_SETTING_MESSAGE);
    }

    const inbox = await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY);
    expect((inbox!.value as any).password).toBe(SECRET);
    expect((inbox!.value as any).host).toBe("imap.example.test");
    const cjib = await storage.getAppSettingByKey(CJIB_CONFIG_KEY);
    expect((cjib!.value as any).password).toBe(CJIB_SECRET);
  });

  it("blanks the SMTP password on read and keeps the stored one when it is saved back empty", async () => {
    const key = `${TEST_PREFIX}email_probe`;
    const created = await storage.createAppSetting({
      key, value: { fromEmail: "a@b.nl", smtpHost: "smtp.b.nl", smtpPassword: "smtp-geheim" },
      category: "email", description: "redaction test", createdBy: "test", updatedBy: "test",
    });
    try {
      const read = await request(admin).get("/api/app-settings/email");
      const row = rowFor(read.body, key);
      expect(row.value.smtpPassword).toBe("");

      // Saving the blanked value back must not wipe the working configuration.
      const written = await request(admin).put(`/api/app-settings/${created.id}`).send({ key, category: "email", value: row.value });
      expect(((await storage.getAppSetting(created.id))!.value as any).smtpPassword).toBe("smtp-geheim");
      // …and the answer must not hand the merged password straight back.
      expect(JSON.stringify(written.body)).not.toContain("smtp-geheim");
      expect(written.body.value.smtpPassword).toBe("");

      const upserted = await request(admin).post("/api/app-settings").send({ key, category: "email", value: row.value });
      expect(JSON.stringify(upserted.body)).not.toContain("smtp-geheim");

      // A password the admin really typed still replaces it.
      await request(admin).put(`/api/app-settings/${created.id}`).send({ key, category: "email", value: { ...row.value, smtpPassword: "nieuw" } });
      expect(((await storage.getAppSetting(created.id))!.value as any).smtpPassword).toBe("nieuw");
    } finally {
      await storage.deleteAppSetting(created.id);
    }
  });

  it("still lets an unrelated setting round-trip through the generic routes", async () => {
    const res = await request(admin).put(`/api/app-settings/${unrelatedId}`).send({
      key: UNRELATED_KEY, value: { greeting: "goedendag" }, category: "expenses",
    });
    expect(res.status).toBe(200);
    const read = await request(nobody).get(`/api/app-settings/key/${UNRELATED_KEY}`);
    expect(read.body.value).toEqual({ greeting: "goedendag" });
  });
});
