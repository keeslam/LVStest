/**
 * Kosten (2026-10-16): what GET /api/expenses, /api/expenses/summary and
 * /api/expenses/facets answer. Shared between the route, the storage layer and
 * the Kostenoverzicht page, so the page is typed against what the server sends.
 */
import type { Expense } from "./schema";

/** The columns the Kosten list can be sorted on. */
export const EXPENSE_SORT_KEYS = ["date", "plate", "category", "description", "supplier", "amount"] as const;
export type ExpenseSortKey = typeof EXPENSE_SORT_KEYS[number];
export type SortDirection = "asc" | "desc";

/** Page sizes the list offers; the server accepts anything from 1 to 500. */
export const EXPENSE_PAGE_SIZE_MAX = 500;

/** One page of the Kosten list plus the size and sum of the whole selection. */
export interface ExpensePage {
  rows: Expense[];
  total: number;
  /** Euros, rounded to cents, over every row that matches — not only this page. */
  totalAmount: number;
  page: number;
  pageSize: number;
}

export interface ExpenseCategoryGroup {
  /** Canonical key: lower case, trimmed. */
  category: string;
  count: number;
  amount: number;
  /** The newest rows of this category within the selection, newest first. */
  recent: Expense[];
}

/** The right-hand panel and the category sections: the selection per category. */
export interface ExpenseSummary {
  total: number;
  totalAmount: number;
  byCategory: ExpenseCategoryGroup[];
}

/**
 * Kosten (2026-10-18): one row per vehicle within a selection (usually one
 * category), so a vehicle with ten fuel bills shows once with the count and sum.
 */
export interface ExpenseVehicleGroup {
  vehicleId: number;
  licensePlate: string | null;
  brand: string | null;
  model: string | null;
  count: number;
  /** Euros, rounded to cents, over every cost of this vehicle in the selection. */
  amount: number;
  /** YYYY-MM-DD of the oldest and the newest cost. */
  firstDate: string;
  lastDate: string;
  /** The description of the newest cost. */
  lastDescription: string | null;
}

/** The choices for the pickers: every vehicle that has an expense, and every category in use. */
export interface ExpenseFacets {
  vehicles: Array<{ id: number; licensePlate: string; brand: string; model: string }>;
  categories: string[];
}
