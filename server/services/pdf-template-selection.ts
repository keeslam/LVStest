/**
 * One picker for the contract template, shared by every endpoint that renders
 * a contract.
 *
 * FIX-N/FIX-P (BUG-028, BUG-156, BUG-181 in part):
 *
 *  - `contracts/generate` answered 200 with the *default* layout when the
 *    `templateId` in the query did not exist, so the operator received a
 *    contract that looked fine and used a layout they had not chosen. The same
 *    silent fallback existed for the transport report. An id that does not
 *    resolve is now a 404.
 *  - three code paths disagreed about what to do with no default template: one
 *    took `allTemplates[0]` (insertion order — effectively random), one fell
 *    through to the legacy fixed-coordinate renderer, one produced a blank
 *    page. They now share this function, which prefers the marked default and
 *    otherwise takes the lowest id, so two endpoints never disagree about
 *    which template a reservation's contract uses.
 *  - a template with no fields produced a completely blank contract, saved it
 *    as the reservation's contract, and said nothing (BUG-028). That is now a
 *    409 naming the template.
 *
 * Still open for the owner (BUG-181): whether "no template is marked as
 * default" should refuse outright instead of picking the lowest id.
 */
import { storage } from "../storage";
import { coerceFieldArray } from "../../shared/template-fields";

export type TemplateSelection<T> =
  | { ok: true; template: T }
  | { ok: false; status: number; message: string };

/** Number of field definitions a stored template carries, whatever its shape. */
export function templateFieldCount(template: { fields?: unknown } | null | undefined): number {
  if (!template) return 0;
  return coerceFieldArray(template.fields).length;
}

function withFields<T extends { id: number; name?: string | null; fields?: unknown }>(
  template: T,
): TemplateSelection<T> {
  if (templateFieldCount(template) === 0) {
    return {
      ok: false,
      status: 409,
      message:
        `The PDF template "${template.name ?? template.id}" has no fields, so the contract would be completely blank. ` +
        `Open it in the template editor, place the fields, and try again.`,
    };
  }
  return { ok: true, template };
}

/**
 * Resolves the template a contract must be rendered with.
 * `templateId` undefined means "use the default".
 */
export async function selectContractTemplate(
  templateId?: number,
): Promise<TemplateSelection<any>> {
  if (templateId !== undefined) {
    const template = await storage.getPdfTemplate(templateId);
    if (!template) {
      return { ok: false, status: 404, message: "Template not found" };
    }
    return withFields(template);
  }

  const preferred = await storage.getDefaultPdfTemplate();
  if (preferred) return withFields(preferred);

  const all = await storage.getAllPdfTemplates();
  if (all.length === 0) {
    return {
      ok: false,
      status: 409,
      message:
        "No contract template has been configured. Create one under Settings → PDF templates before generating a contract.",
    };
  }
  // Deterministic: the lowest id, not "whatever the query returned first".
  const fallback = [...all].sort((a, b) => a.id - b.id)[0];
  console.warn(
    `[contracts] No PDF template is marked as default; using template #${fallback.id} ("${fallback.name}").`,
  );
  return withFields(fallback);
}
