/**
 * FIX-R (BUG-072) — the one way this application opens a stored link.
 *
 * `window.open(value)` with a `javascript:` URL runs that script in our own
 * origin. Every sink that opens a value coming from the database goes through
 * `openStoredUrl` instead, which refuses anything that is not an ordinary
 * http(s)/mailto/tel link or a path inside the app.
 */
import { isSafeHttpUrl } from "@shared/safe-url";

export { isSafeHttpUrl };

/**
 * Opens `url` in a new tab when it is safe. Returns false and opens nothing
 * when it is not — the caller decides what to tell the user.
 *
 * `noopener,noreferrer` on every call: without `noopener` the opened page can
 * navigate this one through `window.opener`.
 */
export function openStoredUrl(url: unknown, target = "_blank"): boolean {
  if (!isSafeHttpUrl(url)) {
    console.warn("Refused to open an unsafe stored URL:", url);
    return false;
  }
  window.open(url as string, target, "noopener,noreferrer");
  return true;
}
