/**
 * FIX-T (BUG-215) — the damage-check header image, normalised once.
 *
 * The branded header is drawn into a band 595 pt wide and 70 pt tall. The
 * uploaded file measured in phase 19 is 1983 x 793 px / 1.6 MB, so pdf-lib was
 * asked to decode and re-deflate a picture roughly ten times larger than it
 * will ever be printed — synchronously, on the event loop, for every single
 * generation: 581 ms of CPU per PDF, a 3.5 MB output file, and a 2.6 s stall
 * of *every other request* when five members of staff print a damage check at
 * the same time.
 *
 * This module scales the image down once and keeps the result in memory,
 * keyed by path + mtime + size, so a replaced header is picked up but an
 * unchanged one is never re-encoded. At 1200 px wide the header is still four
 * times the resolution the band can show.
 */
import { promises as fs } from "fs";
import { createCanvas, loadImage } from "canvas";

export interface PreparedHeaderImage {
  bytes: Buffer;
  width: number;
  height: number;
  /** Always 'png' — pdf-lib's embedPng is what draws it. */
  format: "png";
}

/** Wide enough for print, small enough to encode in single-digit milliseconds. */
export const MAX_HEADER_WIDTH = 1200;

interface CacheEntry {
  key: string;
  value: PreparedHeaderImage;
}

let cached: CacheEntry | null = null;
let normalisations = 0;

/** Test-only counter: how often the image was actually re-encoded. */
export function __headerCacheStats(): { normalisations: number } {
  return { normalisations };
}

/** Test-only: forget the cached image. */
export function __resetHeaderCache(): void {
  cached = null;
}

async function cacheKey(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  return `${filePath}|${stat.mtimeMs}|${stat.size}`;
}

/**
 * Returns the header image ready to embed: PNG bytes no wider than
 * `MAX_HEADER_WIDTH`. An image that is already small enough is returned as it
 * was read, so nothing is re-encoded for no reason.
 */
export async function prepareHeaderImage(filePath: string): Promise<PreparedHeaderImage> {
  const key = await cacheKey(filePath);
  if (cached && cached.key === key) return cached.value;

  const original = await fs.readFile(filePath);
  normalisations += 1;

  let value: PreparedHeaderImage;
  try {
    const image = await loadImage(original);
    if (image.width <= MAX_HEADER_WIDTH) {
      value = { bytes: original, width: image.width, height: image.height, format: "png" };
    } else {
      const scale = MAX_HEADER_WIDTH / image.width;
      const width = MAX_HEADER_WIDTH;
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image as any, 0, 0, width, height);
      value = { bytes: canvas.toBuffer("image/png"), width, height, format: "png" };
    }
  } catch (error) {
    // A header that cannot be decoded here would also fail inside pdf-lib;
    // hand back the original bytes and let the generator report it as it
    // always did, rather than turning a cosmetic problem into a failed PDF.
    console.warn("Damage check header could not be normalised, using it as-is:", (error as Error).message);
    value = { bytes: original, width: 0, height: 0, format: "png" };
  }

  cached = { key, value };
  return value;
}
