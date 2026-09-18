import type { InboxParsedInvoice, ReviewReason } from "../../../shared/invoice-inbox";

export interface DecideInput {
  /** On the allowlist AND not failing SPF/DMARC. */
  senderAllowed: boolean;
  /** Another booked or waiting item carries the same invoice hash. */
  duplicate: boolean;
  /** Distinct normalised plates found on the invoice. */
  plates: string[];
  /** Fleet vehicles whose plate is one of `plates`. */
  fleetMatches: Array<{ id: number; licensePlate: string }>;
  invoice: InboxParsedInvoice;
  /** Euro. */
  tolerance: number;
  /** YYYY-MM-DD in Europe/Amsterdam. */
  today: string;
}

export type Decision = { action: "book"; vehicleId: number } | { action: "review"; reason: ReviewReason };

const cents = (n: unknown) => Math.round((Number(n) || 0) * 100);

/**
 * Garage invoices list their lines excl. VAT and their total incl. VAT, so the
 * line sum is compared with both: the total, the stated subtotal, and total
 * minus VAT. One of them within the tolerance is enough.
 */
export function totalsMatch(invoice: InboxParsedInvoice, tolerance: number): boolean {
  if (!invoice.lineItems || invoice.lineItems.length === 0) return false;
  const sum = invoice.lineItems.reduce((acc, item) => acc + cents(item.amount), 0);
  const targets = [cents(invoice.totalAmount)];
  if ((invoice.subtotalAmount ?? 0) > 0) targets.push(cents(invoice.subtotalAmount));
  if ((invoice.vatAmount ?? 0) > 0) targets.push(cents(invoice.totalAmount) - cents(invoice.vatAmount));
  return targets.some((target) => Math.abs(sum - target) <= cents(tolerance));
}

/** How far back an invoice may be dated and still be booked without a person looking. */
export const MAX_INVOICE_AGE_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * I4: a date the scanner really read, not one that merely looks like a date.
 * "2026-02-31" passes a regular expression and then silently becomes 3 March,
 * so the value has to survive the round trip; an invoice from the future or
 * from more than 400 days ago is not something to book behind a person's back.
 */
function dateIsTrustworthy(date: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false;
  if (date > today) return false;
  return Date.parse(`${today}T00:00:00Z`) - parsed.getTime() <= MAX_INVOICE_AGE_DAYS * DAY_MS;
}

/** Book only when every rule passes; otherwise name the first rule that did not. */
export function decideInvoiceBooking(input: DecideInput): Decision {
  const review = (reason: ReviewReason): Decision => ({ action: "review", reason });
  if (!input.senderAllowed) return review("unknown_sender");
  if (input.duplicate) return review("duplicate");
  // I4: a quote, a reminder or a credit note is not a request to pay for work
  // that was done. Only what the scanner recognised as an invoice is booked;
  // when it read no type at all the rule cannot fire and the rest decides.
  const documentType = String(input.invoice.documentType ?? "").trim().toLowerCase();
  if (documentType && documentType !== "invoice") return review("not_invoice");
  if (input.plates.length === 0) return review("no_plate");
  if (input.plates.length > 1) return review("multiple_plates");
  if (input.fleetMatches.length !== 1) return review("plate_unknown");
  // Lines the scanner invented out of the total were never checked against
  // anything, so "the lines add up to the total" would be true by construction.
  if (input.invoice.lineItemsFromTotal) return review("total_mismatch");
  if (!dateIsTrustworthy(input.invoice.invoiceDate, input.today)) return review("total_mismatch");
  if (!totalsMatch(input.invoice, input.tolerance)) return review("total_mismatch");
  return { action: "book", vehicleId: input.fleetMatches[0].id };
}
