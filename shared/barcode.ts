/**
 * Central barcode format for the whole app. Vehicle barcodes are STORED on the
 * vehicles.barcode column (assigned once, regenerable by admins); reservation
 * barcodes are DERIVED from the reservation id and never stored. Code 128 is
 * the symbology used everywhere (JsBarcode on the client renders it).
 */

export const VEHICLE_BARCODE_PREFIX = "VEH-";
export const RESERVATION_BARCODE_PREFIX = "RES-";

// VEH-000123, VEH-000123-R2 (revision suffix added on regeneration so the old
// physical label stops matching after an explicit admin regenerate), or
// VEH-000123-S / VEH-000123-R2-S (spare-key label; -S always comes after the
// optional revision).
const VEHICLE_BARCODE_RE = /^VEH-(\d{6,})(?:-R(\d+))?(?:-S)?$/;
const RESERVATION_BARCODE_RE = /^RES-(\d{6,})$/;

export type ParsedBarcode =
  | { kind: "vehicle"; vehicleId: number; spareKey?: true }
  | { kind: "reservation"; reservationId: number }
  | { kind: "unknown"; normalized: string };

export function formatVehicleBarcode(vehicleId: number, revision?: number): string {
  const base = `${VEHICLE_BARCODE_PREFIX}${String(vehicleId).padStart(6, "0")}`;
  return revision && revision > 1 ? `${base}-R${revision}` : base;
}

// Spare-key label for a vehicle's second key. Not stored anywhere (unlike the
// primary barcode) — derived on demand and validated at lookup time against
// the vehicle's real stored barcode so a stale/reassigned id doesn't resolve.
export function formatSpareKeyBarcode(vehicleId: number): string {
  return `${VEHICLE_BARCODE_PREFIX}${String(vehicleId).padStart(6, "0")}-S`;
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
    const spareKey = normalized.endsWith("-S");
    return {
      kind: "vehicle",
      vehicleId: parseInt(vehicleMatch[1], 10),
      ...(spareKey ? { spareKey: true as const } : {}),
    };
  }
  const reservationMatch = RESERVATION_BARCODE_RE.exec(normalized);
  if (reservationMatch) {
    return { kind: "reservation", reservationId: parseInt(reservationMatch[1], 10) };
  }
  return { kind: "unknown", normalized };
}

// Positioned field on a barcode label template. Same shape as the existing
// template editors' TemplateField, but x/y are in millimetres of label space
// (labels are small; mm maps 1:1 onto print CSS). barcodeHeightMm and
// barcodeWidthMm only apply when source === "barcode"; width unset means
// auto (scale to fit the label's remaining width), set means the barcode
// is stretched to exactly that many mm.
export interface BarcodeLabelField {
  id: string;
  name: string;
  x: number;
  y: number;
  fontSize: number;
  isBold: boolean;
  source: string;
  textAlign: "left" | "center" | "right";
  locked?: boolean;
  barcodeHeightMm?: number;
  barcodeWidthMm?: number;
}

// Data sources the barcode label editor offers. "barcode" renders as a Code
// 128 graphic; "staticText" prints the field's own name as literal text.
export const BARCODE_LABEL_SOURCES = [
  "barcode",
  "licensePlate",
  "brand",
  "model",
  "vehicleFull",
  "vehicleType",
  "chassisNumber",
  "apkDate",
  "company",
  "fleetNumber",
  "staticText",
] as const;

// Minimal vehicle shape a label needs. Callers that want a formatted plate
// (formatLicensePlate lives client-side and can't be imported here) pass the
// already-formatted string in licensePlate.
export interface BarcodeLabelVehicle {
  id: number;
  barcode?: string | null;
  licensePlate: string;
  brand: string;
  model: string;
  vehicleType?: string | null;
  chassisNumber?: string | null;
  apkDate?: string | null;
  company?: string | null;
}

export function resolveBarcodeLabelSource(
  source: string,
  vehicle: BarcodeLabelVehicle,
  fieldName: string,
): string {
  switch (source) {
    case "licensePlate": return vehicle.licensePlate;
    case "brand": return vehicle.brand;
    case "model": return vehicle.model;
    case "vehicleFull": return `${vehicle.brand} ${vehicle.model}`;
    case "vehicleType": return vehicle.vehicleType ?? "";
    case "chassisNumber": return vehicle.chassisNumber ?? "";
    case "apkDate": return vehicle.apkDate ?? "";
    case "company": return vehicle.company ?? "";
    case "fleetNumber": return String(vehicle.id);
    case "staticText": return fieldName;
    default: return "";
  }
}
