/**
 * Audit A-9-1, A-9-2, A-3-7 (package P1): one canonical list of expense
 * categories, and every screen that shows one reads the label through the one
 * shared helper, in Dutch and in English (no raw "fuel" / "maintenance" in the
 * vehicle Kosten and Geschiedenis tabs, the expense detail dialog or the
 * per-vehicle cost dialog).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EXPENSE_CATEGORIES } from "@shared/expense-categories";
import { EXPENSE_CATEGORIES as INBOX_CATEGORIES } from "@shared/invoice-inbox";
import nlExpenses from "@/locales/nl/expenses.json";
import enExpenses from "@/locales/en/expenses.json";
import { formatExpenseCategory } from "@/lib/format-utils";

const root = path.resolve(__dirname, "../../../..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("expense categories: one list, labelled in nl and en", () => {
  it("the invoice inbox uses the same list as the expense form", () => {
    expect([...INBOX_CATEGORIES]).toEqual([...EXPENSE_CATEGORIES]);
  });

  it("every canonical key has a Dutch and an English label", () => {
    for (const key of EXPENSE_CATEGORIES) {
      expect((nlExpenses as any).form.categories[key], `nl ${key}`).toBeTruthy();
      expect((enExpenses as any).form.categories[key], `en ${key}`).toBeTruthy();
    }
    expect(formatExpenseCategory("toll")).toBe("Tol");
    expect(formatExpenseCategory("parking")).toBe("Parkeren");
    expect(formatExpenseCategory("fuel")).toBe("Brandstof");
  });
});

describe("expense categories: no screen prints the raw key", () => {
  it.each([
    "client/src/components/vehicles/vehicle-details.tsx",
    "client/src/components/expenses/expense-detail-dialog.tsx",
    "client/src/components/expenses/expense-view-dialog.tsx",
    "client/src/pages/expenses/index.tsx",
  ])("%s reads the label through formatExpenseCategory", (file) => {
    const s = source(file);
    expect(s).toContain("formatExpenseCategory");
    expect(s).not.toContain("{expense.category}</Badge>");
    expect(s).not.toContain('<span className="text-sm">{category}</span>');
    expect(s).not.toContain("{ category: expense.category }");
    expect(s).not.toContain("const EXPENSE_CATEGORY_KEYS");
  });

  it("the vehicle Kosten tab names the category with the label, in the group header and the summary", () => {
    const s = source("client/src/components/vehicles/vehicle-details.tsx");
    expect(s).toContain("{formatExpenseCategory(category)}");
    expect(s).toContain("{ category: formatExpenseCategory(expense.category) }");
  });
});
