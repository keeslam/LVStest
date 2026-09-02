import { db } from "../db";
import { emailTemplates, type PortalUser } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "../utils/email-service";
import { storage } from "../storage";
import { portalStorage } from "./portal-storage";
import { getPortalConfig } from "./portal-config";
import { generateInviteToken, INVITE_TTL_MS } from "./portal-tokens";

export const PORTAL_TEMPLATE = {
  INVITE: "portal_invite",
  RESET: "portal_password_reset",
  STAFF: "portal_staff_notification",
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
