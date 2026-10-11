import { and, eq, gte } from "drizzle-orm";
import { expenses, type Expense } from "../../../shared/schema";
import type { DbTransaction } from "../../db";

/**
 * Besluit B-41 D1: a fuel amount typed at "Brandstofstatus bijwerken" is also an
 * expense (category `fuel`) on that vehicle. The helpers here are the pure and
 * the lookup halves of that rule; the route owns the transaction.
 */

/** `expenses.source` of an expense the fuel-status route booked. */
export const FUEL_REFILL_SOURCE = "fuel_refill";

/** A second identical request inside this window is a double submit, not a new refill. */
export const FUEL_DOUBLE_SUBMIT_WINDOW_MS = 2 * 60 * 1000;

/** The expense schema's own ceiling (`insertExpenseSchema`), so the two never disagree. */
export const FUEL_COST_MAX = 1_000_000;

export type FuelCost =
  | { kind: "none" }
  | { kind: "ok"; amount: number }
  | { kind: "invalid" };

/**
 * The amount from the request. Absent or blank is "no amount" (the dialog only
 * sends the field when the user typed one). Anything else must be a plain
 * positive number of at most 1,000,000 with a dot or a comma as the decimal
 * separator; it is rounded to cents like the numeric(10,2) column would.
 */
export function parseFuelCost(raw: unknown): FuelCost {
  if (raw === undefined || raw === null) return { kind: "none" };
  const text = String(raw).trim();
  if (text === "") return { kind: "none" };
  const normalised = text.includes(".") ? text : text.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalised)) return { kind: "invalid" };
  const amount = Math.round(Number(normalised) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0.01 || amount > FUEL_COST_MAX) return { kind: "invalid" };
  return { kind: "ok", amount };
}

/** Identifies one refill event: same vehicle, level, amount and office day. */
export function fuelSourceRef(vehicleId: number, level: string | null, amount: number, officeDate: string): string {
  return `vehicle:${vehicleId}:${level ?? "-"}:${amount.toFixed(2)}:${officeDate}`;
}

/** "Tankbeurt 3/4 11-10-2026": the description is data, written in Dutch like the invoice ones. */
export function fuelExpenseDescription(level: string | null, officeDate: string): string {
  const [year, month, day] = officeDate.split("-");
  const shown = `${day}-${month}-${year}`;
  return level ? `Tankbeurt ${level} ${shown}` : `Tankbeurt ${shown}`;
}

/**
 * The expense a request with this `sourceRef` already booked in the last two
 * minutes, if any. Called after the vehicle row was updated in the same
 * transaction: that update holds the row lock, so a concurrent twin waits for the
 * first commit and then sees its expense here.
 */
export async function findRecentFuelExpense(
  tx: DbTransaction,
  vehicleId: number,
  sourceRef: string,
  now: Date = new Date(),
): Promise<Expense | undefined> {
  const since = new Date(now.getTime() - FUEL_DOUBLE_SUBMIT_WINDOW_MS);
  const [row] = await tx.select().from(expenses).where(and(
    eq(expenses.vehicleId, vehicleId),
    eq(expenses.source, FUEL_REFILL_SOURCE),
    eq(expenses.sourceRef, sourceRef),
    gte(expenses.createdAt, since),
  )).limit(1);
  return row as Expense | undefined;
}
