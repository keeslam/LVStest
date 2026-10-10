/**
 * Audit A-4-1 — capitalizeName turned "B.V." into "B.v." and "DHL" into "Dhl" while the person
 * was typing a company name. Only words typed entirely in lower case are capitalised now; a word
 * that already carries a capital beyond its first letter, or a period, stays as typed.
 */
import { describe, it, expect } from "vitest";
import { capitalizeName } from "./format-utils";

describe("capitalizeName (A-4-1)", () => {
  it("keeps B.V., N.V. and V.O.F. as typed", () => {
    expect(capitalizeName("AUDIT Testklant B.V.")).toBe("AUDIT Testklant B.V.");
    expect(capitalizeName("Bakkerij Jansen N.V.")).toBe("Bakkerij Jansen N.V.");
    expect(capitalizeName("Visserij de Haan V.O.F.")).toBe("Visserij de Haan V.O.F.");
  });

  it("keeps acronyms and mixed-case brand names as typed", () => {
    expect(capitalizeName("DHL Express B.V.")).toBe("DHL Express B.V.");
    expect(capitalizeName("ABN AMRO")).toBe("ABN AMRO");
    expect(capitalizeName("McDonald's Nederland B.V.")).toBe("McDonald's Nederland B.V.");
    expect(capitalizeName("eBay Nederland")).toBe("eBay Nederland");
  });

  it("still capitalises a person's name typed in lower case, with the Dutch prefixes", () => {
    expect(capitalizeName("jan van der berg")).toBe("Jan van der Berg");
    expect(capitalizeName("pieter de vries")).toBe("Pieter de Vries");
    expect(capitalizeName("maria")).toBe("Maria");
    expect(capitalizeName("Van der Berg")).toBe("Van der Berg");
  });

  it("handles the empty string and trailing spaces while typing", () => {
    expect(capitalizeName("")).toBe("");
    expect(capitalizeName("jan ")).toBe("Jan ");
  });
});
