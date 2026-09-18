/**
 * Invoices by e-mail — shared types and pure helpers.
 * Design: docs/superpowers/specs/2026-09-18-invoice-inbox-design.md
 */

export const INVOICE_INBOX_CONFIG_KEY = 'invoice_inbox_config';
/** Shown instead of the stored password; coming back on save it means "keep what is stored". */
export const INVOICE_INBOX_PASSWORD_MASK = '********';

/**
 * Shown on an inbox item whose booking was interrupted between creating the
 * item and marking it "booked" — used by both the mail importer and the
 * manual scan route when they compensate for that gap.
 */
export const INTERRUPTED_BOOKING_MESSAGE =
  'Het boeken is onderbroken voordat er kosten waren aangemaakt. Controleer de factuur en boek hem hier.';

export interface InvoiceInboxConfig {
  /** Scheduler on/off. */
  enabled: boolean;
  host: string;
  /** 993 (implicit TLS) or 143 (STARTTLS). */
  port: number;
  /** true = implicit TLS, false = STARTTLS. */
  secure: boolean;
  username: string;
  password: string;
  inboxFolder: string;
  /** Where a handled mail is moved to; "" = leave it in place and mark it read. */
  processedFolder: string;
  /** 5..1440 */
  pollMinutes: number;
  /** "naam@garage.nl" or "@garage.nl", lower-case. */
  allowedSenders: string[];
  /** Allowed difference in euro between the sum of the lines and the invoice total. */
  totalTolerance: number;
}

export const DEFAULT_INVOICE_INBOX_CONFIG: InvoiceInboxConfig = {
  enabled: false, host: '', port: 993, secure: true, username: '', password: '',
  inboxFolder: 'INBOX', processedFolder: 'Verwerkt', pollMinutes: 15,
  allowedSenders: [], totalTolerance: 1,
};

export const INBOX_STATUSES = ['booked', 'review', 'dismissed'] as const;
export type InboxStatus = typeof INBOX_STATUSES[number];

/** In the order they are checked. */
export const REVIEW_REASONS = [
  'no_attachment', 'parse_failed', 'unknown_sender', 'duplicate',
  'no_plate', 'multiple_plates', 'plate_unknown', 'total_mismatch',
] as const;
export type ReviewReason = typeof REVIEW_REASONS[number];

/** Used in server-written notifications; the client has its own i18n keys. */
export const REVIEW_REASON_LABELS_NL: Record<ReviewReason, string> = {
  no_attachment: 'geen bruikbare bijlage',
  parse_failed: 'uitlezen mislukt',
  unknown_sender: 'onbekende afzender',
  duplicate: 'mogelijk dubbel',
  no_plate: 'geen kenteken gevonden',
  multiple_plates: 'meerdere kentekens',
  plate_unknown: 'kenteken niet in de vloot',
  total_mismatch: 'bedragen kloppen niet',
};

/** Stored values stay English; only labels are translated. */
export const EXPENSE_CATEGORIES = [
  'Maintenance', 'Tires', 'Brakes', 'Damage', 'Fuel',
  'Insurance', 'Registration', 'Cleaning', 'Accessories', 'Other',
] as const;

export interface InboxLineItem {
  description: string;
  amount: number;
  category: string;
  subcategory?: string;
}

/** What the scanner returns, plus `plates` added by the importer. */
export interface InboxParsedInvoice {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string;
  currency: string;
  totalAmount: number;
  subtotalAmount?: number;
  vatAmount?: number;
  lineItems: InboxLineItem[];
  vehicleInfo?: {
    licensePlate?: string;
    chassisNumber?: string;
    licensePlates?: string[];
  };
  /** Normalised plates found on the invoice (upper-case, no dashes). */
  plates?: string[];
}

export interface InvoiceInboxRunSummary {
  startedAt: string;
  finishedAt: string;
  trigger: 'scheduler' | 'manual';
  mails: number;
  attachments: number;
  booked: number;
  review: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/** "Naam <A@B.nl>" -> "a@b.nl"; anything without an @ -> "". */
export function normalizeSender(raw: string): string {
  const text = String(raw ?? '');
  const open = text.lastIndexOf('<');
  const close = text.lastIndexOf('>');
  const address = (open !== -1 && close > open ? text.slice(open + 1, close) : text).trim().toLowerCase();
  return address.includes('@') && !/\s/.test(address) ? address : '';
}

/** An entry is a full address, or "@domain" for every address at exactly that domain. */
export function isAllowedSender(from: string, allowed: string[]): boolean {
  const address = normalizeSender(from);
  if (!address) return false;
  const domain = address.slice(address.lastIndexOf('@'));
  return allowed.some((entry) => {
    const e = String(entry ?? '').trim().toLowerCase();
    if (!e) return false;
    return e.startsWith('@') ? domain === e : address === e;
  });
}
