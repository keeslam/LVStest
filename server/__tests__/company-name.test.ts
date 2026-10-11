/**
 * D15 (besluiten B-41/B-42, ontwerp 12) — één instelling "Bedrijfsnaam"
 * (`company_name`, standaard "Autolease Lam") voor alle mails: de herinneringen
 * in email-templates-i18n, de standaard afzendernaam en de portaalmails (die
 * tot nu toe "Lam Groep" zeiden).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { appSettings, emailTemplates } from "../../shared/schema";
import { storage } from "../storage";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { companyName, loadCompanyName } from "../services/company-name";
import {
  getApkReminderTemplate,
  getMaintenanceReminderTemplate,
  getCustomMessageTemplate,
} from "../utils/email-templates-i18n";
import { renderTemplate, renderTemplateText, ensurePortalEmailTemplates, PORTAL_TEMPLATE } from "../services/portal-mail";
import { resolveEmailConfig, clearEmailConfigCache } from "../utils/email-service";

const KEY = "company_name";
let admin: TestAgent;

async function clearSetting() {
  await db.delete(appSettings).where(eq(appSettings.key, KEY));
  await loadCompanyName();
}
const save = (value: unknown) =>
  admin.post("/api/app-settings").send({ key: KEY, value, category: "business", description: "Bedrijfsnaam" });

beforeAll(async () => {
  admin = await agentFor("admin");
  await clearSetting();
}, 60_000);
afterEach(clearSetting);
afterAll(async () => {
  await clearSetting();
  await cleanupFixtureUsers();
});

describe("company_name: de instelling", () => {
  it("staat zonder rij op Autolease Lam", async () => {
    expect(companyName()).toBe("Autolease Lam");
  });

  it("opslaan werkt direct door en is leesbaar voor elke gebruiker", async () => {
    const res = await save("Garage Voorbeeld");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(companyName()).toBe("Garage Voorbeeld");
    const nobody = await agentFor([]);
    const read = await nobody.get(`/api/app-settings/key/${KEY}`);
    expect(read.body.value).toBe("Garage Voorbeeld");
  });

  it.each([["", "leeg"], ["   ", "alleen spaties"], ["x".repeat(101), "te lang"], ["Naam\r\nBcc: a@b.c", "regeleinde"], [42, "geen tekst"]])(
    "weigert %j (%s) met een vaste code",
    async (value) => {
      const res = await save(value);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_COMPANY_NAME");
      expect(companyName()).toBe("Autolease Lam");
    },
  );
});

describe("de bedrijfsnaam staat in de mails", () => {
  it("de herinneringen (nl en en) noemen de naam uit de instelling", async () => {
    await save("Garage Voorbeeld");
    const all = [
      getApkReminderTemplate("Jan", "AB-123-C", "01-01-2027", "nl", companyName()),
      getApkReminderTemplate("Jan", "AB-123-C", "01-01-2027", "en", companyName()),
      getMaintenanceReminderTemplate("Jan", "AB-123-C", "Beurt", "nl", companyName()),
      getMaintenanceReminderTemplate("Jan", "AB-123-C", "Beurt", "en", companyName()),
      getCustomMessageTemplate("Jan", "AB-123-C", "Hallo", "nl", undefined, companyName()),
      getCustomMessageTemplate("Jan", "AB-123-C", "Hallo", "en", undefined, companyName()),
    ];
    for (const t of all) {
      expect(t.html).toContain("Garage Voorbeeld");
      expect(t.text).toContain("Garage Voorbeeld");
      expect(t.html + t.text).not.toContain("Autolease Lam");
    }
  });

  it("zonder naam meegegeven blijft de standaard Autolease Lam (aanroepen zonder instelling)", () => {
    expect(getApkReminderTemplate("Jan", "AB-123-C", "01-01-2027", "nl").html).toContain("Autolease Lam");
  });

  it("de naam in de html-versie wordt ge-escaped", () => {
    const t = getApkReminderTemplate("Jan", "AB-123-C", "01-01-2027", "nl", "A <b>&</b> B");
    expect(t.html).toContain("A &lt;b&gt;&amp;&lt;/b&gt; B");
    expect(t.text).toContain("A <b>&</b> B");
  });

  it("de standaard afzendernaam is de bedrijfsnaam, een ingestelde afzendernaam wint", async () => {
    await save("Garage Voorbeeld");
    const stored = await storage.getAppSettingByKey("email_config");
    const base = { fromEmail: "noreply@fixture-test.invalid", smtpHost: "127.0.0.1", smtpPort: "2525", smtpUser: "u", smtpPassword: "p" };
    const put = async (value: object) => {
      const row = await storage.getAppSettingByKey("email_config");
      if (row) await storage.updateAppSetting(row.id, { value: JSON.stringify(value) as any, category: "email" });
      else await storage.createAppSetting({ key: "email_config", value: JSON.stringify(value), category: "email", description: "FIXT" } as any);
      clearEmailConfigCache();
    };
    try {
      await put(base);
      expect((await resolveEmailConfig())?.fromName).toBe("Garage Voorbeeld");
      await put({ ...base, fromName: "Eigen Naam" });
      expect((await resolveEmailConfig())?.fromName).toBe("Eigen Naam");
    } finally {
      const row = await storage.getAppSettingByKey("email_config");
      if (row && stored) await storage.updateAppSetting(row.id, { value: stored.value as any, category: stored.category });
      else if (row) await db.delete(appSettings).where(eq(appSettings.id, row.id));
      clearEmailConfigCache();
    }
  });

  it("portaalsjablonen: {{companyName}} wordt de naam, ook in een onderwerp", async () => {
    await save("Garage Voorbeeld");
    expect(renderTemplate("Hallo van {{companyName}}", {})).toBe("Hallo van Garage Voorbeeld");
    expect(renderTemplateText("Van {{companyName}} & co", {})).toBe("Van Garage Voorbeeld & co");
    // an explicit value for the key still wins
    expect(renderTemplate("{{companyName}}", { companyName: "X" })).toBe("X");
  });

  it("de standaard portaalsjablonen gebruiken de plekhouder en onaangepaste oude sjablonen volgen mee", async () => {
    const name = PORTAL_TEMPLATE.RESERVATION_CANCELLED;
    const [before] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name));
    try {
      // The row as an earlier release seeded it: the literal "Lam Groep".
      await db.delete(emailTemplates).where(eq(emailTemplates.name, name));
      await ensurePortalEmailTemplates();
      const [fresh] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name));
      expect(fresh.content).toContain("{{companyName}}");
      const legacy = fresh.content.replace(/{{companyName}}/g, "Lam Groep");
      await db.update(emailTemplates).set({ content: legacy }).where(eq(emailTemplates.name, name));
      await ensurePortalEmailTemplates();
      const [after] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name));
      expect(after.content).toContain("{{companyName}}");
      expect(after.content).not.toContain("Lam Groep");

      // A template staff edited themselves is left alone.
      await db.update(emailTemplates).set({ content: "Aangepast door Lam Groep" }).where(eq(emailTemplates.name, name));
      await ensurePortalEmailTemplates();
      const [edited] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name));
      expect(edited.content).toBe("Aangepast door Lam Groep");
    } finally {
      if (before) await db.update(emailTemplates).set({ content: before.content, subject: before.subject }).where(eq(emailTemplates.name, name));
    }
  });
});
