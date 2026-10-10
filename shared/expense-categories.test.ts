import { describe, it, expect } from "vitest";
import { EXPENSE_CATEGORIES, isExpenseCategory, normalizeExpenseCategory } from "./expense-categories";

describe("expense categories (A-9-1, A-9-2)", () => {
  it("is one lower-case list that keeps every old key and adds toll and parking", () => {
    expect([...EXPENSE_CATEGORIES]).toEqual([
      "maintenance", "tires", "brakes", "damage", "fuel", "insurance",
      "registration", "cleaning", "accessories", "toll", "parking", "other",
    ]);
    for (const key of EXPENSE_CATEGORIES) expect(key).toBe(key.toLowerCase());
  });

  it("lower-cases the capitalised keys the form and the invoice inbox used to store", () => {
    expect(normalizeExpenseCategory("Fuel")).toBe("fuel");
    expect(normalizeExpenseCategory("  Maintenance ")).toBe("maintenance");
    expect(normalizeExpenseCategory("TOLL")).toBe("toll");
    expect(normalizeExpenseCategory("parking")).toBe("parking");
  });

  it("turns anything unknown, empty or not a string into other", () => {
    expect(normalizeExpenseCategory("Front Window")).toBe("other");
    expect(normalizeExpenseCategory("")).toBe("other");
    expect(normalizeExpenseCategory(null)).toBe("other");
    expect(normalizeExpenseCategory(undefined)).toBe("other");
    expect(normalizeExpenseCategory(42 as unknown as string)).toBe("other");
  });

  it("knows a canonical key when it sees one", () => {
    expect(isExpenseCategory("fuel")).toBe(true);
    expect(isExpenseCategory("Fuel")).toBe(false);
    expect(isExpenseCategory("repair")).toBe(false);
  });
});
