/**
 * The languages the app, the customer portal and the customer e-mails can be shown in.
 *
 * Dutch stays the house language: the staff app defaults to it, generated documents are
 * always Dutch (besluiten B-18), and a stored value this list does not know falls back to it.
 * The other languages exist mainly for customers and drivers (portal, e-mails).
 */
export const SUPPORTED_LANGUAGES = ["nl", "en", "es", "pt", "it", "ro", "pl"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = "nl";

/**
 * Each language's own name, as a picker shows it. Written in the language itself so a
 * reader finds their language whatever language the screen is in now.
 */
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  nl: "Nederlands",
  en: "English",
  es: "Español",
  pt: "Português",
  it: "Italiano",
  ro: "Română",
  pl: "Polski",
};

/** The BCP 47 locale used for dates, numbers and amounts in that language. */
export const LANGUAGE_LOCALES: Record<SupportedLanguage, string> = {
  nl: "nl-NL",
  en: "en-GB",
  es: "es-ES",
  pt: "pt-PT",
  it: "it-IT",
  ro: "ro-RO",
  pl: "pl-PL",
};

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * The supported language a stored or detected value stands for: "en-GB" is English, "pt-BR"
 * Portuguese. Anything else (null, "de", garbage) is `fallback`.
 */
export function toSupportedLanguage(value: unknown, fallback: SupportedLanguage = DEFAULT_LANGUAGE): SupportedLanguage {
  if (typeof value !== "string") return fallback;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isSupportedLanguage(base) ? base : fallback;
}
