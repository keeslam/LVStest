/**
 * Rapporten fase 5, onderdeel 13: deliveries and collections. What the server
 * (server/services/reports/delivery-report.ts) and the card agree on. Source:
 * vehicle_transports of type delivery and repossession that are not cancelled.
 */
import type { ReportTileTotal } from "../report-kit";

export const DELIVERY_REPORT_TYPES = ["delivery", "repossession"] as const;

/** all = onTime + late + open + undated (every trip is in exactly one of the four). */
export const DELIVERY_REPORT_TILES = ["all", "onTime", "late", "open", "undated"] as const;
/** Breakdown names that /rows and /export accept as `drill`. */
export const DELIVERY_REPORT_DRILLS = ["type", "driver"] as const;
export type DeliveryReportTile = (typeof DELIVERY_REPORT_TILES)[number];

export const DELIVERY_REPORT_SORTS = ["scheduledDate", "completedDate", "transportType", "driver", "distanceKm", "daysLate"] as const;
export type DeliveryReportSort = (typeof DELIVERY_REPORT_SORTS)[number];

export type DeliveryPunctuality = "onTime" | "late" | "open" | "undated";

export interface DeliveryReportRow {
  id: number;
  transportType: string;
  status: string;
  /** yyyy-mm-dd */
  scheduledDate: string;
  completedDate: string | null;
  punctuality: DeliveryPunctuality;
  /** Days after the planned day (done late) or since the planned day (still not done); null otherwise. */
  daysLate: number | null;
  vehicleId: number | null;
  licensePlate: string | null;
  isExternalVehicle: boolean;
  customerId: number | null;
  customerName: string | null;
  reservationId: number | null;
  driverName: string | null;
  distanceKm: number | null;
  /** coalesce(distanceKm, 0) */
  amount: number;
}

export interface DeliveryMonth {
  month: string;
  onTime: number;
  late: number;
  open: number;
  undated: number;
}

export interface DeliveryTypeCount {
  type: string;
  total: number;
  onTime: number;
  late: number;
  open: number;
  undated: number;
  km: number;
}

export interface DeliveryDriverCount {
  /** Null = no driver filled in. */
  driver: string | null;
  trips: number;
  onTime: number;
  late: number;
  km: number;
}

export interface DeliveryReportSummary {
  tiles: Record<DeliveryReportTile, ReportTileTotal>;
  byMonth: DeliveryMonth[];
  byType: DeliveryTypeCount[];
  byDriver: DeliveryDriverCount[];
  /** onTime / (onTime + late), 1 decimal; null when both are 0. */
  onTimePct: number | null;
  /** Km of tile all / trips with a distance, 1 decimal; null without any. */
  avgKmPerTrip: number | null;
  tripsWithDistance: number;
}
