import { describe, it, expect } from "vitest";
import { formatLicensePlate } from "./license-plate";

describe("formatLicensePlate (shared by the client and the server mails)", () => {
  it("writes the usual Dutch shapes with dashes, whatever the input spelling", () => {
    expect(formatLicensePlate("38XT12")).toBe("38-XT-12");
    expect(formatLicensePlate("38-xt-12")).toBe("38-XT-12");
    expect(formatLicensePlate(" ab 123 c ")).toBe("AB-123-C");
    expect(formatLicensePlate("97GRD4")).toBe("97-GRD-4");
  });

  it("keeps the two sidecode shapes and the three-group fallback", () => {
    expect(formatLicensePlate("1AB234")).toBe("1-AB-234");
    expect(formatLicensePlate("123AB4")).toBe("123-AB-4");
    expect(formatLicensePlate("14XT284")).toBe("14-XT-284");
  });

  it("leaves a plate in another shape as it is (upper-cased, dashes stripped) and tolerates empty input", () => {
    expect(formatLicensePlate("abc")).toBe("ABC");
    expect(formatLicensePlate("")).toBe("");
    expect(formatLicensePlate(null)).toBe("");
    expect(formatLicensePlate(undefined)).toBe("");
  });
});
