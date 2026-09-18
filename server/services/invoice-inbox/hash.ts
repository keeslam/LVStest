import crypto from "crypto";

export function sha256(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Identity of an invoice, independent of the file it arrived in. Null when the
 * invoice carries no number: vendor + date + total alone would call two fuel
 * receipts of the same day "duplicates".
 */
export function computeInvoiceHash(invoice: { vendor?: string; invoiceNumber?: string; invoiceDate?: string; totalAmount?: number }): string | null {
  const number = String(invoice.invoiceNumber ?? "").replace(/\s+/g, "").toUpperCase();
  if (!number) return null;
  const vendor = String(invoice.vendor ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const total = (Math.round((Number(invoice.totalAmount) || 0) * 100) / 100).toFixed(2);
  return sha256(`${vendor}|${number}|${String(invoice.invoiceDate ?? "").trim()}|${total}`);
}
