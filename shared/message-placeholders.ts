/**
 * The one placeholder replacer of the application's outgoing messages
 * (audit 2026-10-09, module 13, finding 6).
 *
 * Two styles were in use: the template builder inserts `{customerName}` and the
 * notification send path replaced only that form, while the portal templates
 * (`server/services/portal-mail.ts`) are written with `{{name}}`. A portal
 * template chosen in a normal message therefore reached the customer with its
 * double braces intact. Both styles are read here, by the notification route,
 * the portal mails and the preview on screen, so the preview can never differ
 * from what is sent.
 *
 * Nothing in this file may import from `server/` (the client bundle imports it).
 */

export interface PlaceholderOptions {
  /**
   * What a `{{key}}` the values do not know becomes: left as written (`keep`,
   * the notification route and the preview: a typo stays visible) or removed
   * (`blank`, the portal mails, which always behaved like this). A single-brace
   * `{text}` that is not a known key is always left alone, so CSS or script
   * braces in a hand-written template are never eaten.
   */
  unknown?: "keep" | "blank";
  /** Applied to every substituted value, never to the surrounding text (HTML escaping for HTML bodies). */
  transform?: (value: string, key: string) => string;
}

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}|\{(\w+)\}/g;

export function fillPlaceholders(
  text: string,
  values: Record<string, string | null | undefined>,
  options: PlaceholderOptions = {},
): string {
  const { unknown = "keep", transform } = options;
  return text.replace(PLACEHOLDER, (match, doubleKey: string | undefined, singleKey: string | undefined) => {
    const key = (doubleKey ?? singleKey) as string;
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      return doubleKey !== undefined && unknown === "blank" ? "" : match;
    }
    const value = String(values[key] ?? "");
    return transform ? transform(value, key) : value;
  });
}
