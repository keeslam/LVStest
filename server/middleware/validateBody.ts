/**
 * FIX-D — request-body validation and partial-update semantics.
 *
 * Closes BUG-202, BUG-084, BUG-111, BUG-063, BUG-025, BUG-052, BUG-104,
 * BUG-122, BUG-127, BUG-172, BUG-148, BUG-194.
 *
 * The audit counted 25 hand-written `"" -> null` coercion blocks across the
 * routes, each a whitelist of column names somebody had to remember to extend.
 * Two of them had already drifted: `replacementForTransportId` (added
 * 2026-08-29) and `portalRequestId` (added 2026-09-06) never made it into the
 * list in `PATCH /api/reservations/:id`, so the reservation edit form — which
 * posts *every* column of the row, with nulls as empty strings — sent
 * `portalRequestId=""` into an integer column and got
 * `invalid input syntax for type integer: ""`. That is BUG-202: twelve days of
 * a 100 % failure rate on the most ordinary action in the system.
 *
 * A whitelist cannot be kept in step with a schema by hand, so this module does
 * not have one. Everything is derived from the drizzle table definition:
 *
 *  1. **coerce** — for every column, using its real `dataType`/`columnType`:
 *     `""`/`"null"` become `null` on a nullable column; a numeric string becomes
 *     a number on an integer column; `"true"`/`"false"` become booleans on a
 *     boolean column; a number becomes a string on a `numeric` column. Adding a
 *     column to the schema extends the coercion in the same commit, by
 *     construction. (`multipart/form-data` sends every field as a string, which
 *     is why this step exists at all.)
 *  2. **validate** — `<insertSchema>.partial()`, so a body carrying one field is
 *     legal and a body carrying nonsense is a 400 instead of a Postgres error.
 *     The schemas stay non-strict: unknown keys are *stripped*, not rejected,
 *     because several screens still post the whole row back (plan §3 FIX-D,
 *     "tighten to .strict() only in a later, separate commit").
 *  3. **strip** — `id`, the `created*`/`updated*`/`deleted*` bookkeeping and the
 *     server-owned path columns can never come from a client (BUG-084).
 *  4. **project** — the result holds only the keys the request actually sent,
 *     which is what ends the read-merge-write lost update in BUG-122/BUG-172:
 *     an UPDATE now touches the fields that were edited and nothing else.
 */
import { getTableColumns } from "drizzle-orm";
import type { Table } from "drizzle-orm";
import { z, type ZodObject, type ZodRawShape } from "zod";

/**
 * Bookkeeping the server owns. Never writable from a request body, on any
 * table, whatever the schema happens to allow.
 */
export const SERVER_OWNED_FIELDS = [
  "id",
  "createdAt",
  "createdBy",
  "createdByUser",
  "updatedAt",
  "updatedBy",
  "updatedByUser",
  "deletedAt",
  "deletedBy",
  "deletedByUser",
] as const;

/** A 400 with field-level detail and nothing from the database in it. */
export class BodyValidationError extends Error {
  readonly status = 400;
  readonly issues: Array<{ field: string; message: string }>;

  constructor(message: string, issues: Array<{ field: string; message: string }>) {
    super(message);
    this.name = "BodyValidationError";
    this.issues = issues;
  }

  /** The response body. No `error`, no stack, no Postgres text. */
  toBody(): Record<string, unknown> {
    return { message: this.message, errors: this.issues };
  }

  static fromZod(error: z.ZodError, message = "Invalid request data"): BodyValidationError {
    return new BodyValidationError(
      message,
      error.errors.map((e) => ({ field: e.path.join(".") || "(body)", message: e.message })),
    );
  }
}

interface ColumnMeta {
  dataType: string;
  columnType: string;
  notNull: boolean;
}

function columnMeta(table: Table): Record<string, ColumnMeta> {
  const out: Record<string, ColumnMeta> = {};
  for (const [name, column] of Object.entries(getTableColumns(table) as Record<string, any>)) {
    out[name] = {
      dataType: String(column.dataType),
      columnType: String(column.columnType),
      notNull: Boolean(column.notNull),
    };
  }
  return out;
}

const metaCache = new WeakMap<object, Record<string, ColumnMeta>>();

function metaFor(table: Table): Record<string, ColumnMeta> {
  const cached = metaCache.get(table as unknown as object);
  if (cached) return cached;
  const meta = columnMeta(table);
  metaCache.set(table as unknown as object, meta);
  return meta;
}

/** The strings a form sends for "this field is empty". */
function isEmptyMarker(value: unknown): boolean {
  return value === "" || value === "null" || value === "undefined";
}

/**
 * Step 1. Coerces a raw request body (which for multipart is all strings) into
 * the shapes the column types expect. Only keys that exist as columns are
 * touched; everything else is passed through untouched for the schema to judge.
 *
 * This is the generic replacement for the 25 hand-maintained lists, and the
 * direct fix for BUG-202.
 */
export function coerceBodyForTable(table: Table, body: Record<string, unknown>): Record<string, unknown> {
  const meta = metaFor(table);
  const out: Record<string, unknown> = { ...body };

  for (const [key, value] of Object.entries(out)) {
    const column = meta[key];
    if (!column) continue;

    // "" / "null" on a nullable column means "clear it". On a NOT NULL column
    // we leave the value alone so the schema can reject it with a field name.
    if (isEmptyMarker(value)) {
      if (!column.notNull) out[key] = null;
      continue;
    }
    if (value === null || value === undefined) continue;

    if (column.dataType === "number" && typeof value === "string") {
      // Only a clean integer/decimal literal; "abc" stays a string so the
      // schema answers 400 rather than the driver answering 500.
      const trimmed = value.trim();
      if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed)) out[key] = parsed;
      }
      continue;
    }

    if (column.dataType === "boolean" && typeof value === "string") {
      const lowered = value.trim().toLowerCase();
      if (lowered === "true" || lowered === "on" || lowered === "1") out[key] = true;
      else if (lowered === "false" || lowered === "off" || lowered === "0") out[key] = false;
      continue;
    }

    // drizzle types `numeric` as a string. A JSON client that sends a number is
    // being reasonable; make it fit rather than 400 on it.
    if (column.columnType === "PgNumeric" && typeof value === "number" && Number.isFinite(value)) {
      out[key] = String(value);
      continue;
    }
  }

  return out;
}

/** The range a Postgres `integer` column actually holds. */
export const INT4_MIN = -2147483648;
export const INT4_MAX = 2147483647;

/**
 * BUG-025 — `{ overrideNumber: 9e18 }` passed every `typeof value === 'number'`
 * check in the code and then overflowed an `integer` column, which came back as
 * a 500. drizzle-zod types an integer column as `z.number().int()` with no
 * bounds, so the range check has to be added, and adding it here means every
 * route that validates through this module gets it at once.
 */
function assertColumnRanges(table: Table, value: Record<string, unknown>, message: string): void {
  const meta = metaFor(table);
  const issues: Array<{ field: string; message: string }> = [];
  for (const [key, raw] of Object.entries(value)) {
    const column = meta[key];
    if (!column || raw === null || raw === undefined) continue;
    if (column.dataType === "number" && typeof raw === "number") {
      if (!Number.isFinite(raw)) {
        issues.push({ field: key, message: "Must be a number" });
      } else if (column.columnType === "PgInteger" || column.columnType === "PgSerial") {
        if (!Number.isInteger(raw)) issues.push({ field: key, message: "Must be a whole number" });
        else if (raw < INT4_MIN || raw > INT4_MAX) issues.push({ field: key, message: "Out of range" });
      }
    }
    if (column.columnType === "PgNumeric" && typeof raw === "string" && raw !== "") {
      if (!Number.isFinite(Number(raw))) issues.push({ field: key, message: "Must be a number" });
    }
  }
  if (issues.length) throw new BodyValidationError(message, issues);
}

export interface PartialUpdateOptions<S extends ZodObject<ZodRawShape>> {
  /** The drizzle table the body is written to — the source of the coercion. */
  table: Table;
  /** An *unrefined* insert schema; refinements are cross-field and belong on the merged row. */
  schema: S;
  /** Extra keys this route owns (paths, computed columns, …). */
  strip?: readonly string[];
  /** Message for the 400. */
  message?: string;
}

/**
 * Steps 1–4 together: the validated set of columns this request asked to
 * change, and nothing else.
 *
 * Throws `BodyValidationError` (status 400) when the body does not fit the
 * schema. Never throws for an unknown key — those are dropped.
 */
export function parsePartialUpdate<S extends ZodObject<ZodRawShape>>(
  body: unknown,
  { table, schema, strip = [], message = "Invalid request data" }: PartialUpdateOptions<S>,
): Partial<z.infer<S>> {
  const raw = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const stripped = new Set<string>([...SERVER_OWNED_FIELDS, ...strip]);

  const coerced = coerceBodyForTable(table, raw);
  for (const key of stripped) delete coerced[key];

  const parsed = schema.partial().safeParse(coerced);
  if (!parsed.success) throw BodyValidationError.fromZod(parsed.error, message);

  // Only what the request actually carried: a PATCH that sends one field must
  // write one field (BUG-122, BUG-172), and a zod default must not become an
  // unrequested write.
  const present = new Set(Object.keys(coerced));
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data as Record<string, unknown>)) {
    if (!present.has(key)) continue;
    if (value === undefined) continue;
    result[key] = value;
  }
  assertColumnRanges(table, result, message);
  return result as Partial<z.infer<S>>;
}

/**
 * Validates a *create* body the same way — coercion plus the full schema, with
 * the server-owned keys stripped first. `schema` may be refined here, because a
 * create carries the whole row.
 */
export function parseCreateBody<T>(
  body: unknown,
  options: { table: Table; schema: { parse(value: unknown): T }; strip?: readonly string[]; message?: string },
): T {
  const raw = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const stripped = new Set<string>([...SERVER_OWNED_FIELDS, ...(options.strip ?? [])]);
  const coerced = coerceBodyForTable(options.table, raw);
  for (const key of stripped) delete coerced[key];
  try {
    const parsed = options.schema.parse(coerced);
    if (parsed && typeof parsed === "object") {
      assertColumnRanges(options.table, parsed as Record<string, unknown>, options.message ?? "Invalid request data");
    }
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) throw BodyValidationError.fromZod(error, options.message ?? "Invalid request data");
    throw error;
  }
}

/**
 * The columns of `table` whose values a request body could break by sending an
 * empty string — i.e. everything a hand-maintained coercion list would have had
 * to remember. The BUG-202 drift test asserts this set is fully covered.
 */
export function nullableNonTextColumns(table: Table): string[] {
  const meta = metaFor(table);
  return Object.entries(meta)
    .filter(([, c]) => !c.notNull && c.dataType !== "string")
    .map(([name]) => name)
    .sort();
}
