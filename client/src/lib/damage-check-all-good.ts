/**
 * "Alles goed" for one block of the damage check form (A-11-7).
 *
 * The field list is editable by the owner (app settings), so the "normal" answer cannot live in the
 * field definitions the app already stores; it is looked up by the field's stable `key` and only
 * used when the field still offers it. A field it does not know is left for a person to fill in.
 * Existing answers are never overwritten.
 */
import type { ChecklistFieldDef, ChecklistGroupDef } from "@shared/schema";

/** key -> the normal answer (a comma list for the multi-choice fields, same shape the form stores). */
const OK_VALUE_BY_KEY: Record<string, string> = {
  carInterior: "schoon",
  windowDamage: "nee",
  upholstery: "heel",
  ashtray: "schoon",
  spareWheel: "goed",
  jack: "ja",
  wheelBrace: "ja",
  floorMats: "ja",
  headrests: "goed",
  carExterior: "schoon",
  hubcaps: "LV,LA,RV,RA",
  licensePlates: "voor,achter",
  mirrorCapsLeft: "goed",
  mirrorCapsRight: "goed",
  mirrorGlassLeftRight: "goed",
  antenna: "goed",
  wiperBlade: "goed",
  doorCatchers: "goed",
  slidingDoorBus: "goed",
  indicatorSlots: "ja",
  fogLights: "goed",
};

export type ChecklistAnswers = Record<string, string | boolean>;

export function okValueForField(field: ChecklistFieldDef): string | null {
  const ok = OK_VALUE_BY_KEY[field.key];
  if (!ok) return null;
  return ok.split(",").every((part) => field.options.includes(part)) ? ok : null;
}

const isEmpty = (value: string | boolean | undefined) => value === undefined || value === "" || value === false;

/** The answers of `group` after "Alles goed": every still-empty field gets its normal value. */
export function applyAllGood(group: ChecklistGroupDef, current: ChecklistAnswers): ChecklistAnswers {
  const next: ChecklistAnswers = { ...current };
  for (const field of group.fields) {
    if (!isEmpty(next[field.key])) continue;
    if (field.inputType === "checkbox") {
      next[field.key] = true;
      continue;
    }
    const ok = okValueForField(field);
    if (ok !== null) next[field.key] = ok;
  }
  return next;
}

/** How many fields of the block have an answer (a ticked box counts; an untouched one does not). */
export function countFilled(group: ChecklistGroupDef, current: ChecklistAnswers): { filled: number; total: number } {
  const filled = group.fields.filter((field) => !isEmpty(current[field.key])).length;
  return { filled, total: group.fields.length };
}
