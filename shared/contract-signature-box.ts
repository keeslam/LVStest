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

/** A box in PDF points, origin bottom-left, on page 1. */
export interface SignatureBox { x: number; y: number; width: number; height: number }

export function tenantSignatureKeyword(box: SignatureBox): string {
  return `${PREFIX}${[box.x, box.y, box.width, box.height].map((n) => Math.round(n * 100) / 100).join(",")}`;
}

/** The tenant box from a PDF's keywords string, or null for contracts made before this existed. */
export function tenantSignatureBoxFrom(keywords: string | null | undefined): SignatureBox | null {
  const part = (keywords ?? "").split(/[\s,;]+(?=lvs-)|\s+/).find((k) => k.startsWith(PREFIX));
  if (!part) return null;
  const nums = part.slice(PREFIX.length).split(",").map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) return null;
  const [x, y, width, height] = nums;
  if (width <= 0 || height <= 0 || x < 0 || y < 0 || x > 1000 || y > 1000) return null;
  return { x, y, width, height };
}

/** Fit an image of iw x ih into the box, keeping its shape, centred vertically, left-aligned. */
export function fitInBox(iw: number, ih: number, box: SignatureBox): SignatureBox {
  const scale = Math.min(box.width / iw, box.height / ih);
  const width = iw * scale;
  const height = ih * scale;
  return { x: box.x, y: box.y + (box.height - height) / 2, width, height };
}
