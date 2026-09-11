/**
 * Concurrency helper for the race regression tests (remediation plan §8.10).
 *
 * `fireParallel` builds all N promises FIRST and awaits them with a single
 * `Promise.allSettled`, so the requests are genuinely in flight at the same
 * time. Awaiting inside a loop would serialise them and every race test would
 * pass for the wrong reason.
 *
 * Two rules from the plan apply to every caller:
 *   1. assert on the database (`SELECT count(*)`), not only on the responses;
 *   2. assert **zero 5xx** — every race bug in the tracker shows up as a raw
 *      500 first and as a duplicate row second.
 */
import type { Response } from "supertest";

export async function fireParallel<T>(n: number, fn: (i: number) => Promise<T>): Promise<PromiseSettledResult<T>[]> {
  const inFlight: Promise<T>[] = [];
  for (let i = 0; i < n; i += 1) inFlight.push(fn(i));
  return Promise.allSettled(inFlight);
}

/** The fulfilled supertest responses of a burst, in completion order. */
export function responsesOf(results: PromiseSettledResult<Response>[]): Response[] {
  return results
    .filter((r): r is PromiseFulfilledResult<Response> => r.status === "fulfilled")
    .map((r) => r.value);
}

/** `{ 200: 1, 409: 19 }` — the status distribution a race test asserts on. */
export function statusCounts(results: PromiseSettledResult<Response>[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const res of responsesOf(results)) {
    counts[res.status] = (counts[res.status] ?? 0) + 1;
  }
  return counts;
}

/** Every 5xx in the burst, as `"500 {body}"` strings, for a readable failure. */
export function serverErrors(results: PromiseSettledResult<Response>[]): string[] {
  return responsesOf(results)
    .filter((res) => res.status >= 500)
    .map((res) => `${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
}

/** Rejected promises (a hung/aborted request), for the same reason. */
export function rejections(results: PromiseSettledResult<unknown>[]): string[] {
  return results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => String(r.reason).slice(0, 300));
}
