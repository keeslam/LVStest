/**
 * One zod error map for the whole client, wired to i18next (A-1-2, A-3-7,
 * A-4-5, A-9-5, A-17-6; audit 2026-10-09). Zod's own messages are English
 * ("Required", "String must contain at least 1 character(s)"). The map is
 * evaluated when an issue is raised, so it follows the language switch; the
 * messages live in common.json `validation.*`.
 *
 * Schemas that need a specific sentence ("Kies een voertuig") pass
 * `v("vehicleRequired")` as the message. That is read when the schema module
 * loads, which is right for the Dutch screen; the default map below covers
 * everything left bare.
 *
 * Importing this module installs the map. main.tsx and every schema file that
 * uses `v` import it, so a test that imports a schema gets the same behaviour.
 */
import { z } from "zod";
import i18n from "@/i18n";

type Params = Record<string, unknown>;

/** A `common:validation.<key>` sentence in the current language. */
export function v(key: string, params?: Params): string {
  return String(i18n.t(`common:validation.${key}`, params as never));
}

export const zodErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === z.ZodParsedType.undefined || issue.received === z.ZodParsedType.null) {
        return { message: v("required") };
      }
      if (issue.expected === z.ZodParsedType.number || issue.expected === z.ZodParsedType.nan) {
        return { message: v("numberInvalid") };
      }
      if (issue.expected === z.ZodParsedType.date) return { message: v("invalidDate") };
      return { message: v("invalidType") };
    case z.ZodIssueCode.too_small: {
      const min = Number(issue.minimum);
      if (issue.type === "string") {
        return { message: min <= 1 ? v("required") : v("tooShort", { count: min }) };
      }
      if (issue.type === "number") {
        return { message: issue.exact || issue.inclusive ? v("numberMin", { min }) : v("numberGreaterThan", { min }) };
      }
      if (issue.type === "array" || issue.type === "set") return { message: v("arrayMin", { count: min }) };
      return { message: v("invalidType") };
    }
    case z.ZodIssueCode.too_big: {
      const max = Number(issue.maximum);
      if (issue.type === "string") return { message: v("tooLong", { count: max }) };
      if (issue.type === "number") return { message: v("numberMax", { max }) };
      if (issue.type === "array" || issue.type === "set") return { message: v("arrayMax", { count: max }) };
      return { message: v("invalidType") };
    }
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: v("invalidEmail") };
      if (issue.validation === "url") return { message: v("invalidUrl") };
      if (issue.validation === "date" || issue.validation === "datetime") return { message: v("invalidDate") };
      return { message: v("invalidFormat") };
    case z.ZodIssueCode.invalid_date:
      return { message: v("invalidDate") };
    case z.ZodIssueCode.invalid_enum_value:
    case z.ZodIssueCode.invalid_literal:
    case z.ZodIssueCode.invalid_union:
      return { message: v("invalidChoice") };
    case z.ZodIssueCode.not_multiple_of:
      return { message: v("integerRequired") };
    default:
      return { message: ctx.defaultError };
  }
};

z.setErrorMap(zodErrorMap);
