/**
 * Dates, amounts and numbers in the customer portal, in the notation of the language the portal
 * is shown in: 13-09-2026 and € 95,00 in Dutch, 13/09/2026 and 95,00 € in Spanish, 13.09.2026 in
 * Polish. The staff app keeps its Dutch notation (format-date-nl.ts, format-utils.ts); generated
 * documents stay Dutch whatever the customer reads (besluiten B-18).
 *
 * Each function reads the current i18n language when it runs; a portal component re-renders on a
 * language switch because it uses `useTranslation`.
 */
import { format } from "date-fns";
import type { Locale } from "date-fns";
import { enGB, es, it, nl, pl, pt, ro } from "date-fns/locale";
import { LANGUAGE_LOCALES, toSupportedLanguage, type SupportedLanguage } from "@shared/languages";
import i18n from "@/i18n";
import { EMPTY_DATE, toScreenDate } from "@/lib/format-date-nl";

const DATE_FNS_LOCALES: Record<SupportedLanguage, Locale> = { nl, en: enGB, es, pt, it, ro, pl };

function currentLanguage(): SupportedLanguage {
  return toSupportedLanguage(i18n.language);
}

/** The date-fns locale of a language (calendars, weekday names); the current portal language by default. */
export function dateFnsLocaleFor(language: string = currentLanguage()): Locale {
  return DATE_FNS_LOCALES[toSupportedLanguage(language)];
}

/** The BCP 47 locale of the current portal language, for `Intl` and `toLocaleString`. */
export function portalIntlLocale(): string {
  return LANGUAGE_LOCALES[currentLanguage()];
}

/**
 * A day: "13-09-2026" in Dutch, "13/09/2026" in English, Spanish, Portuguese and Italian,
 * "13.09.2026" in Romanian and Polish. Accepts the yyyy-MM-dd the API returns as well as a
 * timestamp (shown on the office clock). Empty input is an empty string, like before.
 */
export function formatPortalDate(value: string | Date | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const date = toScreenDate(value);
  if (!date) return typeof value === "string" ? value : "";
  return format(date, "P", { locale: dateFnsLocaleFor() });
}

/** A moment: the day as `formatPortalDate` writes it, then the 24-hour time. */
export function formatPortalDateTime(value: string | Date | number | null | undefined): string {
  const date = toScreenDate(value);
  if (!date) return EMPTY_DATE;
  return `${format(date, "P", { locale: dateFnsLocaleFor() })} ${format(date, "HH:mm")}`;
}

/** An amount in euro with cents ("€ 95,00", "95,00 €"); a missing or unreadable amount is a dash. */
export function formatPortalCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "–";
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return "–";
  return new Intl.NumberFormat(portalIntlLocale(), { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** A day with the month as a word: "13 sep. 2026", "13 sept 2026", "13 wrz 2026". */
export function formatPortalDateMedium(value: string | Date | number | null | undefined): string {
  const date = toScreenDate(value);
  if (!date) return EMPTY_DATE;
  return format(date, "PP", { locale: dateFnsLocaleFor() });
}

/** A moment with the month as a word, then the 24-hour time. */
export function formatPortalDateTimeMedium(value: string | Date | number | null | undefined): string {
  const date = toScreenDate(value);
  if (!date) return EMPTY_DATE;
  return `${format(date, "PP", { locale: dateFnsLocaleFor() })} ${format(date, "HH:mm")}`;
}

/** A plain number with the language's grouping and decimal marks. */
export function formatPortalNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(portalIntlLocale(), options).format(value);
}
