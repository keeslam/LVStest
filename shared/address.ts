/**
 * Dutch addresses: the postcode + house number lookup shares these helpers between the server
 * (query validation, PDOK answer) and the forms (street line <-> street/number/addition).
 */

/** Four digits (no leading zero) and two letters, with or without a space. */
const NL_POSTCODE = /^([1-9][0-9]{3})\s?([A-Za-z]{2})$/;

/** "1234ab" / "1234 AB" -> "1234AB"; null when it is not a Dutch postcode. */
export function normalizePostcode(value: string | null | undefined): string | null {
  const m = NL_POSTCODE.exec((value ?? "").trim());
  return m ? `${m[1]}${m[2].toUpperCase()}` : null;
}

/** "1234ab" -> "1234 AB"; anything else comes back untouched. */
export function formatPostcode(value: string | null | undefined): string {
  const n = normalizePostcode(value);
  return n ? `${n.slice(0, 4)} ${n.slice(4)}` : (value ?? "");
}

export interface StreetLineParts { street: string; number: string; addition: string }

/**
 * "Coolsingel 4A" -> { street: "Coolsingel", number: "4", addition: "A" }; "Dorpsstraat 12-3" ->
 * addition "3". A line without a trailing house number ("Postbus 12" is read as number 12; "Kade") keeps
 * the whole text as the street, so nothing is lost when a stored address does not fit the pattern.
 */
export function splitStreetLine(line: string | null | undefined): StreetLineParts {
  const text = (line ?? "").trim();
  const m = /^(.*\S)\s+(\d{1,5})\s*[-/\s]?\s*([A-Za-z0-9]{0,6})$/.exec(text);
  return m ? { street: m[1], number: m[2], addition: m[3] } : { street: text, number: "", addition: "" };
}

/** The reverse: a letter addition sticks to the number ("4A"), anything else gets a dash ("12-3"). */
export function composeStreetLine({ street, number, addition }: StreetLineParts): string {
  const s = street.trim();
  const n = number.trim();
  const a = addition.trim();
  if (!n) return s;
  const tail = !a ? n : /^[A-Za-z]{1,2}$/.test(a) ? `${n}${a.toUpperCase()}` : `${n}-${a}`;
  return s ? `${s} ${tail}` : tail;
}

export interface AddressLookupQuery { postcode: string; number: string; addition?: string }

export interface AddressLookupResult {
  /** Street and city were found for this postcode and house number. */
  found: boolean;
  /** The addition too matched an address; false = street and city are right but the addition is not known. */
  exact: boolean;
  street?: string;
  city?: string;
  /** Formatted "1234 AB". */
  postalCode?: string;
}
