/**
 * Audit 2026-10-09, module 13, finding 5 (A-13-5): the template pickers of the
 * APK and Onderhoud tabs offered every saved template, among them the portal's
 * system templates under their raw keys ("portal_invite", ...), and no APK
 * template at all when none had been made. The pickers show the templates of
 * their own category and the free ones, and never a system template.
 */
import { describe, it, expect } from "vitest";
import { isSystemTemplate, templatesForMode, systemTemplateLabelKey, systemTemplateParts, systemTemplateLanguage } from "./communication-templates";

const T = (id: number, name: string, category: string | null) => ({ id, name, subject: "s", content: "c", category });

const templates = [
  T(1, "APK herinnering", "apk"),
  T(2, "Onderhoud herinnering", "maintenance"),
  T(3, "Algemeen bericht", "custom"),
  T(4, "portal_invite", "portal"),
  T(5, "portal_password_reset", "portal"),
  T(6, "Zonder categorie", null),
];

describe("system templates", () => {
  it("are the portal's own, by category or by the portal_ name", () => {
    expect(isSystemTemplate(T(4, "portal_invite", "portal"))).toBe(true);
    expect(isSystemTemplate(T(9, "portal_new_thing", "custom"))).toBe(true);
    expect(isSystemTemplate(T(3, "Algemeen bericht", "custom"))).toBe(false);
    expect(isSystemTemplate(T(6, "Zonder categorie", null))).toBe(false);
  });

  it("have a label key per known name, built from the stored name", () => {
    expect(systemTemplateLabelKey("portal_invite")).toBe("customerCommunications.templates.systemNames.portal_invite");
    expect(systemTemplateLabelKey("Algemeen bericht")).toBeNull();
  });

  it("read the language from the name: bare is Dutch, a suffix is that language", () => {
    expect(systemTemplateParts("portal_invite")).toEqual({ base: "portal_invite", language: "nl" });
    expect(systemTemplateParts("portal_invite.es")).toEqual({ base: "portal_invite", language: "es" });
    expect(systemTemplateLabelKey("portal_fine_linked.pl")).toBe("customerCommunications.templates.systemNames.portal_fine_linked");
    expect(systemTemplateLanguage("portal_maintenance.pt")).toBe("pt");
    // Unknown suffixes and staff templates have no language.
    expect(systemTemplateParts("portal_invite.de")).toBeNull();
    expect(systemTemplateParts("portal_invite.nl")).toBeNull();
    expect(systemTemplateLanguage("Algemeen bericht")).toBeNull();
    expect(isSystemTemplate(T(10, "portal_invite.ro", "portal"))).toBe(true);
  });
});

describe("templatesForMode", () => {
  it("APK: the apk templates and the free (custom, uncategorised) ones, never portal ones", () => {
    expect(templatesForMode(templates, "apk").map((t) => t.id)).toEqual([1, 3, 6]);
  });

  it("Onderhoud: the maintenance templates and the free ones, never portal ones", () => {
    expect(templatesForMode(templates, "maintenance").map((t) => t.id)).toEqual([2, 3, 6]);
  });

  it("Aangepast: every template except the system ones", () => {
    expect(templatesForMode(templates, "custom").map((t) => t.id)).toEqual([1, 2, 3, 6]);
  });

  it("copes with a list that is not there yet", () => {
    expect(templatesForMode(undefined as any, "apk")).toEqual([]);
  });
});
