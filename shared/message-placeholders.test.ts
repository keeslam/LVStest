/**
 * Audit 2026-10-09, module 13, finding 6 (A-13-6): the notification send path
 * replaced `{customerName}` only, the portal templates use `{{name}}`, and a
 * portal template chosen in a normal message went to the customer with its
 * double braces intact. One replacer now reads both styles.
 */
import { describe, it, expect } from "vitest";
import { fillPlaceholders } from "./message-placeholders";

describe("fillPlaceholders", () => {
  const values = { customerName: "Audit Testklant B.v.", vehiclePlate: "97-GRD-4", vehicleBrand: "", apkDate: undefined };

  it("fills the single-brace style the template builder inserts", () => {
    expect(fillPlaceholders("Beste {customerName}, kenteken {vehiclePlate}", values)).toBe("Beste Audit Testklant B.v., kenteken 97-GRD-4");
  });

  it("fills the double-brace style of the portal templates, with or without spaces", () => {
    expect(fillPlaceholders("Beste {{customerName}} en {{ vehiclePlate }}", values)).toBe("Beste Audit Testklant B.v. en 97-GRD-4");
  });

  it("turns a known key with no value into an empty string", () => {
    expect(fillPlaceholders("[{vehicleBrand}][{{apkDate}}]", values)).toBe("[][]");
  });

  it("leaves a key it does not know untouched in both styles by default", () => {
    expect(fillPlaceholders("{companyName} {{link}}", values)).toBe("{companyName} {{link}}");
  });

  it("can blank unknown double-brace keys (the portal mails), but never touches single braces it does not know", () => {
    expect(fillPlaceholders("a {{nope}} b {css} c", values, { unknown: "blank" })).toBe("a  b {css} c");
  });

  it("applies the transform to every substituted value only", () => {
    const upper = (value: string) => value.toUpperCase();
    expect(fillPlaceholders("<b>{{customerName}}</b>", values, { transform: upper })).toBe("<b>AUDIT TESTKLANT B.V.</b>");
  });

  it("does not read inherited properties as values", () => {
    expect(fillPlaceholders("{toString} {{constructor}}", {})).toBe("{toString} {{constructor}}");
  });
});

import { MESSAGE_PLACEHOLDER_KEYS, placeholderKeysForCategory } from "./message-placeholders";
describe("D15 - the placeholder list", () => {
  it("has the eleven keys of the send path", () => {
    expect([...MESSAGE_PLACEHOLDER_KEYS]).toEqual([
      "customerName", "vehiclePlate", "vehicleBrand", "vehicleModel", "apkDate",
      "companyName", "customerEmail", "customerPhone", "reservationStart", "reservationEnd", "maintenanceDate",
    ]);
  });

  it("offers maintenanceDate only for the category maintenance", () => {
    expect(placeholderKeysForCategory("maintenance")).toContain("maintenanceDate");
    for (const category of ["custom", "apk", "portal", null, undefined]) {
      expect(placeholderKeysForCategory(category)).not.toContain("maintenanceDate");
      expect(placeholderKeysForCategory(category)).toHaveLength(10);
    }
  });
});
