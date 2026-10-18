/**
 * Every language has exactly the keys of Dutch, the source language, and keeps what the code
 * fills in: the same {{placeholders}} and the same tags (<1>…</1>, <br/>). A key with a plural
 * (`_one`/`_other` in Dutch) must have exactly the plural forms of the target language, so Polish
 * has `_one`, `_few`, `_many`, `_other` and Romanian `_one`, `_few`, `_other`. No value may be
 * empty where Dutch is not. A new key added to nl without the other languages fails here.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES } from "@shared/languages";

const LOCALES = path.resolve(__dirname, "..", "locales");
const NAMESPACES = fs.readdirSync(path.join(LOCALES, "nl")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
const PLURAL = /_(zero|one|two|few|many|other)$/;

type Flat = Record<string, string>;

function flatten(node: unknown, prefix = "", out: Flat = {}): Flat {
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (value && typeof value === "object") flatten(value, `${prefix}${key}.`, out);
    else out[prefix + key] = String(value);
  }
  return out;
}

const read = (lang: string, ns: string): Flat => flatten(JSON.parse(fs.readFileSync(path.join(LOCALES, lang, `${ns}.json`), "utf8")));
const placeholders = (s: string) => [...new Set([...s.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]))].sort();
const tags = (s: string) => [...s.matchAll(/<\/?[a-zA-Z0-9]+[^>]*>/g)].map((m) => m[0].replace(/\s+/g, "")).sort();

/** What a language must have for one Dutch namespace: key -> the Dutch value it stands for. */
function expectedKeys(lang: string, nl: Flat): Map<string, { ref: string; plural: string | null; allowed: string[] }> {
  const categories = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
  const expected = new Map<string, { ref: string; plural: string | null; allowed: string[] }>();
  const groups = new Map<string, Record<string, string>>();
  for (const [key, value] of Object.entries(nl)) {
    const m = key.match(PLURAL);
    if (!m) { expected.set(key, { ref: value, plural: null, allowed: placeholders(value) }); continue; }
    const base = key.slice(0, -m[0].length);
    groups.set(base, { ...groups.get(base), [m[1]]: value });
  }
  for (const [base, forms] of groups) {
    const allowed = [...new Set(Object.values(forms).flatMap(placeholders))].sort();
    for (const c of categories) {
      expected.set(`${base}_${c}`, { ref: c === "one" ? (forms.one ?? forms.other) : forms.other, plural: c, allowed });
    }
  }
  return expected;
}

describe("translations match Dutch", () => {
  it("there is a locale folder for every supported language and no other", () => {
    const folders = fs.readdirSync(LOCALES).filter((f) => fs.statSync(path.join(LOCALES, f)).isDirectory()).sort();
    expect(folders).toEqual([...SUPPORTED_LANGUAGES].sort());
  });

  for (const lang of SUPPORTED_LANGUAGES.filter((l) => l !== "nl")) {
    describe(`${lang} (${LANGUAGE_NAMES[lang]})`, () => {
      for (const ns of NAMESPACES) {
        it(`${ns}: same keys, placeholders and tags as nl, nothing empty`, () => {
          const nl = read("nl", ns);
          const target = read(lang, ns);
          const expected = expectedKeys(lang, nl);
          const problems: string[] = [];
          for (const [key, { ref, plural, allowed }] of expected) {
            const value = target[key];
            if (value === undefined) { problems.push(`missing ${key}`); continue; }
            if (value.trim() === "" && ref.trim() !== "") problems.push(`empty ${key}`);
            const found = placeholders(value);
            if (plural === null || plural !== "one") {
              if (JSON.stringify(found) !== JSON.stringify(placeholders(ref))) problems.push(`${key}: placeholders ${found.join(",")} instead of ${placeholders(ref).join(",")}`);
              if (JSON.stringify(tags(value)) !== JSON.stringify(tags(ref))) problems.push(`${key}: tags ${tags(value).join("")} instead of ${tags(ref).join("")}`);
            } else if (found.some((p) => !allowed.includes(p))) {
              // "one" may leave out {{count}} ("Eén voertuig") but may not invent a placeholder.
              problems.push(`${key}: unknown placeholder in ${found.join(",")}`);
            }
          }
          for (const key of Object.keys(target)) if (!expected.has(key)) problems.push(`extra ${key}`);
          expect(problems).toEqual([]);
        });
      }
    });
  }
});

describe("switching language", () => {
  it.each(SUPPORTED_LANGUAGES.filter((l) => l !== "nl" && l !== "en"))("%s loads on demand and shows its own text", async (lang) => {
    try {
      await i18n.changeLanguage(lang);
      expect(i18n.resolvedLanguage).toBe(lang);
      const own = read(lang, "common")["actions.save"];
      expect(i18n.t("common:actions.save")).toBe(own);
      expect(own).not.toBe(read("nl", "common")["actions.save"]);
    } finally {
      await i18n.changeLanguage("nl");
    }
  });

  it("an unknown language falls back to Dutch", async () => {
    try {
      await i18n.changeLanguage("de");
      expect(i18n.t("common:actions.save")).toBe(read("nl", "common")["actions.save"]);
    } finally {
      await i18n.changeLanguage("nl");
    }
  });
});
