import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "../db";
import { customNotifications, customers, drivers, fines, portalCustomerSettings, portalRequests, portalUsers, reservations, vehicles } from "../../shared/schema";
import { portalStorage } from "./portal-storage";
import { requestsStorage } from "./portal-requests-storage";
import type { PortalDashboard } from "../../shared/portal-types";

/** Days ahead the "upcoming pickups/returns" panel looks. */
export const DASHBOARD_WINDOW_DAYS = 14;
const ATTENTION_LIMIT = 8;
const NOTIFICATION_LIMIT = 15;

export type { PortalDashboard };

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Everything the staff Klantenportaal dashboard shows, in one round trip:
 * counters, items that need a reply or a link, the latest portal notifications
 * and the pickups/returns of portal customers in the next two weeks.
 */
export async function getPortalDashboard(): Promise<PortalDashboard> {
  const today = isoDay(0);
  const horizon = isoDay(DASHBOARD_WINDOW_DAYS);

  const [overview, requests, unlinked, notes, upcomingRows, [vehiclesOnline], [inProgress]] = await Promise.all([
    portalStorage.listCustomersOverview(),
    requestsStorage.listRequests({}),
    db.select().from(fines).where(eq(fines.status, "new")).orderBy(desc(fines.offenceAt)).limit(ATTENTION_LIMIT),
    db.select().from(customNotifications).where(like(customNotifications.type, "portal_%"))
      .orderBy(desc(customNotifications.createdAt), desc(customNotifications.id)).limit(NOTIFICATION_LIMIT),
    db.select({
      r: reservations,
      customerName: sql<string>`coalesce(${customers.companyName}, ${customers.name})`,
      driverName: drivers.displayName,
      vehicle: { id: vehicles.id, brand: vehicles.brand, model: vehicles.model, licensePlate: vehicles.licensePlate },
      viaPortal: sql<boolean>`exists (select 1 from ${portalRequests} pr where pr.reservation_id = ${reservations.id})`,
    }).from(reservations)
      .innerJoin(customers, eq(reservations.customerId, customers.id))
      .leftJoin(drivers, eq(reservations.driverId, drivers.id))
      .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
      .where(and(
        inArray(reservations.status, ["booked", "picked_up"]),
        sql`(${reservations.startDate} between ${today} and ${horizon} or ${reservations.endDate} between ${today} and ${horizon})`,
        sql`(exists (select 1 from ${portalUsers} pu where pu.customer_id = ${customers.id})
             or exists (select 1 from ${portalCustomerSettings} ps where ps.customer_id = ${customers.id}))`,
      )),
    db.select({ n: sql<number>`count(*)::int` }).from(vehicles).where(eq(vehicles.offeredOnline, true)),
    db.select({ n: sql<number>`count(*)::int` }).from(portalRequests).where(eq(portalRequests.status, "in_progress")),
  ]);

  const openRequests = requests.filter((r) => r.status === "new" || r.status === "in_progress");
  const upcoming: PortalDashboard["upcoming"] = [];
  for (const row of upcomingRows) {
    const base = {
      reservationId: row.r.id, status: row.r.status, customerId: row.r.customerId!, customerName: row.customerName,
      driverName: row.driverName ?? null, vehicle: row.vehicle?.id ? row.vehicle : null, viaPortal: Boolean(row.viaPortal),
    };
    if (row.r.status === "booked" && row.r.startDate >= today && row.r.startDate <= horizon) upcoming.push({ ...base, kind: "pickup", date: row.r.startDate });
    if (row.r.endDate && row.r.endDate >= today && row.r.endDate <= horizon) upcoming.push({ ...base, kind: "return", date: row.r.endDate });
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date) || a.reservationId - b.reservationId);

  return {
    counts: {
      newRequests: openRequests.filter((r) => r.status === "new").length,
      inProgressRequests: inProgress?.n ?? 0,
      unlinkedFines: unlinked.length,
      onlineNow: overview.reduce((n, c) => n + c.onlineNow, 0),
      pendingInvites: overview.reduce((n, c) => n + c.pendingInvites, 0),
      expiredInvites: overview.reduce((n, c) => n + c.expiredInvites, 0),
      vehiclesOnline: vehiclesOnline?.n ?? 0,
      unreadNotifications: notes.filter((n) => !n.isRead).length,
    },
    attention: {
      requests: openRequests.slice(0, ATTENTION_LIMIT).map((r) => ({
        id: r.id, type: r.type, status: r.status, customerId: r.customerId, customerName: r.customerName,
        reservationLabel: r.reservationLabel, createdAt: r.createdAt.toISOString(),
      })),
      fines: unlinked.map((f) => ({ id: f.id, licensePlate: f.licensePlate, description: f.description, totalAmount: f.totalAmount, offenceAt: f.offenceAt.toISOString() })),
    },
    notifications: notes.map((n) => ({
      id: n.id, type: n.type, title: n.title, description: n.description, link: n.link ?? "", isRead: n.isRead, createdAt: n.createdAt.toISOString(),
    })),
    upcoming,
  };
}
