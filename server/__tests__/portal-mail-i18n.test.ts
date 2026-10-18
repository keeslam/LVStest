/**
 * Portal mails in the recipient's language (Kees, 2026-10-18: one stored template per language).
 *
 * The account's own language comes first, then the company's preferred language, then Dutch. A
 * language whose row is missing gets the Dutch row, and the values filled in (dates, amounts,
 * request labels, maintenance events) follow the language the template turned out to be in.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
vi.mock("../services/portal-config", () => ({
  getPortalConfig: async () => ({
    allowedFrameOrigins: [], notificationEmail: "", portalBaseUrl: "https://portaal.lamgroep.nl",
    pickupAddress: "Teststraat 1", openingHours: "8-17",
  }),
}));

import { db } from "../db";
import { customers, emailTemplates } from "../../shared/schema";
import { eq, like } from "drizzle-orm";
import {
  DEFAULT_TEMPLATES, ensurePortalEmailTemplates, getPortalTemplate, portalTemplateName, sendPortalInvite,
  sendFineLinkedMailDetailed, sendMaintenanceMail, sendRequestReplyMail, PORTAL_TEMPLATE,
} from "../services/portal-mail";
import { CUSTOMER_TEMPLATE_NAMES, TRANSLATED_TEMPLATES, PORTAL_MAIL_PHRASES } from "../services/portal-mail-texts";
import { SUPPORTED_LANGUAGES } from "../../shared/languages";
import { portalStorage } from "../services/portal-storage";
import { finesStorage } from "../services/fines-storage";
import { requestsStorage } from "../services/portal-requests-storage";
import { createTestCustomer, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";

const placeholders = (text: string) => [...new Set(text.match(/\{\{\w+\}\}/g) ?? [])].sort();
const lastMail = () => sendEmail.mock.calls.at(-1)![0] as unknown as { to: string; subject: string; html: string; text: string };

async function customerIn(language: string, name: string) {
  const c = await createTestCustomer(name);
  await db.update(customers).set({ preferredLanguage: language }).where(eq(customers.id, c.id));
  return c;
}

describe("portal mail texts", () => {
  it("has every customer template in every language, with the Dutch placeholders", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      if (language === "nl") continue;
      for (const name of CUSTOMER_TEMPLATE_NAMES) {
        const dutch = DEFAULT_TEMPLATES.find((t) => t.name === name)!;
        const translated = TRANSLATED_TEMPLATES[language][name];
        expect(placeholders(translated.subject), `${name}.${language} subject`).toEqual(placeholders(dutch.subject));
        expect(placeholders(translated.content), `${name}.${language} content`).toEqual(placeholders(dutch.content));
      }
    }
  });

  it("words every request type, status and maintenance event in every language", () => {
    const nl = PORTAL_MAIL_PHRASES.nl;
    for (const language of SUPPORTED_LANGUAGES) {
      const phrases = PORTAL_MAIL_PHRASES[language];
      expect(Object.keys(phrases.requestType).sort()).toEqual(Object.keys(nl.requestType).sort());
      expect(Object.keys(phrases.requestStatus).sort()).toEqual(Object.keys(nl.requestStatus).sort());
      expect(Object.keys(phrases.maintenanceEvent).sort()).toEqual(Object.keys(nl.maintenanceEvent).sort());
    }
  });
});

describe("portal mail per language", () => {
  beforeAll(async () => { await cleanupPortalTestData(); await ensurePortalEmailTemplates(); });
  afterAll(async () => { await cleanupPortalTestData(); await ensurePortalEmailTemplates(); });
  beforeEach(() => sendEmail.mockClear());

  it("seeds one row per language, and the staff notification in Dutch only", async () => {
    const rows = await db.select({ name: emailTemplates.name, category: emailTemplates.category })
      .from(emailTemplates).where(like(emailTemplates.name, "portal_invite%"));
    const names = rows.map((r) => r.name);
    for (const language of SUPPORTED_LANGUAGES) expect(names).toContain(portalTemplateName("portal_invite", language));
    expect(rows.every((r) => r.category === "portal")).toBe(true);
    const staff = await db.select({ name: emailTemplates.name }).from(emailTemplates).where(like(emailTemplates.name, `${PORTAL_TEMPLATE.STAFF}.%`));
    expect(staff).toEqual([]);
  });

  it("writes the invitation in the account's own language", async () => {
    const c = await customerIn("nl", "I18nOwn");
    const user = await portalStorage.createPortalUser({ customerId: c.id, email: `own@${TEST_EMAIL_DOMAIN}`, fullName: "Ana", role: "admin" }, "t");
    await portalStorage.updatePortalUser(user.id, { language: "es" });
    await sendPortalInvite((await portalStorage.getPortalUser(user.id))!, "invite");
    expect(lastMail().subject).toContain("Su cuenta en el portal de clientes");
    expect(lastMail().html).toContain("Estimado/a Ana:");
  });

  it("follows the company's preferred language when the account has none", async () => {
    const c = await customerIn("pl", "I18nCompany");
    const user = await portalStorage.createPortalUser({ customerId: c.id, email: `company@${TEST_EMAIL_DOMAIN}`, fullName: "Jan", role: "admin" }, "t");
    await sendPortalInvite(user, "reset");
    expect(lastMail().subject).toContain("Ustawienie nowego hasła");
  });

  it("stays Dutch for a Dutch company and an account without a language", async () => {
    const c = await customerIn("nl", "I18nDutch");
    const user = await portalStorage.createPortalUser({ customerId: c.id, email: `dutch@${TEST_EMAIL_DOMAIN}`, fullName: "Piet", role: "admin" }, "t");
    await sendPortalInvite(user, "invite");
    expect(lastMail().html).toContain("Beste Piet,");
  });

  it("falls back to the Dutch row when a language's row is missing", async () => {
    const c = await customerIn("it", "I18nMissing");
    const user = await portalStorage.createPortalUser({ customerId: c.id, email: `missing@${TEST_EMAIL_DOMAIN}`, fullName: "Luca", role: "admin" }, "t");
    await db.delete(emailTemplates).where(eq(emailTemplates.name, "portal_invite.it"));
    try {
      expect((await getPortalTemplate(PORTAL_TEMPLATE.INVITE, "it")).language).toBe("nl");
      await sendPortalInvite(user, "invite");
      expect(lastMail().html).toContain("Beste Luca,");
    } finally {
      await ensurePortalEmailTemplates();
    }
    expect((await getPortalTemplate(PORTAL_TEMPLATE.INVITE, "it")).language).toBe("it");
  });

  it("sends what staff saved in a language's row", async () => {
    const c = await customerIn("ro", "I18nEdited");
    const user = await portalStorage.createPortalUser({ customerId: c.id, email: `edited@${TEST_EMAIL_DOMAIN}`, fullName: "Ion", role: "admin" }, "t");
    const [row] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, "portal_invite.ro"));
    await db.update(emailTemplates).set({ subject: "Bun venit, {{name}}" }).where(eq(emailTemplates.id, row.id));
    try {
      await sendPortalInvite(user, "invite");
      expect(lastMail().subject).toBe("Bun venit, Ion");
    } finally {
      await db.update(emailTemplates).set({ subject: row.subject }).where(eq(emailTemplates.id, row.id));
    }
  });

  it("writes the fine's date and amount in the customer's notation", async () => {
    const c = await customerIn("en", "I18nFine");
    await db.update(customers).set({ email: `fine@${TEST_EMAIL_DOMAIN}` }).where(eq(customers.id, c.id));
    const fine = await finesStorage.createFine({
      licensePlate: `PT${Date.now().toString().slice(-6)}`, offenceAt: new Date("2026-10-01T10:00:00Z"), description: "Speeding",
      amount: "1095.00", adminFee: "12.50", totalAmount: "1107.50", status: "linked", customerId: c.id,
    } as any);
    expect(await sendFineLinkedMailDetailed(fine.id)).toMatchObject({ sent: true });
    expect(lastMail().subject).toContain("Traffic fine");
    expect(lastMail().subject).toContain("01/10/2026");
    expect(lastMail().html).toContain("€ 1,095.00");
  });

  it("words the maintenance event and its dates in the customer's language", async () => {
    const c = await customerIn("pt", "I18nMaint");
    expect(await sendMaintenanceMail(c.id, { plate: "AB123C", car: "Test Model", event: "maintenance_planned", date: "2026-10-12", endDate: "2026-10-14" })).toBe(true);
    expect(lastMail().subject).toContain("Manutenção agendada");
    expect(lastMail().html).toContain("12/10/2026 até 14/10/2026, inclusive");
  });

  it("labels the request type and status in the submitter's language", async () => {
    const c = await customerIn("nl", "I18nRequest");
    const user = await portalStorage.createPortalUser({ customerId: c.id, email: `request@${TEST_EMAIL_DOMAIN}`, fullName: "Giulia", role: "admin" }, "t");
    await portalStorage.updatePortalUser(user.id, { language: "it" });
    const request = await requestsStorage.createRequest({ customerId: c.id, portalUserId: user.id, type: "extension", message: "Più giorni" });
    await requestsStorage.updateRequest(request.id, { staffReply: "Va bene", status: "done" });
    expect(await sendRequestReplyMail(request.id)).toBe(true);
    expect(lastMail().subject).toBe("Risposta alla Sua richiesta (proroga)");
    expect(lastMail().html).toContain("Stato: evasa.");
  });
});
