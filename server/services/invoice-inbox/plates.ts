import { normalizeLicensePlate } from "../../../shared/fines";
import type { InboxParsedInvoice } from "../../../shared/invoice-inbox";

/** A Dutch plate as printed: three groups of 1-3 characters, dashes between, not part of a longer token. */
const DASHED_PLATE = /(?<![A-Z0-9-])([A-Z0-9]{1,3})-([A-Z0-9]{1,3})-([A-Z0-9]{1,3})(?![A-Z0-9-])/g;

const hasLetterAndDigit = (s: string) => /[A-Z]/.test(s) && /[0-9]/.test(s);

/** What the scanner called a plate: accept 4-8 characters with a letter and a digit. */
function looksLikePlate(normalised: string): boolean {
  return /^[A-Z0-9]{4,8}$/.test(normalised) && hasLetterAndDigit(normalised);
}

/** Found in running text: be strict, six characters with a letter and a digit. */
function looksLikeDutchPlate(normalised: string): boolean {
  return normalised.length === 6 && hasLetterAndDigit(normalised);
}

/** Every distinct plate on the invoice, normalised (upper-case, no dashes or spaces), in order of appearance. */
export function extractPlates(invoice: InboxParsedInvoice): string[] {
  const found: string[] = [];
  const add = (plate: string) => { if (!found.includes(plate)) found.push(plate); };

  const named = [invoice.vehicleInfo?.licensePlate, ...(invoice.vehicleInfo?.licensePlates ?? [])];
  for (const raw of named) {
    if (typeof raw !== "string") continue;
    const normalised = normalizeLicensePlate(raw).replace(/[^A-Z0-9]/g, "");
    if (looksLikePlate(normalised)) add(normalised);
  }

  for (const item of invoice.lineItems ?? []) {
    const text = String(item.description ?? "").toUpperCase();
    for (const match of text.matchAll(DASHED_PLATE)) {
      const normalised = `${match[1]}${match[2]}${match[3]}`;
      if (looksLikeDutchPlate(normalised)) add(normalised);
    }
  }
  return found;
}
