/**
 * The one list of expense categories (audit A-9-1, A-9-2, A-3-7).
 *
 * The values are stored verbatim in `expenses.category`, so they stay English
 * and lower case; the label a person reads comes from
 * `formatExpenseCategory` (client/src/lib/format-utils.ts), which looks the key
 * up in `expenses:form.categories` in nl and en.
 *
 * Before this list, the expense form and the invoice inbox stored capitalised
 * keys ("Fuel") while the older data held lower case ("fuel"), so the cost
 * overview showed two tiles for one category, and `toll` / `parking`, the two
 * largest categories in the real data, could not be chosen at all.
 */
export const EXPENSE_CATEGORIES = [
  "maintenance", "tires", "brakes", "damage", "fuel", "insurance",
  "registration", "cleaning", "accessories", "toll", "parking", "other",
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const OTHER_EXPENSE_CATEGORY: ExpenseCategory = "other";

/** True for a key that is already canonical (lower case and on the list). */
export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Whatever a client, the invoice scanner or an old row calls a category, as the
 * canonical key: lower-cased and trimmed, and `other` when it is not on the
 * list (so a stray label never becomes a tile of its own).
 */
export function normalizeExpenseCategory(raw: unknown): ExpenseCategory {
  if (typeof raw !== "string") return OTHER_EXPENSE_CATEGORY;
  const key = raw.trim().toLowerCase();
  return isExpenseCategory(key) ? key : OTHER_EXPENSE_CATEGORY;
}
