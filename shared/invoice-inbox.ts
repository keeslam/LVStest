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
  /**
   * The name our own receiving mail server writes at the start of its
   * `Authentication-Results` header, e.g. "mx.host.nl". Empty = lenient mode:
   * only a hard fail takes trust away, because a host that stamps nothing would
   * otherwise make the feature useless. See `senderAuthVerdict`.
   */
  authservId: string;
  /** Allowed difference in euro between the sum of the lines and the invoice total. */
  totalTolerance: number;
}

export const DEFAULT_INVOICE_INBOX_CONFIG: InvoiceInboxConfig = {
  enabled: false, host: '', port: 993, secure: true, username: '', password: '',
  inboxFolder: 'INBOX', processedFolder: 'Verwerkt', pollMinutes: 15,
  allowedSenders: [], authservId: '', totalTolerance: 1,
};

export const INBOX_STATUSES = ['booked', 'review', 'dismissed'] as const;
export type InboxStatus = typeof INBOX_STATUSES[number];

/** In the order they are checked. */
export const REVIEW_REASONS = [
  'no_attachment', 'parse_failed', 'unknown_sender', 'duplicate', 'not_invoice',
  'no_plate', 'multiple_plates', 'plate_unknown', 'total_mismatch',
] as const;
export type ReviewReason = typeof REVIEW_REASONS[number];

/** Used in server-written notifications; the client has its own i18n keys. */
export const REVIEW_REASON_LABELS_NL: Record<ReviewReason, string> = {
  no_attachment: 'geen bruikbare bijlage',
  parse_failed: 'uitlezen mislukt',
  unknown_sender: 'onbekende afzender',
  duplicate: 'mogelijk dubbel',
  not_invoice: 'geen factuur (offerte, herinnering of creditnota)',
  no_plate: 'geen kenteken gevonden',
  multiple_plates: 'meerdere kentekens',
  plate_unknown: 'kenteken niet in de vloot',
  total_mismatch: 'bedragen of datum kloppen niet',
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
  /** What the scanner thinks it is: invoice | credit_note | quote | reminder | other. */
  documentType?: string;
  /**
   * The scanner read no line items and made one up equal to the total, so the
   * lines were never verified against anything — never booked automatically.
   */
  lineItemsFromTotal?: boolean;
  vehicleInfo?: {
    licensePlate?: string;
    chassisNumber?: string;
    licensePlates?: string[];
  };
  /** Normalised plates found on the invoice (upper-case, no dashes). */
  plates?: string[];
}

/**
 * One folder of the mailbox, as the connection test reports it. The app only
 * reads UNREAD mail from the configured inbox folder; a mail that the host
 * filed under spam, or that someone already opened, is invisible to it — this
 * overview is how an administrator sees that without IMAP tooling.
 */
export interface InboxFolderInfo {
  path: string;
  messages: number;
  unseen: number;
  /** \Inbox, \Junk, \Trash, ... when the server (or its name) says so. */
  specialUse: string | null;
}

/** What the connection test learned about the inbox folder, beyond the list of unread mail. */
export interface InboxDiagnostics {
  /** Vendor, name and version the server reports about itself, when it does. */
  server: string | null;
  /** Messages in the inbox folder according to SELECT. */
  exists: number;
  /** Unread messages according to the server's own SEARCH; null when the search failed. */
  searchUnseen: number | null;
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

// ---- Authentication-Results (I2) --------------------------------------------

interface AuthResult { method: string; result: string; props: Record<string, string> }

/**
 * One `Authentication-Results` header: the name of the server that wrote it,
 * and its verdicts. Returns null for a line that is not one.
 */
function parseAuthResults(rawLine: string): { authserv: string; results: AuthResult[] } | null {
  let value = String(rawLine ?? '').trim();
  const colon = value.indexOf(':');
  const headerName = colon === -1 ? '' : value.slice(0, colon).trim().toLowerCase();
  if (headerName === 'authentication-results') value = value.slice(colon + 1);
  // Any other header (a Received line, say) says nothing about authentication.
  else if (/^[A-Za-z][A-Za-z0-9-]*:/.test(value)) return null;

  const segments = value.split(';');
  // "mx.host.nl 1" — the optional version number is not part of the name.
  const authserv = (segments.shift() ?? '').trim().split(/\s+/)[0].toLowerCase();

  const results: AuthResult[] = [];
  for (const segment of segments) {
    const pairs = Array.from(segment.matchAll(/([A-Za-z][A-Za-z0-9_.-]*)\s*=\s*("[^"]*"|[^\s;]+)/g));
    if (pairs.length === 0) continue;
    const [method, rawResult] = [pairs[0][1].toLowerCase(), pairs[0][2].replace(/^"|"$/g, '').toLowerCase()];
    const props: Record<string, string> = {};
    for (const pair of pairs.slice(1)) props[pair[1].toLowerCase()] = pair[2].replace(/^"|"$/g, '').toLowerCase();
    results.push({ method, result: rawResult, props });
  }
  return { authserv, results };
}

/** "user@garage.nl" and "garage.nl" both belong to garage.nl. */
const domainOf = (value: string): string => {
  const text = String(value ?? '').trim().toLowerCase().replace(/^<|>$/g, '');
  const at = text.lastIndexOf('@');
  return at === -1 ? text : text.slice(at + 1);
};

/**
 * What the receiving mail server said about this mail — the only thing that can
 * contradict a From address, which anyone may type.
 *
 * With `authservId` filled in (strict), only the **top-most** line carrying that
 * name is read. A receiving server prepends its own header, so that line is the
 * one it wrote; everything below it was already in the message and may have been
 * typed by the sender, our authserv-id included. The mail then has to earn its
 * pass in that single line: a DMARC pass about the From domain, or an SPF/DKIM
 * pass aligned with it — and a DMARC fail in the same line beats any of them,
 * because DMARC is the verdict that weighs alignment. No such line, or no pass
 * in it: `fail`.
 *
 * With `authservId` empty (lenient, the default, because many hosts stamp
 * nothing) every line is read but only a hard fail — or an SPF softfail —
 * counts; a forged "pass" still gains an attacker nothing, since a pass is
 * never what grants trust here.
 */
export function senderAuthVerdict(headerLines: string[], fromDomain: string, authservId: string): 'pass' | 'fail' | 'none' {
  const parsed = (headerLines ?? []).map(parseAuthResults).filter((p): p is { authserv: string; results: AuthResult[] } => p !== null);
  const domain = domainOf(fromDomain);
  const wanted = String(authservId ?? '').trim().toLowerCase();

  if (!wanted) {
    const failed = parsed.some(({ results }) => results.some((r) =>
      (r.method === 'dmarc' && r.result === 'fail')
      || (r.method === 'spf' && (r.result === 'fail' || r.result === 'softfail'))));
    return failed ? 'fail' : 'none';
  }

  // `headerLines` arrive in message order, so the first match is the top-most one.
  const ours = parsed.find((p) => p.authserv === wanted);
  if (!ours) return 'fail';

  if (ours.results.some((r) => r.method === 'dmarc' && r.result === 'fail')) return 'fail';
  const passed = ours.results.some((r) => {
    if (r.result !== 'pass') return false;
    // DMARC is evaluated against the From domain by definition; a line that
    // names another domain is not about this mail's sender.
    if (r.method === 'dmarc') return !r.props['header.from'] || domainOf(r.props['header.from']) === domain;
    if (r.method === 'spf') return Boolean(r.props['smtp.mailfrom']) && domainOf(r.props['smtp.mailfrom']) === domain;
    if (r.method === 'dkim') return Boolean(r.props['header.d']) && domainOf(r.props['header.d']) === domain;
    return false;
  });
  return passed ? 'pass' : 'fail';
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
