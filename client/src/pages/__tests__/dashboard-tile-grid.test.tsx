/**
 * Kees 2026-10-19 — the tiles row scales with the number of tiles chosen in
 * Instellingen > Dashboard: fewer tiles get wider columns, never empty space.
 */
import { describe, it, expect } from "vitest";
import { tileGridClass } from "@/pages/dashboard";

const widest = (cls: string) => Math.max(...[...cls.matchAll(/grid-cols-(\d)/g)].map((m) => Number(m[1])));

describe("tileGridClass", () => {
  it("never has more columns than tiles", () => {
    for (const count of [1, 2, 3, 4, 5]) expect(widest(tileGridClass(count))).toBeLessThanOrEqual(count);
  });

  it("fills the row on a wide screen", () => {
    expect(widest(tileGridClass(1))).toBe(1);
    expect(widest(tileGridClass(2))).toBe(2);
    expect(widest(tileGridClass(3))).toBe(3);
    expect(widest(tileGridClass(4))).toBe(4);
    expect(widest(tileGridClass(5))).toBe(5);
  });
});
