import { describe, it, expect } from "vitest";
import { composeStreetLine, formatPostcode, normalizePostcode, splitStreetLine } from "./address";

describe("postcode", () => {
  it("normalizes Dutch postcodes and refuses the rest", () => {
    expect(normalizePostcode("3011ad")).toBe("3011AD");
    expect(normalizePostcode(" 3011 AD ")).toBe("3011AD");
    expect(normalizePostcode("0123AB")).toBeNull();
    expect(normalizePostcode("301AD")).toBeNull();
    expect(normalizePostcode("3011 A")).toBeNull();
    expect(normalizePostcode("")).toBeNull();
    expect(normalizePostcode(null)).toBeNull();
  });
  it("formats with a space, and leaves a foreign postcode alone", () => {
    expect(formatPostcode("3011ad")).toBe("3011 AD");
    expect(formatPostcode("SW1A 1AA")).toBe("SW1A 1AA");
    expect(formatPostcode(undefined)).toBe("");
  });
});

describe("street line", () => {
  it("splits a street with number and addition", () => {
    expect(splitStreetLine("Coolsingel 4")).toEqual({ street: "Coolsingel", number: "4", addition: "" });
    expect(splitStreetLine("Coolsingel 4A")).toEqual({ street: "Coolsingel", number: "4", addition: "A" });
    expect(splitStreetLine("Dorpsstraat 12-3")).toEqual({ street: "Dorpsstraat", number: "12", addition: "3" });
    expect(splitStreetLine("Dorpsstraat 12 bis")).toEqual({ street: "Dorpsstraat", number: "12", addition: "bis" });
    expect(splitStreetLine("Burgemeester Van Der Stad 105")).toEqual({ street: "Burgemeester Van Der Stad", number: "105", addition: "" });
  });
  it("keeps a street that already contains a number as the street", () => {
    expect(splitStreetLine("Laan 1940 12")).toEqual({ street: "Laan 1940", number: "12", addition: "" });
  });
  it("keeps the whole text as the street when there is no trailing number", () => {
    expect(splitStreetLine("Kade")).toEqual({ street: "Kade", number: "", addition: "" });
    expect(splitStreetLine("")).toEqual({ street: "", number: "", addition: "" });
    expect(splitStreetLine(null)).toEqual({ street: "", number: "", addition: "" });
  });
  it("composes the line back, letters glued to the number and other additions after a dash", () => {
    expect(composeStreetLine({ street: "Coolsingel", number: "4", addition: "" })).toBe("Coolsingel 4");
    expect(composeStreetLine({ street: "Coolsingel", number: "4", addition: "a" })).toBe("Coolsingel 4A");
    expect(composeStreetLine({ street: "Dorpsstraat", number: "12", addition: "3" })).toBe("Dorpsstraat 12-3");
    expect(composeStreetLine({ street: "Kade", number: "", addition: "" })).toBe("Kade");
  });
  it("round-trips a stored address without changing it", () => {
    for (const line of ["Coolsingel 4", "Coolsingel 4A", "Dorpsstraat 12-3", "Kade"]) {
      expect(composeStreetLine(splitStreetLine(line))).toBe(line);
    }
  });
});
