import type { Reservation } from "../../shared/schema";
import type { PortalCancellationDto } from "../../shared/portal-types";
import { CHANGE_CUTOFF_MS, maintenanceStartsAt } from "./portal-maintenance-events";

/**
 * Cancelling a reservation from the portal (Kees, 2026-10-18): the customer asks, staff approve, like
 * an extension. Only a booked rental of their own (not one already on the road, and not a replacement
 * car the office arranged) and only until 48 hours before it starts. The start is the reservation's
 * start date and time on the office clock (08:00 when no time is set), the same moment and the same
 * 48 hours as moving a maintenance appointment.
 */
export const CANCEL_CUTOFF_MS = CHANGE_CUTOFF_MS;

type Cancellable = Pick<Reservation, "status" | "type" | "startDate" | "startTime" | "replacementForReservationId">;

export function cancellationState(r: Cancellable, openRequestId: number | null, now = new Date()): PortalCancellationDto {
  if (r.status !== "booked" || (r.type && r.type !== "standard")) return { allowed: false, reason: "not_booked", deadline: null, openRequestId };
  if (r.replacementForReservationId) return { allowed: false, reason: "replacement", deadline: null, openRequestId };
  const deadline = new Date(maintenanceStartsAt(r).getTime() - CANCEL_CUTOFF_MS);
  if (now.getTime() > deadline.getTime()) return { allowed: false, reason: "too_late", deadline: deadline.toISOString(), openRequestId };
  return { allowed: true, reason: null, deadline: deadline.toISOString(), openRequestId };
}
