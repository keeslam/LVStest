/**
 * "Opnieuw genereren" used to put the server's English sentence (with the status prefix, "400: Only
 * generated documents can be regenerated ...") in the toast. Every refusal now carries a stable
 * code; the sentence the reader sees comes from the translation files, by that code only.
 */
import { describe, it, expect } from "vitest";
import nl from "../locales/nl/documents.json";
import en from "../locales/en/documents.json";
import { CONTRACT_ERROR_CODES } from "@shared/contract-error-codes";
import { REGENERATION_ERROR_CODES } from "@shared/document-regeneration-codes";
import { regenerationErrorText } from "./regeneration-error-text";

function lookup(table: Record<string, any>) {
  return (key: string, options?: Record<string, unknown>) => {
    const value = key.split(".").reduce<any>((node, part) => node?.[part], table);
    if (typeof value !== "string") return String(options?.defaultValue ?? key);
    return value.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options?.[name] ?? ""));
  };
}

describe("regenerationErrorText", () => {
  it.each(["nl", "en"] as const)("%s has a sentence for every code the endpoint can answer", (language) => {
    const table = (language === "nl" ? nl : en) as Record<string, any>;
    for (const code of [...CONTRACT_ERROR_CODES, ...REGENERATION_ERROR_CODES, "STALE_WRITE"]) {
      expect(typeof table.staleness.errors[code], `${language} ${code}`).toBe("string");
    }
    expect(typeof table.staleness.errors.UNKNOWN).toBe("string");
  });

  it("says the Dutch sentence for the code, never the English message", () => {
    const t = lookup(nl);
    const error = Object.assign(new Error("400: Only generated documents can be regenerated."), { code: "NOT_REGENERATABLE", httpStatus: 400 });
    const text = regenerationErrorText(t, error);
    expect(text).toBe(t("staleness.errors.NOT_REGENERATABLE"));
    expect(text).not.toMatch(/Only generated/);
    expect(text).not.toMatch(/^400/);
  });

  it("names the template in the sentence for a template without fields", () => {
    const t = lookup(nl);
    const error = Object.assign(new Error("409: x"), { code: "TEMPLATE_WITHOUT_FIELDS", templateName: "Standaard" });
    expect(regenerationErrorText(t, error)).toContain("Standaard");
    const anonymous = Object.assign(new Error("409: x"), { code: "TEMPLATE_WITHOUT_FIELDS" });
    expect(regenerationErrorText(t, anonymous)).not.toContain("{{");
  });

  it("falls back to one generic sentence for an unknown code or no code at all", () => {
    const t = lookup(nl);
    expect(regenerationErrorText(t, new Error("500: boom"))).toBe(t("staleness.errors.UNKNOWN"));
    expect(regenerationErrorText(t, Object.assign(new Error("x"), { code: "SOMETHING_NEW" }))).toBe(t("staleness.errors.UNKNOWN"));
    expect(regenerationErrorText(t, undefined)).toBe(t("staleness.errors.UNKNOWN"));
  });
});
