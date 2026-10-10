/**
 * What makes two versions of a template "the same" for the unsaved-changes check of the three
 * template editors (contract, transport report, barcode label).
 *
 * A whitelist, not "everything except a few keys": only what the person can edit counts, so a field
 * the server adds later (updatedAt, the stored background paths, a new column) never turns a freshly
 * opened editor dirty. An editor that lets the person change more than the common set names the extras
 * (the barcode label's size and bar sizes).
 */
const COMMON_FIELD_KEYS = ["id", "name", "x", "y", "fontSize", "isBold", "source", "textAlign", "locked"] as const;

export interface ComparableTemplateOptions {
  /** Template-level keys besides name and isDefault that this editor changes. */
  templateKeys?: readonly string[];
  /** Field-level keys besides the common set that this editor changes. */
  fieldKeys?: readonly string[];
}

type Loose = { [key: string]: unknown };

export function comparableTemplate<T extends { name?: string; isDefault?: boolean; fields?: readonly object[] | null }>(
  template: T,
  { templateKeys = [], fieldKeys = [] }: ComparableTemplateOptions = {},
): string {
  const source = template as Loose;
  const pick = (from: Loose, keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, from[key]]));
  const fieldKeysToCompare = [...COMMON_FIELD_KEYS, ...fieldKeys];
  return JSON.stringify({
    name: source.name,
    isDefault: !!source.isDefault,
    ...pick(source, templateKeys),
    fields: (template.fields ?? []).map((field) => {
      const values = field as Loose;
      return { ...pick(values, fieldKeysToCompare), isBold: !!values.isBold, locked: !!values.locked };
    }),
  });
}
