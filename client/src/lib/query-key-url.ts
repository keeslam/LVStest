/**
 * FIX-T (BUG-204) — which URL a react-query key actually fetches.
 *
 * The default query function builds its URL from `queryKey[0]`, optionally
 * appending `queryKey[1]` as a query string *when it is an object*. Anything
 * else in the key — a number, a string, a boolean — changes the cache entry
 * and changes nothing about the request.
 *
 * That is how the reservations page came to download the same 8 MB list twice
 * on first paint: `['/api/reservations']` and `['/api/reservations',
 * vehicles.length]` are two cache entries for one URL (phase 19: 19.6 MB of
 * which 16 MB was that list, fetched twice).
 *
 * Extracted so the rule is one function, used by the query function itself and
 * by the regression test that walks the page's query keys.
 */
export function queryKeyUrl(queryKey: readonly unknown[]): string {
  const base = String(queryKey[0] ?? "");
  const params = queryKey[1];
  if (!params || typeof params !== "object" || Array.isArray(params)) return base;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value !== undefined && value !== null) search.append(key, String(value));
  }
  const queryString = search.toString();
  return queryString ? `${base}?${queryString}` : base;
}

/**
 * Given a page's query keys, the URLs that more than one *distinct* key would
 * fetch — i.e. the duplicate downloads. Empty is the property to assert.
 */
export function duplicateFetchUrls(queryKeys: ReadonlyArray<readonly unknown[]>): string[] {
  const keysByUrl = new Map<string, Set<string>>();
  for (const key of queryKeys) {
    const url = queryKeyUrl(key);
    const identity = JSON.stringify(key);
    const seen = keysByUrl.get(url) ?? new Set<string>();
    seen.add(identity);
    keysByUrl.set(url, seen);
  }
  return [...keysByUrl.entries()].filter(([, keys]) => keys.size > 1).map(([url]) => url);
}
