/**
 * OPT-001 — the shape of the work-day screen "Vandaag".
 *
 * `docs/audit/besluiten.md` **B-17** decides exactly what stands under
 * "Openstaande punten", and it is three things:
 *
 *   1. what must be picked up and returned today, with the button to do it;
 *   2. today's maintenance and transport, including the spares that still
 *      need a vehicle;
 *   3. the new portal requests waiting to be reviewed.
 *
 * A "te laat terug" (overdue) list was deliberately **not** chosen: until
 * B-02's bulk close has cleared the historical rows it would be noise. There
 * is therefore no overdue field in this contract, on purpose — adding one is a
 * new owner decision, not a code change.
 *
 * Every row here is deliberately **flat and small**. The workflow report
 * (`docs/audit/08-phase-20-33-workflow-rapport.md` §7, workflow F) measured the
 * employee assembling this picture by hand out of five pages and ~20 MB, of
 * which one 8 MB reservation list was downloaded twice (BUG-203/BUG-204). This
 * screen must never re-fetch those lists, so the server sends the handful of
 * fields the rows render and nothing else: no nested vehicle, no nested
 * customer, no notes, no diagrams.
 */

/** Which handover a group-1 row is. */
export type TodayHandover = "pickup" | "return";

/** A rental to hand over or take back today. */
export interface TodayHandoverRow {
  /** The reservation id — what the pickup/return dialog is opened with. */
  id: number;
  handover: TodayHandover;
  startDate: string;
  endDate: string | null;
  /** "HH:MM" when the booking carries one, so the counter can sort its morning. */
  startTime: string | null;
  endTime: string | null;
  vehicleId: number | null;
  licensePlate: string | null;
  vehicleLabel: string | null;
  customerName: string | null;
  contractNumber: string | null;
  /** A replacement whose vehicle is still to be decided (B-17 group 2 overlap). */
  placeholderSpare: boolean;
}

/** A maintenance block that covers today. */
export interface TodayMaintenanceRow {
  id: number;
  startDate: string;
  endDate: string | null;
  vehicleId: number | null;
  licensePlate: string | null;
  vehicleLabel: string | null;
  /** 'scheduled' | 'in' — an 'out' block is finished and is not listed. */
  maintenanceStatus: string | null;
  maintenanceCategory: string | null;
  customerName: string | null;
}

/** A transport planned for today. */
export interface TodayTransportRow {
  id: number;
  scheduledDate: string;
  status: string;
  transportType: string;
  vehicleId: number | null;
  licensePlate: string | null;
  vehicleLabel: string | null;
  route: string | null;
  driverName: string | null;
  customerName: string | null;
  /** True while `spareRequired` has no `relatedVehicleId` yet (TBD). */
  spareTbd: boolean;
}

/** A placeholder replacement that still needs a real vehicle. */
export interface TodaySpareRow {
  id: number;
  startDate: string;
  endDate: string | null;
  customerName: string | null;
  /** The vehicle the spare stands in for, when the original rental has one. */
  originalLicensePlate: string | null;
}

/** A portal request that nobody has picked up yet. */
export interface TodayPortalRequestRow {
  id: number;
  type: string;
  status: string;
  customerName: string | null;
  /** Truncated on the server — the full text is in the review dialog. */
  message: string;
  createdAt: string;
  reservationLabel: string | null;
}

export interface TodayCounts {
  pickups: number;
  returns: number;
  maintenance: number;
  transports: number;
  spareAssignments: number;
  portalRequests: number;
  /** The one number the dashboard entry shows. Zero means the empty state. */
  total: number;
}

export interface TodayBoard {
  /** The day this board is about, `YYYY-MM-DD`. */
  date: string;
  /** B-17 group 1. */
  pickups: TodayHandoverRow[];
  returns: TodayHandoverRow[];
  /** B-17 group 2. */
  maintenance: TodayMaintenanceRow[];
  transports: TodayTransportRow[];
  spareAssignments: TodaySpareRow[];
  /** B-17 group 3. Empty for a user without portal permission. */
  portalRequests: TodayPortalRequestRow[];
  counts: TodayCounts;
}

/** `YYYY-MM-DD`, and a date that actually exists. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** How much of a portal request's message travels to the list. */
export const TODAY_MESSAGE_PREVIEW_CHARS = 160;

/**
 * The safety valve. A real day never comes near this; a database with a
 * decade of rubbish in it must still not turn this screen into another 20 MB
 * download, so each group is capped and the count tells the truth about what
 * was cut.
 */
export const TODAY_GROUP_LIMIT = 200;
