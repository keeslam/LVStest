/** Every field of the report builder has a translated label in all languages. */
import { describe, it, expect } from "vitest";
import { DATA_SOURCES } from "@shared/report-builder-config";
import nl from "@/locales/nl/reports.json";
import en from "@/locales/en/reports.json";
import es from "@/locales/es/reports.json";
import pt from "@/locales/pt/reports.json";
import it_ from "@/locales/it/reports.json";
import ro from "@/locales/ro/reports.json";
import pl from "@/locales/pl/reports.json";

const locales: Record<string, any> = { nl, en, es, pt, it: it_, ro, pl };

describe("builder field labels", () => {
  for (const [lang, json] of Object.entries(locales)) {
    it(`${lang} has a label for every field`, () => {
      const missing = DATA_SOURCES.flatMap((ds) => ds.fields)
        .filter((f) => typeof json.reportBuilderPage?.fields?.[f.table]?.[f.name] !== "string")
        .map((f) => `${f.table}.${f.name}`);
      expect([...new Set(missing)]).toEqual([]);
    });
  }
});
