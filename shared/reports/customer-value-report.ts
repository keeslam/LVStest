/**
 * Rapporten fase 4, onderdeel 9: customer value on Rapporten > Klanten. What the server
 * (server/services/reports/customer-value-report.ts) and the card agree on.
 *
 * One row per customer (plus one row without a customer, customerId null). Revenue and
 * rental days use exactly the Financieel set; costs = fines + extra km + fuel (damage has
 * no amount in the app, so return checks with damage only count).
 */
import type { ReportBreakdownRow, ReportTileTotal } from "../report-kit";

/**
 * revenue = customers with a rental (amount = revenue), costs = customers with costs, a fine or
 * a damaged return (amount = costs), late / cancelled / requests = customers with at least one
 * (amount = how many times).
 */
export const CUSTOMER_VALUE_TILES = ["revenue", "costs", "late", "cancelled", "requests"] as const;
export type CustomerValueTile = (typeof CUSTOMER_VALUE_TILES)[number];

export const CUSTOMER_VALUE_SORTS = [
  "amount", "customer", "revenue", "costs", "rentals", "rentalDays", "lateReturns", "cancellations", "portalRequests",
] as const;
export type CustomerValueSort = (typeof CUSTOMER_VALUE_SORTS)[number];

export interface CustomerValueRow {
  customerId: number | null;
  customerName: string | null;
  rentals: number;
  rentalDays: number;
  revenue: number;
  extraKmCost: number;
  fuelCost: number;
  finesCount: number;
  finesAmount: number;
  damageChecks: number;
  lateReturns: number;
  cancellations: number;
  portalRequests: number;
  /** finesAmount + extraKmCost + fuelCost */
  costs: number;
  /** The amount of the opened tile. */
  amount: number;
}

export interface CustomerValueSummary {
  tiles: Record<CustomerValueTile, ReportTileTotal>;
  /** Rows of tile revenue, biggest revenue first; count = rentals. */
  topRevenue: ReportBreakdownRow[];
  /** Rows of tile costs, biggest costs first; count = rentals. */
  topCosts: ReportBreakdownRow[];
}
