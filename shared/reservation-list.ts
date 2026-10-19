import type { Reservation } from "./schema";

/**
 * BUG-205 (Kees, 2026-10-19): the reservations list a page at a time. `GET /api/reservations` with
 * `view` answers this shape; without it the route still answers the old full array, so nothing that
 * reads the array breaks.
 */
export const RESERVATION_LIST_VIEWS = ["current", "history", "completed"] as const;
export type ReservationListView = typeof RESERVATION_LIST_VIEWS[number];
export const RESERVATION_LIST_SORTS = ["pickup", "return", "customer", "plate"] as const;
export type ReservationListSort = typeof RESERVATION_LIST_SORTS[number];
/** Most rows one request may ask for. */
export const RESERVATION_LIST_MAX_PAGE_SIZE = 500;

/** A reservation's own columns, with only what the list shows of its vehicle and customer. */
export type ReservationListRow = Omit<Reservation, "vehicle" | "customer" | "driver"> & {
  vehicle: { id: number; licensePlate: string; brand: string; model: string; returnMileage: number | null } | null;
  customer: { id: number; name: string; companyName: string | null } | null;
};

export interface ReservationListPage {
  rows: ReservationListRow[];
  /** Rows matching view and search, over all pages. */
  total: number;
  page: number;
  pageSize: number;
  /** Rows per view without the search, for the tab labels. */
  counts: Record<ReservationListView, number>;
}

/**
 * BUG-205 phase B (2026-10-19): `GET /api/reservations` with any of these answers the old array shape,
 * filtered in the database. `slim=1` answers ReservationListRow (only what a list shows of vehicle
 * and customer); without it each row carries the full vehicle and customer, as before.
 */
export const RESERVATION_FILTER_KEYS = [
  "type", "status", "excludeStatus", "vehicleId", "customerId", "from", "to", "delivery",
  "maintenanceStatus", "excludeMaintenanceStatus", "slim",
] as const;

/** Per customer, for the customers page: how many reservations, the latest one, and whether a car is out now. */
export interface CustomerReservationStats {
  customerId: number;
  count: number;
  lastCreatedAt: string | null;
  hasActiveRental: boolean;
}
