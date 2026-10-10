/**
 * What a send of notifications came to (audit 2026-10-09, module 13, finding 2).
 *
 * `POST /api/notifications/send` answers 200 with `{ sent, failed, errors }`
 * also when nothing was mailed (no e-mail configuration, no usable address).
 * The page used to read that 200 as success.
 */
import { parseFailureReason } from "@shared/email-failure";

export type SendOutcome = "success" | "partial" | "failed";

export function classifySendResult(result: { sent?: number; failed?: number }): SendOutcome {
  const sent = Number(result?.sent) || 0;
  const failed = Number(result?.failed) || 0;
  if (sent === 0) return "failed";
  return failed > 0 ? "partial" : "success";
}

/** The code of the first error of a send that carries one, for the Dutch reason in the toast. */
export function firstFailureCode(errors: string[] | undefined | null): string | null {
  for (const error of errors ?? []) {
    const { code } = parseFailureReason(error);
    if (code) return code;
  }
  return null;
}
