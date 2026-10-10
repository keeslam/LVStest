/**
 * A-2-5 — stored notification texts carry matching keys ("[placeholder:3186]",
 * "[service:155]") that the server needs to find its own rows again. They must
 * stay in the data and never reach the screen. The English text of the spare
 * assignment notification is shown in the user's language, keyed on the stable
 * notification `type`.
 */
import { describe, it, expect } from "vitest";
import nl from "../locales/nl/dashboard.json";
import en from "../locales/en/dashboard.json";
import { stripNotificationTags, displayNotification } from "./notification-display";

const t = (key: string, opts?: Record<string, string>) => `${key}${opts ? JSON.stringify(opts) : ""}`;

describe("stripNotificationTags", () => {
  it("removes the trailing matching keys and the space before them", () => {
    expect(stripNotificationTags("Onderhoudsbeurt: datum 3 dag(en) verstreken [service:155]")).toBe("Onderhoudsbeurt: datum 3 dag(en) verstreken");
    expect(stripNotificationTags("TBD spare vehicle needs assignment for 2098-06-20 [placeholder:3186]")).toBe("TBD spare vehicle needs assignment for 2098-06-20");
  });
  it("leaves text without a tag alone", () => {
    expect(stripNotificationTags("Gewone melding")).toBe("Gewone melding");
  });
});

describe("displayNotification", () => {
  it("shows the spare assignment notification translated, with its period", () => {
    const shown = displayNotification({
      type: "spare_assignment",
      title: "Spare Vehicle Assignment Required",
      description: "TBD spare vehicle needs assignment for 2098-06-20 - 2098-06-21 [placeholder:3186]",
    }, t);
    expect(shown.title).toBe("dashboard:notificationDisplay.spareAssignmentTitle");
    expect(shown.description).toContain("dashboard:notificationDisplay.spareAssignmentDescription");
    expect(shown.description).not.toContain("placeholder");
  });

  it("falls back to the stripped stored text for other types", () => {
    const shown = displayNotification({ type: "service_due", title: "Onderhoudsbeurt nodig: AB-12-CD", description: "Km over [service:9]" }, t);
    expect(shown).toEqual({ title: "Onderhoudsbeurt nodig: AB-12-CD", description: "Km over" });
  });

  it("keeps a spare notification whose dates cannot be read, minus the tag", () => {
    const shown = displayNotification({ type: "spare_assignment", title: "x", description: "iets [placeholder:1]" }, t);
    expect(shown.description).toBe("iets");
  });

  it("has the keys in both languages", () => {
    for (const lang of [nl, en] as any[]) {
      expect(lang.notificationDisplay.spareAssignmentTitle).toBeTruthy();
      expect(lang.notificationDisplay.spareAssignmentDescription).toContain("{{period}}");
    }
  });
});
