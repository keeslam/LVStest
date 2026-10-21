/**
 * Kees, 2026-10-21 — the deductible (eigen risico) per customer per vehicle type,
 * domestic and abroad. Stored on the customer as `{ byType: { <type key>: { domestic,
 * abroad } } }`, the type key as km-allowance uses it (lower case, "other" for no type).
 * An amount left empty falls back to the general amount from Bedrijfsregels.
 */
import { vehicleTypeKey } from "./km-allowance";

export interface DeductiblePair {
  domestic?: number | null;
  abroad?: number | null;
}

export interface CustomerDeductibles {
  byType: Record<string, DeductiblePair>;
}

const amountOk = (v: unknown) => v === null || v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1_000_000);

export function isValidCustomerDeductibles(value: unknown): value is CustomerDeductibles | null {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const byType = (value as { byType?: unknown }).byType;
  if (!byType || typeof byType !== "object" || Array.isArray(byType)) return false;
  const entries = Object.entries(byType as Record<string, unknown>);
  if (entries.length > 100) return false;
  return entries.every(([key, pair]) =>
    key.length > 0 && key.length <= 50
    && !!pair && typeof pair === "object" && !Array.isArray(pair)
    && amountOk((pair as DeductiblePair).domestic) && amountOk((pair as DeductiblePair).abroad));
}

/** The customer's amounts for this vehicle's type, each null when not set. */
export function customerDeductibleFor(
  deductibles: unknown,
  vehicleType: string | null | undefined,
): { domestic: number | null; abroad: number | null } {
  const byType = isValidCustomerDeductibles(deductibles) && deductibles ? deductibles.byType : {};
  const pair = byType[vehicleTypeKey(vehicleType)] ?? {};
  return {
    domestic: typeof pair.domestic === "number" ? pair.domestic : null,
    abroad: typeof pair.abroad === "number" ? pair.abroad : null,
  };
}
