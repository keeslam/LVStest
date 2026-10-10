import { plateMatches } from "@/lib/format-utils";

/** The parts of a reservation row the search looks at. */
export interface ReservationSearchable {
  id: number;
  contractNumber?: string | null;
  vehicle?: { licensePlate?: string | null; brand?: string | null; model?: string | null } | null;
  customer?: { name?: string | null; companyName?: string | null } | null;
}

/**
 * One rule for "does this reservation match what was typed" - plate (with or
 * without dashes), brand and model (also together: "fiat ducato"), customer or
 * company name, contract number and reservation id. Case-insensitive; an empty
 * query matches everything. The reservation list used to repeat this three
 * times, and the not-collected list had none (A-5-3).
 */
export function reservationMatchesSearch(reservation: ReservationSearchable, query: string): boolean {
  const search = query.trim().toLowerCase();
  if (!search) return true;
  const brand = reservation.vehicle?.brand?.toLowerCase() ?? "";
  const model = reservation.vehicle?.model?.toLowerCase() ?? "";
  return (
    plateMatches(reservation.vehicle?.licensePlate, search) ||
    brand.includes(search) ||
    model.includes(search) ||
    `${brand} ${model}`.includes(search) ||
    (reservation.customer?.companyName?.toLowerCase().includes(search) ?? false) ||
    (reservation.customer?.name?.toLowerCase().includes(search) ?? false) ||
    (reservation.contractNumber?.toLowerCase().includes(search) ?? false) ||
    reservation.id.toString().includes(search)
  );
}
