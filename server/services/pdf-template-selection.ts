/**
 * One picker for the contract template, shared by every endpoint that renders
 * a contract.
 *
 * FIX-N/FIX-P (BUG-028, BUG-156, BUG-181 in part), decided by B-34:
 *
 *  - `contracts/generate` answered 200 with the *default* layout when the
 *    `templateId` in the query did not exist, so the operator received a
 *    contract that looked fine and used a layout they had not chosen. The same
 *    silent fallback existed for the transport report. An id that does not
 *    resolve is now a 404.
 *  - three code paths disagreed about what to do with no default template: one
 *    took `allTemplates[0]` (insertion order — effectively random), one fell
 *    through to the legacy fixed-coordinate renderer, one produced a blank
 *    page. They now share this function.
 *  - a template with no fields produced a completely blank contract, saved it
 *    as the reservation's contract, and said nothing (BUG-028). That is now a
 *    409 naming the template.
 *
 * BUG-181a, decided (B-34): "no template is marked as default" no longer
 * guesses. Exactly one template in existence is used, marked default or not
 * — there is nothing to choose between. Two or more with none marked default
 * is a 409 naming how many exist: the owner picks one, this function does
 * not. (`storage.getDefaultPdfTemplate()` itself used to paper over this with
 * its own `allTemplates[0]` fallback — fixed alongside this file, or every
 * call here would still have seen a "default" that nobody had chosen.)
 */
import { storage } from "../storage";
import { coerceFieldArray } from "../../shared/template-fields";
import type { ContractErrorCode } from "../../shared/contract-error-codes";

export type TemplateSelection<T> =
  | { ok: true; template: T }
  | {
      ok: false;
      status: number;
      message: string;
      code: ContractErrorCode;
      /** Fix round 1 (B-34 controller finding #3): the name of the offending
       *  template, so the client can say *which* one has no fields instead of
       *  a generic sentence — set only by `withFields()` below, where a name
       *  is actually known. */
      templateName?: string;
    };

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
      code: "TEMPLATE_WITHOUT_FIELDS",
      // `?? undefined`: a template row's `name` can be `null`, and the field
      // must be genuinely absent (not `null`) for the client's fallback
      // sentence to apply.
      templateName: template.name ?? undefined,
      message:
        `The PDF template "${template.name ?? template.id}" has no fields, so the contract would be completely blank. ` +
        `Open it in the template editor, place the fields, and try again.`,
    };
  }
  return { ok: true, template };
}

/**
 * The "which row is *the* default" half of the picker rule (BUG-181a), without
 * the field-count check below — used directly by `GET /api/pdf-templates/default`
 * (server/routes/pdf-templates.ts), which asks "what row is the default" for
 * display/editing, not "give me something to render a contract from". A
 * default template that has no fields yet is still a valid answer there.
 */
export async function resolveDefaultTemplateRow(): Promise<
  | { ok: true; template: any }
  | { ok: false; status: number; message: string; code: ContractErrorCode }
> {
  const preferred = await storage.getDefaultPdfTemplate();
  if (preferred) return { ok: true, template: preferred };

  const all = await storage.getAllPdfTemplates();
  if (all.length === 0) {
    return {
      ok: false,
      status: 409,
      code: "NO_TEMPLATE",
      message:
        "No contract template has been configured. Create one under Settings → PDF templates before generating a contract.",
    };
  }
  if (all.length === 1) {
    // Exactly one exists: nothing to choose between, marked default or not.
    return { ok: true, template: all[0] };
  }
  // B-34/BUG-181a: several templates, none marked default — refuse instead of
  // guessing which one the operator meant (previously: the lowest id, silently).
  return {
    ok: false,
    status: 409,
    code: "NO_DEFAULT_TEMPLATE",
    message:
      `${all.length} PDF templates exist and none is marked as default. ` +
      `Mark one as default under Settings → PDF templates before generating a contract.`,
  };
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
      return { ok: false, status: 404, code: "TEMPLATE_NOT_FOUND", message: "Template not found" };
    }
    return withFields(template);
  }

  const resolved = await resolveDefaultTemplateRow();
  if (!resolved.ok) return resolved;
  return withFields(resolved.template);
}
