/**
 * Dates in a mail to a customer, written the way the customer's language writes them.
 *
 * Generated documents stay Dutch whatever the customer reads (besluiten B-18, `dutch-format.ts`);
 * this is only for the mails whose wording already follows `preferredLanguage`. Dutch keeps the
 * B-18 notation (dd-mm-jjjj); another language gets its own short numeric date (13/09/2026,
 * 13.09.2026, ...).
 */
import { LANGUAGE_LOCALES, toSupportedLanguage } from '../../shared/languages';
import { formatDateNL, toDate, type DateLike } from './dutch-format';

/** A date in the notation of `language`; empty string for a missing or unreadable date. */
export function formatDateForLanguage(value: DateLike, language: string | null | undefined): string {
  const lang = toSupportedLanguage(language);
  if (lang === 'nl') return formatDateNL(value);
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(LANGUAGE_LOCALES[lang], { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}
