/**
 * The recipients and the text of the send preview (audit 2026-10-09, module 13,
 * finding 3).
 *
 * The preview has to show what each customer will receive. It therefore
 * resolves the recipients the way `POST /api/notifications/send` does
 * (`server/routes/notifications.ts`): a ticked vehicle goes to the customer who
 * has it, a ticked customer goes to that customer (unless already reached
 * through a vehicle), a vehicle nobody rents goes to the office, and the
 * address is the one the route picks for "auto". The placeholders are filled
 * per recipient by the same replacer the route uses.
 */
import { fillPlaceholders, MESSAGE_PLACEHOLDER_KEYS, type MessagePlaceholderKey } from "@shared/message-placeholders";
import { DEFAULT_COMPANY_NAME } from "@shared/company-name";
import { formatLicensePlate } from "@/lib/format-utils";

/** From this many recipients on, the send needs a second, explicit confirmation. */
export const MASS_SEND_THRESHOLD = 25;

export type EmailField = "email" | "emailForMOT" | "emailForInvoices" | "emailGeneral";
export const EMAIL_FIELDS: EmailField[] = ["email", "emailForMOT", "emailForInvoices", "emailGeneral"];

/** D15: one value for every placeholder the send route fills, empty when the data is not there. */
export type PlaceholderValues = Record<MessagePlaceholderKey, string>;

/** What the values need besides the vehicle and the customer (the same facts the route uses). */
export interface PlaceholderContext {
  /** The company name setting; "Autolease Lam" until one is loaded or saved. */
  companyName?: string;
  /** The running reservation of the vehicle (its dates fill reservationStart/End). */
  reservation?: { startDate?: string | null; endDate?: string | null } | null;
  /** Category of the template; only "maintenance" fills maintenanceDate. */
  category?: string | null;
  /** The server's answer for {maintenanceDate} on the vehicle list row (null: none; undefined: not sent). */
  maintenanceDate?: string | null;
}

/** yyyy-MM-dd as dd-mm-jjjj, like the route (formatDateNL); empty when there is none. */
function dutchDate(value: string | null | undefined): string {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

export interface EmailOption {
  field: EmailField;
  email: string;
}

export interface PreviewRecipient {
  key: string;
  /** The customer's name; empty for the office row. */
  name: string;
  /** A vehicle nobody rents: the route sends one notice to the office instead. */
  office: boolean;
  vehicleId: number | null;
  vehicleLicense: string | null;
  customerId: number | null;
  emailOptions: EmailOption[];
  /** The address field in use; null when the route would find no address. */
  emailField: EmailField | null;
  /** What the route picks by itself ("auto"); only a different choice is sent along. */
  defaultEmailField: EmailField | null;
  email: string | null;
  values: PlaceholderValues;
}

export function emailOptionsOf(customer: any): EmailOption[] {
  if (!customer) return [];
  return EMAIL_FIELDS.filter((field) => Boolean(customer[field])).map((field) => ({ field, email: customer[field] as string }));
}

/**
 * The route's `auto` choice for the template types this page sends (a saved
 * template always goes as `custom`): the primary address, then the general one.
 */
export function autoEmailField(customer: any): EmailField | null {
  if (customer?.email) return "email";
  if (customer?.emailGeneral) return "emailGeneral";
  return null;
}

export function placeholderValuesFor(vehicle: any | null, customer: any | null, context: PlaceholderContext = {}): PlaceholderValues {
  const emailField = autoEmailField(customer);
  return {
    customerName: customer?.name ?? "",
    vehiclePlate: vehicle?.licensePlate ? formatLicensePlate(vehicle.licensePlate) : "",
    vehicleBrand: vehicle?.brand ?? "",
    vehicleModel: vehicle?.model ?? "",
    apkDate: vehicle?.apkDate ? new Date(vehicle.apkDate).toLocaleDateString("nl-NL") : "",
    companyName: context.companyName || DEFAULT_COMPANY_NAME,
    customerEmail: emailField ? customer[emailField] : "",
    customerPhone: customer?.phone ?? "",
    reservationStart: dutchDate(context.reservation?.startDate),
    reservationEnd: dutchDate(context.reservation?.endDate),
    // The server decides (last service date, else the block covering today, else the next one) and
    // sends its answer on the vehicle list rows; a row without the field falls back to the vehicle row.
    maintenanceDate: context.category === "maintenance"
      ? dutchDate(context.maintenanceDate !== undefined ? context.maintenanceDate : vehicle?.lastServiceDate)
      : "",
  };
}

function recipientFor(vehicle: any | null, customer: any | null, context: PlaceholderContext = {}): PreviewRecipient {
  const emailField = autoEmailField(customer);
  return {
    key: vehicle ? `v${vehicle.id}` : `c${customer?.id}`,
    name: customer?.name ?? "",
    office: !customer,
    vehicleId: vehicle?.id ?? null,
    vehicleLicense: vehicle?.licensePlate ? formatLicensePlate(vehicle.licensePlate) : null,
    customerId: customer?.id ?? null,
    emailOptions: emailOptionsOf(customer),
    emailField,
    defaultEmailField: emailField,
    email: emailField ? customer[emailField] : null,
    values: placeholderValuesFor(vehicle, customer, context),
  };
}

export function buildRecipients(input: {
  mode: "apk" | "maintenance" | "custom";
  selectedVehicles: any[];
  selectedCustomers: any[];
  /** Rows of GET /api/vehicles/with-reservations or /filtered: `{ vehicle, customer }`. */
  vehicleItems: Array<{ vehicle: any; customer: any | null; reservation?: PlaceholderContext["reservation"]; maintenanceDate?: string | null }>;
  /** D15: the company name setting and the category of the chosen template. */
  companyName?: string;
  category?: string | null;
}): PreviewRecipient[] {
  const rows: PreviewRecipient[] = [];
  const base: PlaceholderContext = { companyName: input.companyName, category: input.category };
  for (const selected of input.selectedVehicles) {
    const item = input.vehicleItems.find((candidate) => candidate.vehicle?.id === selected.id);
    rows.push(recipientFor(item?.vehicle ?? selected, item?.customer ?? null, { ...base, reservation: item?.customer ? item?.reservation ?? null : null, maintenanceDate: item?.maintenanceDate }));
  }
  if (input.mode === "custom") {
    const reached = new Set(rows.map((row) => row.customerId).filter((id) => id !== null));
    for (const customer of input.selectedCustomers) {
      if (reached.has(customer.id)) continue;
      reached.add(customer.id);
      rows.push(recipientFor(null, customer, base));
    }
  }
  return rows;
}

/** The values of a recipient; customerEmail follows the address chosen in the preview, as the route uses that one. */
function valuesOf(recipient: Pick<PreviewRecipient, "values"> & { email?: string | null }): Record<string, string> {
  return { ...recipient.values, ...(recipient.email !== undefined ? { customerEmail: recipient.email ?? "" } : {}) };
}

export function renderForRecipient(text: string, recipient: Pick<PreviewRecipient, "values"> & { email?: string | null }): string {
  return fillPlaceholders(text, valuesOf(recipient));
}

/** The known placeholders in `text` that come out empty for this recipient (shown as a note in the preview). */
export function emptyPlaceholders(text: string, recipient: Pick<PreviewRecipient, "values"> & { email?: string | null }): string[] {
  const empty: string[] = [];
  fillPlaceholders(text, valuesOf(recipient), {
    transform: (value, key) => {
      if (!value && !empty.includes(key)) empty.push(key);
      return value;
    },
  });
  return empty;
}

/**
 * The placeholders written in `text` that no part of the application fills in
 * (the template builder offers a few the send route does not know). They go to
 * the customer as typed, and the preview says so.
 */
export const KNOWN_PLACEHOLDERS: readonly string[] = MESSAGE_PLACEHOLDER_KEYS;
export function unsupportedPlaceholders(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\{\{\s*(\w+)\s*\}\}|\{(\w+)\}/g)) {
    const key = (match[1] ?? match[2]) as string;
    if (!KNOWN_PLACEHOLDERS.includes(key) && !found.includes(key)) found.push(key);
  }
  return found;
}

