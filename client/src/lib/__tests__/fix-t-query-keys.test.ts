/**
 * FIX-T (BUG-204) — the reservations page must not download the same list
 * twice.
 *
 * Phase 19 replayed the page's first paint: 9 requests, 19.61 MB, of which
 * 16 MB was `/api/reservations` fetched **twice** because two `useQuery` calls
 * used two different keys for one URL (`['/api/reservations']` and
 * `['/api/reservations', vehicles.length]` — the extra element is a number,
 * which the query function ignores when it builds the URL, so it changes the
 * cache entry and not the request).
 *
 * The unit half asserts the rule. The source half walks the real query keys in
 * `pages/reservations/calendar.tsx`, because that is where the defect can come
 * back, and a source scan is the only way to see it without mounting a
 * 4 000-line component.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { queryKeyUrl, duplicateFetchUrls } from "../query-key-url";

describe("queryKeyUrl", () => {
  it("appends a params object as a query string", () => {
    expect(queryKeyUrl(["/api/reservations/range", { startDate: "2026-03-01", endDate: "2026-03-31" }])).toBe(
      "/api/reservations/range?startDate=2026-03-01&endDate=2026-03-31",
    );
  });

  it("ignores anything that is not a params object — which is the trap", () => {
    expect(queryKeyUrl(["/api/reservations"])).toBe("/api/reservations");
    expect(queryKeyUrl(["/api/reservations", 665])).toBe("/api/reservations");
    expect(queryKeyUrl(["/api/reservations", "vehicles"])).toBe("/api/reservations");
    expect(queryKeyUrl(["/api/reservations", undefined])).toBe("/api/reservations");
  });

  it("drops undefined and null params rather than sending the string 'undefined'", () => {
    expect(queryKeyUrl(["/api/x", { a: 1, b: undefined, c: null }])).toBe("/api/x?a=1");
  });

  it("duplicateFetchUrls names exactly the URLs two distinct keys would fetch", () => {
    expect(
      duplicateFetchUrls([["/api/reservations"], ["/api/reservations", 665]]),
    ).toEqual(["/api/reservations"]);
    expect(
      duplicateFetchUrls([["/api/reservations"], ["/api/reservations/overdue"]]),
    ).toEqual([]);
    // The same key twice is one query, not two.
    expect(duplicateFetchUrls([["/api/reservations"], ["/api/reservations"]])).toEqual([]);
  });
});

describe("the reservations page fetches each URL once", () => {
  /**
   * Collects the literal `queryKey: [...]` arrays from a source file. Only
   * keys whose first element is a plain string literal are considered — a
   * template-literal key (`/api/documents/reservation/${id}`) is per-entity
   * and cannot collide with the list keys this bug is about.
   */
  function staticQueryKeys(source: string): Array<readonly unknown[]> {
    const keys: Array<readonly unknown[]> = [];
    const re = /queryKey:\s*\[\s*(['"])([^'"]+)\1\s*(,([^\]]*))?\]/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
      const url = match[2];
      const rest = (match[4] ?? "").trim();
      if (!rest) {
        keys.push([url]);
      } else {
        // Anything other than an object literal does not change the URL; an
        // object literal does, and its exact contents do not matter here —
        // what matters is that it is a *different* URL. Model it as an opaque
        // marker so two object-carrying keys on one base are not reported as
        // duplicates of the bare key.
        keys.push([url, rest.startsWith("{") ? { params: rest } : rest]);
      }
    }
    return keys;
  }

  it("no two distinct query keys in calendar.tsx resolve to the same URL", () => {
    const file = path.resolve(__dirname, "../../pages/reservations/calendar.tsx");
    const source = fs.readFileSync(file, "utf8");
    const keys = staticQueryKeys(source);
    expect(keys.length).toBeGreaterThan(3); // the scan found something
    expect(duplicateFetchUrls(keys)).toEqual([]);
  });

  it("the scanner would have caught the bug as it was", () => {
    // The exact pair that shipped, so this test is known to be able to fail.
    const before = `
      const a = useQuery({ queryKey: ['/api/reservations'] });
      const b = useQuery({ queryKey: ['/api/reservations', vehicles?.length] });
    `;
    expect(duplicateFetchUrls(staticQueryKeys(before))).toEqual(["/api/reservations"]);
  });
});
