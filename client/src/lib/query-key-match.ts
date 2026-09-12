/**
 * FIX-Q (BUG-229) — which cached query keys does a changed entity affect?
 *
 * The socket listener used `key.includes('/' + id)`, a plain substring test.
 * For reservation 1 that also matches `/api/reservations/12`,
 * `/api/reservations/vehicle/1870` and `/api/documents/1234`, so one remote
 * mutation invalidated — and, for the mounted ones, refetched — a pile of
 * unrelated queries. Phase 19 measured roughly 19 MB refetched per socket
 * event on an open reservations tab.
 *
 * The rule: the id has to be a whole path segment. It ends at a slash, at the
 * query string, at a fragment, or at the end of the key.
 *
 * Deliberately dependency-free so it is unit-testable without React, the query
 * client or a DOM.
 */
export function matchesEntityId(key: string, id: number | string): boolean {
  if (id === null || id === undefined || id === "") return false;
  const needle = "/" + String(id);
  let from = 0;
  for (;;) {
    const at = key.indexOf(needle, from);
    if (at === -1) return false;
    const next = key[at + needle.length];
    if (next === undefined || next === "/" || next === "?" || next === "#") return true;
    from = at + 1;
  }
}
