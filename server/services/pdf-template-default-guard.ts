/**
 * A-10-2 (audit 2026-10-09, module 10): a contract template without fields could be made the
 * default, and from then on every pickup failed with "the template has no fields" (the contract
 * picker refuses a field-less template, B-34). The trap is made when a template BECOMES the
 * default while empty, or when the default is emptied - this rule names exactly those
 * transitions and nothing else, so a save that does not change the situation stays possible.
 *
 * The first template of an installation is created as the default with no fields (that is how
 * the editor starts); refusing it would make the editor unusable on a fresh install, so it is
 * exempt - the editor warns there.
 */
export interface DefaultGuardInput {
  /** `isDefault` the row will have after this write. */
  resultingIsDefault: boolean;
  /** Number of field definitions the row will have after this write. */
  resultingFieldCount: number;
  /** The row as it is now; `null` when this write creates it. */
  before: { isDefault: boolean; fieldCount: number } | null;
  /** Another contract template exists (only read when `before` is null). */
  otherTemplatesExist: boolean;
}

export const TEMPLATE_DEFAULT_WITHOUT_FIELDS = "TEMPLATE_DEFAULT_WITHOUT_FIELDS" as const;

export function defaultWithoutFieldsViolation(input: DefaultGuardInput): boolean {
  if (!input.resultingIsDefault || input.resultingFieldCount > 0) return false;
  if (input.before === null) return input.otherTemplatesExist;
  if (!input.before.isDefault) return true; // becoming the default while empty
  return input.before.fieldCount > 0; // the default had fields and loses them all
}
