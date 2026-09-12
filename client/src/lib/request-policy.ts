/**
 * FIX-Q (BUG-212, BUG-213) — the two decisions every request needs, kept away
 * from React so they can be tested as plain functions.
 */

/**
 * BUG-212: no request in the application had a deadline. A server that accepts
 * the connection and never answers left a screen on its spinner indefinitely.
 */
export const REQUEST_TIMEOUT_MS = 30000;

export class RequestTimeoutError extends Error {
  readonly code = "REQUEST_TIMEOUT";
  constructor() {
    super("The server did not answer in time. Check your connection and try again.");
    this.name = "RequestTimeoutError";
  }
}

/** `fetch` with a hard deadline, translated into one recognisable error. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * BUG-213: a tab whose session had ended kept serving cached data and never
 * reached the login page, because only a 401 carrying the `expired` flag
 * triggered the logout handler. Every 401 does now — except the ones that are
 * a normal answer rather than an expired session:
 *
 *   - `/api/login` and `/api/register`: a wrong password is a 401 and must
 *     show its error on the login form, not bounce the page;
 *   - `/api/user`: the probe that decides whether anybody is logged in at all;
 *   - `/api/portal/*`: the customer portal is a separate authentication realm
 *     with its own session and its own login screen.
 */
export function shouldForceLogout(url: string, status: number): boolean {
  if (status !== 401) return false;
  const path = (url.split("?")[0] || "").replace(/^https?:\/\/[^/]+/, "");
  // Note the trailing slash: `/api/portal-admin/*` is a *staff* screen and
  // must bounce like any other, so a `startsWith("/api/portal")` prefix would
  // be wrong.
  if (path === "/api/portal" || path.startsWith("/api/portal/")) return false;
  if (path === "/api/user" || path === "/api/login" || path === "/api/register") return false;
  return true;
}
