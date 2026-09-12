/**
 * One schema for every PDF template field, shared by the four template route
 * families and by both generators.
 *
 * FIX-P (BUG-028, BUG-048, BUG-168, BUG-176, BUG-191): `fields` and
 * `canvasFields` are jsonb written straight from `req.body` in four routes,
 * with no schema at all, and the generators trusted them. The damage-check
 * generator sized the document with
 *
 *     Math.max(1, ...fields.map(f => Number(f.page) || 1))
 *
 * so a single stored `page: 40000` allocated forty thousand A4 pages and
 * blocked the event loop for 76 seconds — every other request in the process
 * waited. The contract renderer accepted `x: 1e9` just as happily and drew
 * the value somewhere no printer will ever reach.
 *
 * The bounds below are the page itself: A4 is 595 x 842pt, so nothing outside
 * that box can appear on paper. `page` is capped at MAX_TEMPLATE_PAGES because
 * a damage check is a two-sided form, not a book.
 */
import { z } from "zod";

/** A4 in PDF points — the coordinate space every template field lives in. */
export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;
/** Hard ceiling on the page count a stored template may ask for (BUG-168). */
export const MAX_TEMPLATE_PAGES = 10;
/** Hard ceiling on how many fields one template may carry. */
export const MAX_TEMPLATE_FIELDS = 500;

const MIN_FONT_SIZE = 4;
const MAX_FONT_SIZE = 72;

/**
 * Accepts the number *or* the numeric string the editors have always sent,
 * and refuses NaN/Infinity — which used to travel all the way into
 * `page.drawText({ x: NaN })`.
 */
const coerceFiniteNumber = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.number().finite());

const optionalFinite = coerceFiniteNumber.optional();

const coerceBoolean = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

export const CANVAS_FIELD_TYPES = [
  "text",
  "dynamic",
  "inspection",
  "checkbox",
  "signature",
  "line",
  "box",
  "diagram",
] as const;

const pageNumber = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return 1;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.number().int().min(1).max(MAX_TEMPLATE_PAGES));

const textAlign = z.enum(["left", "center", "right"]).optional();

/**
 * A damage-check canvas field. Mirrors `CanvasField` in
 * `shared/damage-check-default-layout.ts`, which is the type the editor writes.
 */
export const canvasFieldSchema = z
  .object({
    id: z.string().max(120).optional(),
    type: z.enum(CANVAS_FIELD_TYPES),
    x: coerceFiniteNumber.refine((n) => n >= 0 && n <= PAGE_WIDTH, {
      message: `x must be between 0 and ${PAGE_WIDTH}`,
    }),
    y: coerceFiniteNumber.refine((n) => n >= 0 && n <= PAGE_HEIGHT, {
      message: `y must be between 0 and ${PAGE_HEIGHT}`,
    }),
    width: optionalFinite.refine((n) => n === undefined || (n >= 0 && n <= PAGE_WIDTH), {
      message: `width must be between 0 and ${PAGE_WIDTH}`,
    }),
    height: optionalFinite.refine((n) => n === undefined || (n >= 0 && n <= PAGE_HEIGHT), {
      message: `height must be between 0 and ${PAGE_HEIGHT}`,
    }),
    name: z.string().max(500).optional().default(""),
    source: z.string().max(120).optional(),
    fontSize: z
      .preprocess((value) => {
        if (value === undefined || value === null || value === "") return 11;
        if (typeof value === "string") {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : value;
        }
        return value;
      }, z.number().min(MIN_FONT_SIZE).max(MAX_FONT_SIZE))
      .optional()
      .default(11),
    isBold: coerceBoolean.optional().default(false),
    textAlign,
    damageTypes: z.array(z.string().max(120)).max(20).optional(),
    diagramTemplateId: z.number().int().positive().nullable().optional(),
    locked: coerceBoolean.optional(),
    page: pageNumber.optional().default(1),
  })
  .passthrough();

export type ValidatedCanvasField = z.infer<typeof canvasFieldSchema>;

export const canvasFieldsSchema = z.array(canvasFieldSchema).max(MAX_TEMPLATE_FIELDS);

/**
 * A contract / transport-report template field. Same geometry rules, a
 * smaller shape: these are always text drawn from a named data source.
 */
export const templateFieldSchema = z
  .object({
    id: z.string().max(120).optional(),
    name: z.string().max(500).optional(),
    label: z.string().max(500).optional(),
    source: z.string().max(120).optional(),
    x: coerceFiniteNumber.refine((n) => n >= 0 && n <= PAGE_WIDTH, {
      message: `x must be between 0 and ${PAGE_WIDTH}`,
    }),
    y: coerceFiniteNumber.refine((n) => n >= 0 && n <= PAGE_HEIGHT, {
      message: `y must be between 0 and ${PAGE_HEIGHT}`,
    }),
    width: optionalFinite.refine((n) => n === undefined || (n >= 0 && n <= PAGE_WIDTH), {
      message: `width must be between 0 and ${PAGE_WIDTH}`,
    }),
    height: optionalFinite.refine((n) => n === undefined || (n >= 0 && n <= PAGE_HEIGHT), {
      message: `height must be between 0 and ${PAGE_HEIGHT}`,
    }),
    fontSize: z
      .preprocess((value) => {
        if (value === undefined || value === null || value === "") return 12;
        if (typeof value === "string") {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : value;
        }
        return value;
      }, z.number().min(MIN_FONT_SIZE).max(MAX_FONT_SIZE))
      .optional()
      .default(12),
    isBold: coerceBoolean.optional().default(false),
    textAlign,
    page: pageNumber.optional().default(1),
  })
  .passthrough();

export type ValidatedTemplateField = z.infer<typeof templateFieldSchema>;

export const templateFieldsSchema = z.array(templateFieldSchema).max(MAX_TEMPLATE_FIELDS);

/**
 * Turns whatever is stored in a jsonb column into an array, without inventing
 * data. Historically the generators each had their own copy of this, and one
 * of them (`generateRentalContractFromTemplate`) also accepted
 * `Object.values(fields)` — that path is kept so existing rows written by the
 * old editor still render.
 */
export function coerceFieldArray(raw: unknown): unknown[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    let text = raw.trim();
    if (text === "") return [];
    // Double-stringified JSON: the shape the old PATCH handler wrote.
    if (text.startsWith('"[') && text.endsWith(']"')) {
      text = text.slice(1, -1).replace(/\\"/g, '"');
    }
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (typeof raw === "object") {
    const values = Object.values(raw as Record<string, unknown>);
    return Array.isArray(values) ? values : [];
  }
  return [];
}

export interface FieldParseResult<T> {
  /** The fields that passed validation, in their original order. */
  fields: T[];
  /** One line per rejected field — logged by the generator, never drawn. */
  rejected: string[];
}

function parseEach<T>(raw: unknown, schema: z.ZodTypeAny, what: string): FieldParseResult<T> {
  const input = coerceFieldArray(raw).slice(0, MAX_TEMPLATE_FIELDS);
  const fields: T[] = [];
  const rejected: string[] = [];
  input.forEach((candidate, index) => {
    const parsed = schema.safeParse(candidate);
    if (parsed.success) {
      fields.push(parsed.data as T);
    } else {
      rejected.push(`${what}[${index}]: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    }
  });
  return { fields, rejected };
}

/**
 * Defence in depth for the generators: one bad entry in a stored template is
 * dropped with a warning instead of taking the whole PDF with it (BUG-176),
 * and nothing that survives can address a page outside the document or a
 * coordinate outside A4 (BUG-168, BUG-191).
 */
export function parseCanvasFields(raw: unknown): FieldParseResult<ValidatedCanvasField> {
  return parseEach<ValidatedCanvasField>(raw, canvasFieldSchema, "canvasFields");
}

export function parseTemplateFields(raw: unknown): FieldParseResult<ValidatedTemplateField> {
  return parseEach<ValidatedTemplateField>(raw, templateFieldSchema, "fields");
}

/** The page count a validated field list needs — never more than the cap. */
export function pageCountFor(fields: Array<{ page?: number }>): number {
  let max = 1;
  for (const field of fields) {
    const page = Number(field.page) || 1;
    if (page > max) max = page;
  }
  return Math.min(Math.max(1, Math.trunc(max)), MAX_TEMPLATE_PAGES);
}
