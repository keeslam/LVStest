/**
 * Why a mail was not sent, as the e-mail log stores it (audit 2026-10-09,
 * module 13, finding 2).
 *
 * `email_logs.failure_reason` is free text, and the server's texts stay English.
 * The SMTP layer already began every reason with the error code
 * ("ETIMEDOUT: Connection to email server timed out."); the other failures now
 * begin with a code of their own, so the client can show a Dutch sentence for
 * the code and keep the English text as the detail. Rows written before the
 * codes existed have none, and are shown as the generic failure plus their text.
 *
 * Nothing in this file may import from `server/` (the client bundle imports it).
 */

/** Codes of the failures that are not an SMTP error. */
export const EMAIL_FAILURE_CODES = {
  /** No usable e-mail configuration for the purpose of the mail. */
  NO_EMAIL_CONFIG: "NO_EMAIL_CONFIG",
  /** The recipient or the subject holds a line break (header injection). */
  UNSAFE_HEADER: "UNSAFE_HEADER",
  /** The customer has no address of the kind the run asked for. */
  NO_ADDRESS: "NO_ADDRESS",
  /** The mail was handed to the mail layer and was not sent; its own log row says why. */
  SEND_FAILED: "SEND_FAILED",
  /** The send threw something the mail layer did not describe. */
  SEND_ERROR: "SEND_ERROR",
  /** Vehicles without a renter could not be reported: no office address is known. */
  NO_OFFICE_EMAIL: "NO_OFFICE_EMAIL",
  /** The report to the office about vehicles without a renter was not sent. */
  OFFICE_NOTICE_FAILED: "OFFICE_NOTICE_FAILED",
} as const;
export type EmailFailureCode = (typeof EMAIL_FAILURE_CODES)[keyof typeof EMAIL_FAILURE_CODES];

export function withFailureCode(code: EmailFailureCode, text: string): string {
  return `${code}: ${text}`;
}

// An upper-case token of three or more characters (EAUTH, NO_ADDRESS) or an
// SMTP reply code (550), followed by a colon. Ordinary prose never starts so.
const CODE_AT_START = /^([A-Z][A-Z0-9_]{2,}|\d{3}):\s*([\s\S]*)$/;

export interface ParsedFailureReason {
  code: string | null;
  detail: string;
}

export function parseFailureReason(reason: string | null | undefined): ParsedFailureReason {
  const text = (reason ?? "").trim();
  const match = CODE_AT_START.exec(text);
  return match ? { code: match[1], detail: match[2] } : { code: null, detail: text };
}

/**
 * A run (one send of many mails) stores every reason it collected in one string,
 * joined by "; ". Split only where the next piece starts with a code, so a
 * semicolon inside a reason never cuts it in two.
 */
export function splitFailureReasons(reason: string | null | undefined): string[] {
  const text = (reason ?? "").trim();
  if (!text) return [];
  return text.split(/;\s+(?=(?:[A-Z][A-Z0-9_]{2,}|\d{3}):\s)/);
}

export interface FailureSummary {
  /** One entry per code (null = text without a code), in order of first appearance. */
  groups: Array<{ code: string | null; count: number }>;
  /** Every reason exactly as stored. */
  details: string[];
}

export function summariseFailureReasons(reason: string | null | undefined): FailureSummary {
  const details = splitFailureReasons(reason);
  const groups: FailureSummary["groups"] = [];
  for (const item of details) {
    const { code } = parseFailureReason(item);
    const existing = groups.find((group) => group.code === code);
    if (existing) existing.count += 1;
    else groups.push({ code, count: 1 });
  }
  return { groups, details };
}
