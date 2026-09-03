import { db } from "../db";
import {
  portalUsers, portalCustomerSettings, portalActivityLog, reservationDriverAssignments,
  reservations, vehicles, drivers, documents, customers,
  type PortalUser, type InsertPortalUser, type PortalCustomerSettings,
  type InsertPortalActivityLogEntry, type PortalActivityLogEntry,
  type Driver, type Reservation, type Document, type Vehicle,
} from "../../shared/schema";
import { and, desc, eq, exists, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { isContractDocument, isDamageCheckDocument } from "../../shared/document-types";

/** Set for driver-role users: restricts to reservations they were assigned to. */
export interface PortalScope {
  driverId?: number | null;
}

export type PortalReservation = Reservation & { vehicle?: Vehicle; driver?: Driver };
export type PortalDocument = Document & { kind: "contract" | "damage_check" };

type PortalUserUpdate = Partial<Pick<PortalUser,
  "fullName" | "role" | "driverId" | "active" | "passwordHash" | "inviteTokenHash" | "inviteExpiresAt" | "lastLoginAt" | "lastSeenAt" | "updatedBy">>;

/** One row per customer that has a portal (settings row or at least one account). */
export interface PortalCustomerOverviewRow {
  customerId: number;
  customerName: string;
  portalEnabled: boolean;
  accountsTotal: number;
  accountsActive: number;
  accountsBlocked: number;
  onlineNow: number;
  pendingInvites: number;
  expiredInvites: number;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  lastActivityAction: string | null;
  lastActivityUser: string | null;
}

export const ONLINE_WINDOW_MINUTES = 10;

const CUSTOMER_VISIBLE_TYPES = ["standard", "replacement"];

function driverScopeCondition(scope: PortalScope): SQL | undefined {
  if (!scope.driverId) return undefined;
  return or(
    eq(reservations.driverId, scope.driverId),
    exists(
      db.select({ one: sql`1` }).from(reservationDriverAssignments)
        .where(and(
          eq(reservationDriverAssignments.reservationId, reservations.id),
          eq(reservationDriverAssignments.driverId, scope.driverId),
        )),
    ),
  );
}

function reservationBase(customerId: number, scope: PortalScope): SQL | undefined {
  return and(
    eq(reservations.customerId, customerId),
    isNull(reservations.deletedAt),
    inArray(reservations.type, CUSTOMER_VISIBLE_TYPES),
    driverScopeCondition(scope),
  );
}

async function selectReservations(where: SQL | undefined): Promise<PortalReservation[]> {
  const rows = await db
    .select({ reservation: reservations, vehicle: vehicles, driver: drivers })
    .from(reservations)
    .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
    .leftJoin(drivers, eq(reservations.driverId, drivers.id))
    .where(where)
    .orderBy(desc(reservations.startDate), desc(reservations.id));
  return rows.map((r) => ({ ...r.reservation, vehicle: r.vehicle ?? undefined, driver: r.driver ?? undefined }));
}

function classify(doc: Document): PortalDocument | null {
  if (isContractDocument(doc.documentType)) return { ...doc, kind: "contract" };
  if (isDamageCheckDocument(doc.documentType)) return { ...doc, kind: "damage_check" };
  return null;
}

/**
 * Every portal read/write in one place. Reservation, document and driver
 * methods always take the customerId so an ownership check cannot be
 * forgotten; a driver-role scope narrows further.
 */
export const portalStorage = {
  // ---- users ----------------------------------------------------------------
  async getPortalUser(id: number): Promise<PortalUser | undefined> {
    const [row] = await db.select().from(portalUsers).where(eq(portalUsers.id, id));
    return row;
  },
  async getPortalUserByEmail(email: string): Promise<PortalUser | undefined> {
    const [row] = await db.select().from(portalUsers).where(sql`lower(${portalUsers.email}) = ${email.trim().toLowerCase()}`);
    return row;
  },
  async getPortalUserByInviteTokenHash(hash: string): Promise<PortalUser | undefined> {
    const [row] = await db.select().from(portalUsers).where(eq(portalUsers.inviteTokenHash, hash));
    return row;
  },
  async listPortalUsersByCustomer(customerId: number): Promise<PortalUser[]> {
    return db.select().from(portalUsers).where(eq(portalUsers.customerId, customerId)).orderBy(portalUsers.fullName);
  },
  async listAllPortalUsers(): Promise<Array<PortalUser & { customerName: string }>> {
    const rows = await db.select({ user: portalUsers, customerName: customers.name })
      .from(portalUsers).innerJoin(customers, eq(portalUsers.customerId, customers.id))
      .orderBy(customers.name, portalUsers.fullName);
    return rows.map((r) => ({ ...r.user, customerName: r.customerName }));
  },
  async createPortalUser(input: InsertPortalUser, createdBy: string): Promise<PortalUser> {
    await portalStorage.getOrCreateCustomerSettings(input.customerId);
    const [row] = await db.insert(portalUsers).values({ ...input, createdBy, updatedBy: createdBy }).returning();
    return row;
  },
  async updatePortalUser(id: number, data: PortalUserUpdate): Promise<PortalUser | undefined> {
    const [row] = await db.update(portalUsers).set({ ...data, updatedAt: new Date() }).where(eq(portalUsers.id, id)).returning();
    return row;
  },
  async deletePortalUser(id: number): Promise<boolean> {
    const rows = await db.delete(portalUsers).where(eq(portalUsers.id, id)).returning({ id: portalUsers.id });
    return rows.length > 0;
  },

  // ---- customer settings ----------------------------------------------------
  async getOrCreateCustomerSettings(customerId: number): Promise<PortalCustomerSettings> {
    const [existing] = await db.select().from(portalCustomerSettings).where(eq(portalCustomerSettings.customerId, customerId));
    if (existing) return existing;
    const [created] = await db.insert(portalCustomerSettings).values({ customerId }).onConflictDoNothing().returning();
    if (created) return created;
    const [again] = await db.select().from(portalCustomerSettings).where(eq(portalCustomerSettings.customerId, customerId));
    return again;
  },
  async updateCustomerSettings(
    customerId: number,
    data: Partial<Omit<PortalCustomerSettings, "id" | "customerId" | "createdAt" | "updatedAt" | "updatedBy">>,
    updatedBy: string,
  ): Promise<PortalCustomerSettings> {
    await portalStorage.getOrCreateCustomerSettings(customerId);
    const [row] = await db.update(portalCustomerSettings).set({ ...data, updatedBy, updatedAt: new Date() })
      .where(eq(portalCustomerSettings.customerId, customerId)).returning();
    return row;
  },

  // ---- staff overview per customer ------------------------------------------
  // Timestamps are stored as UTC wall-clock (drizzle timestamp without tz), so
  // compare against now() expressed in UTC as well.
  async listCustomersOverview(): Promise<PortalCustomerOverviewRow[]> {
    const result = await db.execute(sql`
      WITH acc AS (
        SELECT customer_id,
               count(*)::int                                                         AS accounts_total,
               count(*) FILTER (WHERE active AND password_hash IS NOT NULL)::int      AS accounts_active,
               count(*) FILTER (WHERE NOT active)::int                                AS accounts_blocked,
               count(*) FILTER (WHERE active AND last_seen_at > timezone('utc', now()) - make_interval(mins => ${ONLINE_WINDOW_MINUTES}))::int AS online_now,
               count(*) FILTER (WHERE invite_token_hash IS NOT NULL AND invite_expires_at > timezone('utc', now()))::int  AS pending_invites,
               count(*) FILTER (WHERE invite_token_hash IS NOT NULL AND invite_expires_at <= timezone('utc', now()))::int AS expired_invites,
               max(last_login_at)                                                     AS last_login_at
        FROM portal_users GROUP BY customer_id
      ),
      act AS (
        SELECT DISTINCT ON (l.customer_id) l.customer_id, l.action, l.created_at, u.full_name
        FROM portal_activity_log l LEFT JOIN portal_users u ON u.id = l.portal_user_id
        ORDER BY l.customer_id, l.created_at DESC, l.id DESC
      )
      SELECT c.id AS customer_id, COALESCE(c.company_name, c.name) AS customer_name,
             COALESCE(s.portal_enabled, true) AS portal_enabled,
             COALESCE(acc.accounts_total, 0) AS accounts_total, COALESCE(acc.accounts_active, 0) AS accounts_active,
             COALESCE(acc.accounts_blocked, 0) AS accounts_blocked, COALESCE(acc.online_now, 0) AS online_now,
             COALESCE(acc.pending_invites, 0) AS pending_invites, COALESCE(acc.expired_invites, 0) AS expired_invites,
             acc.last_login_at, act.created_at AS last_activity_at, act.action AS last_activity_action, act.full_name AS last_activity_user
      FROM customers c
      LEFT JOIN portal_customer_settings s ON s.customer_id = c.id
      LEFT JOIN acc ON acc.customer_id = c.id
      LEFT JOIN act ON act.customer_id = c.id
      WHERE s.id IS NOT NULL OR acc.customer_id IS NOT NULL
      ORDER BY acc.online_now DESC NULLS LAST, act.created_at DESC NULLS LAST, customer_name
    `);
    return (result.rows as any[]).map((r) => ({
      customerId: r.customer_id, customerName: r.customer_name, portalEnabled: r.portal_enabled,
      accountsTotal: r.accounts_total, accountsActive: r.accounts_active, accountsBlocked: r.accounts_blocked,
      onlineNow: r.online_now, pendingInvites: r.pending_invites, expiredInvites: r.expired_invites,
      lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
      lastActivityAt: r.last_activity_at ? new Date(r.last_activity_at).toISOString() : null,
      lastActivityAction: r.last_activity_action ?? null, lastActivityUser: r.last_activity_user ?? null,
    }));
  },

  // ---- activity -------------------------------------------------------------
  async logActivity(entry: InsertPortalActivityLogEntry): Promise<void> {
    await db.insert(portalActivityLog).values(entry);
  },
  async listActivity(opts: { customerId?: number; limit?: number }): Promise<Array<PortalActivityLogEntry & { userName: string | null; customerName: string | null }>> {
    const rows = await db.select({ entry: portalActivityLog, userName: portalUsers.fullName, customerName: customers.name })
      .from(portalActivityLog)
      .leftJoin(portalUsers, eq(portalActivityLog.portalUserId, portalUsers.id))
      .leftJoin(customers, eq(portalActivityLog.customerId, customers.id))
      .where(opts.customerId ? eq(portalActivityLog.customerId, opts.customerId) : undefined)
      .orderBy(desc(portalActivityLog.createdAt), desc(portalActivityLog.id))
      .limit(opts.limit ?? 50);
    return rows.map((r) => ({ ...r.entry, userName: r.userName, customerName: r.customerName }));
  },

  // ---- reservations (always scoped) -----------------------------------------
  async listReservationsForCustomer(customerId: number, scope: PortalScope): Promise<PortalReservation[]> {
    return selectReservations(reservationBase(customerId, scope));
  },
  async getReservationForCustomer(id: number, customerId: number, scope: PortalScope): Promise<PortalReservation | undefined> {
    const [row] = await selectReservations(and(eq(reservations.id, id), reservationBase(customerId, scope)));
    return row;
  },

  // ---- documents (always scoped) --------------------------------------------
  async listDocumentsForCustomer(customerId: number, scope: PortalScope): Promise<PortalDocument[]> {
    const own = await selectReservations(reservationBase(customerId, scope));
    if (own.length === 0) return [];
    const rows = await db.select().from(documents)
      .where(inArray(documents.reservationId, own.map((r) => r.id)))
      .orderBy(desc(documents.uploadDate));
    return rows.map(classify).filter((d): d is PortalDocument => d !== null);
  },
  async getDocumentForCustomer(id: number, customerId: number, scope: PortalScope): Promise<PortalDocument | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc || doc.reservationId == null) return undefined;
    const reservation = await portalStorage.getReservationForCustomer(doc.reservationId, customerId, scope);
    if (!reservation) return undefined;
    return classify(doc) ?? undefined;
  },

  // ---- drivers (always scoped) ----------------------------------------------
  async listDriversForCustomer(customerId: number): Promise<Driver[]> {
    return db.select().from(drivers).where(eq(drivers.customerId, customerId)).orderBy(drivers.displayName);
  },
  async getDriverForCustomer(id: number, customerId: number): Promise<Driver | undefined> {
    const [row] = await db.select().from(drivers).where(and(eq(drivers.id, id), eq(drivers.customerId, customerId)));
    return row;
  },
};
