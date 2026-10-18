/**
 * Dates and amounts in a mail to a customer, written the way the customer's language writes them.
 *
 * Generated documents stay Dutch whatever the customer reads (besluiten B-18, `dutch-format.ts`);
 * this is only for the mails whose wording already follows `preferredLanguage`. Dutch keeps the
 * B-18 notation (dd-mm-jjjj); another language gets its own short numeric date (13/09/2026,
 * 13.09.2026, ...).
 */
import { LANGUAGE_LOCALES, toSupportedLanguage } from '../../shared/languages';
import { formatDateNL, formatNumberNL, toDate, toNumber, type DateLike } from './dutch-format';

/** A date in the notation of `language`; empty string for a missing or unreadable date. */
export function formatDateForLanguage(value: DateLike, language: string | null | undefined): string {
  const lang = toSupportedLanguage(language);
  if (lang === 'nl') return formatDateNL(value);
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(LANGUAGE_LOCALES[lang], { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

/** A bare amount ("95,00", "95.00") in the notation of `language`; the template writes the currency itself. */
export function formatAmountForLanguage(value: unknown, language: string | null | undefined): string {
  const lang = toSupportedLanguage(language);
  if (lang === 'nl') return formatNumberNL(value, 2);
  const numeric = toNumber(value);
  if (numeric === null) return '';
  return new Intl.NumberFormat(LANGUAGE_LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric);
}

/** Date and time on the wall clock of `timeZone`, the way `language` writes them. */
export function formatDateTimeForLanguage(value: DateLike, language: string | null | undefined, timeZone: string): string {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleString(LANGUAGE_LOCALES[toSupportedLanguage(language)], { timeZone });
}
