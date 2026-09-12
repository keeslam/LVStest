/**
 * FIX-R (BUG-072) — "Stored XSS via javascript:-URL's die met window.open()
 * geopend worden."
 *
 * Several screens open a value that came out of the database:
 * `expense.receiptUrl`, `check.pdfPath`, `doc.filePath`,
 * `routeResult.mapsUrl`. `window.open('javascript:…')` executes that script in
 * the application's own origin, so anybody who can store one of those fields
 * can run script in the next employee's session. The global input sanitizer
 * does not help here: it never sees a multipart body (BUG-086), and a plain
 * `javascript:` URL is not HTML.
 *
 * The rule is a whitelist, not a blacklist: `http`, `https`, `mailto`, `tel`
 * and same-origin relative paths, and nothing else. A blacklist of
 * `javascript:` loses to `java\tscript:`, `JaVaScRiPt:`, `%6aavascript:` and
 * the next encoding someone finds.
 *
 * Shared so the client sink guard, the zod schema and the server agree on one
 * definition.
 */

/** Schemes a stored link may use. Everything else — `javascript:`, `data:`,
 *  `vbscript:`, `file:`, `blob:`, `about:` — is refused. */
const ALLOWED_SCHEMES = ["http:", "https:", "mailto:", "tel:"];

/**
 * Is this value safe to navigate to or to open in a new window?
 *
 * Accepts an absolute URL on an allowed scheme, or a same-origin relative
 * path (`/uploads/a.pdf`, `uploads/a.pdf`). Refuses protocol-relative URLs
 * (`//evil.example`) because they are not the same origin, and anything
 * carrying a control character, which is how `java\tscript:` is smuggled past
 * a naive check.
 */
export function isSafeHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const raw = value.trim();
  if (raw === "") return false;
  // Tab, newline and other C0 controls are stripped by the URL parser in a
  // browser, which is exactly how "java\tscript:alert(1)" becomes executable.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return false;
  // No legitimate stored link carries raw markup characters (a real URL spells
  // them %3C/%3E/%22). Refusing them keeps "safe to navigate to" and "safe to put
  // in an attribute" the same answer.
  if (/[<>"'`]/.test(raw)) return false;
  if (raw.startsWith("//")) return false;

  // A relative path: no scheme at all, and not a bare "javascript:…" that the
  // absence of a slash would hide.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    return !raw.startsWith("\\");
  }

  try {
    // The base only matters for the relative case, which is already handled.
    const parsed = new URL(raw);
    return ALLOWED_SCHEMES.includes(parsed.protocol.toLowerCase());
  } catch {
    return false;
  }
}

/** The same rule, phrased for a zod `.refine()`. */
export const SAFE_URL_MESSAGE =
  "Only http(s), mailto, tel links or a path inside this application are allowed";
