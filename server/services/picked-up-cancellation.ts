/**
 * Sub-project C, task 5 (besluiten B-33, B-39) - cancelling or deleting a rental
 * that has been picked up.
 *
 * Until now anyone with `manage_reservations` could cancel or delete a rental
 * that was already at the customer, without a word. The owner's rule: allowed for
 * admin and manager, a per-account checkbox for everybody else, and always behind
 * a warning that the rental has been picked up.
 *
 * One check, called from every writer that can cancel or delete a reservation:
 *   PATCH  /api/reservations/:id/status   (status "cancelled")
 *   PATCH  /api/reservations/:id          (the edit form's status "cancelled")
 *   PATCH  /api/reservations/:id/basic    (the quick-edit dialogs; same transition)
 *   DELETE /api/reservations/:id
 *
 * It applies when the EXISTING status normalises to `picked_up`, so the legacy
 * spellings `active` and `in` count as well (lifecycle.ts, BUG-129). Order of the
 * answers: first the right (403 naming it), then the confirmation (409 with what
 * the dialog needs to show), so an account that may not do this is never asked to
 * confirm something it cannot do.
 *
 * A maintenance block is not a rental. Legacy blocks carry the status `active`,
 * which normalises to `picked_up`, but no customer ever had a car: they keep
 * today's behaviour (the same exemption sits in shared/picked-up-cancellation.ts,
 * which the client uses to decide whether to show the warning).
 *
 * The cancellation of a picked-up rental does not revert the vehicle: the
 * odometer keeps the pickup reading and the car counts as available afterwards
 * (spec section 3). Undoing a pickup is the reversal engine's job.
 */
import { UserPermission, UserRole } from "../../shared/schema";
import {
  PICKED_UP_CODES, PICKED_UP_CANCEL_RIGHT,
  type PickedUpConfirmationRequired,
} from "../../shared/picked-up-cancellation";
import { normalizeReservationStatus } from "./lifecycle";

/** What a refusal looks like: the HTTP status and the JSON body to send. */
export interface PickedUpRefusal {
  status: 403 | 409;
  body: Record<string, unknown>;
}

/** The slice of `req.user` this check reads. */
type Actor = { role?: string | null; permissions?: unknown } | null | undefined;

/**
 * True for the flag as the clients send it: the JSON boolean `true`, or the
 * string "true" (a multipart form field, a query string). Anything else - a
 * missing flag, "yes", 1, false - is "not confirmed".
 */
export function isPickedUpConfirmed(value: unknown): boolean {
  return value === true || value === "true";
}

function mayCancelPickedUp(actor: Actor): boolean {
  if (!actor) return false;
  // Role admin always passes, like every other right (middleware/permissions.ts).
  if (actor.role === UserRole.ADMIN) return true;
  const permissions = Array.isArray(actor.permissions) ? (actor.permissions as string[]) : [];
  return permissions.includes(PICKED_UP_CANCEL_RIGHT);
}

/**
 * Whether the existing row is a picked-up RENTAL for this rule: the status goes
 * through the lifecycle normaliser (the source of truth for legacy spellings),
 * and a maintenance block is exempt (same rule as shared isPickedUpRental, which
 * the c-05 test keeps in step with this).
 */
export function requiresPickedUpConfirmation(existing: { status?: unknown; type?: unknown }): boolean {
  return normalizeReservationStatus(existing.status) === "picked_up" && existing.type !== "maintenance_block";
}

/**
 * `null` when the cancellation/deletion may go ahead; otherwise the refusal to
 * send. Call it BEFORE the first write, with the row as it is stored now.
 */
export function checkPickedUpCancellation(
  existing: { status?: unknown; type?: unknown; actualPickupDate?: string | null; contractNumber?: string | null },
  actor: Actor,
  confirmFlag: unknown,
): PickedUpRefusal | null {
  if (!requiresPickedUpConfirmation(existing)) return null;

  if (!mayCancelPickedUp(actor)) {
    return {
      status: 403,
      body: {
        // The wording of hasPermission(...) so every 403 of this kind reads alike.
        message: `Not authorized. One of these permissions required: ${UserPermission.CANCEL_PICKED_UP_RENTAL}`,
        code: PICKED_UP_CODES.RIGHT_REQUIRED,
        requiredPermission: UserPermission.CANCEL_PICKED_UP_RENTAL,
      },
    };
  }

  if (!isPickedUpConfirmed(confirmFlag)) {
    const body: PickedUpConfirmationRequired = {
      message: "This rental has already been picked up. Resend with confirmPickedUp: true to cancel or delete it.",
      code: PICKED_UP_CODES.CONFIRMATION_REQUIRED,
      actualPickupDate: existing.actualPickupDate ?? null,
      contractNumber: existing.contractNumber ?? null,
    };
    return { status: 409, body: { ...body } };
  }

  return null;
}
