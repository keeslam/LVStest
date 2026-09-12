/**
 * OPT-031 — "RDW-verrijking bij voertuigimport + echte voortgang".
 *
 * The Dutch import screen promises that vehicle data is fetched from the RDW
 * automatically. The handler never called the RDW client that already exists
 * and already works behind the manual button; it wrote `brand: "Unknown"`,
 * `model: "Unknown"` and left the employee to type thirty fields per car.
 *
 * On top of that the loop called `getAllVehicles()` once **per row** to answer
 * "does this plate exist", and there was no upper bound on a batch.
 *
 * This module is the shared part of both import routes:
 *   - the fleet is loaded once, as a set of normalised plates;
 *   - the batch has a bound, so a paste of ten thousand plates is refused with
 *     a clear message instead of running for an hour;
 *   - RDW is called per row, and a row whose lookup fails still imports — with
 *     the reason recorded. "Een RDW-uitval moet de import niet laten mislukken
 *     maar per rij terugvallen."
 */
import { storage } from "../storage";
import {
  fetchVehicleInfoByLicensePlate,
  RDWNotFoundError,
  RDWTimeoutError,
  RDWUpstreamError,
} from "../utils/rdw-api";
import type { InsertVehicle } from "../../shared/schema";

/**
 * The bound on one request. Chosen, not inherited: the client sends the paste
 * in chunks of this size and moves its progress bar per chunk, which is what
 * turns the fake 5% bar into a real one.
 */
export const MAX_IMPORT_BATCH = 100;

export function normalizePlate(value: string): string {
  return value.replace(/[-\s]/g, "").toUpperCase();
}

/** One query for the whole batch instead of one per row. */
export async function loadFleetPlates(): Promise<Set<string>> {
  const fleet = await storage.getAllVehicles();
  return new Set(fleet.map((vehicle) => normalizePlate(vehicle.licensePlate)));
}

export type EnrichmentOutcome =
  | { ok: true; data: Partial<InsertVehicle> }
  | { ok: false; reason: "not_found" | "timeout" | "upstream" | "error"; message: string };

/**
 * The RDW lookup for one row. Never throws: a failure is a value, so the
 * caller can import the row anyway.
 */
export async function enrichFromRdw(licensePlate: string): Promise<EnrichmentOutcome> {
  try {
    const data = await fetchVehicleInfoByLicensePlate(licensePlate);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof RDWNotFoundError) {
      return { ok: false, reason: "not_found", message: error.message };
    }
    if (error instanceof RDWTimeoutError) {
      return { ok: false, reason: "timeout", message: error.message };
    }
    if (error instanceof RDWUpstreamError) {
      return { ok: false, reason: "upstream", message: error.message };
    }
    return {
      ok: false,
      reason: "error",
      message: error instanceof Error ? error.message : "Unknown RDW error",
    };
  }
}

/** The fields the RDW is authoritative about, and that we therefore fill in. */
const ENRICHED_FIELDS = [
  "brand", "model", "vehicleType", "chassisNumber", "fuel", "euroZone",
  "apkDate", "productionDate", "registeredTo", "registeredToDate", "wokNotification",
] as const;

export type EnrichedField = (typeof ENRICHED_FIELDS)[number];

/**
 * Copies the RDW answer onto a vehicle record. `licensePlate` is deliberately
 * not copied: the employee's own plate (and its formatting) wins, and a
 * mistyped plate must not silently become a different car.
 */
export function applyRdwData(
  target: Record<string, unknown>,
  rdw: Partial<InsertVehicle>,
): EnrichedField[] {
  const applied: EnrichedField[] = [];
  for (const field of ENRICHED_FIELDS) {
    const value = (rdw as Record<string, unknown>)[field];
    if (value === null || value === undefined || value === "") continue;
    target[field] = value;
    applied.push(field);
  }
  return applied;
}

export interface FieldDifference {
  field: EnrichedField;
  sheet: unknown;
  rdw: unknown;
}

/**
 * The CSV case: the sheet's own values are kept, and every field where the RDW
 * disagrees is reported so the difference is visible before it becomes a
 * vehicle record.
 */
export function diffAgainstRdw(
  sheetValues: Record<string, unknown>,
  rdw: Partial<InsertVehicle>,
): FieldDifference[] {
  const differences: FieldDifference[] = [];
  for (const field of ENRICHED_FIELDS) {
    const rdwValue = (rdw as Record<string, unknown>)[field];
    const sheetValue = sheetValues[field];
    if (rdwValue === null || rdwValue === undefined || rdwValue === "") continue;
    if (sheetValue === null || sheetValue === undefined || sheetValue === "") continue;
    if (String(sheetValue).trim().toLowerCase() === String(rdwValue).trim().toLowerCase()) continue;
    differences.push({ field, sheet: sheetValue, rdw: rdwValue });
  }
  return differences;
}
