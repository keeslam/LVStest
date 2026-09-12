/**
 * OPT-031 — "toon echte voortgang of geen".
 *
 * The progress bar was set to 5 and never moved, so imports that were simply
 * busy got cancelled. Chunking is what makes the number true: the bar moves by
 * the rows that have actually come back.
 */
import { describe, it, expect } from "vitest";
import { chunk, progressPercent, IMPORT_CHUNK_SIZE } from "../import-chunks";

describe("OPT-031 — echte voortgang", () => {
  it("splits a paste into batches the server will accept", () => {
    const plates = Array.from({ length: 57 }, (_, i) => `PLATE${i}`);
    const chunks = chunk(plates, 25);
    expect(chunks.map((c) => c.length)).toEqual([25, 25, 7]);
    expect(chunks.flat()).toEqual(plates);
  });

  it("leaves a short list as one batch", () => {
    expect(chunk(["a", "b"], 25)).toEqual([["a", "b"]]);
    expect(chunk([], 25)).toEqual([]);
  });

  it("uses a default chunk size that stays inside the server's bound of 100", () => {
    expect(IMPORT_CHUNK_SIZE).toBeGreaterThan(0);
    expect(IMPORT_CHUNK_SIZE).toBeLessThanOrEqual(100);
    expect(chunk(Array.from({ length: IMPORT_CHUNK_SIZE + 1 }, (_, i) => i))).toHaveLength(2);
  });

  it("refuses a chunk size that would loop forever", () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow();
  });

  it("reports a percentage that starts at 0 and ends at 100", () => {
    // Never the old fake head start.
    expect(progressPercent(0, 57)).toBe(0);
    expect(progressPercent(25, 57)).toBe(44);
    expect(progressPercent(57, 57)).toBe(100);
  });

  it("never goes over 100 or divides by zero", () => {
    expect(progressPercent(5, 0)).toBe(0);
    expect(progressPercent(120, 100)).toBe(100);
  });
});
