/**
 * The portal writes dates and amounts the way the language it is shown in writes them; Dutch
 * keeps the notation the portal always had (13-09-2026, € 95,00, 13 sep. 2026).
 */
import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { formatPortalCurrency, formatPortalDate, formatPortalDateMedium, formatPortalDateTime } from "@/lib/portal-format";

const nbsp = (s: string) => s.replace(/[  ]/g, " ");

afterEach(async () => { await i18n.changeLanguage("nl"); });

describe("portal notation follows the portal language", () => {
  it.each([
    ["nl", "13-09-2026", "€ 1.234,50"],
    ["en", "13/09/2026", "€1,234.50"],
    ["es", "13/09/2026", "1234,50 €"],
    ["pt", "13/09/2026", "1234,50 €"],
    ["it", "13/09/2026", "1234,50 €"],
    // Romanian notation writes the currency code, not the sign (CLDR).
    ["ro", "13.09.2026", "1.234,50 EUR"],
    ["pl", "13.09.2026", "1234,50 €"],
  ])("%s: day %s, amount %s", async (lang, day, amount) => {
    await i18n.changeLanguage(lang);
    expect(formatPortalDate("2026-09-13")).toBe(day);
    // Grouping of four-digit amounts differs per ICU version for es/pt/pl; compare without it.
    expect(nbsp(formatPortalCurrency(1234.5)).replace(/(\d)[ .](\d{3})/, "$1$2")).toBe(amount.replace(/(\d)[ .](\d{3})/, "$1$2"));
  });

  it("Dutch keeps the medium date and the time notation", async () => {
    await i18n.changeLanguage("nl");
    expect(formatPortalDateMedium("2026-09-13")).toBe("13 sep. 2026");
    expect(formatPortalDateTime(new Date(2026, 8, 13, 14, 5))).toBe("13-09-2026 14:05");
  });

  it("an empty value stays empty or a dash, as before", () => {
    expect(formatPortalDate(null)).toBe("");
    expect(formatPortalCurrency(null)).toBe("–");
  });
});
