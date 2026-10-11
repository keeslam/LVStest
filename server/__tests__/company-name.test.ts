/**
 * D15 (besluiten B-41/B-42, ontwerp 12) — één instelling "Bedrijfsnaam"
 * (`company_name`, standaard "Autolease Lam") voor alle mails: de herinneringen
 * in email-templates-i18n, de standaard afzendernaam en de portaalmails (die
 * tot nu toe "Lam Groep" zeiden).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
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

  describe("portaalsjablonen die nog de oude tekst hebben", () => {
    const name = PORTAL_TEMPLATE.RESERVATION_CANCELLED;
    let before: typeof emailTemplates.$inferSelect | undefined;

    /** A row exactly as an earlier release seeded it: the literal "Lam Groep" instead of {{companyName}}. */
    async function seedLegacyRow() {
      await db.delete(emailTemplates).where(eq(emailTemplates.name, name));
      await ensurePortalEmailTemplates();
      const [fresh] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name));
      expect(fresh.content).toContain("{{companyName}}");
      await db.update(emailTemplates).set({
        content: fresh.content.split("{{companyName}}").join("Lam Groep"),
        subject: fresh.subject.split("{{companyName}}").join("Lam Groep"),
      }).where(eq(emailTemplates.name, name));
    }
    const row = async () => (await db.select().from(emailTemplates).where(eq(emailTemplates.name, name)))[0];

    beforeAll(async () => { [before] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name)); });
    afterEach(async () => {
      if (before) await db.update(emailTemplates).set({ content: before.content, subject: before.subject }).where(eq(emailTemplates.name, name));
    });

    it("blijven ongemoeid zolang er geen bedrijfsnaam is ingesteld (de portaalmails blijven Lam Groep zeggen)", async () => {
      await seedLegacyRow();
      await ensurePortalEmailTemplates();
      expect((await row()).content).toContain("Lam Groep");
      expect((await row()).content).not.toContain("{{companyName}}");
    });

    it("volgen de instelling zodra de naam voor het eerst wordt opgeslagen, met een logregel met het aantal", async () => {
      await seedLegacyRow();
      const log = vi.spyOn(console, "log");
      try {
        const res = await save("Garage Voorbeeld");
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect((await row()).content).toContain("{{companyName}}");
        expect((await row()).subject).not.toContain("Lam Groep");
        // One line with the number of rewritten rows (other legacy rows of the shared test database count too).
        expect(log.mock.calls.some(([line]) => typeof line === "string" && /portal e-mail templates: [1-9][0-9]* unedited/.test(line))).toBe(true);
      } finally {
        log.mockRestore();
      }
    });

    it("volgen de instelling ook bij het opstarten als de naam al is opgeslagen", async () => {
      await save("Garage Voorbeeld");
      await seedLegacyRow();
      await ensurePortalEmailTemplates();
      expect((await row()).content).toContain("{{companyName}}");
      expect((await row()).content).not.toContain("Lam Groep");
    });

    it("een door medewerkers aangepast sjabloon blijft staan", async () => {
      await save("Garage Voorbeeld");
      await seedLegacyRow();
      await db.update(emailTemplates).set({ content: "Aangepast door Lam Groep" }).where(eq(emailTemplates.name, name));
      await ensurePortalEmailTemplates();
      await save("Tweede Naam");
      expect((await row()).content).toBe("Aangepast door Lam Groep");
    });
  });

  it("de standaard afzendernaam volgt een gewijzigde bedrijfsnaam meteen (config-cache wordt geleegd)", async () => {
    await save("Eerste Naam");
    const stored = await storage.getAppSettingByKey("email_config");
    const value = JSON.stringify({ fromEmail: "noreply@fixture-test.invalid", smtpHost: "127.0.0.1", smtpPort: "2525", smtpUser: "u", smtpPassword: "p" });
    try {
      if (stored) await storage.updateAppSetting(stored.id, { value: value as any, category: "email" });
      else await storage.createAppSetting({ key: "email_config", value, category: "email", description: "FIXT" } as any);
      clearEmailConfigCache();
      expect((await resolveEmailConfig())?.fromName).toBe("Eerste Naam");
      await save("Tweede Naam"); // no clearEmailConfigCache() here: the save does it
      expect((await resolveEmailConfig())?.fromName).toBe("Tweede Naam");
    } finally {
      const row = await storage.getAppSettingByKey("email_config");
      if (row && stored) await storage.updateAppSetting(row.id, { value: stored.value as any, category: stored.category });
      else if (row) await db.delete(appSettings).where(eq(appSettings.id, row.id));
      clearEmailConfigCache();
    }
  });

  it("na 60 seconden leest companyName() de instelling opnieuw (fake Date)", async () => {
    await save("Eerste Naam");
    const row = await storage.getAppSettingByKey(KEY);
    await storage.updateAppSetting(row!.id, { value: "Tweede Naam" as any });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 59_000);
      expect(companyName()).toBe("Eerste Naam");
      vi.setSystemTime(Date.now() + 2_000);
      expect(companyName()).toBe("Eerste Naam"); // stale answer, reload started
      expect(await loadCompanyName()).toBe("Tweede Naam");
      expect(companyName()).toBe("Tweede Naam");
    } finally {
      vi.useRealTimers();
    }
  });

  it("een opslag tijdens een lopende herlezing laat de cache niet op de oude naam staan", async () => {
    await save("Eerste Naam");
    const row = await storage.getAppSettingByKey(KEY);
    const slowOld = vi.spyOn(storage, "getAppSettingByKey").mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { ...row!, value: "Eerste Naam" as any };
    });
    const running = loadCompanyName();
    await db.update(appSettings).set({ value: "Tweede Naam" as any }).where(eq(appSettings.key, KEY));
    expect(await loadCompanyName()).toBe("Tweede Naam");
    await running;
    expect(companyName()).toBe("Tweede Naam");
    slowOld.mockRestore();
  });
});
