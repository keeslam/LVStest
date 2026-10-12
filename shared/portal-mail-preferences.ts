/**
 * Which portal e-mails a customer wants. Two levels:
 * - per account: mails that go to that one account (login on a new device, reply to the account's own request);
 * - per company: mails that go to the company's address (rental changed/cancelled, maintenance, document), set by an admin account.
 * Everything defaults to on; a missing key counts as on. The mails that let someone log in at all
 * (invitation, password reset, e-mail change confirmation) have no switch.
 */
export const ACCOUNT_MAIL_KEYS = ['newDevice', 'requestReply'] as const;
export type AccountMailKey = typeof ACCOUNT_MAIL_KEYS[number];
export type AccountMailPreferences = Partial<Record<AccountMailKey, boolean>>;

/** Column names on portal_customer_settings for the company-wide switches. */
export const COMPANY_MAIL_KEYS = ['mailReservationChanges', 'mailMaintenance', 'mailDocuments'] as const;
export type CompanyMailKey = typeof COMPANY_MAIL_KEYS[number];
export type CompanyMailPreferences = Record<CompanyMailKey, boolean>;

export function accountMailEnabled(prefs: Record<string, unknown> | null | undefined, key: AccountMailKey): boolean {
  return prefs?.[key] !== false;
}
