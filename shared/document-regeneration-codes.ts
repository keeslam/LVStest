/**
 * Stable reasons POST /api/documents/:id/regenerate can refuse for besides the contract codes in
 * shared/contract-error-codes.ts (NO_VEHICLE, NO_TEMPLATE, ... are reused from there). The English
 * `message` stays; the client translates by this code (audit remediation P11, "Opnieuw genereren").
 * Server-only union: nothing in this file may import from `server/`.
 */
export const REGENERATION_ERROR_CODES = [
  /** The document id does not exist. */
  "DOCUMENT_NOT_FOUND",
  /** The document was uploaded or produced elsewhere; there is no generator to reproduce it. */
  "NOT_REGENERATABLE",
  /** A generated document that is not linked to a reservation has nothing to be rebuilt from. */
  "NO_RESERVATION_LINK",
  /** The reservation the document belongs to no longer exists. */
  "RESERVATION_NOT_FOUND",
  /** No damage check template exists to draw the check on. */
  "NO_DAMAGE_CHECK_TEMPLATE",
] as const;

export type RegenerationErrorCode = (typeof REGENERATION_ERROR_CODES)[number];
