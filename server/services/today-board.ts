/**
 * OPT-001 — the one query behind the work-day screen "Vandaag".
 *
 * The problem this solves is measured, not assumed. Workflow F in
 * `docs/audit/wip/p21-workflows.md` counted the morning ritual: five pages
 * (`/`, `/reservations`, `/delivery`, `/maintenance`, `/portal-admin`), five
 * clicks, and ~20 MB of repeated downloads — the reservation list alone is
 * 8 MB and was fetched twice (BUG-203/BUG-204), the spare widget pulled four
 * whole tables for eight rows (~9.7 MB), the calendar range 1 523 KB in
 * 835 ms. All of it to assemble a picture the database can produce in five
 * statements.
 *
 * So this module does exactly that: **five SELECTs, flat rows, no blobs.**
 * It never calls `storage.getAllReservations()`, `getAllTransports()` or
 * `getReservationsInDateRange()` — those return the fat rows with nested
 * vehicle/customer objects that made the morning cost 20 MB.
 *
 * Content is decided by `docs/audit/besluiten.md` **B-17** and nothing else:
 * today's pickups and returns, today's maintenance and transport plus the
 * spares still to be assigned, and the new portal requests. No overdue list —
 * B-17 rejected it by name.
 *
 * `date` is a parameter rather than `new Date()` inside the query so the
 * screen can ask for *its own* today (a browser in Amsterdam is already on
 * tomorrow when a UTC server is not) and so the tests never depend on the day
 * they run.
 */
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  customers,
  portalRequests,
  reservations,
  vehicleTransports,
  vehicles,
} from "../../shared/schema";
import {
  LEGACY_RESERVATION_STATUS_ALIASES,
  type ReservationStatus,
} from "./lifecycle";
import {
  TODAY_GROUP_LIMIT,
  TODAY_MESSAGE_PREVIEW_CHARS,
  type TodayBoard,
  type TodayHandoverRow,
  type TodayMaintenanceRow,
  type TodayPortalRequestRow,
  type TodaySpareRow,
  type TodayTransportRow,
} from "../../shared/today";

/**
 * Every stored spelling of one canonical status. BUG-129 left `confirmed`,
 * `pending`, `scheduled`, `active` and `in` in the column; `lifecycle.ts`
 * already knows what each of them means, so the list is derived from there
 * instead of being retyped (and drifting) here.
 */
function storedSpellingsOf(canonical: ReservationStatus): string[] {
  const aliases = Object.entries(LEGACY_RESERVATION_STATUS_ALIASES)
    .filter(([, meaning]) => meaning === canonical)
    .map(([stored]) => stored);
  return [canonical, ...aliases];
}

const NOT_YET_PICKED_UP = storedSpellingsOf("booked");
const OUT_WITH_THE_CUSTOMER = storedSpellingsOf("picked_up");

/** "AB-12-CD Volkswagen Caddy", as far as the columns allow. */
function vehicleLabel(brand: string | null, model: string | null): string | null {
  const label = [brand, model].filter(Boolean).join(" ").trim();
  return label.length > 0 ? label : null;
}

function customerLabel(name: string | null, companyName: string | null): string | null {
  return companyName?.trim() || name?.trim() || null;
}

function routeLabel(
  originCity: string | null,
  destinationCity: string | null,
): string | null {
  if (!originCity && !destinationCity) return null;
  return `${originCity ?? "?"} → ${destinationCity ?? "?"}`;
}

export interface TodayBoardOptions {
  /**
   * B-17 group 3 is portal work. A user without portal permission gets an
   * empty group rather than a 403 on the whole screen — the other two groups
   * are still their morning.
   */
  includePortalRequests: boolean;
}

export async function buildTodayBoard(
  date: string,
  options: TodayBoardOptions,
): Promise<TodayBoard> {
  const [handoverRows, maintenanceRows, transportRows, spareRows, requestRows] =
    await Promise.all([
      // 1 — B-17 group 1: what goes out and what comes back today.
      db
        .select({
          id: reservations.id,
          startDate: reservations.startDate,
          endDate: reservations.endDate,
          startTime: reservations.startTime,
          endTime: reservations.endTime,
          status: reservations.status,
          contractNumber: reservations.contractNumber,
          placeholderSpare: reservations.placeholderSpare,
          vehicleId: reservations.vehicleId,
          licensePlate: vehicles.licensePlate,
          brand: vehicles.brand,
          model: vehicles.model,
          customerName: customers.name,
          customerCompany: customers.companyName,
        })
        .from(reservations)
        .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
        .leftJoin(customers, eq(reservations.customerId, customers.id))
        .where(
          and(
            isNull(reservations.deletedAt),
            sql`(${reservations.type} IS NULL OR ${reservations.type} <> 'maintenance_block')`,
            or(
              and(
                eq(reservations.startDate, date),
                inArray(reservations.status, NOT_YET_PICKED_UP),
              ),
              and(
                eq(reservations.endDate, date),
                inArray(reservations.status, OUT_WITH_THE_CUSTOMER),
              ),
            ),
          ),
        )
        .orderBy(reservations.startTime, reservations.id)
        .limit(TODAY_GROUP_LIMIT * 2),

      // 2 — B-17 group 2a: the blocks that cover today and are not closed.
      db
        .select({
          id: reservations.id,
          startDate: reservations.startDate,
          endDate: reservations.endDate,
          maintenanceStatus: reservations.maintenanceStatus,
          maintenanceCategory: reservations.maintenanceCategory,
          vehicleId: reservations.vehicleId,
          licensePlate: vehicles.licensePlate,
          brand: vehicles.brand,
          model: vehicles.model,
          customerName: customers.name,
          customerCompany: customers.companyName,
        })
        .from(reservations)
        .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
        .leftJoin(customers, eq(reservations.customerId, customers.id))
        .where(
          and(
            isNull(reservations.deletedAt),
            eq(reservations.type, "maintenance_block"),
            sql`${reservations.status} <> 'cancelled'`,
            sql`${reservations.startDate} <= ${date}`,
            sql`(${reservations.endDate} IS NULL OR ${reservations.endDate} >= ${date})`,
            // 'out' is a finished repair: OPT-015's "onderhoud afronden" wrote
            // it, and it is not today's work any more.
            sql`(${reservations.maintenanceStatus} IS NULL OR ${reservations.maintenanceStatus} <> 'out')`,
          ),
        )
        .orderBy(reservations.startDate, reservations.id)
        .limit(TODAY_GROUP_LIMIT),

      // 3 — B-17 group 2b: today's transports that are still to be driven.
      db
        .select({
          id: vehicleTransports.id,
          scheduledDate: vehicleTransports.scheduledDate,
          status: vehicleTransports.status,
          transportType: vehicleTransports.transportType,
          originCity: vehicleTransports.originCity,
          destinationCity: vehicleTransports.destinationCity,
          driverName: vehicleTransports.driverName,
          spareRequired: vehicleTransports.spareRequired,
          relatedVehicleId: vehicleTransports.relatedVehicleId,
          vehicleId: vehicleTransports.vehicleId,
          externalLicensePlate: vehicleTransports.externalLicensePlate,
          externalBrand: vehicleTransports.externalBrand,
          externalModel: vehicleTransports.externalModel,
          licensePlate: vehicles.licensePlate,
          brand: vehicles.brand,
          model: vehicles.model,
          customerName: customers.name,
          customerCompany: customers.companyName,
        })
        .from(vehicleTransports)
        .leftJoin(vehicles, eq(vehicleTransports.vehicleId, vehicles.id))
        .leftJoin(customers, eq(vehicleTransports.customerId, customers.id))
        .where(
          and(
            eq(vehicleTransports.scheduledDate, date),
            sql`${vehicleTransports.status} NOT IN ('completed','cancelled')`,
          ),
        )
        .orderBy(vehicleTransports.id)
        .limit(TODAY_GROUP_LIMIT),

      // 4 — B-17 group 2c: "vervangers die nog toegewezen moeten worden".
      // Same population as `/api/placeholder-reservations/needing-assignment`
      // (BUG-137's filters included), but as five columns instead of the four
      // whole tables the dashboard widget pulls for it.
      db
        .select({
          id: reservations.id,
          startDate: reservations.startDate,
          endDate: reservations.endDate,
          customerName: customers.name,
          customerCompany: customers.companyName,
          originalLicensePlate: sql<string | null>`(
            SELECT v.license_plate FROM reservations orig
            JOIN vehicles v ON v.id = orig.vehicle_id
            WHERE orig.id = ${reservations.replacementForReservationId}
          )`,
        })
        .from(reservations)
        .leftJoin(customers, eq(reservations.customerId, customers.id))
        .where(
          and(
            isNull(reservations.deletedAt),
            eq(reservations.placeholderSpare, true),
            eq(reservations.type, "replacement"),
            isNull(reservations.vehicleId),
            eq(reservations.status, "booked"),
            sql`${reservations.startDate} <= ${date}`,
            sql`(
              ${reservations.replacementForTransportId} IS NULL
              OR EXISTS (
                SELECT 1 FROM vehicle_transports t
                WHERE t.id = ${reservations.replacementForTransportId}
                  AND t.status NOT IN ('completed','cancelled')
                  AND t.spare_required = true
              )
            )`,
          ),
        )
        .orderBy(reservations.startDate, reservations.id)
        .limit(TODAY_GROUP_LIMIT),

      // 5 — B-17 group 3: portal requests nobody has taken yet.
      options.includePortalRequests
        ? db
            .select({
              id: portalRequests.id,
              type: portalRequests.type,
              status: portalRequests.status,
              createdAt: portalRequests.createdAt,
              message: portalRequests.message,
              customerName: customers.name,
              customerCompany: customers.companyName,
              reservationLabel: sql<string | null>`(
                SELECT concat(v.license_plate, ' ', r.start_date, ' - ', coalesce(r.end_date, '...'))
                FROM reservations r
                LEFT JOIN vehicles v ON v.id = r.vehicle_id
                WHERE r.id = ${portalRequests.reservationId}
              )`,
            })
            .from(portalRequests)
            .leftJoin(customers, eq(portalRequests.customerId, customers.id))
            .where(eq(portalRequests.status, "new"))
            .orderBy(portalRequests.createdAt, portalRequests.id)
            .limit(TODAY_GROUP_LIMIT)
        : Promise.resolve([] as Array<{
            id: number;
            type: string;
            status: string;
            createdAt: Date;
            message: string;
            customerName: string | null;
            customerCompany: string | null;
            reservationLabel: string | null;
          }>),
    ]);

  const pickups: TodayHandoverRow[] = [];
  const returns: TodayHandoverRow[] = [];
  for (const row of handoverRows) {
    // A row can only be in one group: the status says whether the car is still
    // here (hand it over) or already out (take it back).
    const handover: TodayHandoverRow["handover"] =
      row.endDate === date && OUT_WITH_THE_CUSTOMER.includes(row.status) ? "return" : "pickup";
    const mapped: TodayHandoverRow = {
      id: row.id,
      handover,
      startDate: row.startDate,
      endDate: row.endDate,
      startTime: row.startTime,
      endTime: row.endTime,
      vehicleId: row.vehicleId,
      licensePlate: row.licensePlate ?? null,
      vehicleLabel: vehicleLabel(row.brand ?? null, row.model ?? null),
      customerName: customerLabel(row.customerName ?? null, row.customerCompany ?? null),
      contractNumber: row.contractNumber,
      placeholderSpare: row.placeholderSpare,
    };
    (handover === "return" ? returns : pickups).push(mapped);
  }

  const maintenance: TodayMaintenanceRow[] = maintenanceRows.map((row) => ({
    id: row.id,
    startDate: row.startDate,
    endDate: row.endDate,
    vehicleId: row.vehicleId,
    licensePlate: row.licensePlate ?? null,
    vehicleLabel: vehicleLabel(row.brand ?? null, row.model ?? null),
    maintenanceStatus: row.maintenanceStatus,
    maintenanceCategory: row.maintenanceCategory,
    customerName: customerLabel(row.customerName ?? null, row.customerCompany ?? null),
  }));

  const transports: TodayTransportRow[] = transportRows.map((row) => ({
    id: row.id,
    scheduledDate: row.scheduledDate,
    status: row.status,
    transportType: row.transportType,
    vehicleId: row.vehicleId,
    licensePlate: row.licensePlate ?? row.externalLicensePlate ?? null,
    vehicleLabel:
      vehicleLabel(row.brand ?? null, row.model ?? null) ??
      vehicleLabel(row.externalBrand ?? null, row.externalModel ?? null),
    route: routeLabel(row.originCity, row.destinationCity),
    driverName: row.driverName,
    customerName: customerLabel(row.customerName ?? null, row.customerCompany ?? null),
    spareTbd: row.spareRequired && row.relatedVehicleId === null,
  }));

  const spareAssignments: TodaySpareRow[] = spareRows.map((row) => ({
    id: row.id,
    startDate: row.startDate,
    endDate: row.endDate,
    customerName: customerLabel(row.customerName ?? null, row.customerCompany ?? null),
    originalLicensePlate: row.originalLicensePlate ?? null,
  }));

  const portalRequestRows: TodayPortalRequestRow[] = requestRows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    customerName: customerLabel(row.customerName ?? null, row.customerCompany ?? null),
    // The review dialog fetches the full request; the list only needs enough
    // to recognise it.
    message: (row.message ?? "").slice(0, TODAY_MESSAGE_PREVIEW_CHARS),
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    reservationLabel: row.reservationLabel ?? null,
  }));

  return {
    date,
    pickups,
    returns,
    maintenance,
    transports,
    spareAssignments,
    portalRequests: portalRequestRows,
    counts: {
      pickups: pickups.length,
      returns: returns.length,
      maintenance: maintenance.length,
      transports: transports.length,
      spareAssignments: spareAssignments.length,
      portalRequests: portalRequestRows.length,
      total:
        pickups.length +
        returns.length +
        maintenance.length +
        transports.length +
        spareAssignments.length +
        portalRequestRows.length,
    },
  };
}
