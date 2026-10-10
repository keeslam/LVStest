/**
 * A money amount typed by a person (A-3-2): "45,50", "45.50", "1.234,50",
 * "€ 12". Returns the number, or null when the text is not an amount.
 *
 * `<input type="number">` is not an option for this: in a Dutch browser "45,50"
 * is read as empty (or as 4550), so the value silently vanished from the
 * request. The field is plain text and goes through this.
 *
 * Accepted: digits with at most two decimals after a comma or a dot, or a
 * Dutch thousands grouping ("1.234,50", "1.234"). Not accepted: signs,
 * exponents, a second separator, more than two decimals. An empty string is
 * not an amount either (the caller decides whether the field is optional).
 */
export function parseMoneyInput(text: string): number | null {
  const cleaned = text.trim().replace(/^€\s*/, "");
  if (/^\d+([.,]\d{1,2})?$/.test(cleaned)) return Number(cleaned.replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned)) return Number(cleaned.replace(/\./g, "").replace(",", "."));
  return null;
}
