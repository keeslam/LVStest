/**
 * Kees, 2026-10-21 — signatures on the contract itself.
 *
 * Two template sources draw a picture instead of text, in a box from the field's
 * top-left corner (its own width/height, else 170 x 55 pt):
 *  - signatureLandlord: the signature of the staff member who generates the contract;
 *  - signatureTenant:   left empty when the contract is made. Its box is written into the
 *    PDF's keywords, so that when the customer signs in the portal their signature lands
 *    in that box on the signed copy (the proof page stays as well).
 */
export const SIGNATURE_LANDLORD_SOURCE = "signatureLandlord";
export const SIGNATURE_TENANT_SOURCE = "signatureTenant";
export const SIGNATURE_SOURCES = new Set([SIGNATURE_LANDLORD_SOURCE, SIGNATURE_TENANT_SOURCE]);
export const DEFAULT_SIGNATURE_BOX = { width: 170, height: 55 };

const PREFIX = "lvs-tenant-signature:";

/** A box in PDF points, origin bottom-left; `page` is 0-based (absent = page 1). */
export interface SignatureBox { x: number; y: number; width: number; height: number; page?: number }

/** The box as a PDF keyword. A box on page 1 keeps the four-number form older contracts carry. */
export function tenantSignatureKeyword(box: SignatureBox): string {
  const nums = [box.x, box.y, box.width, box.height].map((n) => Math.round(n * 100) / 100);
  if (box.page && box.page > 0) nums.push(Math.floor(box.page));
  return `${PREFIX}${nums.join(",")}`;
}

/** The tenant box from a PDF's keywords string, or null for contracts made before this existed. */
export function tenantSignatureBoxFrom(keywords: string | null | undefined): SignatureBox | null {
  const part = (keywords ?? "").split(/[\s,;]+(?=lvs-)|\s+/).find((k) => k.startsWith(PREFIX));
  if (!part) return null;
  const nums = part.slice(PREFIX.length).split(",").map(Number);
  if ((nums.length !== 4 && nums.length !== 5) || nums.some((n) => !Number.isFinite(n))) return null;
  const [x, y, width, height, page = 0] = nums;
  if (width <= 0 || height <= 0 || x < 0 || y < 0 || x > 1000 || y > 1000 || page < 0 || page > 50) return null;
  return page > 0 ? { x, y, width, height, page } : { x, y, width, height };
}

/** Fit an image of iw x ih into the box, keeping its shape, centred vertically, left-aligned. */
export function fitInBox(iw: number, ih: number, box: SignatureBox): SignatureBox {
  const scale = Math.min(box.width / iw, box.height / ih);
  const width = iw * scale;
  const height = ih * scale;
  return { x: box.x, y: box.y + (box.height - height) / 2, width, height };
}

/**
 * Kees 2026-10-21: the reservation barcode as a template field ("Barcode reservering").
 * A template with this field prints the barcode in the field's box; one without it keeps
 * the old place, top right of page 1 (DEFAULT_BARCODE_BOX, in template coordinates: x, y
 * from the top-left, as the editor shows it).
 */
export const BARCODE_SOURCE = "reservationBarcode";
export const DEFAULT_BARCODE_BOX = { x: 440, y: 20, width: 131, height: 41 };

/** The sources drawn as a picture in a box instead of text, with their default size. */
export function pictureBoxSize(source: string | null | undefined): { width: number; height: number } | null {
  if (source === BARCODE_SOURCE) return { width: DEFAULT_BARCODE_BOX.width, height: DEFAULT_BARCODE_BOX.height };
  if (source === SIGNATURE_LANDLORD_SOURCE || source === SIGNATURE_TENANT_SOURCE) return DEFAULT_SIGNATURE_BOX;
  return null;
}

/**
 * Kees, 2026-10-23: who signs a signature field on a damage-check template. The field's
 * source says it ("Handtekening klant" / "Handtekening medewerker"); a field without one
 * keeps the old rule and is read from its name (verhuurder/renter/staff vs huurder/klant/customer).
 * The customer's box is where a signature from the portal lands.
 */
export function damageCheckSignatureRole(field: { source?: string | null; name?: string | null }): "customer" | "staff" | null {
  if (field.source === SIGNATURE_TENANT_SOURCE) return "customer";
  if (field.source === SIGNATURE_LANDLORD_SOURCE) return "staff";
  const name = String(field.name ?? "").toLowerCase();
  if (name.includes("verhuurder") || name.includes("renter") || name.includes("staff")) return "staff";
  if (name.includes("huurder") || name.includes("customer") || name.includes("klant")) return "customer";
  return null;
}
