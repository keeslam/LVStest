/**
 * Which saved e-mail templates the send pickers of Communicatie offer
 * (audit 2026-10-09, module 13, finding 5).
 *
 * The table `email_templates` holds two kinds of rows: the templates staff write
 * in the Sjabloonbouwer (category apk, maintenance or custom) and the eleven
 * system templates of the customer portal (`portal_invite`, one row per language
 * such as `portal_invite.es`; category `portal`, seeded by
 * `server/services/portal-mail.ts`). The system ones are
 * edited in the Sjabloonbouwer, but they are written for one purpose each and
 * with `{{name}}`-style placeholders; offering them as an APK reminder sends a
 * customer a portal invitation.
 */

import { isSupportedLanguage, type SupportedLanguage } from "@shared/languages";

export type SendMode = "apk" | "maintenance" | "custom";

export interface TemplateLike {
  id: number | string;
  name: string;
  category?: string | null;
}

/** The names `ensurePortalEmailTemplates` seeds; each has a Dutch label in the notifications namespace. */
export const SYSTEM_TEMPLATE_NAMES = [
  "portal_invite",
  "portal_password_reset",
  "portal_staff_notification",
  "portal_fine_linked",
  "portal_request_replied",
  "portal_email_change",
  "portal_new_device",
  "portal_maintenance",
  "portal_reservation_changed",
  "portal_reservation_cancelled",
  "portal_document_available",
] as const;

export function isSystemTemplate(template: TemplateLike): boolean {
  return template.category === "portal" || /^portal_/.test(template.name);
}

/**
 * A system template's base name and language. Every language has its own row (Kees, 2026-10-18):
 * Dutch keeps the bare name (`portal_invite`), another language adds its code (`portal_invite.es`).
 * Null for a name that is not a system template.
 */
export function systemTemplateParts(name: string): { base: string; language: SupportedLanguage } | null {
  const [base, suffix, ...rest] = name.split(".");
  if (rest.length > 0 || !(SYSTEM_TEMPLATE_NAMES as readonly string[]).includes(base)) return null;
  if (suffix === undefined) return { base, language: "nl" };
  return isSupportedLanguage(suffix) && suffix !== "nl" ? { base, language: suffix } : null;
}

/** i18n key (notifications namespace) of a system template's Dutch name, or null for any other template. */
export function systemTemplateLabelKey(name: string): string | null {
  const parts = systemTemplateParts(name);
  return parts ? `customerCommunications.templates.systemNames.${parts.base}` : null;
}

/** The language of a system template's row; null for a template staff wrote themselves. */
export function systemTemplateLanguage(name: string): SupportedLanguage | null {
  return systemTemplateParts(name)?.language ?? null;
}

/**
 * The templates a tab may offer: those of its own category, plus the free ones
 * (custom, or no category) that suit any message. The Aangepast tab takes
 * every template that is not a system template.
 */
export function templatesForMode<T extends TemplateLike>(templates: T[] | undefined | null, mode: SendMode): T[] {
  if (!Array.isArray(templates)) return [];
  return templates.filter((template) => {
    if (isSystemTemplate(template)) return false;
    if (mode === "custom") return true;
    const category = template.category;
    if (category === "apk" || category === "maintenance") return category === mode;
    return true;
  });
}

/**
 * The readable text of a system template. They are written as HTML mail bodies
 * (`<p>Beste {{name}},</p>`); on screen the markup is noise.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

