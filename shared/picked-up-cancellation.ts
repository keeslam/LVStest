/**
 * Sub-project C, task 5 (besluiten B-33, B-39) - cancelling or deleting a
 * rental that has been picked up.
 *
 * Shared between the server (`server/services/picked-up-cancellation.ts`, which
 * enforces the rule) and the client (the warning box and the openers). The client
 * branches on these codes, never on the English `message`.
 *
 * Nothing in this file may import from `server/` (the client bundle imports it).
 */
import { UserPermission } from "./schema";

/** `code` of a refused cancel/delete of a picked-up rental. */
export const PICKED_UP_CODES = {
  /**
   * The rental has been picked up and the request carried no `confirmPickedUp`
   * flag. 409, with `actualPickupDate` and `contractNumber` so the dialog can say
   * what is being cancelled.
   */
  CONFIRMATION_REQUIRED: "PICKED_UP_CONFIRMATION_REQUIRED",
  /** The rental has been picked up and the account lacks `cancel_picked_up_rental`. 403. */
  RIGHT_REQUIRED: "PICKED_UP_RIGHT_REQUIRED",
} as const;

/** The right that unlocks cancelling/deleting a picked-up rental (role admin always has it). */
export const PICKED_UP_CANCEL_RIGHT = UserPermission.CANCEL_PICKED_UP_RENTAL;

/** The body of a 409 `PICKED_UP_CONFIRMATION_REQUIRED`. */
export interface PickedUpConfirmationRequired {
  message: string;
  code: typeof PICKED_UP_CODES.CONFIRMATION_REQUIRED;
  actualPickupDate: string | null;
  contractNumber: string | null;
}

/**
 * The stored spellings the server's lifecycle normaliser
 * (`normalizeReservationStatus`, server/services/lifecycle.ts) maps to
 * `picked_up`: the status itself and the two legacy aliases `active` and `in`.
 * The client cannot import the normaliser, so it decides with this list;
 * server/__tests__/c-05-picked-up-cancel.test.ts walks every spelling the
 * normaliser knows and fails when the two disagree.
 */
const PICKED_UP_SPELLINGS: ReadonlySet<string> = new Set(["picked_up", "active", "in"]);

/**
 * Whether cancelling or deleting this row is a "picked-up rental" decision.
 *
 * A maintenance block is not a rental: legacy blocks carry the status `active`,
 * which normalises to `picked_up`, but nothing was ever handed to a customer, so
 * they stay as easy to delete as before.
 */
export function isPickedUpRental(reservation: { status?: unknown; type?: unknown } | null | undefined): boolean {
  if (!reservation) return false;
  if (reservation.type === "maintenance_block") return false;
  if (typeof reservation.status !== "string") return false;
  return PICKED_UP_SPELLINGS.has(reservation.status.trim().toLowerCase());
}
