/**
 * Audit remediation P11 / A-10-5 (docs/audit/fysieke-e2e-audit-2026-10-09.md, module 10): the
 * document library showed "Damage Check", "Contract (Unsigned)" and "Damage check recorded at
 * return of reservation #3200". The stored values stay as they are (the server matches on them);
 * only what is shown is translated, in nl and en.
 */
import { describe, it, expect } from "vitest";
import nl from "../locales/nl/documents.json";
import en from "../locales/en/documents.json";
import { documentTypeLabel, documentNotesLabel, staleReasonLabel, DOCUMENT_TYPE_LABEL_KEYS } from "./document-labels";

function lookup(table: Record<string, any>) {
  return (key: string, options?: Record<string, unknown>) => {
    const value = key.split(".").reduce<any>((node, part) => node?.[part], table);
    if (typeof value !== "string") return String(options?.defaultValue ?? key);
    return value.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options?.[name] ?? ""));
  };
}
const tNl = lookup(nl);
const tEn = lookup(en);

describe("documentTypeLabel", () => {
  it.each([
    ["Contract (Unsigned)", "Contract (niet ondertekend)", "Contract (unsigned)"],
    ["Contract (Signed)", "Contract (ondertekend)", "Contract (signed)"],
    ["Contracts", "Contracten", "Contracts"],
    ["Damage Check", "Schadecheck", "Damage check"],
    ["Damage Check (Pickup)", "Schadecheck (ophalen)", "Damage check (pickup)"],
    ["Damage Check (Return)", "Schadecheck (inleveren)", "Damage check (return)"],
    ["Damage Check (Unsigned)", "Schadecheck (niet ondertekend)", "Damage check (unsigned)"],
    ["Damage Check (Return) - Edited (Previous Version 2026-10-09 19:35)", "Schadecheck (inleveren) - bewerkt (vorige versie 2026-10-09 19:35)", "Damage check (return) - edited (previous version 2026-10-09 19:35)"],
    ["transport_report", "Transportrapport", "Transport report"],
    ["APK Inspection", "APK-keuring", "APK Inspection"],
    ["Insurance", "Verzekering", "Insurance"],
    ["Vehicle Photos", "Voertuigfoto's", "Vehicle Photos"],
  ])("%s", (stored, dutch, english) => {
    expect(documentTypeLabel(tNl, stored)).toBe(dutch);
    expect(documentTypeLabel(tEn, stored)).toBe(english);
  });

  it("shows a type it does not know exactly as stored (a free-text type someone typed)", () => {
    expect(documentTypeLabel(tNl, "Eigen soort")).toBe("Eigen soort");
    expect(documentTypeLabel(tNl, "")).toBe("");
    expect(documentTypeLabel(tNl, null)).toBe("");
  });

  it("every uploadable type and every generated type has a label in both languages", () => {
    for (const key of Object.values(DOCUMENT_TYPE_LABEL_KEYS)) {
      expect(typeof key.split(".").reduce<any>((n, p) => n?.[p], nl), `nl ${key}`).toBe("string");
      expect(typeof key.split(".").reduce<any>((n, p) => n?.[p], en), `en ${key}`).toBe("string");
    }
  });
});

describe("documentNotesLabel", () => {
  it("translates the notes the app writes itself", () => {
    expect(documentNotesLabel(tNl, "Damage check recorded at return of reservation #3200")).toBe("Schadecheck vastgelegd bij het inleveren van reservering #3200");
    expect(documentNotesLabel(tEn, "Damage check recorded at return of reservation #3200")).toBe("Damage check recorded at return of reservation #3200");
    expect(documentNotesLabel(tNl, "Auto-generated unsigned contract for reservation #17")).toBe("Automatisch aangemaakt contract (niet ondertekend) voor reservering #17");
    expect(documentNotesLabel(tNl, "Damage check for reservation from 2026-10-01 to 2026-10-05")).toBe("Schadecheck voor de reservering van 2026-10-01 tot 2026-10-05");
    expect(documentNotesLabel(tNl, "Updated damage check for reservation from 2026-10-01 to 2026-10-05")).toBe("Bijgewerkte schadecheck voor de reservering van 2026-10-01 tot 2026-10-05");
    expect(documentNotesLabel(tNl, "Regenerated on request; replaces version 2.")).toBe("Op verzoek opnieuw gemaakt; vervangt versie 2.");
  });
  it("leaves what a person typed alone", () => {
    expect(documentNotesLabel(tNl, "Sleutel zit in de bus")).toBe("Sleutel zit in de bus");
    expect(documentNotesLabel(tNl, null)).toBe("");
  });
});

describe("staleReasonLabel", () => {
  it("translates the three reasons the server writes and shows anything else as is", () => {
    expect(staleReasonLabel(tNl, "handover reverted")).toBe("de overdracht is teruggedraaid");
    expect(staleReasonLabel(tNl, "superseded by a newer version")).toBe("vervangen door een nieuwere versie");
    expect(staleReasonLabel(tNl, "the reservation changed after this document was generated")).toBe("de reservering is gewijzigd nadat dit document was gemaakt");
    expect(staleReasonLabel(tNl, "iets anders")).toBe("iets anders");
  });
});
