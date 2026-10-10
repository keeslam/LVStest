/**
 * The Dutch sentence for the reason a mail was not sent (audit 2026-10-09,
 * module 13, finding 2). The stored reason carries a stable code
 * (`shared/email-failure.ts`); the sentence is looked up by that code, never by
 * the English text. A reason without a known code reads as the generic failure.
 *
 * `t` is the translator of the "notifications" namespace.
 */
import { summariseFailureReasons } from "@shared/email-failure";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function failureCodeText(t: Translate, code: string | null): string {
  const generic = t("customerCommunications.failure.unknown");
  if (!code) return generic;
  return t(`customerCommunications.failure.codes.${code}`, { defaultValue: `${generic} (${code})` });
}

/** One line per code of a stored reason: "2× Geen geschikt e-mailadres". */
export function failureLines(t: Translate, reason: string | null | undefined): string[] {
  return summariseFailureReasons(reason).groups.map((group) => {
    const text = failureCodeText(t, group.code);
    return group.count > 1 ? `${group.count}× ${text}` : text;
  });
}
