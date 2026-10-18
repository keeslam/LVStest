/**
 * The three customer mails (APK, maintenance, custom message) exist in every supported language,
 * follow the customer's preferredLanguage, and keep what the office relies on in each of them:
 * plate, date, customer name, company name, the staff message. The Dutch and English wording is
 * the wording the office wrote; an unknown or empty language is Dutch.
 */
import { describe, it, expect } from "vitest";
import { SUPPORTED_LANGUAGES } from "../../shared/languages";
import {
  getApkReminderTemplate,
  getMaintenanceReminderTemplate,
  getCustomMessageTemplate,
  defaultMaintenanceType,
  unknownApkDate,
} from "../utils/email-templates-i18n";
import { formatDateForLanguage } from "../utils/locale-format";

const PLATE = "AB-123-C";
const COMPANY = "Autolease Lam";

describe("customer mails in every language", () => {
  it.each(SUPPORTED_LANGUAGES)("%s: every mail has its plate, values, greeting and company name", (lang) => {
    const apk = getApkReminderTemplate("Jan Jansen", PLATE, "13-09-2026", lang, COMPANY);
    const maintenance = getMaintenanceReminderTemplate("Jan Jansen", PLATE, defaultMaintenanceType(lang), lang, COMPANY);
    const custom = getCustomMessageTemplate("Jan Jansen", PLATE, "Bericht van kantoor", lang, undefined, COMPANY);
    for (const mail of [apk, maintenance, custom]) {
      expect(mail.subject).toContain(PLATE);
      for (const part of [mail.html, mail.text]) {
        expect(part).toContain("Jan Jansen");
        expect(part).toContain(PLATE);
        expect(part).toContain(COMPANY);
        expect(part).not.toContain("{plate}");
        expect(part).not.toContain("undefined");
      }
    }
    expect(apk.html + apk.text).toContain("13-09-2026");
    expect(maintenance.text).toContain(defaultMaintenanceType(lang));
    expect(custom.html + custom.text).toContain("Bericht van kantoor");
  });

  it("each language has its own wording: no two languages send the same APK subject", () => {
    const subjects = SUPPORTED_LANGUAGES.map((lang) => getApkReminderTemplate("Jan", PLATE, "x", lang).subject);
    expect(new Set(subjects).size).toBe(SUPPORTED_LANGUAGES.length);
  });

  it("Dutch and English keep the wording the office wrote", () => {
    const nl = getApkReminderTemplate("Jan", PLATE, "01-01-2027", "nl");
    expect(nl.subject).toBe(`APK Herinnering - ${PLATE} verloopt binnenkort`);
    expect(nl.text.startsWith("Beste Jan,")).toBe(true);
    expect(nl.text).toContain("Met vriendelijke groet,");
    const en = getMaintenanceReminderTemplate("Jan", PLATE, "Regular Service", "en");
    expect(en.subject).toBe(`Maintenance Reminder - ${PLATE}`);
    expect(en.text.startsWith("Dear Jan,")).toBe(true);
    expect(en.text).toContain("Maintenance Type: Regular Service");
  });

  it("Polish and Romanian are in their own language", () => {
    expect(getApkReminderTemplate("Jan", PLATE, "x", "pl").text).toContain("Z poważaniem,");
    expect(getApkReminderTemplate("Jan", PLATE, "x", "ro").text).toContain("Cu stimă,");
  });

  it("an unknown or missing language is Dutch", () => {
    const dutch = getApkReminderTemplate("Jan", PLATE, "x", "nl");
    expect(getApkReminderTemplate("Jan", PLATE, "x", "de" as never)).toEqual(dutch);
    expect(getApkReminderTemplate("Jan", PLATE, "x", "" as never)).toEqual(dutch);
    expect(unknownApkDate(null)).toBe("onbekend");
  });

  it("the customer name is escaped in the HTML half only", () => {
    const mail = getCustomMessageTemplate("<b>Jan</b>", PLATE, "x", "es");
    expect(mail.html).toContain("&lt;b&gt;Jan&lt;/b&gt;");
    expect(mail.text).toContain("<b>Jan</b>");
  });

  it("a custom subject wins over the language's default", () => {
    expect(getCustomMessageTemplate("Jan", PLATE, "x", "it", "Eigen onderwerp").subject).toBe("Eigen onderwerp");
  });
});

describe("dates in a customer mail follow the language", () => {
  it.each([
    ["nl", "13-09-2026"],
    ["en", "13/09/2026"],
    ["es", "13/09/2026"],
    ["pt", "13/09/2026"],
    ["it", "13/09/2026"],
    ["ro", "13.09.2026"],
    ["pl", "13.09.2026"],
  ])("%s writes 2026-09-13 as %s", (lang, expected) => {
    expect(formatDateForLanguage("2026-09-13", lang)).toBe(expected);
  });

  it("an unknown language and a missing date behave like the Dutch notation", () => {
    expect(formatDateForLanguage("2026-09-13", "de")).toBe("13-09-2026");
    expect(formatDateForLanguage(null, "es")).toBe("");
    expect(formatDateForLanguage("geen datum", "pl")).toBe("");
  });
});
