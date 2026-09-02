// Regular-service due calculation shared by the client (vehicle details,
// maintenance calendar) and the server (nightly scan + notifications), so both
// sides agree on when a vehicle needs its next service.

export interface ServiceDueDefaults {
  /** Kilometres between services when the vehicle has no interval of its own */
  intervalKm: number;
  /** Months between services when the vehicle has no interval of its own */
  intervalMonths: number;
  /** Start warning this many km before the service is due */
  reminderKm: number;
  /** Start warning this many days before the service is due */
  reminderDays: number;
}

export const SERVICE_DUE_DEFAULTS: ServiceDueDefaults = {
  intervalKm: 30000,
  intervalMonths: 12,
  reminderKm: 1000,
  reminderDays: 30,
};

/** The vehicle columns the calculation reads (subset of the vehicles table) */
export interface ServiceDueVehicleFields {
  lastServiceDate?: string | null;
  lastServiceMileage?: number | null;
  currentMileage?: number | null;
  serviceIntervalKm?: number | null;
  serviceIntervalMonths?: number | null;
}

/** The settings columns that hold the defaults (subset of the settings table) */
export interface ServiceDueSettingsFields {
  defaultServiceIntervalKm?: number | null;
  defaultServiceIntervalMonths?: number | null;
  serviceReminderKm?: number | null;
  serviceReminderDays?: number | null;
}

export interface ServiceDueInfo {
  /** Effective interval used (vehicle value or default) */
  intervalKm: number;
  intervalMonths: number;
  /** yyyy-MM-dd of the next service by date, null when no last service date is known */
  nextServiceDate: string | null;
  /** Odometer reading at which the next service is due, null when no last service mileage is known */
  nextServiceMileage: number | null;
  /** Days until nextServiceDate (negative when overdue), null when unknown */
  daysUntilService: number | null;
  /** Km until nextServiceMileage (negative when overdue), null when unknown */
  kmUntilService: number | null;
  isDueByDate: boolean;
  isDueByMileage: boolean;
  /** Overdue on either axis */
  isServiceDue: boolean;
  /** Within the reminder window on either axis (but not yet due) */
  isServiceDueSoon: boolean;
  /** False when neither a last service date nor mileage is recorded */
  hasData: boolean;
}

export function serviceDueDefaultsFromSettings(settings?: ServiceDueSettingsFields | null): ServiceDueDefaults {
  const pick = (value: number | null | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
  return {
    intervalKm: pick(settings?.defaultServiceIntervalKm, SERVICE_DUE_DEFAULTS.intervalKm),
    intervalMonths: pick(settings?.defaultServiceIntervalMonths, SERVICE_DUE_DEFAULTS.intervalMonths),
    reminderKm: pick(settings?.serviceReminderKm, SERVICE_DUE_DEFAULTS.reminderKm),
    reminderDays: pick(settings?.serviceReminderDays, SERVICE_DUE_DEFAULTS.reminderDays),
  };
}

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYmd(value: string): Date | null {
  // Accept "yyyy-MM-dd" or a full ISO timestamp; use the date part only.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  // Clamp the day so e.g. Jan 31 + 1 month becomes Feb 28/29 instead of Mar 3
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(date.getDate(), lastDay));
  return result;
}

function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

export function computeServiceDue(
  vehicle: ServiceDueVehicleFields,
  defaults: ServiceDueDefaults = SERVICE_DUE_DEFAULTS,
  today: Date = new Date(),
): ServiceDueInfo {
  const intervalKm = vehicle.serviceIntervalKm && vehicle.serviceIntervalKm > 0 ? vehicle.serviceIntervalKm : defaults.intervalKm;
  const intervalMonths = vehicle.serviceIntervalMonths && vehicle.serviceIntervalMonths > 0 ? vehicle.serviceIntervalMonths : defaults.intervalMonths;

  let nextServiceDate: string | null = null;
  let daysUntilService: number | null = null;
  const lastServiceDate = vehicle.lastServiceDate ? parseYmd(vehicle.lastServiceDate) : null;
  if (lastServiceDate) {
    const next = addMonths(lastServiceDate, intervalMonths);
    nextServiceDate = toYmd(next);
    daysUntilService = daysBetween(today, next);
  }

  let nextServiceMileage: number | null = null;
  let kmUntilService: number | null = null;
  if (vehicle.lastServiceMileage != null && vehicle.currentMileage != null) {
    nextServiceMileage = vehicle.lastServiceMileage + intervalKm;
    kmUntilService = nextServiceMileage - vehicle.currentMileage;
  }

  const isDueByDate = daysUntilService !== null && daysUntilService <= 0;
  const isDueByMileage = kmUntilService !== null && kmUntilService <= 0;
  const isSoonByDate = daysUntilService !== null && daysUntilService > 0 && daysUntilService <= defaults.reminderDays;
  const isSoonByMileage = kmUntilService !== null && kmUntilService > 0 && kmUntilService <= defaults.reminderKm;
  const isServiceDue = isDueByDate || isDueByMileage;

  return {
    intervalKm,
    intervalMonths,
    nextServiceDate,
    nextServiceMileage,
    daysUntilService,
    kmUntilService,
    isDueByDate,
    isDueByMileage,
    isServiceDue,
    isServiceDueSoon: !isServiceDue && (isSoonByDate || isSoonByMileage),
    hasData: nextServiceDate !== null || nextServiceMileage !== null,
  };
}
