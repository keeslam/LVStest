import { db } from "../db";
import {
  portalRequests, portalRequestAttachments, customers, portalUsers, reservations, vehicles,
  type PortalRequest, type InsertPortalRequest, type PortalRequestAttachment,
} from "../../shared/schema";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { PortalRequestDto } from "../../shared/portal-requests";

export type RequestRow = PortalRequest & {
  customerName: string; submittedBy: string | null; submitterEmail: string | null;
  attachments: PortalRequestAttachment[]; reservationLabel: string | null;
};

async function select(where: SQL | undefined, limit = 500): Promise<RequestRow[]> {
  const rows = await db.select({
    r: portalRequests,
    customerName: sql<string>`coalesce(${customers.companyName}, ${customers.name})`,
    submittedBy: portalUsers.fullName,
    submitterEmail: portalUsers.email,
    reservationLabel: sql<string | null>`case when ${reservations.id} is null then null else concat(${vehicles.licensePlate}, ' ', ${reservations.startDate}, ' - ', coalesce(${reservations.endDate}, '...')) end`,
  }).from(portalRequests)
    .innerJoin(customers, eq(portalRequests.customerId, customers.id))
    .leftJoin(portalUsers, eq(portalRequests.portalUserId, portalUsers.id))
    .leftJoin(reservations, eq(portalRequests.reservationId, reservations.id))
    .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
    .where(where)
    .orderBy(desc(portalRequests.createdAt), desc(portalRequests.id))
    .limit(limit);
  if (rows.length === 0) return [];
  const atts = await db.select().from(portalRequestAttachments).where(inArray(portalRequestAttachments.requestId, rows.map((x) => x.r.id)));
  return rows.map((x) => ({
    ...x.r, customerName: x.customerName, submittedBy: x.submittedBy, submitterEmail: x.submitterEmail,
    reservationLabel: x.reservationLabel, attachments: atts.filter((a) => a.requestId === x.r.id),
  }));
}

export function toRequestDto(row: RequestRow, staff: boolean): PortalRequestDto {
  const dto: PortalRequestDto = {
    id: row.id, type: row.type as PortalRequestDto["type"], status: row.status as PortalRequestDto["status"],
    reservationId: row.reservationId, fineId: row.fineId, payload: row.payload, message: row.message,
    staffReply: row.staffReply, repliedAt: row.repliedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
    submittedBy: row.submittedBy, reservationLabel: row.reservationLabel,
    attachments: row.attachments.map((a) => ({ id: a.id, fileName: a.fileName, contentType: a.contentType, fileSize: a.fileSize })),
  };
  if (staff) { dto.customerId = row.customerId; dto.customerName = row.customerName; }
  return dto;
}

/** All reads/writes for portal requests. Customer methods always take the customerId. */
export const requestsStorage = {
  async createRequest(data: InsertPortalRequest): Promise<PortalRequest> {
    const [row] = await db.insert(portalRequests).values(data).returning();
    return row;
  },
  async addAttachment(data: typeof portalRequestAttachments.$inferInsert): Promise<PortalRequestAttachment> {
    const [row] = await db.insert(portalRequestAttachments).values(data).returning();
    return row;
  },
  async getAttachment(id: number): Promise<PortalRequestAttachment | undefined> {
    const [row] = await db.select().from(portalRequestAttachments).where(eq(portalRequestAttachments.id, id));
    return row;
  },
  async getRequest(id: number): Promise<RequestRow | undefined> {
    return (await select(eq(portalRequests.id, id)))[0];
  },
  async listRequests(f: { status?: string; type?: string; customerId?: number }): Promise<RequestRow[]> {
    return select(and(
      f.status ? eq(portalRequests.status, f.status) : undefined,
      f.type ? eq(portalRequests.type, f.type) : undefined,
      f.customerId ? eq(portalRequests.customerId, f.customerId) : undefined,
    ));
  },
  async listRequestsForCustomer(customerId: number, scope: { portalUserId?: number }): Promise<RequestRow[]> {
    return select(and(eq(portalRequests.customerId, customerId), scope.portalUserId ? eq(portalRequests.portalUserId, scope.portalUserId) : undefined));
  },
  async getRequestForCustomer(id: number, customerId: number, scope: { portalUserId?: number }): Promise<RequestRow | undefined> {
    return (await select(and(
      eq(portalRequests.id, id), eq(portalRequests.customerId, customerId),
      scope.portalUserId ? eq(portalRequests.portalUserId, scope.portalUserId) : undefined,
    )))[0];
  },
  async updateRequest(id: number, patch: Partial<PortalRequest>): Promise<PortalRequest | undefined> {
    const [row] = await db.update(portalRequests).set({ ...patch, updatedAt: new Date() }).where(eq(portalRequests.id, id)).returning();
    return row;
  },
  /** Removes the request and its attachment rows; returns the attachments so files can be cleaned up. */
  async deleteRequest(id: number): Promise<PortalRequestAttachment[]> {
    const atts = await db.select().from(portalRequestAttachments).where(eq(portalRequestAttachments.requestId, id));
    await db.delete(portalRequestAttachments).where(eq(portalRequestAttachments.requestId, id));
    await db.delete(portalRequests).where(eq(portalRequests.id, id));
    return atts;
  },
  async countNewRequests(): Promise<number> {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(portalRequests).where(eq(portalRequests.status, "new"));
    return r?.n ?? 0;
  },
};
