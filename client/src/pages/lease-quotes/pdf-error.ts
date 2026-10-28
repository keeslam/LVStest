import { describeApiError, parseApiError } from "@/lib/api-error";

/** Lease PDF error codes that have a sentence of their own in leaseQuotes `editor.pdfErrors`. */
const KNOWN_PDF_ERRORS = new Set(["LEASE_NO_TEMPLATE", "LEASE_NO_VARIANT"]);

/** The text for a failed "PDF maken": the lease-specific sentence when the server sent a known code. */
export function describeLeasePdfError(error: unknown, t: (key: string) => string): string {
  const code = parseApiError(error).code;
  return code && KNOWN_PDF_ERRORS.has(code) ? t(`editor.pdfErrors.${code}`) : describeApiError(error);
}
