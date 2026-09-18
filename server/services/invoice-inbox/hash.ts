import crypto from "crypto";

export function sha256(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** The invoice number as both duplicate checks compare it: no whitespace, upper case. */
export function normalizeInvoiceNumber(invoiceNumber: unknown): string {
  return String(invoiceNumber ?? "").replace(/\s+/g, "").toUpperCase();
}

/** The invoice total in whole cents, or null when it is not a usable number. */
export function invoiceTotalCents(totalAmount: unknown): number | null {
  const amount = Number(totalAmount);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
}

/**
 * Identity of an invoice, independent of the file it arrived in. Null when the
 * invoice carries no number: vendor + date + total alone would call two fuel
 * receipts of the same day "duplicates".
 */
export function computeInvoiceHash(invoice: { vendor?: string; invoiceNumber?: string; invoiceDate?: string; totalAmount?: number }): string | null {
  const number = normalizeInvoiceNumber(invoice.invoiceNumber);
  if (!number) return null;
  const vendor = String(invoice.vendor ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const total = (Math.round((Number(invoice.totalAmount) || 0) * 100) / 100).toFixed(2);
  return sha256(`${vendor}|${number}|${String(invoice.invoiceDate ?? "").trim()}|${total}`);
}
