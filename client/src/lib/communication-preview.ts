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
import { fillPlaceholders } from "@shared/message-placeholders";
import { formatLicensePlate } from "@/lib/format-utils";

/** From this many recipients on, the send needs a second, explicit confirmation. */
export const MASS_SEND_THRESHOLD = 25;

export type EmailField = "email" | "emailForMOT" | "emailForInvoices" | "emailGeneral";
export const EMAIL_FIELDS: EmailField[] = ["email", "emailForMOT", "emailForInvoices", "emailGeneral"];

export interface PlaceholderValues {
  customerName: string;
  vehiclePlate: string;
  vehicleBrand: string;
  vehicleModel: string;
  apkDate: string;
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

export function placeholderValuesFor(vehicle: any | null, customer: any | null): PlaceholderValues {
  return {
    customerName: customer?.name ?? "",
    vehiclePlate: vehicle?.licensePlate ? formatLicensePlate(vehicle.licensePlate) : "",
    vehicleBrand: vehicle?.brand ?? "",
    vehicleModel: vehicle?.model ?? "",
    apkDate: vehicle?.apkDate ? new Date(vehicle.apkDate).toLocaleDateString("nl-NL") : "",
  };
}

function recipientFor(vehicle: any | null, customer: any | null): PreviewRecipient {
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
    values: placeholderValuesFor(vehicle, customer),
  };
}

export function buildRecipients(input: {
  mode: "apk" | "maintenance" | "custom";
  selectedVehicles: any[];
  selectedCustomers: any[];
  /** Rows of GET /api/vehicles/with-reservations or /filtered: `{ vehicle, customer }`. */
  vehicleItems: Array<{ vehicle: any; customer: any | null }>;
}): PreviewRecipient[] {
  const rows: PreviewRecipient[] = [];
  for (const selected of input.selectedVehicles) {
    const item = input.vehicleItems.find((candidate) => candidate.vehicle?.id === selected.id);
    rows.push(recipientFor(item?.vehicle ?? selected, item?.customer ?? null));
  }
  if (input.mode === "custom") {
    const reached = new Set(rows.map((row) => row.customerId).filter((id) => id !== null));
    for (const customer of input.selectedCustomers) {
      if (reached.has(customer.id)) continue;
      reached.add(customer.id);
      rows.push(recipientFor(null, customer));
    }
  }
  return rows;
}

export function renderForRecipient(text: string, recipient: Pick<PreviewRecipient, "values">): string {
  return fillPlaceholders(text, recipient.values as unknown as Record<string, string>);
}

/** The known placeholders in `text` that come out empty for this recipient (shown as a note in the preview). */
export function emptyPlaceholders(text: string, recipient: Pick<PreviewRecipient, "values">): string[] {
  const empty: string[] = [];
  fillPlaceholders(text, recipient.values as unknown as Record<string, string>, {
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
const KNOWN_PLACEHOLDERS = ["customerName", "vehiclePlate", "vehicleBrand", "vehicleModel", "apkDate"];
export function unsupportedPlaceholders(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\{\{\s*(\w+)\s*\}\}|\{(\w+)\}/g)) {
    const key = (match[1] ?? match[2]) as string;
    if (!KNOWN_PLACEHOLDERS.includes(key) && !found.includes(key)) found.push(key);
  }
  return found;
}

