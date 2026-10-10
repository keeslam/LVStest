/**
 * Audit 2026-10-09, module 13, finding 2: every code the server stores in front
 * of a failure reason has a Dutch sentence (and an English one), and the lookup
 * goes by the code, never by the English text.
 */
import { describe, it, expect } from "vitest";
import nl from "../locales/nl/notifications.json";
import en from "../locales/en/notifications.json";
import { EMAIL_FAILURE_CODES } from "@shared/email-failure";
import { failureCodeText, failureLines } from "./email-failure-text";
import { systemTemplateLabelKey, SYSTEM_TEMPLATE_NAMES } from "./communication-templates";

// The codes server/utils/email-service.ts puts in front of an SMTP failure
// (`${error.code || error.responseCode || 'ERROR'}: ...`, getSmtpErrorMessage).
const SMTP_CODES = ["EAUTH", "535", "ECONNECTION", "ECONNREFUSED", "ETIMEDOUT", "ESOCKET", "EDNS", "ENOTFOUND", "550", "553", "ERROR"];

function lookup(table: Record<string, any>) {
  return (key: string, options?: Record<string, unknown>) => {
    const value = key.split(".").reduce<any>((node, part) => node?.[part], table);
    return typeof value === "string" ? value : String(options?.defaultValue ?? key);
  };
}

describe("failure code sentences", () => {
  const codes = [...Object.values(EMAIL_FAILURE_CODES), ...SMTP_CODES];

  it.each(["nl", "en"] as const)("%s has a sentence for every code", (language) => {
    const table = (language === "nl" ? nl : en) as Record<string, any>;
    for (const code of codes) {
      const sentence = table.customerCommunications.failure.codes[code];
      expect(typeof sentence, `${language} ${code}`).toBe("string");
      expect(sentence.length).toBeGreaterThan(10);
    }
  });

  it("nl and en describe the same set of codes and system templates", () => {
    expect(Object.keys(en.customerCommunications.failure.codes).sort()).toEqual(Object.keys(nl.customerCommunications.failure.codes).sort());
    expect(Object.keys(en.customerCommunications.templates.systemNames).sort()).toEqual([...SYSTEM_TEMPLATE_NAMES].sort());
    expect(Object.keys(nl.customerCommunications.templates.systemNames).sort()).toEqual([...SYSTEM_TEMPLATE_NAMES].sort());
  });

  it("every system template name resolves to a label", () => {
    for (const name of SYSTEM_TEMPLATE_NAMES) {
      expect(systemTemplateLabelKey(name)).toBe(`customerCommunications.templates.systemNames.${name}`);
    }
  });
});

describe("failureLines", () => {
  const t = lookup(nl as Record<string, any>);

  it("says the sentence of the code, and counts a code that repeats", () => {
    expect(failureLines(t, "NO_EMAIL_CONFIG: No valid email configuration for purpose: custom")).toEqual([
      nl.customerCommunications.failure.codes.NO_EMAIL_CONFIG,
    ]);
    expect(failureLines(t, "NO_ADDRESS: a; NO_ADDRESS: b; SEND_FAILED: c")).toEqual([
      `2× ${nl.customerCommunications.failure.codes.NO_ADDRESS}`,
      nl.customerCommunications.failure.codes.SEND_FAILED,
    ]);
  });

  it("reads a reason without a code (rows from before the codes) as the generic failure, never by its English text", () => {
    expect(failureLines(t, "No valid email configuration for purpose: custom")).toEqual([nl.customerCommunications.failure.unknown]);
  });

  it("an unknown code is the generic failure with the code in brackets", () => {
    expect(failureCodeText(t, "EWHATEVER")).toBe(`${nl.customerCommunications.failure.unknown} (EWHATEVER)`);
  });
});
