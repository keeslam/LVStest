/**
 * The sentence for a refused "opnieuw genereren" (POST /api/documents/:id/regenerate). The server's
 * message is English and carries the status ("400: ..."); the client looks the reason up by the
 * stable `code` and never by matching that text (shared/contract-error-codes.ts,
 * shared/document-regeneration-codes.ts).
 */
import { CONTRACT_ERROR_CODES } from "@shared/contract-error-codes";
import { REGENERATION_ERROR_CODES } from "@shared/document-regeneration-codes";
import type { Translate } from "./document-labels";

const KNOWN_CODES: readonly string[] = [...CONTRACT_ERROR_CODES, ...REGENERATION_ERROR_CODES, "STALE_WRITE"];

export function regenerationErrorText(t: Translate, error: unknown): string {
  const code = typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "";
  if (!KNOWN_CODES.includes(code)) return t("staleness.errors.UNKNOWN");
  const templateName = (error as { templateName?: unknown }).templateName;
  if (code === "TEMPLATE_WITHOUT_FIELDS") {
    return typeof templateName === "string" && templateName
      ? t("staleness.errors.TEMPLATE_WITHOUT_FIELDS", { name: templateName })
      : t("staleness.errors.TEMPLATE_WITHOUT_FIELDS_UNKNOWN");
  }
  return t(`staleness.errors.${code}`);
}
