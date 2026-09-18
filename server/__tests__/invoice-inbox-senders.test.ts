import { describe, it, expect } from "vitest";
import { normalizeSender, isAllowedSender, senderAuthVerdict } from "../../shared/invoice-inbox";

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

/**
 * I2 — a From address is free to type. Only the receiving mail server's own
 * `Authentication-Results` line says anything, and only when we know that
 * server's name: anyone can add a line saying `dmarc=pass`.
 */
describe("senderAuthVerdict", () => {
  const line = (text: string) => `Authentication-Results: ${text}`;

  describe("with the name of our own mail server (strict)", () => {
    const verdict = (...lines: string[]) => senderAuthVerdict(lines, "garage.nl", "mx.host.nl");

    it("passes on DMARC, on aligned SPF and on aligned DKIM", () => {
      expect(verdict(line("mx.host.nl; dmarc=pass header.from=garage.nl"))).toBe("pass");
      expect(verdict(line("mx.host.nl; spf=pass smtp.mailfrom=facturen@garage.nl"))).toBe("pass");
      expect(verdict(line("mx.host.nl; spf=pass smtp.mailfrom=garage.nl"))).toBe("pass");
      expect(verdict(line("mx.host.nl; dkim=pass header.d=garage.nl"))).toBe("pass");
    });

    it("reads the header whatever its casing, and past a version number", () => {
      expect(senderAuthVerdict(["AUTHENTICATION-RESULTS: MX.Host.NL 1; DMARC=PASS"], "garage.nl", "  MX.HOST.NL "))
        .toBe("pass");
    });

    it("refuses a pass that belongs to someone else's domain", () => {
      expect(verdict(line("mx.host.nl; spf=pass smtp.mailfrom=bounce.evil.example"))).toBe("fail");
      expect(verdict(line("mx.host.nl; dkim=pass header.d=evil.example"))).toBe("fail");
      expect(verdict(line("mx.host.nl; spf=pass smtp.mailfrom=notgarage.nl"))).toBe("fail");
    });

    /**
     * A receiving server PREPENDS its own header, so its verdict is the
     * top-most line carrying its name. A sender can write anything below it —
     * including a second line with our own authserv-id on it.
     */
    it("reads only the top-most line of our own server, so a forged one below it is worthless", () => {
      expect(verdict(
        line("mx.host.nl; dmarc=fail header.from=garage.nl"),
        line("mx.host.nl; dmarc=pass header.from=garage.nl"),
      )).toBe("fail");
      // The genuine verdict on top still counts when rubbish follows it.
      expect(verdict(
        line("mx.host.nl; dmarc=pass header.from=garage.nl"),
        line("mx.host.nl; dmarc=fail header.from=garage.nl"),
      )).toBe("pass");
      // Lines of other servers above ours do not hide it.
      expect(verdict(
        line("spamfilter.example; dmarc=pass"),
        line("mx.host.nl; dmarc=pass header.from=garage.nl"),
        line("mx.host.nl; dmarc=fail"),
      )).toBe("pass");
    });

    it("lets a DMARC fail in that line beat any pass beside it", () => {
      expect(verdict(line("mx.host.nl; spf=pass smtp.mailfrom=garage.nl; dmarc=fail header.from=garage.nl"))).toBe("fail");
      expect(verdict(line("mx.host.nl; dkim=pass header.d=garage.nl; dmarc=fail"))).toBe("fail");
    });

    it("only accepts a DMARC pass that is about the From domain", () => {
      expect(verdict(line("mx.host.nl; dmarc=pass header.from=evil.example"))).toBe("fail");
      // No header.from at all: DMARC is evaluated on the From domain by definition.
      expect(verdict(line("mx.host.nl; dmarc=pass"))).toBe("pass");
    });

    it("ignores a pass line the sender stamped under another authserv-id", () => {
      expect(verdict(line("evil.example; dmarc=pass header.from=garage.nl"))).toBe("fail");
      expect(verdict(
        line("evil.example; dmarc=pass header.from=garage.nl"),
        line("mx.host.nl; dmarc=fail header.from=garage.nl"),
      )).toBe("fail");
      // Our own server's pass still counts when a forged line sits next to it.
      expect(verdict(
        line("evil.example; dmarc=fail"),
        line("mx.host.nl; dmarc=pass header.from=garage.nl"),
      )).toBe("pass");
    });

    it("refuses a mail our server said nothing about", () => {
      expect(verdict()).toBe("fail");
      expect(verdict(line("mx.host.nl; dmarc=none header.from=garage.nl"))).toBe("fail");
      expect(verdict(line("mx.host.nl; dmarc=permerror"))).toBe("fail");
      expect(verdict("Received: from somewhere")).toBe("fail");
    });
  });

  describe("without that name (lenient, the default)", () => {
    const verdict = (...lines: string[]) => senderAuthVerdict(lines, "garage.nl", "");

    it("only a hard fail — or a softfail — takes the trust away", () => {
      expect(verdict(line("mx.host.nl; dmarc=fail header.from=garage.nl"))).toBe("fail");
      expect(verdict(line("mx.host.nl; spf=fail smtp.mailfrom=garage.nl"))).toBe("fail");
      expect(verdict(line("mx.host.nl; spf=softfail smtp.mailfrom=garage.nl"))).toBe("fail");
      expect(verdict(line("anything.example; spf=softfail"))).toBe("fail");
    });

    it("says 'none' when nothing failed, so a forged pass gains nothing either", () => {
      expect(verdict()).toBe("none");
      expect(verdict(line("mx.host.nl; dmarc=none"))).toBe("none");
      expect(verdict(line("mx.host.nl; spf=permerror"))).toBe("none");
      expect(verdict(line("evil.example; dmarc=pass"))).toBe("none");
    });
  });
});
