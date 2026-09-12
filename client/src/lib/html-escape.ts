/**
 * FIX-R (BUG-102) — "innerHTML in de print-/rapportbouwer van de client."
 *
 * The report printer builds one big HTML string and assigns it to the print
 * iframe's `document.body.innerHTML`, with vehicle brand, model, licence plate,
 * category, description, customer name and the transport fields interpolated
 * raw into `<td>` elements. Today the only thing standing between that and a
 * working XSS on the application's own origin is the server's global tag
 * stripper — which is demonstrably bypassable through a multipart body
 * (BUG-086), does not run on the CSV plate import or the CJIB importer, and
 * does not exist at all for a direct database write.
 *
 * So the values are escaped where they are used. `escapeHtml` is deliberately
 * tiny and dependency-free: five characters, no parser, nothing to get wrong.
 */

/**
 * Renders any value as text that is safe inside element content or a quoted
 * attribute. `null`/`undefined` become an empty string, so a missing field does
 * not print the word "null".
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
