/**
 * B-34 — one stable reason code for every way contract generation can fail.
 *
 * Every contract-generating route already had its own English `message`
 * (kept unchanged); what it did not have was anything the client could
 * translate reliably. Matching the English sentence is exactly what the
 * client must never do (besluiten: "client translates by stable code, never
 * by matching English text") — so from here on every failure also carries one
 * of these codes, and the client (task 6) maps *that* to nl/en copy.
 *
 * Server-only union: nothing in this file may import from `server/`, so the
 * client bundle can import it too.
 */
export const CONTRACT_ERROR_CODES = [
  /** No PDF template exists at all (`pdf_templates` is empty). */
  "NO_TEMPLATE",
  /** Two or more templates exist and none is marked default (B-34/BUG-181a:
   *  refuse instead of silently guessing "the lowest id"). */
  "NO_DEFAULT_TEMPLATE",
  /** An explicit `templateId` was given and it does not exist. */
  "TEMPLATE_NOT_FOUND",
  /** The template that would be used has zero field definitions, so the
   *  contract would be a blank page (BUG-028). */
  "TEMPLATE_WITHOUT_FIELDS",
  /** The template names a background file/image that cannot be read
   *  (deleted from disk, moved, ...) (BUG-179). */
  "TEMPLATE_BACKGROUND_MISSING",
  /** The reservation has a `vehicleId` but the vehicle itself could not be
   *  loaded (e.g. deleted after the reservation was made). */
  "NO_VEHICLE",
  /** The reservation is a placeholder spare: no vehicle has been assigned to
   *  it yet, so there is nothing to draw a contract for. */
  "PLACEHOLDER_RESERVATION",
  /** The reservation has no customer, so the contract would be missing the
   *  tenant's details. */
  "NO_CUSTOMER",
  /** The reservation is a maintenance block, not a rental. */
  "MAINTENANCE_BLOCK",
  /** The renderer threw for a reason none of the above names — a real bug,
   *  not a configuration problem the operator can fix from Settings. */
  "RENDER_FAILED",
] as const;

export type ContractErrorCode = (typeof CONTRACT_ERROR_CODES)[number];
