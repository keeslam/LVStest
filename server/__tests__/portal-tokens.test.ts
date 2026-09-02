import { describe, it, expect } from "vitest";
import { generateInviteToken, hashInviteToken, INVITE_TTL_MS } from "../services/portal-tokens";

describe("portal tokens", () => {
  it("makes a 64-hex token whose sha256 is the stored hash", () => {
    const { token, hash } = generateInviteToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashInviteToken(token));
    expect(hash).not.toBe(token);
  });
  it("uses a 72 hour lifetime", () => {
    expect(INVITE_TTL_MS).toBe(72 * 60 * 60 * 1000);
  });
});
