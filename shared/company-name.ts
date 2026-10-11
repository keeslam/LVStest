/**
 * D15 (besluiten B-41/B-42, ontwerp 12) — the company name that appears in every
 * mail the application sends (reminders, the default sender name, the portal
 * mails) and fills the `{companyName}` placeholder of a message template.
 * Stored as the `app_settings` row `company_name`; one setting for all mails.
 */

export const COMPANY_NAME_KEY = "company_name";
/** The name the mails carried before it became a setting. */
export const DEFAULT_COMPANY_NAME = "Autolease Lam";
/** The name the portal texts carried before it became a setting; they keep it until a name is saved. */
export const LEGACY_COMPANY_NAME = "Lam Groep";
/** Stable error code of the settings route for a name that is not acceptable. */
export const INVALID_COMPANY_NAME_CODE = "INVALID_COMPANY_NAME";
export const COMPANY_NAME_MAX_LENGTH = 100;

/** The trimmed name when the value is acceptable (text, 1-100 characters, no control characters), else null. */
export function validCompanyName(value: unknown): string | null {
  const raw = typeof value === "string" ? value : value && typeof value === "object" ? (value as { name?: unknown }).name : undefined;
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  // The name ends up in a From header and in subjects: no line breaks or other control characters.
  if (name.length === 0 || name.length > COMPANY_NAME_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

/** The name a stored value stands for; anything unusable is the default. */
export function companyNameFromSetting(value: unknown): string {
  return validCompanyName(value) ?? DEFAULT_COMPANY_NAME;
}
