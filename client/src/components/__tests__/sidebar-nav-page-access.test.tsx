/**
 * Fix round 1 (review of Task 1, "Access on staff screens") — the "every
 * menu item has a row" check used to live in shared/page-access.test.ts
 * against a hand-copied array of hrefs. That copy could silently drift from
 * the real menu (a new item added to sidebar-nav.tsx's `NAV_ITEMS` without a
 * matching row would pass unnoticed). This asserts it against the sidebar's
 * own exported item list instead, so it fails the moment the two diverge.
 *
 * Runs in the jsdom project (plan §8.8) purely because sidebar-nav.tsx is a
 * .tsx file; nothing here renders a component.
 */
import { describe, it, expect } from "vitest";
import { NAV_ITEMS } from "@/components/sidebar-nav";
import { pageAccessFor } from "@shared/page-access";

describe("sidebar-nav / page-access", () => {
  it("has at least the menu it had before (sanity check on the import itself)", () => {
    expect(NAV_ITEMS.length).toBeGreaterThanOrEqual(12);
  });

  it("has a shared/page-access.ts row for every menu item's href", () => {
    for (const item of NAV_ITEMS) {
      expect(pageAccessFor(item.href), item.href).toBeDefined();
    }
  });

  // B-44 (11-10-2026): the comparison only runs menu -> table, never the other
  // way round, so a page may have a row without a menu item. /fines is that
  // page: it keeps its own rights and is opened by the "Bekeuringen" button on
  // the Klantenportaal page and by URL, not from the menu.
  it("allows a page without a menu item: /fines has a row but no menu item (B-44)", () => {
    expect(pageAccessFor("/fines")).toBeDefined();
    expect(NAV_ITEMS.map((item) => item.href)).not.toContain("/fines");
  });
});
