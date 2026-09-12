/**
 * FIX-U (BUG-087) — what may be written into a `frame-ancestors` directive.
 *
 * `allowedFrameOrigins` is interpolated into the Content-Security-Policy header
 * of every portal response. `z.string().url()` was the only gate, and that
 * accepts a great deal more than an origin: `javascript:alert(1)`,
 * `data:text/html,…`, and — the one that matters —
 * `https://a.example/; script-src *`, whose path segment may contain spaces and
 * semicolons and therefore appends a directive of the attacker's choosing.
 *
 * An origin is `scheme://host[:port]` and nothing else. No credentials, no
 * path, no query, no fragment, no wildcard, no whitespace.
 */

const FORBIDDEN_CHARS = /[\s;,'"*\\<>]/;

export function isValidFrameOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const raw = value.trim();
  if (!raw || raw.length > 255) return false;
  if (FORBIDDEN_CHARS.test(raw)) return false;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.search || url.hash) return false;
  if (url.pathname !== "" && url.pathname !== "/") return false;
  if (!url.hostname) return false;
  // `new URL` normalises "https://a.example" to a trailing slash; anything the
  // operator typed beyond the origin is a mistake worth telling them about
  // rather than silently trimming.
  const origin = `${url.protocol}//${url.host}`;
  return raw === origin || raw === `${origin}/`;
}

/** The canonical form written into the header: never a trailing slash. */
export function normalizeFrameOrigin(value: string): string {
  return new URL(value.trim()).origin;
}

export const FRAME_ORIGIN_MESSAGE =
  "Use a bare origin such as https://example.com — no path, port-less host names, credentials or wildcards";
