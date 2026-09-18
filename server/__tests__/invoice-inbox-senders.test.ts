import { describe, it, expect } from "vitest";
import { normalizeSender, isAllowedSender } from "../../shared/invoice-inbox";

describe("invoice inbox sender allowlist", () => {
  it("reduces a From header to a bare lower-case address", () => {
    expect(normalizeSender("Garage Jansen <Facturen@GarageJansen.NL>")).toBe("facturen@garagejansen.nl");
    expect(normalizeSender("  info@garage.nl ")).toBe("info@garage.nl");
    expect(normalizeSender("geen adres")).toBe("");
  });

  it("matches a full address, case-insensitively", () => {
    expect(isAllowedSender("Facturen@Garage.nl", ["facturen@garage.nl"])).toBe(true);
    expect(isAllowedSender("iemand@garage.nl", ["facturen@garage.nl"])).toBe(false);
  });

  it("matches a whole domain written as @domain", () => {
    expect(isAllowedSender("Kees <kees@lamgroep.nl>", ["@lamgroep.nl"])).toBe(true);
    expect(isAllowedSender("kees@lamgroep.nl", ["@LamGroep.nl"])).toBe(true);
  });

  it("does not let a subdomain or a look-alike through on a bare domain", () => {
    expect(isAllowedSender("x@mail.lamgroep.nl", ["@lamgroep.nl"])).toBe(false);
    expect(isAllowedSender("x@evil-lamgroep.nl", ["@lamgroep.nl"])).toBe(false);
    expect(isAllowedSender("x@lamgroep.nl.evil.com", ["@lamgroep.nl"])).toBe(false);
  });

  it("refuses everything when the list is empty or the sender is unreadable", () => {
    expect(isAllowedSender("a@b.nl", [])).toBe(false);
    expect(isAllowedSender("", ["@b.nl"])).toBe(false);
  });
});
