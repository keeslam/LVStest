/**
 * Which plain `Error`s thrown by the reservation storage are deliberate refusals
 * (a sentence written for the user) and which are raw exceptions (a database or
 * file-system message that must never reach the wire).
 *
 * The pickup, return, spare and placeholder routes used to answer every Error as
 * a 400 carrying `error.message`, and mapped a few statuses by `includes()` on
 * that text, so a Postgres "duplicate key ... already exists" became a 409 that
 * quoted the constraint. The sentences storage throws on purpose are a closed
 * list; anything else is an unexpected failure: the route logs it and answers a
 * fixed message with a stable code.
 *
 * Add a pattern here when storage gains a new deliberate refusal.
 */
const DELIBERATE_STORAGE_REFUSALS: RegExp[] = [
  /^(Original reservation|Reservation|Vehicle|Placeholder reservation|Transport) not found\.?$/,
  /^Cannot (pickup|return) reservation (with status: |without a vehicle)/,
  /^(Pickup|Return) mileage \([^)]*\) cannot be less than /,
  /^(Replacement|Spare) vehicle cannot be the same as (the )?original vehicle$/,
  /^Vehicle is currently in service and not available$/,
  /^End date must be specified when assigning vehicle to open-ended placeholder reservation$/,
  /^A placeholder spare reservation already exists for this original reservation$/,
];

export function isDeliberateStorageRefusal(error: unknown): error is Error {
  return error instanceof Error && DELIBERATE_STORAGE_REFUSALS.some((pattern) => pattern.test(error.message));
}
