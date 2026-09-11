/**
 * BUG-148 — one place that turns a Postgres error into something safe to send.
 *
 * The audit found three shapes of leak: `res.json({ message, error })` with the
 * whole pg error object (severity, code, `detail` naming a row id, schema,
 * table, constraint and the server source file), `error.message` echoed
 * verbatim (constraint names), and a duplicate-key on *any* column reported as
 * a duplicate license plate. All of them told the user a constraint name
 * instead of what went wrong.
 *
 * The rule: map the code, name the field in our own vocabulary, and never put
 * `message`, `detail`, `constraint`, `schema` or `table` in a response.
 */

/** Postgres error codes we can say something useful about. */
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const NOT_NULL_VIOLATION = "23502";

/** constraint name -> the field name the client knows it by. */
const CONSTRAINT_FIELDS: Record<string, string> = {
  vehicles_license_plate_unique: "licensePlate",
  vehicles_barcode_unique: "barcode",
  vehicles_chassis_number_unique: "chassisNumber",
  reservations_contract_number_unique: "contractNumber",
  users_username_unique: "username",
  customers_email_unique: "email",
};

export interface DbErrorDescription {
  status: number;
  message: string;
  field?: string;
  /** true when the error really was a recognised database constraint. */
  recognised: boolean;
}

function pgCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") return code;
  if (typeof code === "number") return String(code);
  return null;
}

function constraintOf(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const c = (error as { constraint?: unknown }).constraint;
  return typeof c === "string" ? c : null;
}

/**
 * Describes a database error for the client. Never returns database text:
 * the message is ours, the field name is ours.
 */
export function describeDbError(error: unknown, fallbackMessage = "The operation failed"): DbErrorDescription {
  const code = pgCode(error);
  const constraint = constraintOf(error);
  const field = constraint ? CONSTRAINT_FIELDS[constraint] : undefined;

  if (code === UNIQUE_VIOLATION) {
    return {
      status: 409,
      message: field
        ? `Another record already uses this ${field}.`
        : "Another record already uses one of these values.",
      field,
      recognised: true,
    };
  }
  if (code === FOREIGN_KEY_VIOLATION) {
    return {
      status: 409,
      message: "This record is still linked to other records, or points at a record that does not exist.",
      field,
      recognised: true,
    };
  }
  if (code === NOT_NULL_VIOLATION) {
    return { status: 400, message: "A required field is missing.", field, recognised: true };
  }
  return { status: 500, message: fallbackMessage, recognised: false };
}

/** The body to send. Deliberately has no `error`/`details` key at all. */
export function dbErrorBody(description: DbErrorDescription): Record<string, unknown> {
  return description.field
    ? { message: description.message, field: description.field }
    : { message: description.message };
}
