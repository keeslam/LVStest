import { formatPostcode, normalizePostcode, type AddressLookupQuery, type AddressLookupResult } from "../../shared/address";

/**
 * Postcode + house number -> street and city, from the Kadaster's PDOK Locatieserver (BAG data): free,
 * no key. The browser never calls PDOK itself; it asks us, so the security headers stay strict, the
 * request can be limited, and a slow or absent PDOK never blocks a form (the caller types the address).
 */
const PDOK_BASE_URL = (process.env.PDOK_BASE_URL || "https://api.pdok.nl/bzk/locatieserver/search/v3_1").replace(/\/+$/, "");
const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 2000;

interface PdokDoc { straatnaam?: string; woonplaatsnaam?: string; huisletter?: string; huisnummertoevoeging?: string }

const cache = new Map<string, { at: number; docs: PdokDoc[] }>();

/** Everything at a postcode + house number (all letters and additions); cached, since addresses hardly change. */
async function docsFor(postcode: string, number: string): Promise<PdokDoc[]> {
  const key = `${postcode}|${number}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.docs;

  const url = new URL(`${PDOK_BASE_URL}/free`);
  url.searchParams.set("q", "*");
  url.searchParams.append("fq", `postcode:${postcode}`);
  url.searchParams.append("fq", `huisnummer:${number}`);
  url.searchParams.append("fq", "type:adres");
  url.searchParams.set("rows", "50");
  url.searchParams.set("fl", "straatnaam,woonplaatsnaam,huisletter,huisnummertoevoeging");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`PDOK answered ${res.status}`);
    const body = (await res.json()) as { response?: { docs?: PdokDoc[] } };
    const docs = body.response?.docs ?? [];
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), docs });
    return docs;
  } finally {
    clearTimeout(timer);
  }
}

/** For tests. */
export function clearAddressLookupCache(): void { cache.clear(); }

/**
 * Throws when PDOK cannot be reached (the route answers 502, the form lets the user type). An unknown
 * address is not an error: `found: false`.
 */
export async function lookupDutchAddress(query: AddressLookupQuery): Promise<AddressLookupResult> {
  const postcode = normalizePostcode(query.postcode);
  const number = query.number.trim();
  if (!postcode || !/^\d{1,5}$/.test(number)) return { found: false, exact: false };

  const docs = await docsFor(postcode, String(parseInt(number, 10)));
  if (docs.length === 0) return { found: false, exact: false };

  const addition = (query.addition ?? "").trim().toUpperCase();
  // No addition asked for: the plain number is the exact match. A letter ("A") matches a house letter, anything else an addition.
  const exact = docs.some((d) => {
    const letter = (d.huisletter ?? "").toUpperCase();
    const extra = (d.huisnummertoevoeging ?? "").toUpperCase();
    return !addition ? !letter && !extra : addition === letter || addition === extra || addition === `${letter}${extra}`;
  });
  const first = docs[0];
  return {
    found: true,
    exact: addition ? exact : true,
    street: first.straatnaam,
    city: first.woonplaatsnaam,
    postalCode: formatPostcode(postcode),
  };
}
