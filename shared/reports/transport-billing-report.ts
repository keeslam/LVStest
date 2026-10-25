/**
 * Rapporten fase 2, onderdeel 3: the transport billing report on Rapporten >
 * Financieel. What the server (server/services/reports/transport-billing-report.ts)
 * and the card (client/src/pages/reports/transport-billing-report-card.tsx) agree on.
 */
import type { ReportTileTotal } from "../report-kit";

/**
 * notInvoiced = billable and not invoiced yet, invoiced = billable and invoiced, toll = toll cost above 0.
 * openAllTime = the same rows as notInvoiced over ALL periods (ignores from/to): the money that is left behind.
 */
export const TRANSPORT_BILLING_TILES = ["notInvoiced", "invoiced", "toll", "openAllTime", "all"] as const;
/**
 * all = every transport of the period (not cancelled), what the type breakdown counts; amount = the billable
 * amount. Not a card: a type line opens it narrowed to that type.
 */
export const TRANSPORT_BILLING_CARD_TILES = ["notInvoiced", "invoiced", "toll", "openAllTime"] as const;
/** Breakdown names that /rows and /export accept as `drill`. */
export const TRANSPORT_BILLING_DRILLS = ["type"] as const;
export type TransportBillingTile = (typeof TRANSPORT_BILLING_TILES)[number];

export const TRANSPORT_BILLING_SORTS = ["date", "amount", "tollCost", "transportType", "status"] as const;
export type TransportBillingSort = (typeof TRANSPORT_BILLING_SORTS)[number];

export interface TransportBillingRow {
  id: number;
  /** Completed day, else scheduled day (yyyy-mm-dd). */
  date: string;
  transportType: string;
  status: string;
  vehicleId: number | null;
  licensePlate: string | null;
  isExternalVehicle: boolean;
  customerId: number | null;
  customerName: string | null;
  billable: boolean;
  /** Null while the amount was never filled in. */
  billableAmount: number | null;
  tollCost: number | null;
  invoiced: boolean;
  invoicedDate: string | null;
  distanceKm: number | null;
  /** The amount of the opened tile: tollCost for toll, else billableAmount ?? 0. */
  amount: number;
}

export interface TransportBillingSummary {
  tiles: Record<TransportBillingTile, ReportTileTotal>;
  /** Rows of the notInvoiced tile without a billable amount (they count for 0). */
  missingAmount: number;
  byMonth: Array<{ month: string; invoiced: number; notInvoiced: number; toll: number }>;
  byType: Array<{ type: string; count: number; billable: number; notInvoiced: number; toll: number }>;
}
