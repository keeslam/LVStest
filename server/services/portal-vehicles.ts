import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles } from "../../shared/schema";
import { portalStorage, type PortalScope } from "./portal-storage";
import { requestsStorage } from "./portal-requests-storage";
import { getServiceDueVehicles } from "../utils/service-due-scanner";
import { canCustomerChangeMaintenance } from "./portal-maintenance-events";
import type { PortalMyVehicleDto, PortalVehicleMaintenanceDto } from "../../shared/portal-types";

const isoDay = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

/** The vehicles a customer has on the road right now, with maintenance and replacement state. */
export async function listMyVehicles(customerId: number, scope: PortalScope): Promise<PortalMyVehicleDto[]> {
  const rentals = (await portalStorage.listReservationsForCustomer(customerId, scope)).filter((r) => r.status === "picked_up" && r.type === "standard" && r.vehicle);
  if (rentals.length === 0) return [];
  const vehicleIds = rentals.map((r) => r.vehicleId!);
  const rentalIds = rentals.map((r) => r.id);
  const recentOut = isoDay(-7);
  const [blocks, replacements, requests, due] = await Promise.all([
    db.select().from(reservations).where(and(
      eq(reservations.type, "maintenance_block"), inArray(reservations.vehicleId, vehicleIds), isNull(reservations.deletedAt),
      or(sql`${reservations.maintenanceStatus} is distinct from 'out'`, sql`coalesce(${reservations.endDate}, ${reservations.startDate}) >= ${recentOut}`),
    )).orderBy(reservations.startDate),
    db.select({ r: reservations, v: vehicles }).from(reservations).leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id)).where(and(
      eq(reservations.type, "replacement"), inArray(reservations.replacementForReservationId, rentalIds), isNull(reservations.deletedAt),
      eq(reservations.placeholderSpare, false), sql`${reservations.vehicleId} is not null`,
    )).orderBy(desc(reservations.startDate)),
    requestsStorage.listRequestsForCustomer(customerId, {}),
    getServiceDueVehicles(),
  ]);
  const open = requests.filter((q) => q.status === "new" || q.status === "in_progress");
  const mileageReports = requests.filter((q) => q.type === "mileage" && q.reservationId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return rentals.map((r) => {
    // Blocks that start before the rental ends count; the rental start is not a bound
    // because the car is already with the customer.
    const overlapping = blocks.filter((b) => b.vehicleId === r.vehicleId && b.startDate <= (r.endDate ?? "9999-12-31"));
    const upcoming = overlapping.filter((b) => b.maintenanceStatus !== "out");
    const recentlyOut = overlapping.filter((b) => b.maintenanceStatus === "out");
    // Blocks are ordered by startDate ascending: the first non-"out" block is the earliest
    // upcoming one; when there is none, fall back to the most recent (last) "out" block.
    const block = upcoming[0] ?? recentlyOut[recentlyOut.length - 1] ?? null;
    let maintenance: PortalVehicleMaintenanceDto | null = null;
    if (block) {
      const rep = replacements.find((x) => x.r.replacementForReservationId === r.id && x.v);
      maintenance = {
        blockId: block.id, startDate: block.startDate, endDate: block.endDate, status: (block.maintenanceStatus as "scheduled" | "in" | "out") ?? "scheduled",
        category: (block.maintenanceCategory as "scheduled_maintenance" | "repair" | null) ?? null,
        canRequestChange: canCustomerChangeMaintenance(block),
        openChangeRequestId: open.find((q) => q.type === "maintenance_change" && q.reservationId === block.id)?.id ?? null,
        replacement: rep?.v ? { licensePlate: rep.v.licensePlate, brand: rep.v.brand, model: rep.v.model, status: rep.r.spareVehicleStatus } : null,
      };
    }
    const lastMileage = mileageReports.find((q) => q.reservationId === r.id);
    const km = lastMileage ? Number((lastMileage.payload as Record<string, unknown>).mileage) : NaN;
    const d = due.find((v) => v.id === r.vehicleId);
    return {
      reservationId: r.id,
      vehicle: { id: r.vehicle!.id, licensePlate: r.vehicle!.licensePlate, brand: r.vehicle!.brand, model: r.vehicle!.model, apkDate: r.vehicle!.apkDate ?? null, currentMileage: r.vehicle!.currentMileage ?? null },
      driver: r.driver ? { id: r.driver.id, displayName: r.driver.displayName } : null,
      startDate: r.startDate, endDate: r.endDate,
      lastReportedMileage: lastMileage && Number.isFinite(km) ? { value: km, at: lastMileage.createdAt.toISOString() } : r.pickupMileage ? { value: r.pickupMileage, at: r.actualPickupDate ?? r.startDate } : null,
      serviceDue: d?.serviceDue.isServiceDue ? "due" : d?.serviceDue.isServiceDueSoon ? "soon" : null,
      maintenance,
      openMaintenanceRequestId: open.find((q) => q.type === "maintenance" && q.reservationId === r.id)?.id ?? null,
    };
  });
}
