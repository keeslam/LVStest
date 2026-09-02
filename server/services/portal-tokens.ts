import { createHash, randomBytes } from "crypto";

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The token goes in the e-mail link; only its hash is stored. */
export function generateInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashInviteToken(token) };
}
