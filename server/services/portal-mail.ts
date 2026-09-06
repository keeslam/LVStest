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

export const PORTAL_TEMPLATE = {
  INVITE: "portal_invite",
  RESET: "portal_password_reset",
  STAFF: "portal_staff_notification",
  FINE_LINKED: "portal_fine_linked",
  REQUEST_REPLIED: "portal_request_replied",
  EMAIL_CHANGE: "portal_email_change",
  NEW_DEVICE: "portal_new_device",
  MAINTENANCE: "portal_maintenance",
} as const;

// Seeded once; staff edit them afterwards in Communicatie > E-mailsjablonen.
const DEFAULT_TEMPLATES: Array<{ name: string; subject: string; content: string }> = [
  {
    name: PORTAL_TEMPLATE.INVITE,
    subject: "Uw account voor het klantenportaal van Lam Groep",
    content: `<p>Beste {{name}},</p>
<p>Er is een account voor u aangemaakt in het klantenportaal van Lam Groep voor {{company}}.</p>
<p>Kies uw wachtwoord via deze link (72 uur geldig):</p>
<p><a href="{{link}}">{{link}}</a></p>
<p>Met vriendelijke groet,<br>Lam Groep</p>`,
  },
  {
    name: PORTAL_TEMPLATE.EMAIL_CHANGE,
    subject: "Bevestig uw nieuwe e-mailadres - klantenportaal Lam Groep",
    content: `<p>Beste {{name}},</p>
<p>U heeft gevraagd om het e-mailadres van uw account in het klantenportaal van Lam Groep te wijzigen naar {{newEmail}}.</p>
<p>Bevestig dit via deze link (72 uur geldig):</p>
<p><a href="{{link}}">{{link}}</a></p>
<p>Heeft u dit niet aangevraagd, dan kunt u deze e-mail negeren; uw huidige adres blijft dan in gebruik.</p>
<p>Met vriendelijke groet,<br>Lam Groep</p>`,
  },
  {
    name: PORTAL_TEMPLATE.NEW_DEVICE,
    subject: "Nieuwe aanmelding op uw klantenportaal-account",
    content: `<p>Beste {{name}},</p>
<p>Er is zojuist ingelogd op uw account van het klantenportaal van Lam Groep vanaf een browser of apparaat dat we nog niet kenden.</p>
<p>Tijdstip: {{at}}<br>Browser: {{ua}}<br>IP-adres: {{ip}}</p>
<p>Was u dit zelf? Dan hoeft u niets te doen. Herkent u dit niet, wijzig dan direct uw wachtwoord in het portaal en neem contact op met Lam Groep.</p>
<p>Met vriendelijke groet,<br>Lam Groep</p>`,
  },
  {
    name: PORTAL_TEMPLATE.RESET,
    subject: "Wachtwoord opnieuw instellen - klantenportaal Lam Groep",
    content: `<p>Beste {{name}},</p>
<p>Via deze link stelt u een nieuw wachtwoord in (72 uur geldig):</p>
<p><a href="{{link}}">{{link}}</a></p>
<p>Heeft u dit niet aangevraagd, dan kunt u deze e-mail negeren.</p>
<p>Met vriendelijke groet,<br>Lam Groep</p>`,
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
<p>Met vriendelijke groet,<br>Lam Groep</p>`,
  },
  {
    name: PORTAL_TEMPLATE.REQUEST_REPLIED,
    subject: "Reactie op uw aanvraag ({{type}})",
    content: `<p>Beste {{name}},</p>
<p>Wij hebben uw aanvraag ({{type}}) beantwoord:</p>
<blockquote>{{reply}}</blockquote>
<p>Status: {{status}}. Bekijk de aanvraag in het klantenportaal: <a href="{{link}}">{{link}}</a></p>
<p>Met vriendelijke groet,<br>Lam Groep</p>`,
  },
  {
    name: PORTAL_TEMPLATE.MAINTENANCE,
    subject: "Onderhoud {{plate}}: {{event}}",
    content: `<p>Beste {{name}},</p>
<p>{{event}} voor {{car}} ({{plate}}).</p>
<p>Datum: {{date}}{{endDate}}</p>
<p>Adres: {{pickupAddress}}<br>Openingstijden: {{openingHours}}</p>
<p>In het klantenportaal ziet u de actuele status: <a href="{{link}}">{{link}}</a></p>
<p>Met vriendelijke groet,<br>Lam Groep</p>`,
  },
];

export async function ensurePortalEmailTemplates(): Promise<void> {
  for (const t of DEFAULT_TEMPLATES) {
    const [existing] = await db.select({ id: emailTemplates.id }).from(emailTemplates).where(eq(emailTemplates.name, t.name));
    if (existing) continue;
    await db.insert(emailTemplates).values({ ...t, category: "portal", createdAt: new Date().toISOString() });
  }
}

export function renderTemplate(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

export async function getPortalTemplate(name: string): Promise<{ subject: string; content: string }> {
  const [row] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name));
  if (row) return { subject: row.subject, content: row.content };
  const fallback = DEFAULT_TEMPLATES.find((t) => t.name === name)!;
  return { subject: fallback.subject, content: fallback.content };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\n{2,}/g, "\n").trim();
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
  const template = await getPortalTemplate(kind === "invite" ? PORTAL_TEMPLATE.INVITE : PORTAL_TEMPLATE.RESET);
  const vars = { name: user.fullName, company: customer?.companyName || customer?.name || "", link };
  const html = renderTemplate(template.content, vars);

  const sent = await sendEmail({
    to: user.email,
    toName: user.fullName,
    subject: renderTemplate(template.subject, vars),
    html,
    text: stripHtml(html),
  }, "custom");
  return { sent, token };
}

/** Warns the account holder about a login from a browser the account has not used before. */
export async function sendNewDeviceMail(user: PortalUser, info: { ua: string; ip: string; at: string }): Promise<boolean> {
  const template = await getPortalTemplate(PORTAL_TEMPLATE.NEW_DEVICE);
  const vars = { name: user.fullName, ua: info.ua, ip: info.ip, at: new Date(info.at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" }) };
  const html = renderTemplate(template.content, vars);
  return sendEmail({ to: user.email, toName: user.fullName, subject: renderTemplate(template.subject, vars), html, text: stripHtml(html) }, "custom");
}

/** Sends the confirmation link for a new address to that new address; only its hash is stored. */
export async function sendEmailChangeMail(user: PortalUser, newEmail: string): Promise<{ sent: boolean; token: string }> {
  const { token, hash } = generateInviteToken();
  await portalStorage.updatePortalUser(user.id, { pendingEmail: newEmail, emailChangeTokenHash: hash, emailChangeExpiresAt: new Date(Date.now() + INVITE_TTL_MS) });
  const config = await getPortalConfig();
  const link = `${config.portalBaseUrl.replace(/\/$/, "")}/portaal/email-bevestigen?token=${token}`;
  const template = await getPortalTemplate(PORTAL_TEMPLATE.EMAIL_CHANGE);
  const vars = { name: user.fullName, newEmail, link };
  const html = renderTemplate(template.content, vars);
  const sent = await sendEmail({ to: newEmail, toName: user.fullName, subject: renderTemplate(template.subject, vars), html, text: stripHtml(html) }, "custom");
  return { sent, token };
}

/** Tells the customer a fine was attributed to them. Skips silently without an address or with the portal off. */
export async function sendFineLinkedMail(fineId: number): Promise<boolean> {
  const fine = await finesStorage.getFineRow(fineId);
  if (!fine || !fine.customerId) return false;
  const [customer, settings, config] = await Promise.all([
    storage.getCustomer(fine.customerId), portalStorage.getOrCreateCustomerSettings(fine.customerId), getPortalConfig(),
  ]);
  const to = customer?.email || customer?.emailForInvoices;
  if (!customer || !settings.portalEnabled || !to) return false;
  const template = await getPortalTemplate(PORTAL_TEMPLATE.FINE_LINKED);
  const vars = {
    name: customer.contactPerson || customer.companyName || customer.name,
    company: customer.companyName || customer.name,
    plate: fine.licensePlate, date: fine.offenceAt.toISOString().slice(0, 10), description: fine.description,
    amount: fine.amount, adminFee: fine.adminFee, total: fine.totalAmount,
    link: `${config.portalBaseUrl.replace(/\/$/, "")}/portaal/bekeuringen/${fine.id}`,
  };
  const html = renderTemplate(template.content, vars);
  return sendEmail({ to, subject: renderTemplate(template.subject, vars), html, text: stripHtml(html) }, "custom");
}

/** Maintenance news for a customer: planned, moved, car in, car ready, cancelled, replacement ready. */
export async function sendMaintenanceMail(customerId: number, vars: { plate: string; car: string; event: string; date: string; endDate: string | null }): Promise<boolean> {
  const [customer, settings, config] = await Promise.all([
    storage.getCustomer(customerId), portalStorage.getOrCreateCustomerSettings(customerId), getPortalConfig(),
  ]);
  const to = customer?.emailForMOT || customer?.email;
  if (!customer || !settings.portalEnabled || !to) return false;
  const template = await getPortalTemplate(PORTAL_TEMPLATE.MAINTENANCE);
  const v = {
    name: customer.contactPerson || customer.companyName || customer.name,
    plate: vars.plate, car: vars.car, event: vars.event, date: vars.date,
    endDate: vars.endDate && vars.endDate !== vars.date ? ` tot en met ${vars.endDate}` : "",
    pickupAddress: config.pickupAddress, openingHours: config.openingHours,
    link: `${config.portalBaseUrl.replace(/\/$/, "")}/portaal/voertuigen`,
  };
  const html = renderTemplate(template.content, v);
  return sendEmail({ to, subject: renderTemplate(template.subject, v), html, text: stripHtml(html) }, "custom");
}

const REQUEST_TYPE_LABEL: Record<string, string> = { extension: "verlenging", early_return: "eerder inleveren", damage: "schademelding", fine_question: "vraag over bekeuring", other: "overig" };
const REQUEST_STATUS_LABEL: Record<string, string> = { new: "nieuw", in_progress: "in behandeling", done: "afgehandeld", rejected: "afgewezen" };

/** Sends the staff reply on a request to the portal user who submitted it. */
export async function sendRequestReplyMail(requestId: number): Promise<boolean> {
  const row = await requestsStorage.getRequest(requestId);
  if (!row || !row.submitterEmail || !row.staffReply) return false;
  const config = await getPortalConfig();
  const template = await getPortalTemplate(PORTAL_TEMPLATE.REQUEST_REPLIED);
  const vars = {
    name: row.submittedBy ?? "", type: REQUEST_TYPE_LABEL[row.type] ?? row.type, reply: row.staffReply,
    status: REQUEST_STATUS_LABEL[row.status] ?? row.status,
    link: `${config.portalBaseUrl.replace(/\/$/, "")}/portaal/aanvragen/${row.id}`,
  };
  const html = renderTemplate(template.content, vars);
  return sendEmail({ to: row.submitterEmail, toName: row.submittedBy ?? undefined, subject: renderTemplate(template.subject, vars), html, text: stripHtml(html) }, "custom");
}
