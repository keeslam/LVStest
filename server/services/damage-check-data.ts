/**
 * The reservation block printed on a damage check.
 *
 * FIX-N (BUG-166): three call sites each built the customer's name as
 * `${customer.firstName} ${customer.lastName}` — but `first_name` and
 * `last_name` are nullable columns that almost nothing writes; `name` is the
 * NOT NULL column the whole app actually fills. For roughly 99% of customers
 * both halves were null, so template interpolation produced the literal string
 * `"null null"` and that is what got printed on the form the customer signs.
 */
import { format } from "date-fns";

export interface DamageCheckCustomerLike {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
}

export interface DamageCheckReservationLike {
  id: number;
  contractNumber?: string | null;
  startDate: string | Date;
  endDate?: string | Date | null;
}

export interface DamageCheckReservationData {
  contractNumber: string;
  customerName: string;
  startDate: string;
  endDate: string;
  rentalDays: number;
}

/**
 * The customer's name as a human would write it: the `name` column first,
 * then first+last if somebody filled those in, then the company name. Never
 * `"null null"`, never `"undefined undefined"`, and an empty string when there
 * genuinely is no name rather than a placeholder pretending to be one.
 */
export function customerDisplayName(customer: DamageCheckCustomerLike | null | undefined): string {
  if (!customer) return "";
  const direct = (customer.name ?? "").trim();
  if (direct) return direct;
  const composed = [customer.firstName, customer.lastName]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (composed) return composed;
  return (customer.companyName ?? "").trim();
}

/** Shared by every route that renders a damage check for a reservation. */
export function buildDamageCheckReservationData(
  reservation: DamageCheckReservationLike,
  customer: DamageCheckCustomerLike | null | undefined,
): DamageCheckReservationData {
  const startDate = new Date(reservation.startDate);
  const endDate = reservation.endDate
    ? new Date(reservation.endDate)
    : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const rentalDays = Math.max(
    1,
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
  );
  return {
    contractNumber:
      (reservation.contractNumber ?? "").trim() ||
      `C-${reservation.id}-${format(new Date(), "yyyyMMdd")}`,
    customerName: customerDisplayName(customer),
    startDate: format(startDate, "dd-MM-yyyy"),
    endDate: format(endDate, "dd-MM-yyyy"),
    rentalDays,
  };
}
