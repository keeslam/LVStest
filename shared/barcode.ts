/**
 * Central barcode format for the whole app. Vehicle barcodes are STORED on the
 * vehicles.barcode column (assigned once, regenerable by admins); reservation
 * barcodes are DERIVED from the reservation id and never stored. Code 128 is
 * the symbology used everywhere (JsBarcode on the client renders it).
 */

export const VEHICLE_BARCODE_PREFIX = "VEH-";
export const RESERVATION_BARCODE_PREFIX = "RES-";

// VEH-000123 or VEH-000123-R2 (revision suffix added on regeneration so the
// old physical label stops matching after an explicit admin regenerate)
const VEHICLE_BARCODE_RE = /^VEH-(\d{6,})(?:-R(\d+))?$/;
const RESERVATION_BARCODE_RE = /^RES-(\d{6,})$/;

export type ParsedBarcode =
  | { kind: "vehicle"; vehicleId: number }
  | { kind: "reservation"; reservationId: number }
  | { kind: "unknown"; normalized: string };

export function formatVehicleBarcode(vehicleId: number, revision?: number): string {
  const base = `${VEHICLE_BARCODE_PREFIX}${String(vehicleId).padStart(6, "0")}`;
  return revision && revision > 1 ? `${base}-R${revision}` : base;
}

export function formatReservationBarcode(reservationId: number): string {
  return `${RESERVATION_BARCODE_PREFIX}${String(reservationId).padStart(6, "0")}`;
}

// Scanners sometimes send trailing whitespace/CR and users may type lowercase.
export function normalizeScannedCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function parseBarcode(raw: string): ParsedBarcode {
  const normalized = normalizeScannedCode(raw);
  const vehicleMatch = VEHICLE_BARCODE_RE.exec(normalized);
  if (vehicleMatch) {
    return { kind: "vehicle", vehicleId: parseInt(vehicleMatch[1], 10) };
  }
  const reservationMatch = RESERVATION_BARCODE_RE.exec(normalized);
  if (reservationMatch) {
    return { kind: "reservation", reservationId: parseInt(reservationMatch[1], 10) };
  }
  return { kind: "unknown", normalized };
}
