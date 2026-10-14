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

// Short code printed on small key labels (30x12 mm tape leaves ~24 mm for the bars, too little
// for the 123 modules of VEH-000123): V123 = main key, S123 = spare key, with R<n> after the
// id for a regenerated code (V123R2). It is expanded back to the stored VEH- form before any
// lookup, so nothing is stored differently and labels with the long code keep scanning.
const SHORT_KEY_CODE_RE = /^([VS])(\d{1,9})(?:R(\d+))?$/;

export function shortKeyLabelCode(code: string): string {
  const match = VEHICLE_BARCODE_RE.exec(normalizeScannedCode(code));
  if (!match) return code;
  const spare = normalizeScannedCode(code).endsWith("-S");
  const id = parseInt(match[1], 10);
  return `${spare ? "S" : "V"}${id}${match[2] ? `R${match[2]}` : ""}`;
}

// The stored VEH- code for a short key-label code, or null when `raw` is not one.
export function expandShortKeyCode(raw: string): string | null {
  const match = SHORT_KEY_CODE_RE.exec(raw.trim().toUpperCase());
  if (!match) return null;
  const base = `${VEHICLE_BARCODE_PREFIX}${match[2].padStart(6, "0")}`;
  return `${base}${match[3] ? `-R${match[3]}` : ""}${match[1] === "S" ? "-S" : ""}`;
}

// Scanners sometimes send trailing whitespace/CR and users may type lowercase.
// A short key-label code (V123, S123R2) comes back as the stored VEH- code.
export function normalizeScannedCode(raw: string): string {
  return expandShortKeyCode(raw) ?? raw.trim().toUpperCase();
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
  // Only for text fields: the box is this many mm wide (text-align works inside it, e.g. a
  // plate centred under a barcode). Unset = from x to the label's right edge.
  textWidthMm?: number;
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
  "keyKind",
  "staticText",
] as const;

// What a key label says about the key itself: a spare-key code ends in -S.
// Label text, not UI text: the labels at the desk are Dutch.
export const KEY_KIND_LABELS = { main: "Hoofd", spare: "Reserve" } as const;

export function keyKindLabel(barcode: string | null | undefined): string {
  if (!barcode) return KEY_KIND_LABELS.main;
  const parsed = parseBarcode(barcode);
  return parsed.kind === "vehicle" && parsed.spareKey === true ? KEY_KIND_LABELS.spare : KEY_KIND_LABELS.main;
}

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
    case "keyKind": return keyKindLabel(vehicle.barcode);
    case "staticText": return fieldName;
    default: return "";
  }
}

/**
 * BUG-125 — does this stored barcode actually belong to this vehicle?
 *
 * `vehicles.barcode` used to be a free client field, so an employee with
 * `manage_vehicles` could store *another* car's license plate (or another
 * car's `VEH-…` code, or a `RES-…` code) in it. Lookups match the stored value
 * verbatim and do that before the license-plate fallback, so a scan of car A's
 * plate resolved to car B, the scan panel showed B's rental, and the scan was
 * logged on B. The write side is closed now (the server assigns the code), but
 * rows written before that are still in the column, so every lookup checks the
 * code it found really is the one this vehicle is entitled to.
 */
export function isOwnVehicleBarcode(vehicleId: number, barcode: string | null | undefined): boolean {
  if (!barcode) return false;
  const parsed = parseBarcode(barcode);
  return parsed.kind === "vehicle" && parsed.vehicleId === vehicleId;
}
