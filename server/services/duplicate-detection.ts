/**
 * OPT-019 — "Dubbele klant en chauffeur detecteren".
 *
 * The customer form has 34 fields of which exactly one is required, and there
 * was no duplicate check at all: this audit proved it by posting the same name
 * and e-mail twice and getting two 201s (ids 1302 and 1303). Duplicates then
 * appear silently and are expensive to clean up — find them, delete one, move
 * the reservation across.
 *
 * The rule from the report, and it matters: **warn and open, never block.** Two
 * drivers of the same company legitimately share a phone number, and a family
 * shares an address; a hard block on e-mail would make honest cases
 * impossible. So this only ever answers "these look like the same person",
 * and the employee decides.
 */
import { db } from "../db";
import { customers, drivers } from "../../shared/schema";
import { and, eq, ne, or, sql, isNull } from "drizzle-orm";

export type DuplicateMatch = "email" | "phone";

export interface DuplicateHit {
  id: number;
  name: string;
  /** Which field matched; both, when both did. */
  matchedOn: DuplicateMatch[];
}

/** Digits only: "06-12 34 56 78", "+31612345678" and "0612345678" are one number. */
export function normalizePhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits === "") return "";
  // A Dutch number typed with its country code is the same number as the one
  // typed with a leading zero.
  if (digits.startsWith("31") && digits.length >= 11) return `0${digits.slice(2)}`;
  if (digits.startsWith("0031")) return `0${digits.slice(4)}`;
  return digits;
}

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** A phone number shorter than this is not specific enough to call a match. */
const MIN_PHONE_DIGITS = 8;

function mergeHits(
  byEmail: Array<{ id: number; name: string }>,
  byPhone: Array<{ id: number; name: string }>,
): DuplicateHit[] {
  const hits = new Map<number, DuplicateHit>();
  for (const row of byEmail) {
    hits.set(row.id, { id: row.id, name: row.name, matchedOn: ["email"] });
  }
  for (const row of byPhone) {
    const existing = hits.get(row.id);
    if (existing) existing.matchedOn.push("phone");
    else hits.set(row.id, { id: row.id, name: row.name, matchedOn: ["phone"] });
  }
  return [...hits.values()];
}

export async function findCustomerDuplicates(input: {
  email?: string | null;
  phone?: string | null;
  excludeId?: number | null;
}): Promise<DuplicateHit[]> {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  if (email === "" && phone.length < MIN_PHONE_DIGITS) return [];

  const notSelf = input.excludeId ? ne(customers.id, input.excludeId) : undefined;

  const byEmail = email
    ? await db.select({ id: customers.id, name: customers.name }).from(customers)
        .where(and(sql`lower(${customers.email}) = ${email}`, notSelf))
        .limit(5)
    : [];

  const byPhone = phone.length >= MIN_PHONE_DIGITS
    ? await db.select({ id: customers.id, name: customers.name }).from(customers)
        .where(and(sql`regexp_replace(coalesce(${customers.phone}, ''), '[^0-9]', '', 'g') LIKE ${`%${phone.replace(/^0/, "")}`}`, notSelf))
        .limit(5)
    : [];

  return mergeHits(byEmail, byPhone);
}

export async function findDriverDuplicates(input: {
  customerId?: number | null;
  email?: string | null;
  phone?: string | null;
  excludeId?: number | null;
}): Promise<DuplicateHit[]> {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  if (email === "" && phone.length < MIN_PHONE_DIGITS) return [];

  const notSelf = input.excludeId ? ne(drivers.id, input.excludeId) : undefined;
  // A driver is looked for across the whole book, not only inside one customer:
  // the same person driving for two companies is exactly the case that costs
  // an afternoon to untangle later.
  const scope = undefined;

  const byEmail = email
    ? await db.select({ id: drivers.id, name: drivers.displayName }).from(drivers)
        .where(and(sql`lower(${drivers.email}) = ${email}`, notSelf, scope))
        .limit(5)
    : [];

  const byPhone = phone.length >= MIN_PHONE_DIGITS
    ? await db.select({ id: drivers.id, name: drivers.displayName }).from(drivers)
        .where(and(sql`regexp_replace(coalesce(${drivers.phone}, ''), '[^0-9]', '', 'g') LIKE ${`%${phone.replace(/^0/, "")}`}`, notSelf, scope))
        .limit(5)
    : [];

  return mergeHits(byEmail, byPhone);
}
