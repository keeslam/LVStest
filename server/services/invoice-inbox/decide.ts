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

/** Book only when every rule passes; otherwise name the first rule that did not. */
export function decideInvoiceBooking(input: DecideInput): Decision {
  const review = (reason: ReviewReason): Decision => ({ action: "review", reason });
  if (!input.senderAllowed) return review("unknown_sender");
  if (input.duplicate) return review("duplicate");
  if (input.plates.length === 0) return review("no_plate");
  if (input.plates.length > 1) return review("multiple_plates");
  if (input.fleetMatches.length !== 1) return review("plate_unknown");
  const date = input.invoice.invoiceDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > input.today) return review("total_mismatch");
  if (!totalsMatch(input.invoice, input.tolerance)) return review("total_mismatch");
  return { action: "book", vehicleId: input.fleetMatches[0].id };
}
