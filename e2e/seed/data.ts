/** Office (Europe/Amsterdam) calendar date, `offset` days from today, as yyyy-MM-dd. */
export function officeDay(offset: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

// The four values a person (or this seed) may set by hand — the fifth value
// the column can hold, "scheduled", only ever comes out of the app's own
// derivation (server/services/lifecycle.ts deriveVehicleAvailability) and is
// never written directly here. Mirrors VehicleAvailabilityStatus in
// shared/schema.ts.
type ManualAvailabilityStatus = "available" | "needs_fixing" | "not_for_rental" | "rented";

// 'cancelled' is a valid reservation status (server/services/lifecycle.ts
// RESERVATION_STATUSES) even though it has no entry of its own in the
// ReservationStatus object in shared/schema.ts.
type SeedReservationStatus = "booked" | "picked_up" | "returned" | "completed" | "cancelled";

// Rows below have differing shapes (optional columns present on some, absent
// on others) and mix officeDay() calls with literals; `as const` on a mixed
// array like that produces a union of distinct object types that drizzle's
// `.values()` typing rejects. Small explicit interfaces avoid both that and
// an `as any` escape hatch. Fields are `readonly`, and SEED itself is frozen
// below, so a layer-a spec (they run fully parallel and several will import
// SEED) cannot mutate a row and leak that into another spec.
interface SeedVehicle {
  readonly licensePlate: string;
  readonly brand: string;
  readonly model: string;
  readonly currentMileage: number;
  // The value *before* runSeed() calls the app's own
  // storage.syncVehicleAvailabilityWithReservations() — i.e. what a fresh
  // vehicle, or one a staff member manually flagged, looks like prior to
  // that sync deriving "rented"/"scheduled" from the reservations below.
  readonly availabilityStatus: ManualAvailabilityStatus;
  readonly apkDate?: string;
  readonly warrantyEndDate?: string;
}

interface SeedCustomer {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
}

interface SeedReservation {
  readonly label: string;
  // Indexes into SEED.vehicles / SEED.customers.
  readonly vehicle: number;
  readonly customer: number;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly status: SeedReservationStatus;
  // Pickup fields: written by POST /api/reservations/:id/pickup
  // (database-storage.ts pickupReservation) and required there, so a
  // 'picked_up'/'returned'/'completed' row without them is a state the real
  // application can never produce.
  readonly pickupMileage?: number;
  readonly actualPickupDate?: string;
  // Return fields: written by POST /api/reservations/:id/return
  // (database-storage.ts returnReservation), same reasoning.
  readonly returnMileage?: number;
  readonly actualReturnDate?: string;
  readonly completionDate?: string;
}

const vehicles: SeedVehicle[] = [
  { licensePlate: "E2E-01-A", brand: "Volkswagen", model: "Crafter", currentMileage: 45000, availabilityStatus: "available" },
  // Backs "next-week" / "open-ended" below: within 30 days but not covering
  // today, so the sync turns this into "scheduled".
  { licensePlate: "E2E-02-B", brand: "Mercedes-Benz", model: "Sprinter", currentMileage: 82000, availabilityStatus: "available" },
  // Backs "picked-up" below: a picked_up rental is always "rented" in the
  // rule, regardless of dates, so "available" here is the right pre-sync
  // value — the sync turns it into "rented" the same way pickup/return would.
  { licensePlate: "E2E-03-C", brand: "Ford", model: "Transit", currentMileage: 61000, availabilityStatus: "available" },
  // Manual status: no reservation of its own, and the rule keeps a manually
  // set "needs_fixing" sticky (no maintenance_status flag or open block is
  // needed for that), so the sync leaves this alone.
  { licensePlate: "E2E-04-D", brand: "Renault", model: "Master", currentMileage: 120500, availabilityStatus: "needs_fixing" },
  // Manual status: "not_for_rental" is the rule's top precedence and nothing
  // derived may overwrite it, so the sync leaves this alone too.
  { licensePlate: "E2E-05-E", brand: "Opel", model: "Vivaro", currentMileage: 30100, availabilityStatus: "not_for_rental" },
  { licensePlate: "E2E-06-F", brand: "Peugeot", model: "Boxer", currentMileage: 99000, availabilityStatus: "available", apkDate: officeDay(20) },
  { licensePlate: "E2E-07-G", brand: "Fiat", model: "Ducato", currentMileage: 15000, availabilityStatus: "available", warrantyEndDate: officeDay(25) },
  { licensePlate: "E2E-08-H", brand: "Toyota", model: "Proace", currentMileage: 5000, availabilityStatus: "available" },
];

const customers: SeedCustomer[] = [
  { name: "E2E Bouwbedrijf De Vries B.V.", email: "devries@e2e.invalid", phone: "0612345601" },
  { name: "E2E Jansen Transport", email: "jansen@e2e.invalid", phone: "0612345602" },
  { name: "E2E Pieter Bakker", email: "bakker@e2e.invalid", phone: "0612345603" },
  { name: "E2E Sanne de Boer", email: "deboer@e2e.invalid", phone: "0612345604" },
  { name: "E2E Garage Visser", email: "visser@e2e.invalid", phone: "0612345605" },
  { name: "E2E Hoveniers Groen", email: "groen@e2e.invalid", phone: "0612345606" },
];

// vehicle and customer are indexes into the arrays above.
const reservations: SeedReservation[] = [
  { label: "today-booked", vehicle: 0, customer: 0, startDate: officeDay(0), endDate: officeDay(3), status: "booked" },
  { label: "next-week", vehicle: 1, customer: 1, startDate: officeDay(7), endDate: officeDay(10), status: "booked" },
  {
    label: "picked-up", vehicle: 2, customer: 2, startDate: officeDay(-2), endDate: officeDay(2), status: "picked_up",
    pickupMileage: 61000, actualPickupDate: officeDay(-2),
  },
  {
    label: "returned", vehicle: 7, customer: 3, startDate: officeDay(-10), endDate: officeDay(-6), status: "returned",
    pickupMileage: 4600, actualPickupDate: officeDay(-10), returnMileage: 5000, actualReturnDate: officeDay(-6), completionDate: officeDay(-6),
  },
  {
    label: "completed", vehicle: 5, customer: 4, startDate: officeDay(-30), endDate: officeDay(-25), status: "completed",
    pickupMileage: 98000, actualPickupDate: officeDay(-30), returnMileage: 99000, actualReturnDate: officeDay(-25), completionDate: officeDay(-25),
  },
  { label: "cancelled", vehicle: 6, customer: 5, startDate: officeDay(14), endDate: officeDay(16), status: "cancelled" },
  { label: "open-ended", vehicle: 1, customer: 0, startDate: officeDay(20), endDate: null, status: "booked" },
];

/** Recursively Object.freeze()s so a mutation in one parallel spec cannot leak into another. */
function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.getOwnPropertyNames(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

export const SEED: {
  readonly vehicles: readonly SeedVehicle[];
  readonly customers: readonly SeedCustomer[];
  readonly reservations: readonly SeedReservation[];
} = deepFreeze({ vehicles, customers, reservations });
