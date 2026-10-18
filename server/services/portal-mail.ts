import { db } from "../db";
import { emailTemplates, type PortalUser } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "../utils/email-service";
import { storage } from "../storage";
import { portalStorage } from "./portal-storage";
import { getPortalConfig } from "./portal-config";
import { generateInviteToken, INVITE_TTL_MS } from "./portal-tokens";
import { finesStorage } from "./fines-storage";
import { requestsStorage } from "./portal-requests-storage";
import { fillPlaceholders } from "../../shared/message-placeholders";
import { formatAmountForLanguage, formatDateForLanguage, formatDateTimeForLanguage } from "../utils/locale-format";
import { SUPPORTED_LANGUAGES, toSupportedLanguage, type SupportedLanguage } from "../../shared/languages";
import { PORTAL_MAIL_PHRASES, TRANSLATED_TEMPLATES, type MaintenanceMailEvent, type TemplateText } from "./portal-mail-texts";
import { formatLicensePlate } from "../../shared/license-plate";
import { officeTimeZone } from "./office-time";
import { companyName } from "./company-name";
import { COMPANY_NAME_KEY } from "../../shared/company-name";
import { accountMailEnabled, type CompanyMailKey } from "../../shared/portal-mail-preferences";

export const PORTAL_TEMPLATE = {
  INVITE: "portal_invite",
  RESET: "portal_password_reset",
  STAFF: "portal_staff_notification",
  FINE_LINKED: "portal_fine_linked",
  REQUEST_REPLIED: "portal_request_replied",
  EMAIL_CHANGE: "portal_email_change",
  NEW_DEVICE: "portal_new_device",
  EMAIL_CHANGED: "portal_email_changed",
  MAINTENANCE: "portal_maintenance",
  // besluiten B-06 (BUG-134) — the three events of the decision that were
  // never built: the office moved the rental, the office cancelled it, and a
  // new document is waiting in the portal.
  RESERVATION_CHANGED: "portal_reservation_changed",
  RESERVATION_CANCELLED: "portal_reservation_cancelled",
  DOCUMENT_AVAILABLE: "portal_document_available",
  // Kees, 2026-10-18: a contract was signed in the portal; a link, never the PDF itself.
  CONTRACT_SIGNED: "portal_contract_signed",
} as const;

// Seeded once; staff edit them afterwards in Communicatie > E-mailsjablonen. These are the Dutch
// rows; the other languages are seeded from portal-mail-texts.ts under `<name>.<language>`.
export const DEFAULT_TEMPLATES: Array<{ name: string; subject: string; content: string }> = [
  {
    name: PORTAL_TEMPLATE.INVITE,
    subject: "Uw account voor het klantenportaal van {{companyName}}",
    content: `<p>Beste {{name}},</p>
<p>Er is een account voor u aangemaakt in het klantenportaal van {{companyName}} voor {{company}}.</p>
<p>Kies uw wachtwoord via deze link (72 uur geldig):</p>
<p><a href="{{link}}">{{link}}</a></p>
<p>Met vriendelijke groet,<br>{{companyName}}</p>`,
  },
  {
    name: PORTAL_TEMPLATE.EMAIL_CHANGE,
    subject: "Bevestig uw nieuwe e-mailadres - klantenportaal {{companyName}}",
    content: `<p>Beste {{name}},</p>
<p>U heeft gevraagd om het e-mailadres van uw account in het klantenportaal van {{companyName}} te wijzigen naar {{newEmail}}.</p>
<p>Bevestig dit via deze link (72 uur geldig):</p>
<p><a href="{{link}}">{{link}}</a></p>
<p>Heeft u dit niet aangevraagd, dan kunt u deze e-mail negeren; uw huidige adres blijft dan in gebruik.</p>
<p>Met vriendelijke groet,<br>{{companyName}}</p>`,
  },
  {
    name: PORTAL_TEMPLATE.EMAIL_CHANGED,
    subject: "Het e-mailadres van uw klantenportaal-account is gewijzigd",
    content: `<p>Beste {{name}},</p>
<p>Het e-mailadres waarmee u inlogt op het klantenportaal van {{companyName}} is zojuist gewijzigd naar {{newEmail}}. Alle ingelogde sessies van dit account zijn beëindigd.</p>
<p>Was u dit zelf? Dan hoeft u niets te doen. Was u dit niet, neem dan direct contact op met {{companyName}}.</p>
<p>Met vriendelijke groet,<br>{{companyName}}</p>`,
  },
  {
    name: PORTAL_TEMPLATE.NEW_DEVICE,
    subject: "Nieuwe aanmelding op uw klantenportaal-account",
    content: `<p>Beste {{name}},</p>
<p>Er is zojuist ingelogd op uw account van het klantenportaal van {{companyName}} vanaf een browser of apparaat dat we nog niet kenden.</p>
<p>Tijdstip: {{at}}<br>Browser: {{ua}}<br>IP-adres: {{ip}}</p>
<p>Was u dit zelf? Dan hoeft u niets te doen. Herkent u dit niet, wijzig dan direct uw wachtwoord in het portaal en neem contact op met {{companyName}}.</p>
<p>Met vriendelijke groet,<br>{{companyName}}</p>`,
  },
  {
    name: PORTAL_TEMPLATE.RESET,
    subject: "Wachtwoord opnieuw instellen - klantenportaal {{companyName}}",
    content: `<p>Beste {{name}},</p>
<p>Via deze link stelt u een nieuw wachtwoord in (72 uur geldig):</p>
<p><a href="{{link}}">{{link}}</a></p>
<p>Heeft u dit niet aangevraagd, dan kunt u deze e-mail negeren.</p>
<p>Met vriendelijke groet,<br>{{companyName}}</p>`,
  },
  {
    name: PORTAL_TEMPLATE.STAFF,
    subject: "Klantenportaal: {{title}}",
    content: `<p>{{title}}</p>
<p>{{description}}</p>
<p>Klant: {{company}}</p>
<p><a href="{{link}}">Openen in de app</a></p>`,
  },
  {
    name: PORTAL_TEMPLATE.FINE_LINKED,
    subject: "Bekeuring {{plate}} van {{date}}",
    content: `<p>Beste {{name}},</p>
<p>Er is een bekeuring op naam van {{company}} verwerkt:</p>
<p>Kenteken {{plate}}, {{date}}<br>{{description}}<br>Bedrag <strong>€ {{amount}}</strong></p>
<p>Bekijk de bekeuring in het klantenportaal: <a href="{{link}}">{{link}}</a></p>
<p>Met vriendelijke groet,<br>{{companyName}}</p>`,
  },
  {
    name: PORTAL_TEMPLATE.REQUEST_REPLIED,
    subject: "Reactie op uw aanvraag ({{type}})",
    content: `<p>Beste {{name}},</p>
<p>Wij hebben uw aanvraag ({{type}}) beantwoord:</p>
<blockquote>{{reply}}</blockquote>
<p>Status: {{status}}. Bekijk de aanvraag in het klantenportaal: <a href="{{link}}">{{link}}</a></p>
<p>Met vriendelijke groet,<br>{{companyName}}</p>`,
  },
  {
    name: PORTAL_TEMPLATE.MAINTENANCE,
    subject: "Onderhoud {{plate}}: {{event}}",
    content: `<p>Beste {{name}},</p>
<p>{{event}} voor {{car}} ({{plate}}).</p>
<p>Datum: {{date}}{{endDate}}</p>
<p>Adres: {{pickupAddress}}<br>Openingstijden: {{openingHours}}</p>
<p>In het klantenportaal ziet u de actuele status: <a href="{{link}}">{{link}}</a></p>
<p>Met vriendelijke groet,<br>{{companyName}}</p>`,
  },
  {
    name: PORTAL_TEMPLATE.RESERVATION_CHANGED,
    subject: "Uw reservering is gewijzigd ({{plate}})",
    content: `<p>Beste {{name}},</p>
<p>{{companyName}} heeft uw reservering aangepast.</p>
<p>{{changes}}</p>
<p>Auto: {{car}}<br>Periode: {{period}}</p>
<p>In het klantenportaal ziet u de actuele gegevens: <a href="{{link}}">{{link}}</a></p>
<p>Klopt er iets niet? Neem dan contact op met {{companyName}}.</p>
<p>Met vriendelijke groet,<br>{{companyName}}</p>`,
  },
  {
    name: PORTAL_TEMPLATE.RESERVATION_CANCELLED,
    subject: "Uw reservering is geannuleerd ({{plate}})",
    content: `<p>Beste {{name}},</p>
<p>{{companyName}} heeft uw reservering geannuleerd.</p>
<p>Auto: {{car}}<br>Periode: {{period}}</p>
<p>In het klantenportaal ziet u uw overige reserveringen: <a href="{{link}}">{{link}}</a></p>
<p>Klopt dit niet? Neem dan contact op met {{companyName}}.</p>
<p>Met vriendelijke groet,<br>{{companyName}}</p>`,
  },
  {
    name: PORTAL_TEMPLATE.DOCUMENT_AVAILABLE,
    subject: "Nieuw document beschikbaar: {{document}}",
    content: `<p>Beste {{name}},</p>
<p>Er staat een nieuw document voor u klaar in het klantenportaal: {{document}} ({{fileName}}).</p>
<p>Auto: {{car}}<br>Periode: {{period}}</p>
<p>Bekijk en download het document hier: <a href="{{link}}">{{link}}</a></p>
<p>Met vriendelijke groet,<br>{{companyName}}</p>`,
  },
  {
    name: PORTAL_TEMPLATE.CONTRACT_SIGNED,
    subject: "Getekend: {{document}} ({{plate}})",
    content: `<p>Beste {{name}},</p>
<p>{{signer}} heeft op {{at}} voor {{company}} digitaal getekend: {{document}}.</p>
<p>Auto: {{car}}<br>Periode: {{period}}</p>
<p>Het getekende exemplaar staat in het klantenportaal: <a href="{{link}}">{{link}}</a></p>
<p>Heeft u dit niet gedaan? Neem dan direct contact op met {{companyName}}.</p>
<p>Met vriendelijke groet,<br>{{companyName}}</p>`,
  },
];

/**
 * The stored name of a template in a language (Kees, 2026-10-18: one row per language). Dutch keeps
 * the bare name every earlier release used; another language adds its code: `portal_invite.es`.
 */
export function portalTemplateName(name: string, language: SupportedLanguage): string {
  return language === "nl" ? name : `${name}.${language}`;
}

/** The seed text of a template in a language; undefined where that language has none (the staff notification is Dutch only). */
function defaultTemplate(name: string, language: SupportedLanguage): TemplateText | undefined {
  if (language === "nl") return DEFAULT_TEMPLATES.find((t) => t.name === name);
  return (TRANSLATED_TEMPLATES[language] as Record<string, TemplateText>)[name];
}

/** Every row ensurePortalEmailTemplates seeds: the Dutch defaults, then each translation under its own name. */
function seedRows(): Array<{ name: string; subject: string; content: string }> {
  const rows = [...DEFAULT_TEMPLATES];
  for (const language of SUPPORTED_LANGUAGES) {
    if (language === "nl") continue;
    for (const [name, text] of Object.entries(TRANSLATED_TEMPLATES[language])) rows.push({ name: portalTemplateName(name, language), ...text });
  }
  return rows;
}

/** The text of a default template as earlier releases seeded it, before the name became {{companyName}}. */
const LEGACY_COMPANY_NAME = "Lam Groep";
const legacyText = (text: string): string => text.split("{{companyName}}").join(LEGACY_COMPANY_NAME);

export async function ensurePortalEmailTemplates(): Promise<void> {
  const stored = new Set((await db.select({ name: emailTemplates.name }).from(emailTemplates)).map((row) => row.name));
  for (const t of seedRows()) {
    if (!stored.has(t.name)) await db.insert(emailTemplates).values({ ...t, category: "portal", createdAt: new Date().toISOString() });
  }
  // D15: stored rows only follow the company name once somebody has set it. Until then the portal
  // mails keep saying "Lam Groep"; the first save of the setting runs the same step (app-settings route).
  if (await storage.getAppSettingByKey(COMPANY_NAME_KEY)) await migratePortalTemplatesToCompanyName();
}

/**
 * D15: a stored portal template that still reads exactly like the old default (the literal
 * "Lam Groep") is rewritten to `{{companyName}}`, so it follows the company name setting; a row
 * staff edited is theirs and stays as it is. Idempotent. Returns (and logs) the number of rewritten rows.
 * Only the Dutch rows: the other languages were seeded with `{{companyName}}` from the start.
 */
export async function migratePortalTemplatesToCompanyName(): Promise<number> {
  let rewritten = 0;
  for (const t of DEFAULT_TEMPLATES) {
    const [existing] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, t.name));
    if (!existing) continue;
    const patch: { subject?: string; content?: string } = {};
    if (t.subject.includes("{{companyName}}") && existing.subject === legacyText(t.subject)) patch.subject = t.subject;
    if (t.content.includes("{{companyName}}") && existing.content === legacyText(t.content)) patch.content = t.content;
    if (patch.subject !== undefined || patch.content !== undefined) {
      await db.update(emailTemplates).set(patch).where(eq(emailTemplates.id, existing.id));
      rewritten += 1;
    }
  }
  if (rewritten > 0) console.log(`📧 portal e-mail templates: ${rewritten} unedited template(s) now follow the company name setting`);
  return rewritten;
}

/**
 * FIX-M (BUG-187) — every interpolated value is HTML-escaped.
 *
 * These templates are HTML and the variables are portal-controlled: a customer
 * who names a driver `<img src=x onerror=…>`, or types a request message full
 * of markup, had it rendered as live HTML in staff mail and in the stored
 * in-app notification. Escaping at the one substitution point is what fixes
 * every template at once, including the ones staff edit themselves.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Audit A-13-6: the same replacer as the notification route, so a template
// written with {name} (the template builder's style) is filled in as well as
// one written with {{name}}. Unknown {{keys}} stay blank, as they always did.
export function renderTemplate(content: string, vars: Record<string, string>): string {
  // D15: {{companyName}} is the company name setting in every template; a caller's own value wins.
  return fillPlaceholders(content, { companyName: companyName(), ...vars }, { unknown: "blank", transform: (value) => escapeHtml(value) });
}

/**
 * The same substitution for a value that is NOT HTML — a subject line, where
 * `&amp;` would be read literally by every mail client.
 */
export function renderTemplateText(content: string, vars: Record<string, string>): string {
  return fillPlaceholders(content, { companyName: companyName(), ...vars }, { unknown: "blank" });
}

/**
 * The template to send in `language`: the stored row of that language, else the stored Dutch row
 * (a language staff removed falls back to Dutch), else the seed text. `language` in the result says
 * which one it turned out to be, so the values filled in (dates, amounts, labels) read the same.
 */
export async function getPortalTemplate(name: string, language: SupportedLanguage = "nl"): Promise<TemplateText & { language: SupportedLanguage }> {
  const candidates: SupportedLanguage[] = language === "nl" ? ["nl"] : [language, "nl"];
  for (const lang of candidates) {
    const [row] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, portalTemplateName(name, lang)));
    if (row) return { subject: row.subject, content: row.content, language: lang };
  }
  for (const lang of candidates) {
    const seed = defaultTemplate(name, lang);
    if (seed) return { subject: seed.subject, content: seed.content, language: lang };
  }
  const fallback = DEFAULT_TEMPLATES.find((t) => t.name === name)!;
  return { subject: fallback.subject, content: fallback.content, language: "nl" };
}

/** The language a customer's mail goes out in: its preferred language, Dutch when unset or unknown. */
export function customerLanguage(customer: { preferredLanguage?: string | null } | undefined | null): SupportedLanguage {
  return toSupportedLanguage(customer?.preferredLanguage);
}

/** A portal account's mail language: its own choice first, else its company's preferred language. */
export async function portalUserLanguage(user: Pick<PortalUser, "language" | "customerId">): Promise<SupportedLanguage> {
  return toSupportedLanguage(user.language, customerLanguage(await storage.getCustomer(user.customerId)));
}

function stripHtml(html: string): string {
  // The HTML half is escaped (BUG-187); the plain-text half has to read back as
  // what the customer actually typed, not as entities.
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Issues a fresh token (invalidating any earlier one), stores its hash and
 * expiry on the user and mails the activation / reset link. Returns the raw
 * token so a caller (tests, or a staff "copy link" action) can use it.
 */
export async function sendPortalInvite(user: PortalUser, kind: "invite" | "reset"): Promise<{ sent: boolean; token: string }> {
  const { token, hash } = generateInviteToken();
  await portalStorage.updatePortalUser(user.id, { inviteTokenHash: hash, inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS) });

  const [config, customer] = await Promise.all([getPortalConfig(), storage.getCustomer(user.customerId)]);
  const base = config.portalBaseUrl.replace(/\/$/, "");
  const link = `${base}/portaal/activeren?token=${token}`;
  const language = toSupportedLanguage(user.language, customerLanguage(customer));
  const template = await getPortalTemplate(kind === "invite" ? PORTAL_TEMPLATE.INVITE : PORTAL_TEMPLATE.RESET, language);
  const vars = { name: user.fullName, company: customer?.companyName || customer?.name || "", link };
  const html = renderTemplate(template.content, vars);

  const sent = await sendEmail({
    to: user.email,
    toName: user.fullName,
    subject: renderTemplateText(template.subject, vars),
    html,
    text: stripHtml(html),
  }, "custom");
  return { sent, token };
}

/** Warns the account holder about a login from a browser the account has not used before. */
export async function sendNewDeviceMail(user: PortalUser, info: { ua: string; ip: string; at: string }): Promise<boolean> {
  if (!accountMailEnabled(user.mailPreferences, "newDevice")) return false;
  const template = await getPortalTemplate(PORTAL_TEMPLATE.NEW_DEVICE, await portalUserLanguage(user));
  const vars = { name: user.fullName, ua: info.ua, ip: info.ip, at: formatDateTimeForLanguage(info.at, template.language, officeTimeZone()) };
  const html = renderTemplate(template.content, vars);
  return sendEmail({ to: user.email, toName: user.fullName, subject: renderTemplateText(template.subject, vars), html, text: stripHtml(html) }, "custom");
}

/** Tells the OLD address that the login address was changed, so the owner can react if it was not them. */
export async function sendEmailChangedNotice(user: PortalUser, oldEmail: string, newEmail: string): Promise<boolean> {
  const template = await getPortalTemplate(PORTAL_TEMPLATE.EMAIL_CHANGED, await portalUserLanguage(user));
  const vars = { name: user.fullName, newEmail };
  const html = renderTemplate(template.content, vars);
  return sendEmail({ to: oldEmail, toName: user.fullName, subject: renderTemplateText(template.subject, vars), html, text: stripHtml(html) }, "custom");
}

/** Sends the confirmation link for a new address to that new address; only its hash is stored. */
export async function sendEmailChangeMail(user: PortalUser, newEmail: string): Promise<{ sent: boolean; token: string }> {
  const { token, hash } = generateInviteToken();
  await portalStorage.updatePortalUser(user.id, { pendingEmail: newEmail, emailChangeTokenHash: hash, emailChangeExpiresAt: new Date(Date.now() + INVITE_TTL_MS) });
  const config = await getPortalConfig();
  const link = `${config.portalBaseUrl.replace(/\/$/, "")}/portaal/email-bevestigen?token=${token}`;
  const template = await getPortalTemplate(PORTAL_TEMPLATE.EMAIL_CHANGE, await portalUserLanguage(user));
  const vars = { name: user.fullName, newEmail, link };
  const html = renderTemplate(template.content, vars);
  const sent = await sendEmail({ to: newEmail, toName: user.fullName, subject: renderTemplateText(template.subject, vars), html, text: stripHtml(html) }, "custom");
  return { sent, token };
}

/** Why the fine mail did not go out; the codes the client words (B-41 D10). */
export type FineMailRefusal = "NO_CUSTOMER" | "NO_EMAIL" | "PORTAL_DISABLED" | "MAIL_FAILED";
export type FineMailResult = { sent: true; to: string } | { sent: false; reason: FineMailRefusal };

/** The address a fine mail goes to: the customer's own, else the invoice address. */
export function fineMailAddress(customer: { email?: string | null; emailForInvoices?: string | null } | undefined | null): string | null {
  return customer?.email || customer?.emailForInvoices || null;
}

/**
 * Tells the customer about a fine linked to them, and says why when it did not go out. Sent only on
 * request ("Klant informeren", B-41 D10), never on create or link. The attempt is logged as template
 * `fine_linked`, including a failed send.
 */
export async function sendFineLinkedMailDetailed(fineId: number): Promise<FineMailResult> {
  const fine = await finesStorage.getFineRow(fineId);
  if (!fine || !fine.customerId) return { sent: false, reason: "NO_CUSTOMER" };
  const [customer, settings, config] = await Promise.all([
    storage.getCustomer(fine.customerId), portalStorage.getOrCreateCustomerSettings(fine.customerId), getPortalConfig(),
  ]);
  if (!customer) return { sent: false, reason: "NO_CUSTOMER" };
  if (!settings.portalEnabled) return { sent: false, reason: "PORTAL_DISABLED" };
  const to = fineMailAddress(customer);
  if (!to) return { sent: false, reason: "NO_EMAIL" };
  const template = await getPortalTemplate(PORTAL_TEMPLATE.FINE_LINKED, customerLanguage(customer));
  const lang = template.language;
  const vars = {
    name: customer.contactPerson || customer.companyName || customer.name,
    company: customer.companyName || customer.name,
    // A-12-7 / B-18: the notation of the mail's language (Dutch "95,00"). The template writes the euro sign itself, so the amounts are bare numbers.
    plate: formatLicensePlate(fine.licensePlate), date: formatDateForLanguage(fine.offenceAt, lang), description: fine.description,
    amount: formatAmountForLanguage(fine.amount, lang), adminFee: formatAmountForLanguage(fine.adminFee, lang), total: formatAmountForLanguage(fine.totalAmount, lang),
    link: `${config.portalBaseUrl.replace(/\/$/, "")}/portaal/bekeuringen/${fine.id}`,
  };
  const html = renderTemplate(template.content, vars);
  const sent = await sendEmail({ to, subject: renderTemplateText(template.subject, vars), html, text: stripHtml(html), logTemplate: "fine_linked" }, "custom");
  return sent ? { sent: true, to } : { sent: false, reason: "MAIL_FAILED" };
}

/**
 * Maintenance news for a customer: planned, moved, car in, car ready, cancelled, replacement ready.
 * `event` is the kind of news; the mail words it, and writes the dates, in the customer's language.
 */
export async function sendMaintenanceMail(customerId: number, vars: { plate: string; car: string; event: MaintenanceMailEvent; date: string; endDate: string | null }): Promise<boolean> {
  const [customer, settings, config] = await Promise.all([
    storage.getCustomer(customerId), portalStorage.getOrCreateCustomerSettings(customerId), getPortalConfig(),
  ]);
  const to = customer?.emailForMOT || customer?.email;
  if (!customer || !settings.portalEnabled || !settings.mailMaintenance || !to) return false;
  const template = await getPortalTemplate(PORTAL_TEMPLATE.MAINTENANCE, customerLanguage(customer));
  const phrases = PORTAL_MAIL_PHRASES[template.language];
  const v = {
    name: customer.contactPerson || customer.companyName || customer.name,
    plate: formatLicensePlate(vars.plate), car: vars.car, event: phrases.maintenanceEvent[vars.event],
    date: formatDateForLanguage(vars.date, template.language),
    endDate: vars.endDate && vars.endDate !== vars.date ? phrases.untilDate(formatDateForLanguage(vars.endDate, template.language)) : "",
    pickupAddress: config.pickupAddress, openingHours: config.openingHours,
    link: `${config.portalBaseUrl.replace(/\/$/, "")}/portaal/voertuigen`,
  };
  const html = renderTemplate(template.content, v);
  return sendEmail({ to, subject: renderTemplateText(template.subject, v), html, text: stripHtml(html) }, "custom");
}

/** The company-wide switch (portal_customer_settings) that governs each company mail; a template not listed has no switch. */
const COMPANY_MAIL_FOR_TEMPLATE: Record<string, CompanyMailKey | undefined> = {
  [PORTAL_TEMPLATE.RESERVATION_CHANGED]: "mailReservationChanges",
  [PORTAL_TEMPLATE.RESERVATION_CANCELLED]: "mailReservationChanges",
  [PORTAL_TEMPLATE.DOCUMENT_AVAILABLE]: "mailDocuments",
  [PORTAL_TEMPLATE.CONTRACT_SIGNED]: "mailDocuments",
};

/**
 * besluiten **B-06** (BUG-134) — the office changed something and the customer
 * has to hear it from us, not by opening the portal.
 *
 * One sender for the three events the decision names besides maintenance. The
 * address is the customer's own (`email`), with the invoice and MOT addresses
 * as the fallbacks the rest of the application also accepts; the portal switch
 * of that customer still decides whether anything goes out at all. Returns
 * false — never throws — when there is nothing to send to.
 *
 * `vars` may be a function of the language: the caller's own sentences (a period, "no car yet")
 * are then written in the language the template turned out to be in.
 */
export async function sendPortalCustomerMail(
  customerId: number,
  templateName: string,
  vars: Record<string, string> | ((language: SupportedLanguage) => Record<string, string>),
  portalPath: string,
): Promise<boolean> {
  const [customer, settings, config] = await Promise.all([
    storage.getCustomer(customerId), portalStorage.getOrCreateCustomerSettings(customerId), getPortalConfig(),
  ]);
  const to = customer?.email || customer?.emailForInvoices || customer?.emailForMOT;
  if (!customer || !settings.portalEnabled || !to) return false;
  const companySwitch = COMPANY_MAIL_FOR_TEMPLATE[templateName];
  if (companySwitch && !settings[companySwitch]) return false;
  const template = await getPortalTemplate(templateName, customerLanguage(customer));
  const own = typeof vars === "function" ? vars(template.language) : vars;
  const v = {
    name: customer.contactPerson || customer.companyName || customer.name,
    company: customer.companyName || customer.name,
    ...own,
    // One plate notation in every mail; a "#123" placeholder (no plate) passes through unchanged.
    ...(own.plate ? { plate: formatLicensePlate(own.plate) } : {}),
    link: `${config.portalBaseUrl.replace(/\/$/, "")}/portaal${portalPath}`,
  };
  const html = renderTemplate(template.content, v);
  return sendEmail({ to, subject: renderTemplateText(template.subject, v), html, text: stripHtml(html) }, "custom");
}

/** True when the account that submitted the request has switched its reply mails off, so staff can tell that from a failed send. */
export async function requestReplyMailOptedOut(requestId: number): Promise<boolean> {
  const row = await requestsStorage.getRequest(requestId);
  if (!row?.portalUserId) return false;
  const user = await portalStorage.getPortalUser(row.portalUserId);
  return Boolean(user) && !accountMailEnabled(user!.mailPreferences, "requestReply");
}

/** Sends the staff reply on a request to the portal user who submitted it. */
export async function sendRequestReplyMail(requestId: number): Promise<boolean> {
  const row = await requestsStorage.getRequest(requestId);
  if (!row || !row.submitterEmail || !row.staffReply) return false;
  if (await requestReplyMailOptedOut(requestId)) return false;
  const config = await getPortalConfig();
  // The account that submitted it reads the reply; a request whose account is gone follows the company.
  const user = row.portalUserId ? await portalStorage.getPortalUser(row.portalUserId) : undefined;
  const language = user ? await portalUserLanguage(user) : customerLanguage(await storage.getCustomer(row.customerId));
  const template = await getPortalTemplate(PORTAL_TEMPLATE.REQUEST_REPLIED, language);
  const phrases = PORTAL_MAIL_PHRASES[template.language];
  const vars = {
    name: row.submittedBy ?? "", type: phrases.requestType[row.type] ?? row.type, reply: row.staffReply,
    status: phrases.requestStatus[row.status] ?? row.status,
    link: `${config.portalBaseUrl.replace(/\/$/, "")}/portaal/aanvragen/${row.id}`,
  };
  const html = renderTemplate(template.content, vars);
  return sendEmail({ to: row.submitterEmail, toName: row.submittedBy ?? undefined, subject: renderTemplateText(template.subject, vars), html, text: stripHtml(html) }, "custom");
}

/**
 * "Contract getekend" (Kees, 2026-10-18): to the company address like every document mail (and its
 * switch), and always to the account that signed when that is another address: a signature is a
 * legal act, so the person whose login was used must hear about it even if the company mails are off.
 * Only a link to the portal, never the PDF. Returns the number of mails sent.
 */
export async function sendContractSignedMails(
  customerId: number,
  signer: Pick<PortalUser, "email" | "fullName" | "language" | "customerId">,
  vars: (language: SupportedLanguage) => Record<string, string>,
): Promise<number> {
  let sent = 0;
  if (await sendPortalCustomerMail(customerId, PORTAL_TEMPLATE.CONTRACT_SIGNED, vars, "/documenten")) sent += 1;
  const customer = await storage.getCustomer(customerId);
  const companyTo = (customer?.email || customer?.emailForInvoices || customer?.emailForMOT || "").toLowerCase();
  if (!signer.email || signer.email.toLowerCase() === companyTo) return sent;
  const config = await getPortalConfig();
  const template = await getPortalTemplate(PORTAL_TEMPLATE.CONTRACT_SIGNED, await portalUserLanguage(signer));
  const v: Record<string, string> = {
    name: signer.fullName, company: customer?.companyName || customer?.name || "",
    ...vars(template.language),
    link: `${config.portalBaseUrl.replace(/\/$/, "")}/portaal/documenten`,
  };
  if (v.plate) v.plate = formatLicensePlate(v.plate);
  const html = renderTemplate(template.content, v);
  if (await sendEmail({ to: signer.email, toName: signer.fullName, subject: renderTemplateText(template.subject, v), html, text: stripHtml(html) }, "custom")) sent += 1;
  return sent;
}
