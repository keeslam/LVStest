import { db } from "../db";
import { portalNotifications, reservations, vehicles, customers, portalUsers, type PortalNotification } from "../../shared/schema";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getServiceDueVehicles } from "../utils/service-due-scanner";

/** How far ahead the customer hears about an APK that is about to expire. */
export const APK_WARNING_DAYS = 30;

export interface CustomerNotificationInput {
  customerId: number;
  /** Only this account; omit for every account of the customer. */
  portalUserId?: number | null;
  type: string;
  title: string;
  description: string;
  /** Portal-relative link, e.g. /aanvragen/12 or /reserveringen/5. */
  link?: string;
  /** Same tag + customer within `dedupeDays` days: do not create again (used by the scanners). */
  dedupeTag?: string;
  dedupeDays?: number;
}

/**
 * Notifications the customer sees under the bell in the portal. Written by
 * staff actions (reply, approval, fine linked) and by the daily vehicle scan
 * (APK, service due). Read state is per row; a row without portalUserId is
 * for everyone at the customer.
 */
export const customerNotifications = {
  async notify(input: CustomerNotificationInput): Promise<PortalNotification | null> {
    if (input.dedupeTag) {
      const since = new Date(Date.now() - (input.dedupeDays ?? 30) * 86_400_000);
      const [dup] = await db.select({ id: portalNotifications.id }).from(portalNotifications)
        .where(and(eq(portalNotifications.customerId, input.customerId), eq(portalNotifications.dedupeTag, input.dedupeTag), sql`${portalNotifications.createdAt} > ${since}`))
        .limit(1);
      if (dup) return null;
    }
    const [row] = await db.insert(portalNotifications).values({
      customerId: input.customerId, portalUserId: input.portalUserId ?? null, type: input.type,
      title: input.title, description: input.description, link: input.link ?? null, dedupeTag: input.dedupeTag ?? null,
    }).returning();
    return row;
  },

  /**
   * besluiten **B-13** (BUG-139) — a notification can stop being true. When a
   * rental moves to another car the "Onderhoud gepland" for the block it left
   * behind is no longer about that customer, so it goes, and a
   * `maintenance_unlinked` takes its place. Matched on the dedupe tag, which is
   * the only stable key these rows have (`maint:<blockId>:…`).
   */
  async removeByDedupePrefix(customerId: number, prefix: string): Promise<number> {
    const removed = await db.delete(portalNotifications)
      .where(and(
        eq(portalNotifications.customerId, customerId),
        sql`${portalNotifications.dedupeTag} LIKE ${`${prefix}%`}`,
      ))
      .returning({ id: portalNotifications.id });
    return removed.length;
  },

  async listForUser(customerId: number, portalUserId: number, limit = 100): Promise<PortalNotification[]> {
    return db.select().from(portalNotifications)
      .where(and(eq(portalNotifications.customerId, customerId), or(isNull(portalNotifications.portalUserId), eq(portalNotifications.portalUserId, portalUserId))))
      .orderBy(desc(portalNotifications.createdAt), desc(portalNotifications.id))
      .limit(limit);
  },

  async countUnread(customerId: number, portalUserId: number): Promise<number> {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(portalNotifications)
      .where(and(eq(portalNotifications.customerId, customerId), eq(portalNotifications.isRead, false),
        or(isNull(portalNotifications.portalUserId), eq(portalNotifications.portalUserId, portalUserId))));
    return row?.n ?? 0;
  },

  async markRead(customerId: number, ids: number[] | "all", portalUserId: number): Promise<void> {
    const scope = and(eq(portalNotifications.customerId, customerId), or(isNull(portalNotifications.portalUserId), eq(portalNotifications.portalUserId, portalUserId)));
    await db.update(portalNotifications).set({ isRead: true })
      .where(ids === "all" ? scope : and(scope, inArray(portalNotifications.id, ids)));
  },
};

/** Customers that have a portal account: only they get vehicle alerts. */
async function portalCustomerIds(): Promise<Set<number>> {
  const rows = await db.selectDistinct({ id: portalUsers.customerId }).from(portalUsers).where(eq(portalUsers.active, true));
  return new Set(rows.map((r) => r.id));
}

const isoDay = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

/**
 * Daily: for every vehicle that a portal customer has on the road right now,
 * warn about an APK that expires within APK_WARNING_DAYS (or has expired) and
 * about a service that is due. One notification per vehicle per subject per month.
 */
export async function scanVehicleAlertsForPortal(): Promise<{ apk: number; service: number }> {
  const customersWithPortal = await portalCustomerIds();
  if (customersWithPortal.size === 0) return { apk: 0, service: 0 };
  const onRoad = await db.select({
    reservationId: reservations.id, customerId: reservations.customerId, vehicleId: vehicles.id,
    plate: vehicles.licensePlate, brand: vehicles.brand, model: vehicles.model, apkDate: vehicles.apkDate,
  }).from(reservations).innerJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
    .where(and(eq(reservations.status, "picked_up"), isNull(reservations.deletedAt)));

  const today = isoDay(0), horizon = isoDay(APK_WARNING_DAYS);
  let apk = 0, service = 0;
  const dueVehicles = new Map((await getServiceDueVehicles()).map((v) => [v.id, v]));

  for (const r of onRoad) {
    if (!r.customerId || !customersWithPortal.has(r.customerId)) continue;
    const car = `${r.brand} ${r.model} (${r.plate})`;
    if (r.apkDate && r.apkDate <= horizon) {
      const expired = r.apkDate < today;
      const created = await customerNotifications.notify({
        customerId: r.customerId, type: expired ? "apk_expired" : "apk_due",
        title: expired ? `APK verlopen: ${r.plate}` : `APK verloopt binnenkort: ${r.plate}`,
        description: expired
          ? `De APK van ${car} is verlopen op ${r.apkDate}. Neem contact op met Lam Groep om een keuring in te plannen.`
          : `De APK van ${car} verloopt op ${r.apkDate}. Lam Groep plant de keuring; houd rekening met een moment zonder de auto.`,
        link: `/reserveringen/${r.reservationId}`, dedupeTag: `apk:${r.vehicleId}:${r.apkDate}`, dedupeDays: 30,
      });
      if (created) apk += 1;
    }
    const due = dueVehicles.get(r.vehicleId);
    if (due && (due.serviceDue.isServiceDue || due.serviceDue.isServiceDueSoon)) {
      const created = await customerNotifications.notify({
        customerId: r.customerId, type: due.serviceDue.isServiceDue ? "service_due" : "service_due_soon",
        title: due.serviceDue.isServiceDue ? `Onderhoud nodig: ${r.plate}` : `Onderhoud komt eraan: ${r.plate}`,
        description: `${car} is ${due.serviceDue.isServiceDue ? "toe aan" : "bijna toe aan"} een onderhoudsbeurt. Lam Groep neemt contact op om dit in te plannen; u kunt ook zelf een onderhoudsmelding doen via een aanvraag.`,
        link: `/reserveringen/${r.reservationId}`, dedupeTag: `service:${r.vehicleId}:${due.serviceDue.isServiceDue ? "due" : "soon"}`, dedupeDays: 30,
      });
      if (created) service += 1;
    }
  }
  return { apk, service };
}

export async function customerNameOf(customerId: number): Promise<string> {
  const [c] = await db.select({ name: sql<string>`coalesce(nullif(${customers.companyName}, ''), ${customers.name})` }).from(customers).where(eq(customers.id, customerId));
  return c?.name ?? String(customerId);
}
