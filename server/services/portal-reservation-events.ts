/**
 * besluiten **B-06** (BUG-134) — "melden bij alle vier de gebeurtenissen:
 * 1. datums of voertuig gewijzigd; 2. reservering geannuleerd; 3. onderhoud
 * gepland of verzet; 4. nieuw document beschikbaar. Telkens een portaalmelding
 * plus e-mail, via de bestaande `portal_notifications`/mailweg."
 *
 * Event 3 lives in `portal-maintenance-events.ts` and was the only one built.
 * This module is the other three. Phase 10 moved reservation 3395 of portal
 * customer 179 by a day, swapped its vehicle, cancelled it and deleted it, and
 * counted the customer's `portal_notifications` after every step: unchanged.
 *
 * Three properties this shares with the maintenance hook, deliberately:
 *   - **a dedupe tag per change**, so saving the same edit twice (or cancelling
 *     and then deleting) reaches the customer once;
 *   - **only a customer with an active portal account** is written to at all;
 *   - **it never throws**. A reservation a colleague just saved may not be
 *     undone because a notification or an SMTP server failed.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { portalUsers, type Document, type Reservation } from "../../shared/schema";
import { storage } from "../storage";
import { customerNotifications } from "./portal-customer-notifications";
import { portalStorage } from "./portal-storage";
import { PORTAL_TEMPLATE, sendPortalCustomerMail } from "./portal-mail";
import { formatDateNL } from "../utils/dutch-format";
import { isContractDocument, isDamageCheckDocument } from "../../shared/document-types";

export type ReservationCustomerEvent = "reservation_changed" | "reservation_cancelled";

/** A row the customer still has: not cancelled, not in the recycle bin. */
const alive = (row: Reservation | null | undefined): row is Reservation =>
  Boolean(row && !row.deletedAt && row.status !== "cancelled");

async function hasPortalAccount(customerId: number): Promise<boolean> {
  const [row] = await db.select({ id: portalUsers.id }).from(portalUsers)
    .where(and(eq(portalUsers.customerId, customerId), eq(portalUsers.active, true))).limit(1);
  return Boolean(row);
}

/** B-18: `12-10-2026 t/m 17-10-2026`, `12-10-2026` for one day, `vanaf …` when open-ended. */
function period(startDate: string | null | undefined, endDate: string | null | undefined): string {
  const start = formatDateNL(startDate ?? null);
  if (!start) return "";
  if (!endDate) return `vanaf ${start}`;
  const end = formatDateNL(endDate);
  return !end || end === start ? start : `${start} t/m ${end}`;
}

/** `Volkswagen Caddy (AB-123-C)`, or a sentence saying no car is assigned yet. */
async function describeVehicle(vehicleId: number | null | undefined): Promise<{ text: string; plate: string | null }> {
  if (vehicleId == null) return { text: "nog geen auto toegewezen", plate: null };
  const vehicle = await storage.getVehicle(vehicleId);
  if (!vehicle) return { text: "nog geen auto toegewezen", plate: null };
  return { text: `${vehicle.brand} ${vehicle.model} (${vehicle.licensePlate})`, plate: vehicle.licensePlate };
}

function classify(before: Reservation | null, after: Reservation | null): ReservationCustomerEvent | null {
  const b = alive(before) ? before : null;
  const a = alive(after) ? after : null;
  if (b && !a) return "reservation_cancelled";
  if (!b || !a) return null;
  // A hand-over is not an office change. besluiten B-16 moves the start date to
  // today when a rental is picked up early, and the customer is standing at the
  // counter while that happens — telling them by mail that "the office changed
  // your dates" would be noise, not news.
  if (b.status !== "picked_up" && a.status === "picked_up") return null;
  const datesChanged = b.startDate !== a.startDate || (b.endDate ?? "") !== (a.endDate ?? "");
  const vehicleChanged = (b.vehicleId ?? null) !== (a.vehicleId ?? null);
  return datesChanged || vehicleChanged ? "reservation_changed" : null;
}

/**
 * Called from every staff write path of a reservation (`PATCH /:id`,
 * `PATCH /:id/basic`, `PATCH /:id/status`, `DELETE /:id`) with the row before
 * and after. Returns the event that was reported, or null when there was
 * nothing to report — which is the normal case.
 */
export async function onReservationChangedByStaff(
  before: Reservation | null,
  after: Reservation | null,
): Promise<ReservationCustomerEvent | null> {
  try {
    const row = alive(after) ? after : before;
    if (!row?.id) return null;
    // Maintenance blocks and spare bookings have their own hooks (B-06 event 3,
    // B-13); this one is about the customer's own rental.
    if ((row.type ?? "standard") !== "standard") return null;
    const event = classify(before, after);
    if (!event) return null;

    const customerId = after?.customerId ?? before?.customerId ?? null;
    if (customerId == null) return null;
    if (!(await hasPortalAccount(customerId))) return null;

    const link = `/reserveringen/${row.id}`;
    if (event === "reservation_cancelled") {
      const source = before ?? after!;
      const car = await describeVehicle(source.vehicleId);
      const when = period(source.startDate, source.endDate);
      const created = await customerNotifications.notify({
        customerId,
        type: "reservation_cancelled",
        title: `Reservering geannuleerd: ${car.plate ?? `#${row.id}`}`,
        description: `Lam Groep heeft uw reservering voor ${car.text}${when ? ` van ${when}` : ""} geannuleerd. Neem contact op met Lam Groep als dit niet klopt.`,
        link,
        // One tag for the whole reservation: cancel-then-delete is one message.
        dedupeTag: `res:${row.id}:cancelled`,
        dedupeDays: 365,
      });
      if (!created) return null;
      try {
        await sendPortalCustomerMail(customerId, PORTAL_TEMPLATE.RESERVATION_CANCELLED, {
          plate: car.plate ?? `#${row.id}`, car: car.text, period: when,
        }, "/reserveringen");
      } catch (e) { console.error("reservation cancelled mail failed:", e); }
      return event;
    }

    const b = before!, a = after!;
    const oldCar = await describeVehicle(b.vehicleId);
    const newCar = await describeVehicle(a.vehicleId);
    const changes: string[] = [];
    if (b.startDate !== a.startDate || (b.endDate ?? "") !== (a.endDate ?? "")) {
      changes.push(`De periode is nu ${period(a.startDate, a.endDate)} (was ${period(b.startDate, b.endDate)}).`);
    }
    if ((b.vehicleId ?? null) !== (a.vehicleId ?? null)) {
      changes.push(`U rijdt nu in ${newCar.text} in plaats van ${oldCar.text}.`);
    }
    const created = await customerNotifications.notify({
      customerId,
      type: "reservation_changed",
      title: `Reservering gewijzigd: ${newCar.plate ?? `#${row.id}`}`,
      description: `Lam Groep heeft uw reservering aangepast. ${changes.join(" ")}`,
      link,
      // The new values are part of the tag: saving the same edit again is the
      // same news, moving the rental once more is not.
      dedupeTag: `res:${row.id}:changed:${a.startDate}:${a.endDate ?? ""}:${a.vehicleId ?? ""}`,
      dedupeDays: 365,
    });
    if (!created) return null;
    try {
      await sendPortalCustomerMail(customerId, PORTAL_TEMPLATE.RESERVATION_CHANGED, {
        plate: newCar.plate ?? `#${row.id}`, car: newCar.text,
        period: period(a.startDate, a.endDate), changes: changes.join(" "),
      }, `/reserveringen/${row.id}`);
    } catch (e) { console.error("reservation changed mail failed:", e); }
    return event;
  } catch (e) {
    console.error("onReservationChangedByStaff failed:", e);
    return null;
  }
}

/** What the portal calls the document, in the customer's own words. */
function documentLabel(documentType?: string | null): string | null {
  if (isContractDocument(documentType)) return "Huurcontract";
  if (isDamageCheckDocument(documentType)) return "Schadecontrole";
  return null;
}

/**
 * besluiten **B-06** event 4 — a new document is waiting for the customer.
 *
 * Called from the one place every document is written (`createDocument`), so a
 * new generator cannot forget it. Only the two kinds the portal actually shows
 * count (`listDocumentsForCustomer` classifies on exactly this rule), and only
 * when that customer may see documents at all.
 */
export async function onDocumentAvailable(doc: Document | null | undefined): Promise<boolean> {
  try {
    if (!doc?.id || doc.reservationId == null) return false;
    if (doc.isStale) return false;
    const label = documentLabel(doc.documentType);
    if (!label) return false;

    const rental = await storage.getReservation(doc.reservationId);
    if (!rental?.customerId || rental.deletedAt) return false;
    if (!(await hasPortalAccount(rental.customerId))) return false;
    const settings = await portalStorage.getOrCreateCustomerSettings(rental.customerId);
    if (!settings.portalEnabled || !settings.canViewContracts) return false;

    const car = await describeVehicle(rental.vehicleId);
    const when = period(rental.startDate, rental.endDate);
    const created = await customerNotifications.notify({
      customerId: rental.customerId,
      type: "document_available",
      title: `Nieuw document: ${label}`,
      description: `Er staat een nieuw document voor u klaar in het klantenportaal: ${label} (${doc.fileName})${when ? `, bij uw huur van ${when}` : ""}. U kunt het daar bekijken en downloaden.`,
      link: "/documenten",
      dedupeTag: `doc:${doc.id}`,
      dedupeDays: 365,
    });
    if (!created) return false;
    try {
      await sendPortalCustomerMail(rental.customerId, PORTAL_TEMPLATE.DOCUMENT_AVAILABLE, {
        document: label, fileName: doc.fileName, car: car.text, period: when,
      }, "/documenten");
    } catch (e) { console.error("document available mail failed:", e); }
    return true;
  } catch (e) {
    console.error("onDocumentAvailable failed:", e);
    return false;
  }
}
