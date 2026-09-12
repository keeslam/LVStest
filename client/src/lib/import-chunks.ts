/**
 * OPT-031 — "toon echte voortgang of geen".
 *
 * The import progress bar was set to 5 and never moved again, so people
 * cancelled imports that were simply busy. There is no streaming endpoint to
 * hang a real percentage on, and inventing one for this would be a bigger
 * change than the proposal. What does give a true number: send the paste in
 * chunks and move the bar by the chunks that have actually come back.
 *
 * The chunk size matches the server's `MAX_IMPORT_BATCH`-bounded request; it is
 * smaller, because every row now costs an RDW lookup and a shorter request is
 * a more honest progress step.
 */
export const IMPORT_CHUNK_SIZE = 25;

export function chunk<T>(items: T[], size: number = IMPORT_CHUNK_SIZE): T[][] {
  if (size < 1) throw new Error("chunk size must be at least 1");
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/** The percentage to show once `done` of `total` rows have come back. */
export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}
