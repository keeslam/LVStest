import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db";
import { customers, documents, drivers, fines, reservations, vehicles } from "../../shared/schema";
import { CUSTOMER_UPLOAD_DOCUMENT_TYPE, type CustomerUploadRow, type FineAwaitingDriverRow } from "../../shared/portal-types";
import { CUSTOMER_VISIBLE_FINE_STATUSES } from "../../shared/fines";
import { customerDisplayName } from "./customer-display-name";
import { driversAt } from "./fine-attribution";

/**
 * Lists for the staff Klantenportaal dashboard (Kees, 2026-10-19): documents customers uploaded, and
 * fines that wait for the customer to say who drove.
 */

/** Uploads by customers, newest first; `onlyUnseen` for the tile's count. */
export async function listCustomerUploads(opts: { onlyUnseen?: boolean; limit?: number } = {}): Promise<CustomerUploadRow[]> {
  const rows = await db.select({
    d: documents, customerId: reservations.customerId, customerName: customerDisplayName(), licensePlate: vehicles.licensePlate,
  }).from(documents)
    .innerJoin(reservations, eq(documents.reservationId, reservations.id))
    .leftJoin(customers, eq(reservations.customerId, customers.id))
    .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
    .where(and(eq(documents.documentType, CUSTOMER_UPLOAD_DOCUMENT_TYPE), opts.onlyUnseen ? isNull(documents.portalSeenAt) : undefined))
    .orderBy(desc(documents.uploadDate))
    .limit(opts.limit ?? 200);
  return rows.map((r) => ({
    id: r.d.id, reservationId: r.d.reservationId!, customerId: r.customerId ?? null, customerName: r.customerName ?? "",
    licensePlate: r.licensePlate ?? null, description: r.d.notes ?? "", fileName: r.d.fileName, contentType: r.d.contentType,
    uploadedAt: new Date(r.d.uploadDate).toISOString(), uploadedBy: (r.d.createdBy ?? "").replace(/^portaal:/, ""),
    seenAt: r.d.portalSeenAt ? new Date(r.d.portalSeenAt).toISOString() : null, seenBy: r.d.portalSeenBy ?? null,
  }));
}

/** "Gezien": the upload leaves the tile's count. Only customer uploads can be marked. */
export async function markUploadSeen(id: number, username: string): Promise<boolean> {
  const [doc] = await db.select({ id: documents.id }).from(documents)
    .where(and(eq(documents.id, id), eq(documents.documentType, CUSTOMER_UPLOAD_DOCUMENT_TYPE)));
  if (!doc) return false;
  await db.update(documents).set({ portalSeenAt: new Date(), portalSeenBy: username })
    .where(and(eq(documents.id, id), isNull(documents.portalSeenAt)));
  return true;
}

/**
 * Fines linked to a customer and reservation but without a driver because several drivers shared the
 * car at the offence moment: the customer still has to say who drove (or the office does).
 */
export async function listFinesAwaitingDriver(limit = 200): Promise<FineAwaitingDriverRow[]> {
  const rows = await db.select({ f: fines, customerName: customerDisplayName() }).from(fines)
    .leftJoin(customers, eq(fines.customerId, customers.id))
    .where(and(isNull(fines.driverId), isNotNull(fines.reservationId), isNotNull(fines.customerId), inArray(fines.status, CUSTOMER_VISIBLE_FINE_STATUSES)))
    .orderBy(desc(fines.offenceAt))
    .limit(500);
  const out: FineAwaitingDriverRow[] = [];
  for (const r of rows) {
    const ids = await driversAt(r.f.reservationId!, r.f.offenceAt);
    if (ids.length < 2) continue;
    const names = await db.select({ id: drivers.id, displayName: drivers.displayName }).from(drivers).where(inArray(drivers.id, ids));
    out.push({
      id: r.f.id, reservationId: r.f.reservationId!, customerId: r.f.customerId!, customerName: r.customerName ?? "",
      licensePlate: r.f.licensePlate, description: r.f.description, offenceAt: r.f.offenceAt.toISOString(), totalAmount: r.f.totalAmount,
      drivers: names.map((d) => d.displayName),
    });
    if (out.length >= limit) break;
  }
  return out;
}
