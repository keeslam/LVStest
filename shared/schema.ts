import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb, index, varchar, uniqueIndex, date, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod";
// FIX-R (BUG-072): one definition of "a link we are willing to open", shared
// by the client sink guard and this schema.
import { isSafeHttpUrl, SAFE_URL_MESSAGE, isLocalOrNetworkPath, LOCAL_PATH_MESSAGE } from "./safe-url";
import type { InboxParsedInvoice } from "./invoice-inbox";

// User Roles enum
export const UserRole = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
  CLEANER: 'cleaner',
  VIEWER: 'viewer',
  ACCOUNTANT: 'accountant',
  MAINTENANCE: 'maintenance',
} as const;

// Vehicle Availability Status enum
export const VehicleAvailabilityStatus = {
  AVAILABLE: 'available',
  NEEDS_FIXING: 'needs_fixing',
  NOT_FOR_RENTAL: 'not_for_rental',
  RENTED: 'rented',
} as const;

// Reservation Status enum
export const ReservationStatus = {
  BOOKED: 'booked',           // Reservation created, waiting for pickup
  PICKED_UP: 'picked_up',     // Vehicle handed over, contract generated
  RETURNED: 'returned',       // Vehicle returned, damage check completed
  COMPLETED: 'completed',     // Fully processed and closed
} as const;

// Spare Vehicle Status enum
export const SpareVehicleStatus = {
  ASSIGNED: 'assigned',       // Spare vehicle assigned to reservation
  READY: 'ready',             // Vehicle prepared and ready for pickup
  PICKED_UP: 'picked_up',     // Customer has picked up spare vehicle
  RETURNED: 'returned',       // Spare vehicle returned
} as const;

// Valid status transitions for reservations
export const VALID_RESERVATION_TRANSITIONS: Record<string, string[]> = {
  'booked': ['picked_up', 'cancelled'],
  'picked_up': ['completed', 'cancelled'],
  'completed': [], // Final state
  'cancelled': [], // Final state
  'returned': ['completed'], // Legacy state - can transition to completed
};

// Valid status transitions for spare vehicles
export const VALID_SPARE_TRANSITIONS: Record<string, string[]> = {
  'assigned': ['ready', 'cancelled'],
  'ready': ['picked_up', 'cancelled'],
  'picked_up': ['returned'],
  'returned': [], // Final state
  'cancelled': [], // Final state
};

// Validation helper: check if a status transition is valid
export function isValidReservationTransition(currentStatus: string | null, newStatus: string): boolean {
  if (!currentStatus) return newStatus === 'booked'; // New reservations start as booked
  const validNext = VALID_RESERVATION_TRANSITIONS[currentStatus] || [];
  return validNext.includes(newStatus) || currentStatus === newStatus; // Allow same status (idempotent)
}

export function isValidSpareTransition(currentStatus: string | null, newStatus: string): boolean {
  if (!currentStatus) return newStatus === 'assigned'; // New spare assignments start as assigned
  const validNext = VALID_SPARE_TRANSITIONS[currentStatus] || [];
  return validNext.includes(newStatus) || currentStatus === newStatus; // Allow same status (idempotent)
}

// Permissions
export const UserPermission = {
  // User Management
  MANAGE_USERS: 'manage_users',
  
  // Vehicle Management
  MANAGE_VEHICLES: 'manage_vehicles',
  VIEW_VEHICLES: 'view_vehicles',
  
  // Customer Management
  MANAGE_CUSTOMERS: 'manage_customers',
  VIEW_CUSTOMERS: 'view_customers',
  
  // Reservation Management
  MANAGE_RESERVATIONS: 'manage_reservations',
  VIEW_RESERVATIONS: 'view_reservations',
  // Allows confirming a mileage decrease at pickup with your own account password.
  // Checked strictly - admins need it too, so it can be revoked per user.
  AUTHORIZE_MILEAGE_DECREASE: 'authorize_mileage_decrease',
  
  // Maintenance & Expenses
  MANAGE_MAINTENANCE: 'manage_maintenance',
  MANAGE_EXPENSES: 'manage_expenses',
  
  // Documents & Templates
  // besluit B-23 (BUG-167): documents have a permission of their own, with a
  // separate checkbox for "may look at it" and "may generate/change it". They
  // deliberately do NOT ride along on the vehicle or reservation permission.
  VIEW_DOCUMENTS: 'view_documents',
  MANAGE_DOCUMENTS: 'manage_documents',
  MANAGE_PDF_TEMPLATES: 'manage_pdf_templates',
  
  // Damage Checks
  MANAGE_DAMAGE_CHECKS: 'manage_damage_checks',
  VIEW_DAMAGE_CHECKS: 'view_damage_checks',
  
  // Reports & Analytics
  MANAGE_REPORTS: 'manage_reports',
  VIEW_REPORTS: 'view_reports',
  
  // System Administration
  MANAGE_BACKUPS: 'manage_backups',
  MANAGE_SETTINGS: 'manage_settings',
  MANAGE_EMAIL_TEMPLATES: 'manage_email_templates',
  MANAGE_NOTIFICATIONS: 'manage_notifications',

  // Customer portal (accounts, per-customer switches, online vehicles)
  MANAGE_PORTAL: 'manage_portal',
  VIEW_PORTAL: 'view_portal',

  // Traffic fines (entry, attribution, charging)
  MANAGE_FINES: 'manage_fines',
  VIEW_FINES: 'view_fines',

  // Fiscal mobility check (docs/fiscaal). Configuration is global and
  // versioned; preparing, approving and publishing a version are separate
  // rights so they can be split across people later (besluit F-04: not yet).
  VIEW_FISCAL: 'view_fiscal',
  MANAGE_FISCAL_REVIEW: 'manage_fiscal_review',
  MANAGE_FISCAL_CONFIGURATION: 'manage_fiscal_configuration',
  APPROVE_FISCAL_CONFIGURATION: 'approve_fiscal_configuration',
  PUBLISH_FISCAL_CONFIGURATION: 'publish_fiscal_configuration',
  VIEW_FISCAL_AUDIT_LOG: 'view_fiscal_audit_log',

  // General
  VIEW_DASHBOARD: 'view_dashboard',
} as const;

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name"),
  email: text("email"),
  role: text("role").notNull().default(UserRole.USER),
  permissions: jsonb("permissions").$type<string[]>().default([]).notNull(),
  active: boolean("active").notNull().default(true),
  hidePrices: boolean("hide_prices").notNull().default(false),
  mileageOverridePasswordHash: text("mileage_override_password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  fullName: true,
  email: true,
  role: true,
  permissions: true,
  active: true,
  hidePrices: true,
  mileageOverridePasswordHash: true,
  createdBy: true,
  updatedBy: true,
});

export const updateUserSchema = createInsertSchema(users).pick({
  fullName: true,
  email: true,
  role: true,
  permissions: true,
  active: true,
  hidePrices: true,
  mileageOverridePasswordHash: true,
  updatedBy: true,
}).partial();

/**
 * BUG-063 — `PATCH /api/users/:id` spread the raw body into the update, so any
 * column of `users` was writable from a request (including `id` and the
 * bookkeeping columns) and `password` was accepted for *any* account. This is
 * the closed list of fields that endpoint may write; the route decides who may
 * write which of them.
 */
export const patchUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    password: true,
    fullName: true,
    email: true,
    role: true,
    permissions: true,
    active: true,
    hidePrices: true,
    mileageOverridePasswordHash: true,
  })
  .partial();

// Vehicles table
export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  licensePlate: text("license_plate").notNull().unique(),
  brand: text("brand").notNull(),
  model: text("model").notNull(),
  vehicleType: text("vehicle_type"),
  chassisNumber: text("chassis_number"),
  fuel: text("fuel"),
  adBlue: boolean("ad_blue"),
  euroZone: text("euro_zone"),
  euroZoneEndDate: text("euro_zone_end_date"),
  euroZoneAccess: boolean("euro_zone_access"),
  euroZonePaidPermitAccess: boolean("euro_zone_paid_permit_access"),
  moveIziRegistered: boolean("move_izi_registered"),
  moveIziRegistrationDate: text("move_izi_registration_date"),
  moveIziExpirationDate: text("move_izi_expiration_date"),
  internalAppointments: text("internal_appointments"),
  apkDate: text("apk_date"),
  company: text("company"),
  companyDate: text("company_date"),
  companyBy: text("company_by"), // Track who changed the company status
  registeredTo: text("registered_to"),
  registeredToDate: text("registered_to_date"),
  registeredToBy: text("registered_to_by"), // Track who changed the registeredTo status
  productionDate: text("production_date"), // Production/build date from RDW API
  gps: boolean("gps"),
  imei: text("imei"), // GPS device IMEI number
  gpsSwapped: boolean("gps_swapped"), // GPS module swap status
  gpsActivated: boolean("gps_activated"), // GPS activation status
  monthlyPrice: numeric("monthly_price"),
  dailyPrice: numeric("daily_price"),
  dateIn: text("date_in"),
  dateOut: text("date_out"),
  contractNumber: text("contract_number"),
  damageCheck: boolean("damage_check"),
  damageCheckDate: text("damage_check_date"),
  damageCheckAttachment: text("damage_check_attachment"),
  damageCheckAttachmentDate: text("damage_check_attachment_date"),
  creationDate: text("creation_date"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"), // Added missing updatedBy column
  departureMileage: integer("departure_mileage"),
  returnMileage: integer("return_mileage"),
  roadsideAssistance: boolean("roadside_assistance"),
  spareKey: boolean("spare_key"),
  spareKeyWithCustomer: boolean("spare_key_with_customer"), // Is the spare key currently with a customer?
  spareKeyCustomerName: text("spare_key_customer_name"), // Name of customer who has the spare key
  remarks: text("remarks"),
  // OPT-011 - the remark text that was on this vehicle at its last completed
  // pickup, and who confirmed it. A warning that fires on every single pickup
  // of every car that has ever had a note is not a warning any more; the
  // employee is asked again only when the text has changed since then.
  remarksConfirmedText: text("remarks_confirmed_text"),
  remarksConfirmedAt: timestamp("remarks_confirmed_at", { withTimezone: true }),
  remarksConfirmedBy: text("remarks_confirmed_by"),
  winterTires: boolean("winter_tires"),
  tireSize: text("tire_size"),
  wokNotification: boolean("wok_notification"),
  radioCode: text("radio_code"),
  warrantyEndDate: text("warranty_end_date"),
  seatcovers: boolean("seatcovers"),
  backupbeepers: boolean("backupbeepers"),
  spareTire: boolean("spare_tire"),
  toolsAndJack: boolean("tools_and_jack"),
  
  // Maintenance status for spare vehicle management
  maintenanceStatus: text("maintenance_status").default("ok").notNull(), // 'ok' | 'needs_service' | 'in_service'
  maintenanceNote: text("maintenance_note"), // Optional note about maintenance
  
  // Mileage tracking for service scheduling
  currentMileage: integer("current_mileage"),
  lastServiceDate: text("last_service_date"),
  lastServiceMileage: integer("last_service_mileage"),
  // Regular-service interval for this vehicle; null = use the defaults from settings
  serviceIntervalKm: integer("service_interval_km"),
  serviceIntervalMonths: integer("service_interval_months"),
  
  // Mileage decrease tracking (admin-only visibility)
  mileageDecreasedBy: text("mileage_decreased_by"), // Username who decreased the mileage
  mileageDecreasedAt: timestamp("mileage_decreased_at", { withTimezone: true }), // When mileage was decreased
  previousMileage: integer("previous_mileage"), // Mileage before the decrease
  
  // Fuel level tracking (independent of reservations)
  currentFuelLevel: varchar("current_fuel_level"), // 'empty' | '1/4' | '1/2' | '3/4' | 'full'
  fuelRefillCost: numeric("fuel_refill_cost", { precision: 10, scale: 2 }), // Cost of last refill
  fuelRefillReceipt: text("fuel_refill_receipt"), // Path to receipt image/PDF
  fuelRefillNotes: text("fuel_refill_notes"), // Notes about the refill
  fuelRefillDate: timestamp("fuel_refill_date", { withTimezone: true }), // When the refill was done
  
  // Oil specification
  recommendedOil: text("recommended_oil"), // e.g., "5W-30", "10W-40", or custom specification
  
  // Availability status (manual control with 5 states)
  // 'available' - ready for rental (no reservations)
  // 'scheduled' - has a reservation within 30 days (auto-set by system)
  // 'needs_fixing' - in workshop or needs repairs
  // 'not_for_rental' - owned but not being rented out
  // 'rented' - currently rented (auto-set by system)
  availabilityStatus: text("availability_status").default("available").notNull(),

  // Permanent scan identifier printed on the key label. Assigned automatically
  // from the row id (VEH-000123, see shared/barcode.ts); only an explicit admin
  // regenerate changes it. Unique index added in startup-migration.js.
  barcode: text("barcode").unique(),

  // Customer portal: staff flag a vehicle as offered online; the portal's
  // booking flow (part 2) only ever lists vehicles with this on.
  offeredOnline: boolean("offered_online").default(false).notNull(),
  onlineDescription: text("online_description"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * BUG-111 — the reservation date columns are `text`, and nothing checked what
 * went into them, so "not-a-date" and "2026-13-45" were stored verbatim and
 * every date comparison downstream (conflict checks, overdue lists, the
 * calendar) silently stopped working for that row. One yyyy-MM-dd schema that
 * also rejects an impossible calendar day.
 */
export function isCalendarDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export const ymdDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the yyyy-MM-dd format")
  .refine(isCalendarDate, "That is not a real calendar date");

/**
 * FIX-Z (BUG-020, BUG-058) — the plate column is `text .notNull().unique()` and
 * nothing normalised it, so "AB-123-C", "ab123c" and "AB 123 C" were three
 * different vehicles as far as the unique constraint was concerned, and nothing
 * stopped an emoji or a 100-character plate either.
 *
 * `normaliseLicensePlate` is the same normalisation `server/utils/rdw-api.ts`
 * already uses before calling the RDW; the routes compare *this* form when they
 * check for a duplicate.
 */
export function normaliseLicensePlate(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export const licensePlateSchema = z
  .string()
  .trim()
  .min(1, "License plate is required")
  .max(20, "License plate is too long")
  .regex(/^[A-Za-z0-9][A-Za-z0-9 .-]*$/, "A license plate holds only letters, digits, spaces and dashes")
  .refine((v) => {
    const n = normaliseLicensePlate(v);
    return n.length >= 4 && n.length <= 16;
  }, "That is not a usable license plate")
  .transform((v) => v.trim().toUpperCase());

/** A whole, non-negative odometer reading. BUG-041. */
const mileageField = z.coerce
  .number({ invalid_type_error: "Mileage must be a number" })
  .int("Mileage must be a whole number")
  .min(0, "Mileage cannot be negative")
  .max(9999999, "Mileage is out of range")
  .nullable()
  .optional();

/**
 * A yyyy-MM-dd date column that may be empty. BUG-042.
 *
 * PHASE 57 / WAVE 13 item 1 — "empty" has two spellings. A row read back from
 * the database carries `null`, but an HTML date input that was never filled in
 * carries `""`, and so does every one of the fourteen ymd defaults in the
 * add-vehicle form. `""` is not a date and never was one: it means "no date",
 * exactly like `null`. Rejecting it made `POST /api/vehicles` impossible from
 * the form while `PATCH` on an existing vehicle sailed through, which is the
 * whole of the "Voertuig toevoegen doet niets" report. An impossible date such
 * as "2026-02-30" is still refused — only the blank is normalised.
 */
const optionalYmd = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  ymdDateSchema.nullable().optional(),
);

/** A service interval: whole, positive, or absent. BUG-149. */
const serviceIntervalField = z.coerce
  .number({ invalid_type_error: "The interval must be a number" })
  .int("The interval must be a whole number")
  .positive("The interval must be greater than zero")
  .nullable()
  .optional();

export const insertVehicleSchema = createInsertSchema(vehicles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  // OPT-011 - server-owned bookkeeping: which remark text was in force at the
  // last pickup. It is written by the pickup route, never by a request body,
  // so a PATCH cannot silence the warning for a remark that was never read.
  remarksConfirmedText: true,
  remarksConfirmedAt: true,
  remarksConfirmedBy: true,
  // No longer omit these fields so they can be set during insert/update
  // createdBy: true,
  // updatedBy: true,
}).extend({
  // BUG-020 / BUG-058
  licensePlate: licensePlateSchema,
  // BUG-041 — currentMileage already had a floor; its two siblings did not.
  currentMileage: mileageField,
  departureMileage: mileageField,
  returnMileage: mileageField,
  lastServiceMileage: mileageField,
  // BUG-042 — every one of these is a `text` column that only ever holds a
  // yyyy-MM-dd day; "2026-02-30" used to be stored verbatim.
  apkDate: optionalYmd,
  companyDate: optionalYmd,
  creationDate: optionalYmd,
  damageCheckAttachmentDate: optionalYmd,
  damageCheckDate: optionalYmd,
  dateIn: optionalYmd,
  dateOut: optionalYmd,
  euroZoneEndDate: optionalYmd,
  lastServiceDate: optionalYmd,
  moveIziExpirationDate: optionalYmd,
  moveIziRegistrationDate: optionalYmd,
  productionDate: optionalYmd,
  registeredToDate: optionalYmd,
  warrantyEndDate: optionalYmd,
  // BUG-149 — "0", "-1" and "abc" all silently switched the service reminder off.
  serviceIntervalKm: serviceIntervalField,
  serviceIntervalMonths: serviceIntervalField,
});

// Customers table
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  debtorNumber: text("debtor_number"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  companyName: text("company_name"),
  driverName: text("driver_name"),
  contactPerson: text("contact_person"),
  
  // Communication
  email: text("email"),
  emailForMOT: text("email_for_mot"), // For APK inspection
  emailForInvoices: text("email_for_invoices"),
  emailGeneral: text("email_general"),
  phone: text("phone"),
  driverPhone: text("driver_phone"),
  
  // Address
  streetName: text("street_name"),
  address: text("address"),
  city: text("city"),
  postalCode: text("postal_code"),
  country: text("country").default("Nederland"),
  
  // Identification
  driverLicenseNumber: text("driver_license_number"),
  chamberOfCommerceNumber: text("chamber_of_commerce_number"), // CoC
  rsin: text("rsin"), // Legal Entity Identification Number
  vatNumber: text("vat_number"),
  
  // Status
  status: text("status"),
  statusDate: text("status_date"),
  statusBy: text("status_by"), // Track who changed the status
  
  // Notes
  notes: text("notes"),
  
  // Multi-language support
  preferredLanguage: text("preferred_language").default("nl").notNull(), // 'nl' | 'en'
  
  // Corporate/Business features
  customerType: text("customer_type").default("business").notNull(), // 'business' | 'individual'
  accountManager: text("account_manager"), // Assigned account manager
  billingAddress: text("billing_address"), // Separate billing address if different
  billingCity: text("billing_city"),
  billingPostalCode: text("billing_postal_code"),
  corporateDiscount: numeric("corporate_discount"), // Discount percentage for corporate clients
  paymentTermDays: integer("payment_term_days").default(30), // Payment terms in days
  creditLimit: numeric("credit_limit"), // Credit limit for corporate accounts
  
  // Multiple contacts for businesses
  primaryContactName: text("primary_contact_name"),
  primaryContactEmail: text("primary_contact_email"),
  primaryContactPhone: text("primary_contact_phone"),
  secondaryContactName: text("secondary_contact_name"),
  secondaryContactEmail: text("secondary_contact_email"),
  secondaryContactPhone: text("secondary_contact_phone"),
  billingContactName: text("billing_contact_name"),
  billingContactEmail: text("billing_contact_email"),
  billingContactPhone: text("billing_contact_phone"),
  
  // Tracking
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdByUser: integer("created_by_user_id").references(() => users.id),
  updatedByUser: integer("updated_by_user_id").references(() => users.id),
});

const optionalEmail = z.string().email("Invalid email address").nullable().optional().or(z.literal(''));

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdByUser: true,
  updatedByUser: true,
}).extend({
  // BUG-044 / BUG-059 — `name` is NOT NULL in the database and nothing else,
  // so "   " created a nameless customer and a 5 000-character name was fine.
  name: z.string().trim().min(1, "Name is required").max(255, "Name is too long"),
  email: optionalEmail,
  emailForMOT: optionalEmail,
  emailForInvoices: optionalEmail,
  emailGeneral: optionalEmail,
  primaryContactEmail: optionalEmail,
  secondaryContactEmail: optionalEmail,
  billingContactEmail: optionalEmail,
});

// Drivers table - for managing multiple drivers per customer/company
export const drivers = pgTable("drivers", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  
  // Driver personal info
  displayName: text("display_name").notNull(), // Full name for display
  firstName: text("first_name"),
  lastName: text("last_name"),
  
  // Contact info
  email: text("email"),
  phone: text("phone"),
  
  // Driver's license info
  driverLicenseNumber: text("driver_license_number"),
  licenseExpiry: text("license_expiry"),
  licenseOrigin: text("license_origin"), // Country/region of license issuance
  licenseDocumentId: integer("license_document_id").references(() => documents.id, { onDelete: "set null" }), // FK to documents table for license copy
  licenseFilePath: text("license_file_path"), // Direct file path for license copy (simpler alternative)
  
  // Driver flags
  isPrimaryDriver: boolean("is_primary_driver").default(false).notNull(), // Mark as primary contact for this customer
  status: text("status").default("active").notNull(), // 'active' | 'inactive'
  
  // Additional info
  notes: text("notes"),
  preferredLanguage: text("preferred_language").default("nl"), // 'nl' | 'en'
  
  // Tracking
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdByUser: integer("created_by_user_id").references(() => users.id),
  updatedByUser: integer("updated_by_user_id").references(() => users.id),
});

export const insertDriverSchema = createInsertSchema(drivers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdByUser: true,
  updatedByUser: true,
});

export type Driver = typeof drivers.$inferSelect;
export type InsertDriver = z.infer<typeof insertDriverSchema>;

// ---------------------------------------------------------------------------
// Customer portal
// ---------------------------------------------------------------------------

export const PortalUserRole = {
  ADMIN: 'admin',   // may do everything the customer's switches allow
  DRIVER: 'driver', // tied to one drivers row; sees only their own rentals
} as const;
export type PortalUserRoleValue = typeof PortalUserRole[keyof typeof PortalUserRole];

// Logins for customers. Deliberately NOT in `users`: every staff permission
// check assumes req.user is staff, and one missed check would leak staff data.
export const portalUsers = pgTable("portal_users", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  passwordHash: text("password_hash"), // null until the invitation is accepted
  fullName: text("full_name").notNull(),
  role: text("role").notNull().default(PortalUserRole.ADMIN),
  driverId: integer("driver_id").references(() => drivers.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  /** Per-account restrictions on top of the customer settings; see PortalAccountPermissions. */
  permissions: jsonb("permissions").$type<Record<string, boolean>>().notNull().default({}),
  inviteTokenHash: text("invite_token_hash"),
  inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
  /** Own language choice; null = follow the customer's preferred language. */
  language: text("language"),
  /** A new address waits here until the confirmation link in the mail to it is used. */
  pendingEmail: text("pending_email"),
  emailChangeTokenHash: text("email_change_token_hash"),
  emailChangeExpiresAt: timestamp("email_change_expires_at", { withTimezone: true }),
  /** Browsers this account logged in from; a login from an unknown one triggers a warning mail. */
  knownDevices: jsonb("known_devices").$type<PortalKnownDevice[]>().notNull().default([]),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  // Touched at most once a minute while the user is active; "online" in the
  // staff overview means seen within the last 10 minutes.
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
}, (table) => ({
  emailLowerIdx: uniqueIndex("portal_users_email_lower_idx").on(sql`lower(${table.email})`),
  customerIdx: index("portal_users_customer_id_idx").on(table.customerId),
}));

export const insertPortalUserSchema = createInsertSchema(portalUsers)
  .omit({ id: true, createdAt: true, updatedAt: true, passwordHash: true, inviteTokenHash: true, inviteExpiresAt: true, lastLoginAt: true, lastSeenAt: true })
  .extend({
    email: z.string().email().transform((v) => v.trim().toLowerCase()),
    fullName: z.string().trim().min(1),
    role: z.enum([PortalUserRole.ADMIN, PortalUserRole.DRIVER]),
    driverId: z.number().int().positive().nullable().optional(),
  })
  .refine((d) => d.role !== PortalUserRole.DRIVER || (d.driverId != null), {
    message: "A driver account must be linked to a driver",
    path: ["driverId"],
  });

export type PortalUser = typeof portalUsers.$inferSelect;
export type InsertPortalUser = z.infer<typeof insertPortalUserSchema>;

// One row per customer. Staff can switch off any portal feature per customer.
export const portalCustomerSettings = pgTable("portal_customer_settings", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().unique().references(() => customers.id, { onDelete: "cascade" }),
  portalEnabled: boolean("portal_enabled").notNull().default(true),
  canBook: boolean("can_book").notNull().default(true),
  canManageDrivers: boolean("can_manage_drivers").notNull().default(true),
  canSubmitRequests: boolean("can_submit_requests").notNull().default(true),
  canViewFines: boolean("can_view_fines").notNull().default(true),
  canViewContracts: boolean("can_view_contracts").notNull().default(true),
  showPrices: boolean("show_prices").notNull().default(false),
  canReturn: boolean("can_return").notNull().default(true),
  // Fiscal mobility check (docs/fiscaal/03-schema-en-dataflow.md §1.8). These
  // switch visibility and notifications for the customer; they never change a
  // fiscal parameter, and switching one off deletes nothing.
  fiscalMobilityEnabled: boolean("fiscal_mobility_enabled").notNull().default(false),
  pseudoEindheffingEnabled: boolean("pseudo_eindheffing_enabled").notNull().default(false),
  fiscalDashboardEnabled: boolean("fiscal_dashboard_enabled").notNull().default(false),
  fiscalWarningsEnabled: boolean("fiscal_warnings_enabled").notNull().default(false),
  fiscalReportsEnabled: boolean("fiscal_reports_enabled").notNull().default(false),
  driverFiscalVisibilityEnabled: boolean("driver_fiscal_visibility_enabled").notNull().default(false),
  internalNotes: text("internal_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: text("updated_by"),
});

export const insertPortalCustomerSettingsSchema = createInsertSchema(portalCustomerSettings)
  .omit({ id: true, createdAt: true, updatedAt: true });
export const updatePortalCustomerSettingsSchema = insertPortalCustomerSettingsSchema
  .omit({ customerId: true }).partial();

export type PortalCustomerSettings = typeof portalCustomerSettings.$inferSelect;
export type InsertPortalCustomerSettings = z.infer<typeof insertPortalCustomerSettingsSchema>;

// Who was the driver of a reservation, and when. Exactly one open row
// (assigned_until IS NULL) per reservation. Part 3 (fines) answers
// "who drove plate X at time T" from this table.
export const reservationDriverAssignments = pgTable("reservation_driver_assignments", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id").notNull().references(() => reservations.id, { onDelete: "cascade" }),
  driverId: integer("driver_id").references(() => drivers.id, { onDelete: "set null" }),
  assignedFrom: timestamp("assigned_from", { withTimezone: true }).notNull(),
  assignedUntil: timestamp("assigned_until", { withTimezone: true }),
  assignedByPortalUserId: integer("assigned_by_portal_user_id").references(() => portalUsers.id, { onDelete: "set null" }),
  assignedByUserId: integer("assigned_by_user_id").references(() => users.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  reservationFromIdx: index("rda_reservation_from_idx").on(table.reservationId, table.assignedFrom),
}));

export const insertReservationDriverAssignmentSchema = createInsertSchema(reservationDriverAssignments)
  .omit({ id: true, createdAt: true });
export type ReservationDriverAssignment = typeof reservationDriverAssignments.$inferSelect;
export type InsertReservationDriverAssignment = z.infer<typeof insertReservationDriverAssignmentSchema>;

// What customers do in the portal. Separate from audit_logs (staff actions).
export const portalActivityLog = pgTable("portal_activity_log", {
  id: serial("id").primaryKey(),
  portalUserId: integer("portal_user_id").references(() => portalUsers.id, { onDelete: "set null" }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: integer("entity_id"),
  details: jsonb("details").$type<Record<string, unknown>>(),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  customerCreatedIdx: index("portal_activity_customer_created_idx").on(table.customerId, table.createdAt),
}));

export const insertPortalActivityLogSchema = createInsertSchema(portalActivityLog)
  .omit({ id: true, createdAt: true });
export type PortalActivityLogEntry = typeof portalActivityLog.$inferSelect;
export type InsertPortalActivityLogEntry = z.infer<typeof insertPortalActivityLogSchema>;

// Traffic fines. Lam Groep pays the authority and recharges the customer plus
// an administration fee; attribution to reservation + driver happens through
// reservation_driver_assignments (see server/services/fine-attribution.ts).
export const fines = pgTable("fines", {
  id: serial("id").primaryKey(),
  licensePlate: text("license_plate").notNull(),
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
  offenceAt: timestamp("offence_at", { withTimezone: true }).notNull(),
  receivedAt: text("received_at"),
  reference: text("reference"),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  adminFee: numeric("admin_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  letterFilePath: text("letter_file_path"),
  status: text("status").notNull().default("new"),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  reservationId: integer("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
  driverId: integer("driver_id").references(() => drivers.id, { onDelete: "set null" }),
  linkedAt: timestamp("linked_at", { withTimezone: true }),
  linkedBy: text("linked_by"),
  chargedAt: timestamp("charged_at", { withTimezone: true }),
  invoiceReference: text("invoice_reference"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  internalNotes: text("internal_notes"),
  customerNote: text("customer_note"),
  /** manual | scan | cjib; null = manual (rows from before the import feature) */
  source: text("source"),
  importFileId: integer("import_file_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
}, (table) => ({
  plateOffenceIdx: index("fines_plate_offence_idx").on(table.licensePlate, table.offenceAt),
  customerStatusIdx: index("fines_customer_status_idx").on(table.customerId, table.status),
}));

// Staff input; the server computes totalAmount, normalises the plate and sets the letter path.
// One received/uploaded CJIB file and what the import made of it.
export const fineImportFiles = pgTable("fine_import_files", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  fileName: text("file_name").notNull(),
  fileHash: text("file_hash").notNull().unique(),
  rawPath: text("raw_path"),
  status: text("status").notNull().default("processed"),
  recordsTotal: integer("records_total").notNull().default(0),
  recordsCreated: integer("records_created").notNull().default(0),
  recordsLinked: integer("records_linked").notNull().default(0),
  recordsDuplicate: integer("records_duplicate").notNull().default(0),
  recordsFailed: integer("records_failed").notNull().default(0),
  errorMessage: text("error_message"),
  details: jsonb("details").$type<FineImportDetail[]>().notNull().default([]),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdBy: text("created_by"),
});
export interface FineImportDetail { reference: string | null; licensePlate: string | null; fineId?: number; outcome: 'created' | 'linked' | 'duplicate' | 'failed'; error?: string }
export type FineImportFile = typeof fineImportFiles.$inferSelect;

export const insertFineSchema = z.object({
  licensePlate: z.string().trim().min(4).max(12),
  offenceAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reference: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().min(1).max(500),
  amount: z.coerce.number().min(0),
  adminFee: z.coerce.number().min(0).default(0),
  internalNotes: z.string().max(2000).nullable().optional(),
  customerNote: z.string().max(1000).nullable().optional(),
});
export type Fine = typeof fines.$inferSelect;
export type InsertFine = z.infer<typeof insertFineSchema>;

// Typed requests from the portal (extension, early return, damage, fine question, other).
export const portalRequests = pgTable("portal_requests", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  portalUserId: integer("portal_user_id").references(() => portalUsers.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  reservationId: integer("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
  fineId: integer("fine_id").references(() => fines.id, { onDelete: "set null" }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"),
  staffReply: text("staff_reply"),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  repliedBy: text("replied_by"),
  handledBy: text("handled_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  customerCreatedIdx: index("portal_requests_customer_created_idx").on(table.customerId, table.createdAt),
  statusIdx: index("portal_requests_status_idx").on(table.status),
}));
export type PortalRequest = typeof portalRequests.$inferSelect;
export type InsertPortalRequest = typeof portalRequests.$inferInsert;

export const portalRequestAttachments = pgTable("portal_request_attachments", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => portalRequests.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  contentType: text("content_type").notNull(),
  fileSize: integer("file_size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type PortalRequestAttachment = typeof portalRequestAttachments.$inferSelect;

export interface PortalKnownDevice { id: string; ua: string; firstSeen: string; lastSeen: string }

/** Back-and-forth on a request: the customer and staff each add messages. */
export const portalRequestMessages = pgTable("portal_request_messages", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => portalRequests.id, { onDelete: "cascade" }),
  author: text("author").notNull(), // 'customer' | 'staff'
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({ requestIdx: index("portal_request_messages_request_idx").on(table.requestId) }));
export type PortalRequestMessage = typeof portalRequestMessages.$inferSelect;

/** What the customer sees under the bell in the portal. portalUserId null = every account of the customer. */
export const portalNotifications = pgTable("portal_notifications", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  portalUserId: integer("portal_user_id").references(() => portalUsers.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  link: text("link"),
  dedupeTag: text("dedupe_tag"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({ customerIdx: index("portal_notifications_customer_idx").on(table.customerId, table.createdAt) }));
export type PortalNotification = typeof portalNotifications.$inferSelect;

/** "Gezien en akkoord" on a contract, by whom and when. */
export const portalDocumentAcks = pgTable("portal_document_acks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  portalUserId: integer("portal_user_id").references(() => portalUsers.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  ip: text("ip"),
  ackedAt: timestamp("acked_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({ documentIdx: uniqueIndex("portal_document_acks_document_idx").on(table.documentId) }));
export type PortalDocumentAck = typeof portalDocumentAcks.$inferSelect;

// Reservations table
export const reservations = pgTable("reservations", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id"), // Made nullable to support placeholder spare vehicles
  customerId: integer("customer_id"), // Allow null for maintenance blocks
  driverId: integer("driver_id").references(() => drivers.id, { onDelete: "set null" }), // Link to specific driver (nullable for backward compatibility)
  startDate: text("start_date").notNull(), // Immutable booking/scheduled start date
  endDate: text("end_date"), // Allow null for open-ended rentals
  startTime: text("start_time"), // Optional scheduled pickup time, "HH:MM" 24h. Lets same-day
  // turnovers (see checkReservationConflicts) tell an early pickup from a late one instead of
  // treating every same-day touch as fine by default.
  endTime: text("end_time"), // Optional scheduled return time, "HH:MM" 24h — same as above.
  actualPickupDate: text("actual_pickup_date"), // Date when vehicle was actually picked up
  actualReturnDate: text("actual_return_date"), // Date when vehicle was actually returned
  completionDate: text("completion_date"), // Date when vehicle was actually returned (for backlog/future tracking)
  status: text("status").default("booked").notNull(), // 'booked', 'picked_up', 'returned', 'completed'
  totalPrice: numeric("total_price"),
  notes: text("notes"),
  damageCheckPath: text("damage_check_path"),
  contractNumber: text("contract_number").unique(), // Nullable - assigned during pickup, not creation
  
  // Spare vehicle management
  type: text("type").default("standard").notNull(), // 'standard' | 'replacement' | 'maintenance_block'
  replacementForReservationId: integer("replacement_for_reservation_id"), // FK to reservations.id for replacement reservations
  // FK to vehicle_transports.id (enforced at the DB level via the migration, not
  // through Drizzle's .references() here — that would create a circular type
  // reference with vehicleTransports.spareReservationId's FK back to this table,
  // which already points the other way) — set instead of replacementForReservationId
  // when this spare reservation was created from a standalone Transport
  // (swap/tow/etc.) rather than a customer rental.
  replacementForTransportId: integer("replacement_for_transport_id"),
  placeholderSpare: boolean("placeholder_spare").default(false).notNull(), // True when vehicleId is null and spare vehicle assignment is pending
  // FIX-V (BUG-118, BUG-014) — which maintenance block this replacement was
  // created for. Until this column existed, a spare was attached to its parent
  // *rental* only, so the block-delete cascade had to guess by date overlap and
  // happily wiped the spares of a different, still-live block on the same
  // vehicle. Nullable and additive: rows written before this are matched by the
  // old rule as a fallback.
  maintenanceBlockId: integer("maintenance_block_id"),
  spareVehicleStatus: text("spare_vehicle_status").default("assigned"), // 'assigned', 'ready', 'picked_up', 'returned'
  
  // Maintenance-specific fields
  maintenanceDuration: integer("maintenance_duration"), // Duration in days for maintenance_block type
  maintenanceStatus: text("maintenance_status"), // 'scheduled' | 'in' | 'out' for maintenance_block type
  maintenanceCategory: text("maintenance_category"), // 'scheduled_maintenance' | 'repair' to distinguish service types
  spareAssignmentDecision: text("spare_assignment_decision"), // 'spare_assigned' | 'customer_arranging' | 'not_handled' for maintenance tracking
  affectedRentalId: integer("affected_rental_id"), // FK to the rental that's affected by this maintenance
  portalRequestId: integer("portal_request_id"), // Set on a maintenance block created from a customer portal request

  // Mileage Tracking
  pickupMileage: integer("pickup_mileage"), // Odometer reading when vehicle was picked up
  returnMileage: integer("return_mileage"), // Odometer reading when vehicle was returned
  
  // Fuel Management
  fuelLevelPickup: text("fuel_level_pickup"), // Fuel level at pickup ('empty', '1/4', '1/2', '3/4', 'full')
  fuelLevelReturn: text("fuel_level_return"), // Fuel level at return
  fuelCost: numeric("fuel_cost"), // Calculated fuel cost
  fuelCardNumber: text("fuel_card_number"), // Associated fuel card
  fuelNotes: text("fuel_notes"), // Additional fuel-related notes
  
  // Recurring Rental Support
  isRecurring: boolean("is_recurring").default(false).notNull(), // Is this a recurring rental
  recurringParentId: integer("recurring_parent_id"), // FK to parent recurring reservation
  recurringFrequency: text("recurring_frequency"), // 'daily', 'weekly', 'monthly'
  recurringEndDate: text("recurring_end_date"), // When recurring pattern ends
  recurringDayOfWeek: integer("recurring_day_of_week"), // For weekly: 0-6 (Sunday-Saturday)
  recurringDayOfMonth: integer("recurring_day_of_month"), // For monthly: 1-31
  
  // Delivery Service
  deliveryRequired: boolean("delivery_required").default(false).notNull(), // Does customer need delivery
  deliveryAddress: text("delivery_address"), // Full delivery address
  deliveryCity: text("delivery_city"),
  deliveryPostalCode: text("delivery_postal_code"),
  deliveryFee: numeric("delivery_fee"), // Fee charged for delivery
  deliveryStatus: text("delivery_status"), // 'pending' | 'scheduled' | 'en_route' | 'delivered' | 'completed'
  deliveryStaffId: integer("delivery_staff_id").references(() => users.id), // Staff assigned to delivery
  deliveryNotes: text("delivery_notes"), // Special delivery instructions
  
  // Tracking
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdByUser: integer("created_by_user_id").references(() => users.id),
  updatedByUser: integer("updated_by_user_id").references(() => users.id),
  
  // Soft delete tracking
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by"),
  deletedByUser: integer("deleted_by_user_id").references(() => users.id),
}, (table) => ({
  vehicleIdIdx: index("reservations_vehicle_id_idx").on(table.vehicleId),
  customerIdIdx: index("reservations_customer_id_idx").on(table.customerId),
  statusIdx: index("reservations_status_idx").on(table.status),
  startDateIdx: index("reservations_start_date_idx").on(table.startDate),
  endDateIdx: index("reservations_end_date_idx").on(table.endDate),
  deletedAtIdx: index("reservations_deleted_at_idx").on(table.deletedAt),
  statusStartDateIdx: index("reservations_status_start_date_idx").on(table.status, table.startDate),
}));


/**
 * BUG-054 — a money amount: a real number, not negative, and inside something a
 * `numeric` column and a human can both live with. An empty field clears it.
 */
export const priceSchema = z
  .union([
    z.null(),
    z.number(),
    z.string().transform((val, ctx) => {
      if (val.trim() === "") return null;
      const num = Number(val);
      if (Number.isNaN(num)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "That is not an amount" });
        return z.NEVER;
      }
      return num;
    }),
  ])
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 10_000_000), {
    message: "The amount must be between 0 and 10000000",
  })
  .optional();

// Base schema that can be extended by frontend forms
export const insertReservationSchemaBase = createInsertSchema(reservations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdByUser: true,
  updatedByUser: true,
  deletedAt: true,
  deletedBy: true,
  deletedByUser: true,
})
.extend({
  // BUG-054 — this had no bounds at all, and non-numeric input silently became
  // `undefined`: typing "abc" as a price saved the reservation with no price and
  // told nobody. Out of range or unparseable is now a 400 naming the field.
  // BUG-202: the edit form posts every column, and an empty price arrives as ""
  // which the generic coercion turns into null. Clearing a price is legal.
  totalPrice: priceSchema,
  startDate: ymdDateSchema, // BUG-111: a text column, but only ever a real yyyy-MM-dd date
  endDate: ymdDateSchema.optional().or(z.null()), // optional for open-ended rentals; still a real date
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM").optional().or(z.literal('')).or(z.null()),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM").optional().or(z.literal('')).or(z.null()),
  type: z.enum(["standard", "replacement", "maintenance_block"]).optional(),
  replacementForReservationId: z.number().optional().or(z.null()), // Allow null
  replacementForTransportId: z.number().optional().or(z.null()), // Allow null
  customerId: z.number().optional().or(z.null()), // Make customerId optional for maintenance blocks
  vehicleId: z.number().optional().or(z.null()), // Allow null for placeholder spare vehicles
  placeholderSpare: z.boolean().optional().default(false), // Default to false for normal reservations
  affectedRentalId: z.number().optional().or(z.null()), // Allow null
  maintenanceDuration: z.number().optional().or(z.null()), // Allow null
  // BUG-052: the generic PATCH wrote this column with no enum check at all.
  maintenanceStatus: z.enum(["scheduled", "in", "out"]).optional().or(z.null()),
  maintenanceCategory: z.string().optional().or(z.null()), // Allow null
  spareAssignmentDecision: z.string().optional().or(z.null()), // Allow null
  contractNumber: z.string().optional().or(z.null()), // Contract number is assigned during pickup, not creation
});

// Fully validated schema with business rules for server-side use
export const insertReservationSchema = insertReservationSchemaBase
.refine((data) => {
  const type = data.type ?? 'standard'; // Handle default type
  const noVehicle = data.vehicleId == null; // Handles both null and undefined
  
  // If placeholderSpare is true, then vehicleId must be null/undefined, type must be 'replacement', and either replacementForReservationId (customer rental) or replacementForTransportId (standalone transport) must be present
  if (data.placeholderSpare === true) {
    return noVehicle &&
           type === 'replacement' &&
           (data.replacementForReservationId != null || data.replacementForTransportId != null);
  }
  return true;
}, {
  message: "Placeholder spare reservations must have no vehicleId, type 'replacement', and a replacementForReservationId or replacementForTransportId",
  path: ["placeholderSpare"]
})
.refine((data) => {
  const noVehicle = data.vehicleId == null; // Handles both null and undefined
  
  // If vehicleId is null/undefined, then placeholderSpare must be true
  if (noVehicle) {
    return data.placeholderSpare === true;
  }
  return true;
}, {
  message: "Reservations with no vehicleId must be placeholder spare reservations",
  path: ["vehicleId"]
})
.refine((data) => {
  const type = data.type ?? 'standard'; // Handle default type
  const noVehicle = data.vehicleId == null; // Handles both null and undefined
  
  // If type is 'maintenance_block', then vehicleId must be present
  if (type === 'maintenance_block') {
    return !noVehicle;
  }
  return true;
}, {
  message: "Maintenance block reservations must have a vehicleId",
  path: ["type"]
})
.refine((data) => {
  const type = data.type ?? 'standard'; // Handle default type
  
  // All replacement reservations (placeholder or not) must have replacementForReservationId or replacementForTransportId
  if (type === 'replacement') {
    return data.replacementForReservationId != null || data.replacementForTransportId != null;
  }
  return true;
}, {
  message: "Replacement reservations must have a replacementForReservationId or replacementForTransportId",
  path: ["type"]
})
.refine((data) => {
  const noVehicle = data.vehicleId == null; // Handles both null and undefined
  
  // Non-placeholder reservations must have a vehicleId
  if (data.placeholderSpare !== true) {
    return !noVehicle;
  }
  return true;
}, {
  message: "Non-placeholder reservations must have a vehicleId",
  path: ["vehicleId"]
})
.refine((data) => {
  // Date validation: endDate must be >= startDate (when endDate is provided)
  if (data.endDate && data.startDate) {
    return data.endDate >= data.startDate;
  }
  return true; // Open-ended rentals (no endDate) are valid
}, {
  message: "End date must be on or after start date",
  path: ["endDate"]
});

// ============= MILEAGE & FUEL VALIDATION HELPERS =============

// Validates that mileage is non-negative
export const mileageSchema = z.coerce.number().min(0, "Mileage cannot be negative").optional().or(z.null());

// Validates that fuel level is between 0 and 100 (percentage) or valid fuel amount
export const fuelLevelSchema = z.coerce.number().min(0, "Fuel level cannot be negative").optional().or(z.null());

// Validates that fuel cost is non-negative
export const fuelCostSchema = z.coerce.number().min(0, "Fuel cost cannot be negative").optional().or(z.null());

// Pickup validation schema
export const pickupValidationSchema = z.object({
  contractNumber: z.string().min(1, "Contract number is required for pickup"),
  pickupMileage: z.coerce.number().min(0, "Mileage cannot be negative"),
  pickupFuelLevel: z.coerce.number().min(0, "Fuel level cannot be negative").optional(),
});

// Return validation schema with mileage comparison
export const returnValidationSchema = z.object({
  returnMileage: z.coerce.number().min(0, "Mileage cannot be negative"),
  pickupMileage: z.coerce.number().optional(), // For comparison
  returnFuelLevel: z.coerce.number().min(0, "Fuel level cannot be negative").optional(),
  fuelCost: z.coerce.number().min(0, "Fuel cost cannot be negative").optional(),
}).refine((data) => {
  // Return mileage must be >= pickup mileage (when both are provided)
  if (data.returnMileage !== undefined && data.pickupMileage !== undefined) {
    return data.returnMileage >= data.pickupMileage;
  }
  return true;
}, {
  message: "Return mileage cannot be less than pickup mileage",
  path: ["returnMileage"]
});

// ============= PLACEHOLDER SPARE VEHICLE SCHEMAS =============

// Schema for creating placeholder reservations
export const createPlaceholderReservationSchema = z.object({
  originalReservationId: z.coerce.number().int().positive(),
  customerId: z.coerce.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").optional()
}).refine((data) => {
  if (data.endDate) {
    return data.startDate <= data.endDate;
  }
  return true;
}, {
  message: "End date must be on or after start date",
  path: ["endDate"]
});

// Schema for querying placeholder reservations
export const placeholderQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").optional()
}).refine((data) => {
  if (data.startDate && data.endDate) {
    return data.startDate <= data.endDate;
  }
  return true;
}, {
  message: "End date must be on or after start date",
  path: ["endDate"]
});

// Schema for querying placeholders needing assignment
export const placeholderNeedingAssignmentQuerySchema = z.object({
  daysAhead: z.coerce.number().int().min(1).max(365).default(7)
});

// Schema for assigning vehicles to placeholders
export const assignVehicleToPlaceholderSchema = z.object({
  vehicleId: z.coerce.number().int().positive(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").optional()
});

// ============= END PLACEHOLDER SCHEMAS =============

// Expenses table
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull(),
  category: text("category").notNull(),
  amount: numeric("amount").notNull(),
  date: text("date").notNull(),
  description: text("description"),
  receiptUrl: text("receipt_url"),
  receiptFile: text("receipt_file"), // Stores the file name
  receiptFilePath: text("receipt_file_path"), // Stores the path to the file
  receiptFileSize: integer("receipt_file_size"), // Stores the file size
  receiptContentType: text("receipt_content_type"), // Stores the file content type
  // Invoices by e-mail: the inbox item this expense was booked from. Set by
  // the server only (see the omit list below); null for hand-typed expenses.
  inboxItemId: integer("inbox_item_id").references((): AnyPgColumn => invoiceInboxItems.id, { onDelete: "set null" }),

  // Tracking
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdByUser: integer("created_by_user_id").references(() => users.id),
  updatedByUser: integer("updated_by_user_id").references(() => users.id),
}, (table) => ({
  vehicleIdIdx: index("expenses_vehicle_id_idx").on(table.vehicleId),
  createdAtIdx: index("expenses_created_at_idx").on(table.createdAt),
  dateIdx: index("expenses_date_idx").on(table.date),
}));

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdByUser: true,
  updatedByUser: true,
  // BUG-060: these describe a file the server wrote and are set from
  // req.file after the upload. Leaving them in the insert schema let a request
  // body point receiptFilePath at any file in the container
  // (/proc/self/environ was read this way during the audit).
  // receiptUrl stays: it is a link the user types in the expense form, not a
  // path the server ever opens.
  receiptFile: true,
  receiptFilePath: true,
  receiptFileSize: true,
  receiptContentType: true,
  // Server-set, like the receipt fields: a request body may not attach an
  // expense to an inbox item of its choosing.
  inboxItemId: true,
}).extend({
  amount: z.union([
    z.number(),
    z.string().transform(val => parseFloat(val) || 0)
  ]).refine(val => val > 0 && val <= 1000000, {
    message: "Amount must be greater than 0 and no more than €1,000,000",
  }),
  receiptPath: z.string().nullable().optional(),
  // FIX-R (BUG-072): this is a link an employee types in and another employee
  // later opens with window.open(). `javascript:alert(1)` stored here executed
  // in the application's own origin. The client refuses to open an unsafe one;
  // this refuses to store it.
  //
  // besluiten B-20: and a local or network path is refused in its own right,
  // with its own Dutch sentence. FIX-R's rule already turned `C:\scans\bon.pdf`
  // away, but with a message about allowed schemes — which does not tell the
  // employee that the problem is that their D-drive is not the office's.
  // Checked first, so the more specific answer wins.
  //
  // This lives on the write schema, which is what both the expense form and
  // every /api/expenses route parse, so the API refuses it too. Rows that
  // already carry such a path are not touched: the rule is about what may be
  // stored from now on.
  receiptUrl: z
    .string()
    .max(2048)
    .superRefine((value, ctx) => {
      if (value === "") return;
      if (isLocalOrNetworkPath(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: LOCAL_PATH_MESSAGE });
        return;
      }
      if (!isSafeHttpUrl(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: SAFE_URL_MESSAGE });
      }
    })
    .nullable()
    .optional(),
});

// Invoices by e-mail (docs/superpowers/specs/2026-09-18-invoice-inbox-design.md):
// one row per attachment the inbox has seen, or per manual scan that was booked.
export const invoiceInboxItems = pgTable("invoice_inbox_items", {
  id: serial("id").primaryKey(),
  messageId: text("message_id"),
  fromAddress: text("from_address"),
  subject: text("subject"),
  mailDate: timestamp("mail_date", { withTimezone: true }),
  attachmentName: text("attachment_name"),
  attachmentPath: text("attachment_path"),
  // sha256 of the attachment bytes: an attachment is processed once.
  attachmentHash: text("attachment_hash").notNull().unique(),
  attachmentContentType: text("attachment_content_type"),
  // sha256 of vendor|number|date|total; null when the invoice has no number.
  invoiceHash: text("invoice_hash"),
  parsed: jsonb("parsed").$type<InboxParsedInvoice | null>(),
  status: text("status").notNull().default("review"), // 'booked' | 'review' | 'dismissed'
  reviewReason: text("review_reason"),
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
  expenseIds: integer("expense_ids").array().notNull().default(sql`'{}'::integer[]`),
  errorMessage: text("error_message"),
  note: text("note"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
}, (table) => ({
  messageIdIdx: index("invoice_inbox_items_message_id_idx").on(table.messageId),
  invoiceHashIdx: index("invoice_inbox_items_invoice_hash_idx").on(table.invoiceHash),
  statusIdx: index("invoice_inbox_items_status_idx").on(table.status, table.receivedAt),
}));
export type InvoiceInboxItem = typeof invoiceInboxItems.$inferSelect;

// Documents table
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id"), // Nullable: general reports (e.g. multi-vehicle transport summaries) aren't tied to one vehicle
  reservationId: integer("reservation_id"), // Optional link to specific reservation
  documentType: text("document_type").notNull(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  contentType: text("content_type").notNull(),
  uploadDate: timestamp("upload_date", { withTimezone: true }).defaultNow().notNull(),
  notes: text("notes"),

  // B-05 / FIX-O: the version number lives in its own column instead of being
  // appended to `document_type` ("Contract (Unsigned) 3"), which made every
  // consumer parse a label with a regex and made "all unsigned contracts for
  // this reservation" a prefix match.
  version: integer("version").default(1),
  // B-05: a document that no longer matches its reservation is kept and
  // marked "verouderd"; the employee regenerates a new version deliberately.
  isStale: boolean("is_stale").default(false),
  staleReason: text("stale_reason"),
  staleSince: timestamp("stale_since", { withTimezone: true }),

  // Tracking
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdByUser: integer("created_by_user_id").references(() => users.id),
  updatedByUser: integer("updated_by_user_id").references(() => users.id),
}, (table) => ({
  vehicleIdIdx: index("documents_vehicle_id_idx").on(table.vehicleId),
  reservationIdIdx: index("documents_reservation_id_idx").on(table.reservationId),
}));

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadDate: true,
});

// Define types for each model
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Reservation = typeof reservations.$inferSelect & {
  vehicle?: Vehicle;
  customer?: Customer;
  driver?: Driver;
};
export type InsertReservation = z.infer<typeof insertReservationSchema>;

export type Expense = typeof expenses.$inferSelect & {
  vehicle?: Vehicle;
};
export type InsertExpense = z.infer<typeof insertExpenseSchema>;

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

// PDF Templates table
export const pdfTemplates = pgTable("pdf_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").default(false),
  backgroundPath: text("background_path"), // Custom background PDF/image path (null = use default)
  backgroundPreviewPath: text("background_preview_path"), // Preview image for editor (PNG converted from PDF)
  templatePreviewPath: text("template_preview_path"), // Preview thumbnail of the complete template for library display
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  fields: jsonb("fields").default([])
});

// BUG-194 — `name: ""` was accepted on all three template families, so the
// picker showed a blank row nobody could tell apart. The column is NOT NULL
// but says nothing about emptiness, which is what createInsertSchema derives
// from.
const templateNameField = z.string().trim().min(1, "Template name is required").max(200);

// BUG-194 — `labelWidthMm: -5` and `labelHeightMm: 0` were stored verbatim
// and every sheet printed from that template came out empty.
const labelMillimetreField = z.coerce
  .number()
  .int("Label size must be a whole number of millimetres")
  .min(1, "Label size must be at least 1 mm")
  .max(1000, "Label size must be at most 1000 mm");
export const insertPdfTemplateSchema = createInsertSchema(pdfTemplates)
  .omit({ id: true })
  .extend({ name: templateNameField });

export type PdfTemplate = typeof pdfTemplates.$inferSelect;
export type InsertPdfTemplate = z.infer<typeof insertPdfTemplateSchema>;

// Template Backgrounds table - per-template background library
export const templateBackgrounds = pgTable("template_backgrounds", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => pdfTemplates.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // User-friendly label for the background
  backgroundPath: text("background_path").notNull(), // Path to PDF file
  previewPath: text("preview_path").notNull(), // Path to PNG preview
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTemplateBackgroundSchema = createInsertSchema(templateBackgrounds)
  .omit({ id: true, createdAt: true });

export type TemplateBackground = typeof templateBackgrounds.$inferSelect;
export type InsertTemplateBackground = z.infer<typeof insertTemplateBackgroundSchema>;

// Transport Report Templates — same drag-position-fields-on-a-page model as
// pdfTemplates/templateBackgrounds above, but a separate table so the driver-
// facing transport report editor can't collide with or risk the live contract
// template system. One page per transport when generated.
export const transportReportTemplates = pgTable("transport_report_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").default(false),
  backgroundPath: text("background_path"),
  backgroundPreviewPath: text("background_preview_path"),
  templatePreviewPath: text("template_preview_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  fields: jsonb("fields").default([])
});

export const insertTransportReportTemplateSchema = createInsertSchema(transportReportTemplates)
  .omit({ id: true })
  .extend({ name: templateNameField });

export type TransportReportTemplate = typeof transportReportTemplates.$inferSelect;
export type InsertTransportReportTemplate = z.infer<typeof insertTransportReportTemplateSchema>;

export const transportReportTemplateBackgrounds = pgTable("transport_report_template_backgrounds", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => transportReportTemplates.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  backgroundPath: text("background_path").notNull(),
  previewPath: text("preview_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTransportReportTemplateBackgroundSchema = createInsertSchema(transportReportTemplateBackgrounds)
  .omit({ id: true, createdAt: true });

export type TransportReportTemplateBackground = typeof transportReportTemplateBackgrounds.$inferSelect;
export type InsertTransportReportTemplateBackground = z.infer<typeof insertTransportReportTemplateBackgroundSchema>;

// Barcode label templates — same clone-per-domain template-editor pattern as
// transportReportTemplates above (see that comment), adapted for key-label
// stickers: a small mm-sized canvas instead of A4, no background library, and
// fields may include a positioned Code 128 barcode. x/y in fields are mm.
export const barcodeLabelTemplates = pgTable("barcode_label_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").default(false),
  labelWidthMm: integer("label_width_mm").default(62).notNull(),
  labelHeightMm: integer("label_height_mm").default(29).notNull(),
  fields: jsonb("fields").default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const insertBarcodeLabelTemplateSchema = createInsertSchema(barcodeLabelTemplates)
  .omit({ id: true })
  .extend({
    name: templateNameField,
    labelWidthMm: labelMillimetreField,
    labelHeightMm: labelMillimetreField,
  });

export type BarcodeLabelTemplate = typeof barcodeLabelTemplates.$inferSelect;
export type InsertBarcodeLabelTemplate = z.infer<typeof insertBarcodeLabelTemplateSchema>;

// Scan event history — one row per barcode lookup (GET /api/barcodes/:code),
// win or miss, so a "recent scans" list can show what got scanned and
// whether it resolved to a vehicle, reservation, or spare key.
export const scanEvents = pgTable("scan_events", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  matchType: text("match_type").notNull(), // 'vehicle' | 'reservation' | 'spare_key' | 'none'
  vehicleId: integer("vehicle_id"),
  reservationId: integer("reservation_id"),
  licensePlate: text("license_plate"),
  scannedBy: text("scanned_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertScanEventSchema = createInsertSchema(scanEvents)
  .omit({ id: true, createdAt: true });

export type ScanEvent = typeof scanEvents.$inferSelect;
export type InsertScanEvent = z.infer<typeof insertScanEventSchema>;

// Custom Notifications table
export const customNotifications = pgTable("custom_notifications", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  date: text("date").notNull(),
  type: text("type").default("custom").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  link: text("link").default(""),
  icon: text("icon").default("Bell"),
  priority: text("priority").default("normal"),
  userId: integer("user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCustomNotificationSchema = createInsertSchema(customNotifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CustomNotification = typeof customNotifications.$inferSelect;
export type InsertCustomNotification = z.infer<typeof insertCustomNotificationSchema>;

// Email Templates table
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull().default("custom"), // 'apk', 'maintenance', 'custom'
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
  lastUsed: text("last_used"),
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates)
  .omit({ id: true, createdAt: true, updatedAt: true, lastUsed: true });

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;

// Email Logs table
export const emailLogs = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  template: text("template").notNull(), // 'apk', 'maintenance', 'custom'
  subject: text("subject").notNull(),
  recipients: integer("recipients").notNull(),
  emailsSent: integer("emails_sent").notNull().default(0),
  emailsFailed: integer("emails_failed").notNull().default(0),
  failureReason: text("failure_reason"),
  vehicleIds: jsonb("vehicle_ids").$type<number[]>().default([]).notNull(),
  sentAt: text("sent_at").notNull(),
  // FIX-M (BUG-155, BUG-185): every single send attempt writes its own row, so
  // "did this customer get the contract" has an answer and a bulk run that
  // dies halfway still leaves a trail. Nullable, because the pre-existing rows
  // are per-run summaries that have neither.
  recipient: text("recipient"),
  result: text("result"), // 'sent' | 'failed'
  // OPT-013: which document this attempt carried, so "heeft de klant het
  // contract gekregen?" has an answer *on the document* and not only in a flat
  // log nobody opens. Nullable: most mail (APK reminders, portal notices)
  // carries no document at all.
  documentId: integer("document_id"),
});

export const insertEmailLogSchema = createInsertSchema(emailLogs)
  .omit({ id: true });

export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;

// RDW APK date changes - detected by the background scan that compares each
// vehicle's stored APK expiry date against the RDW open data API. Stays
// 'pending' until a user confirms (applies newApkDate to the vehicle) or
// dismisses (keeps the vehicle's current date) it, so re-scans don't create
// duplicate rows for a discrepancy that's already been surfaced.
export const apkDateChanges = pgTable("apk_date_changes", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  previousApkDate: text("previous_apk_date"),
  newApkDate: text("new_apk_date").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'confirmed' | 'dismissed'
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: text("resolved_by"),
});

export const insertApkDateChangeSchema = createInsertSchema(apkDateChanges).omit({
  id: true,
  detectedAt: true,
});

export type ApkDateChange = typeof apkDateChanges.$inferSelect;
export type InsertApkDateChange = z.infer<typeof insertApkDateChangeSchema>;

// Backup Settings table
export const backupSettings = pgTable("backup_settings", {
  id: serial("id").primaryKey(),
  storageType: text("storage_type").notNull().default("object_storage"), // 'object_storage', 'local_filesystem'
  localPath: text("local_path"), // Path for local filesystem backups
  enableAutoBackup: boolean("enable_auto_backup").notNull().default(true),
  backupSchedule: text("backup_schedule").notNull().default("0 2 * * *"), // Cron expression
  retentionDays: integer("retention_days").notNull().default(30),
  settings: jsonb("settings").$type<Record<string, any>>().default({}).notNull(), // Additional settings
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});

export const insertBackupSettingsSchema = createInsertSchema(backupSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BackupSettings = typeof backupSettings.$inferSelect;
export type InsertBackupSettings = z.infer<typeof insertBackupSettingsSchema>;

// Backup run history. This replaces the previous /tmp/backup-status.json,
// which was wiped on every container restart — taking the record of both
// successes and failures with it, so the UI reported "Never" while backups
// sat on disk and failures left no trace.
export const backupRuns = pgTable("backup_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  type: text("type").notNull(), // 'database' | 'files'
  status: text("status").notNull(), // 'running' | 'success' | 'failed'
  filename: text("filename"),
  sizeBytes: integer("size_bytes"),
  checksum: text("checksum"),
  verified: boolean("verified").default(false).notNull(),
  filePruned: boolean("file_pruned").default(false).notNull(),
  error: text("error"),
  trigger: text("trigger").notNull(), // 'scheduled' | 'manual' | 'catchup' | 'pre-restore'
});

export const insertBackupRunSchema = createInsertSchema(backupRuns).omit({
  id: true,
});

export type BackupRun = typeof backupRuns.$inferSelect;
export type InsertBackupRun = z.infer<typeof insertBackupRunSchema>;

// App Settings table - for general application settings
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // Setting identifier (e.g., 'email_config', 'smtp_config')
  value: jsonb("value").$type<Record<string, any>>().default({}).notNull(), // Setting value as JSON
  category: text("category").notNull().default("general"), // 'email', 'general', 'notifications', etc.
  description: text("description"), // Human-readable description
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});

export const insertAppSettingsSchema = createInsertSchema(appSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AppSettings = typeof appSettings.$inferSelect;
export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;

// ---------------------------------------------------------------------------
// Damage check field schema (editable from admin settings page)
// ---------------------------------------------------------------------------
// Stored as a single row in app_settings keyed `damage_check_fields`.
// Used by: interactive damage check UI, template editor default layout,
// and the PDF renderer's auto-fill map.

export const checklistFieldDefSchema = z.object({
  key: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "key must be camelCase / snake_case"),
  label: z.string().min(1),
  inputType: z.enum(["select", "checkbox"]),
  options: z.array(z.string()).default([]),
});

export const checklistGroupDefSchema = z.object({
  id: z.enum(["interior", "exterior", "delivery"]),
  label: z.string().min(1),
  fields: z.array(checklistFieldDefSchema),
});

export const damageCheckFieldsConfigSchema = z.object({
  groups: z.array(checklistGroupDefSchema),
  headerImagePath: z.string().nullable().optional(),
});

export type ChecklistFieldDef = z.infer<typeof checklistFieldDefSchema>;
export type ChecklistGroupDef = z.infer<typeof checklistGroupDefSchema>;
export type DamageCheckFieldsConfig = z.infer<typeof damageCheckFieldsConfigSchema>;

export const DAMAGE_CHECK_FIELDS_KEY = "damage_check_fields";

export const DEFAULT_DAMAGE_CHECK_FIELDS: DamageCheckFieldsConfig = {
  groups: [
    {
      id: "interior",
      label: "Interieur",
      // Matches LAM Groep paper "PRE RENTAL/SCHADE CHECK" exactly.
      fields: [
        { key: "carInterior", label: "Binnenzijde auto", inputType: "select", options: ["schoon", "vuil"] },
        { key: "windowDamage", label: "Ruitschade", inputType: "select", options: ["ja", "nee"] },
        { key: "upholstery", label: "Bekleding", inputType: "select", options: ["kapot", "heel", "brandgaten"] },
        { key: "ashtray", label: "Asbak", inputType: "select", options: ["schoon", "vuil"] },
        { key: "spareWheel", label: "Reservewiel", inputType: "select", options: ["goed", "geen", "lek"] },
        { key: "jack", label: "Krik", inputType: "select", options: ["ja", "nee"] },
        { key: "wheelBrace", label: "Wielsleutel", inputType: "select", options: ["ja", "nee"] },
        { key: "floorMats", label: "Matten", inputType: "select", options: ["ja", "nee"] },
        { key: "headrests", label: "Hoofdsteunen", inputType: "select", options: ["goed", "kapot"] },
      ],
    },
    {
      id: "exterior",
      label: "Exterieur",
      fields: [
        { key: "carExterior", label: "Buitenzijde auto", inputType: "select", options: ["vuil", "schoon"] },
        { key: "hubcaps", label: "Wieldoppen", inputType: "select", options: ["LV", "LA", "RV", "RA", "geen"] },
        { key: "licensePlates", label: "Kentekenplaten", inputType: "select", options: ["voor", "achter"] },
        { key: "mirrorCapsLeft", label: "Spiegelkap links", inputType: "select", options: ["kapot", "krassen", "goed"] },
        { key: "mirrorCapsRight", label: "Spiegelkap rechts", inputType: "select", options: ["kapot", "krassen", "goed"] },
        { key: "mirrorGlassLeftRight", label: "Spiegelglas L+R", inputType: "select", options: ["goed", "kapot"] },
        { key: "antenna", label: "Antenne", inputType: "select", options: ["goed", "kapot", "geen"] },
        { key: "wiperBlade", label: "Ruitenwisser", inputType: "select", options: ["goed", "kapot"] },
        { key: "doorCatchers", label: "Deurvangers", inputType: "select", options: ["goed", "kapot"] },
        { key: "slidingDoorBus", label: "Schuifdeur (bus)", inputType: "select", options: ["goed", "kapot", "slecht"] },
        { key: "indicatorSlots", label: "Werkende sloten", inputType: "select", options: ["ja", "nee"] },
        { key: "fogLights", label: "Mistlampen voor", inputType: "select", options: ["goed", "kapot", "geen"] },
      ],
    },
    {
      id: "delivery",
      label: "Aflever Check",
      fields: [
        { key: "oilWater", label: "Olie - water", inputType: "checkbox", options: [] },
        { key: "washerFluid", label: "Ruitenproeiervloeistof", inputType: "checkbox", options: [] },
        { key: "lighting", label: "Verlichting", inputType: "checkbox", options: [] },
        { key: "tireInflation", label: "Bandenspanning incl. reservewiel", inputType: "checkbox", options: [] },
        { key: "fanBelt", label: "Kachelfan", inputType: "checkbox", options: [] },
        { key: "engineBoard", label: "Hoedenplank", inputType: "checkbox", options: [] },
        { key: "jackKnife", label: "IJskrabber", inputType: "checkbox", options: [] },
        { key: "allDoorsOpen", label: "Gaan alle deuren open", inputType: "checkbox", options: [] },
        { key: "licensePlatePapers", label: "Kentekenpapieren", inputType: "checkbox", options: [] },
        { key: "validGreenCard", label: "Geldige groene kaart", inputType: "checkbox", options: [] },
        { key: "europeanDamageForm", label: "Europees schadeformulier", inputType: "checkbox", options: [] },
      ],
    },
  ],
};

// Vehicle Waitlist table - for tracking customers waiting for unavailable vehicles
export const vehicleWaitlist = pgTable("vehicle_waitlist", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  vehicleId: integer("vehicle_id").references(() => vehicles.id), // Specific vehicle or null for any of type
  vehicleType: text("vehicle_type"), // If waiting for any vehicle of a type
  preferredStartDate: text("preferred_start_date").notNull(),
  preferredEndDate: text("preferred_end_date"),
  duration: integer("duration"), // Duration in days
  priority: text("priority").default("normal").notNull(), // 'low', 'normal', 'high'
  status: text("status").default("active").notNull(), // 'active', 'contacted', 'fulfilled', 'cancelled'
  notes: text("notes"),
  contactedAt: timestamp("contacted_at", { withTimezone: true }),
  fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});

export const insertVehicleWaitlistSchema = createInsertSchema(vehicleWaitlist).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  contactedAt: true,
  fulfilledAt: true,
});

export type VehicleWaitlist = typeof vehicleWaitlist.$inferSelect & {
  customer?: Customer;
  vehicle?: Vehicle;
};
export type InsertVehicleWaitlist = z.infer<typeof insertVehicleWaitlistSchema>;

// ============= DELIVERY SERVICE FEATURE =============

// Delivery Tasks table - for tracking vehicle delivery and pickup
export const deliveryTasks = pgTable("delivery_tasks", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id").notNull().references(() => reservations.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'delivery' | 'pickup' | 'both'
  
  // Delivery details
  deliveryAddress: text("delivery_address").notNull(),
  deliveryCity: text("delivery_city"),
  deliveryPostalCode: text("delivery_postal_code"),
  deliveryLatitude: numeric("delivery_latitude"), // GPS coordinates for mapping
  deliveryLongitude: numeric("delivery_longitude"),
  
  // Pickup details (for return)
  pickupAddress: text("pickup_address"),
  pickupCity: text("pickup_city"),
  pickupPostalCode: text("pickup_postal_code"),
  pickupLatitude: numeric("pickup_latitude"),
  pickupLongitude: numeric("pickup_longitude"),
  
  // Scheduling
  scheduledDeliveryTime: timestamp("scheduled_delivery_time", { withTimezone: true }),
  scheduledPickupTime: timestamp("scheduled_pickup_time", { withTimezone: true }),
  estimatedDeliveryTime: timestamp("estimated_delivery_time", { withTimezone: true }),
  estimatedPickupTime: timestamp("estimated_pickup_time", { withTimezone: true }),
  
  // Status tracking
  status: text("status").default("scheduled").notNull(), // 'scheduled' | 'en_route_delivery' | 'delivered' | 'en_route_pickup' | 'completed' | 'cancelled'
  deliveryCompletedAt: timestamp("delivery_completed_at", { withTimezone: true }),
  pickupCompletedAt: timestamp("pickup_completed_at", { withTimezone: true }),
  
  // Staff assignment
  assignedStaffId: integer("assigned_staff_id").references(() => users.id),
  assignedStaffName: text("assigned_staff_name"),
  
  // Proof of delivery
  deliveryPhotoPath: text("delivery_photo_path"),
  deliverySignaturePath: text("delivery_signature_path"),
  deliveryMileage: integer("delivery_mileage"),
  pickupPhotoPath: text("pickup_photo_path"),
  pickupSignaturePath: text("pickup_signature_path"),
  pickupMileage: integer("pickup_mileage"),
  
  // Pricing
  deliveryFee: numeric("delivery_fee"),
  pickupFee: numeric("pickup_fee"),
  distanceKm: numeric("distance_km"),
  
  // Notes
  deliveryNotes: text("delivery_notes"),
  pickupNotes: text("pickup_notes"),
  customerInstructions: text("customer_instructions"),
  
  // Tracking
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});

export const insertDeliveryTaskSchema = createInsertSchema(deliveryTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DeliveryTask = typeof deliveryTasks.$inferSelect & {
  reservation?: Reservation;
  assignedStaff?: User;
};
export type InsertDeliveryTask = z.infer<typeof insertDeliveryTaskSchema>;

// ============= VEHICLE TRANSPORT FEATURE =============
// Standalone transport jobs that aren't a normal rental delivery: swapping a
// vehicle mid-rental, towing one in for service, or repossessing one. Unlike
// deliveryTasks above, a transport does NOT require a reservation — a
// repossession or breakdown tow often has none. Tracks distance and toll cost
// (Dutch per-km road toll) so the business knows what it paid, and separately
// whether/how much to bill the customer for the trip.
export const vehicleTransports = pgTable("vehicle_transports", {
  id: serial("id").primaryKey(),
  // Null when isExternalVehicle is true — an outside/customer-owned vehicle (e.g. a
  // garage pickup) that never enters the fleet, described instead by the
  // externalLicensePlate/externalBrand/externalModel/externalColor fields below.
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: "cascade" }),
  // Outside/customer-owned vehicle, not part of the fleet. When true, vehicleId stays
  // null and the fields below describe the vehicle instead. Everything else about the
  // transport (spare workflow, billing, etc.) works the same — the one exception is
  // that isBreakdownOrMaintenance never puts a vehicle into maintenance status here,
  // since there's no fleet vehicle to update.
  isExternalVehicle: boolean("is_external_vehicle").notNull().default(false),
  externalLicensePlate: text("external_license_plate"),
  externalBrand: text("external_brand"),
  externalModel: text("external_model"),
  externalColor: text("external_color"),
  externalOwnerName: text("external_owner_name"),
  externalOwnerPhone: text("external_owner_phone"),
  // The assigned replacement/spare vehicle for this transport's original `vehicleId`,
  // for any transport type (not just 'swap'). Null while spareRequired is true and no
  // vehicle has been picked yet (TBD) — see getTransportSpareStatus in
  // shared/transport-spare-status.ts, the single source of truth for the derived
  // Not Required / TBD / Assigned / Picked Up state.
  relatedVehicleId: integer("related_vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
  reservationId: integer("reservation_id").references(() => reservations.id, { onDelete: "set null" }), // optional link
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }), // who to bill, if billable

  // Spare/replacement-vehicle workflow (see shared/transport-spare-status.ts).
  spareRequired: boolean("spare_required").notNull().default(false),
  // The 'standard' reservation created for relatedVehicleId once it's assigned, so the
  // spare vehicle is blocked from double-booking via the existing conflict-check path.
  spareReservationId: integer("spare_reservation_id").references(() => reservations.id, { onDelete: "set null" }),

  transportType: text("transport_type").notNull(), // 'swap' | 'tow' | 'repossession' | 'delivery' | 'other'
  status: text("status").notNull().default("scheduled"), // 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

  originAddress: text("origin_address"),
  originCity: text("origin_city"),
  destinationAddress: text("destination_address"),
  destinationCity: text("destination_city"),
  distanceKm: numeric("distance_km"),

  // Cost we pay (e.g. road toll) vs. what we charge the customer — kept separate
  // since they're often different amounts, or the trip may not be billable at all.
  tollCost: numeric("toll_cost"),
  // A transport caused by a breakdown or scheduled maintenance is our own cost, not
  // the customer's — checking this defaults billable off. When spareRequired is also
  // set, assigning relatedVehicleId puts the original vehicle into maintenance status
  // (markVehicleForService) and completing/cancelling the transport restores it.
  isBreakdownOrMaintenance: boolean("is_breakdown_or_maintenance").notNull().default(false),
  billable: boolean("billable").notNull().default(false),
  billableAmount: numeric("billable_amount"),
  invoiced: boolean("invoiced").notNull().default(false),
  invoicedDate: text("invoiced_date"),

  scheduledDate: text("scheduled_date").notNull(),
  completedDate: text("completed_date"),
  driverName: text("driver_name"),
  reason: text("reason"),
  notes: text("notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdByUser: integer("created_by_user_id").references(() => users.id),
  updatedByUser: integer("updated_by_user_id").references(() => users.id),
}, (table) => ({
  vehicleIdIdx: index("vehicle_transports_vehicle_id_idx").on(table.vehicleId),
  statusIdx: index("vehicle_transports_status_idx").on(table.status),
}));

export const insertVehicleTransportSchema = createInsertSchema(vehicleTransports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdByUser: true,
  updatedByUser: true,
  // Server-managed: set by the spare-assignment transaction, never supplied
  // directly by the client.
  spareReservationId: true,
}).extend({
  distanceKm: z.union([z.number(), z.string().transform(v => v === '' ? null : parseFloat(v))]).nullish()
    .refine(v => v === null || v === undefined || v >= 0, { message: "Distance cannot be negative" }),
  tollCost: z.union([z.number(), z.string().transform(v => v === '' ? null : parseFloat(v))]).nullish()
    .refine(v => v === null || v === undefined || v >= 0, { message: "Toll cost cannot be negative" }),
  billableAmount: z.union([z.number(), z.string().transform(v => v === '' ? null : parseFloat(v))]).nullish()
    .refine(v => v === null || v === undefined || v >= 0, { message: "Billable amount cannot be negative" }),
  // Nullable for external vehicles (isExternalVehicle: true) — enforced as "one or the
  // other" in the POST /api/transports route instead of here, since this schema also
  // backs partial() for PATCH, where neither field being present is normal.
  vehicleId: z.number().nullish(),
});

export type VehicleTransport = typeof vehicleTransports.$inferSelect & {
  vehicle?: Vehicle;
  relatedVehicle?: Vehicle;
  customer?: Customer;
  reservation?: Reservation;
  spareReservation?: Reservation;
};
export type InsertVehicleTransport = z.infer<typeof insertVehicleTransportSchema>;

// ============= CUSTOM REPORT BUILDER FEATURE =============

// Saved Reports table - for storing user-created custom reports
export const savedReports = pgTable("saved_reports", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  
  // Report configuration
  dataSource: text("data_source").notNull(), // 'vehicles' | 'customers' | 'reservations' | 'expenses' | 'maintenance'
  // Full report-builder configuration (dataSources, columns, filters, groupBy) as the
  // builder produced it; the columns below hold the derived/simple values.
  configuration: jsonb("configuration").$type<Record<string, any>>(),
  fields: jsonb("fields").$type<string[]>().default([]).notNull(), // Selected columns
  filters: jsonb("filters").$type<Record<string, any>>().default({}).notNull(), // Filter conditions
  groupBy: jsonb("group_by").$type<string[]>().default([]), // Group by fields
  orderBy: jsonb("order_by").$type<Array<{field: string, direction: 'asc' | 'desc'}>>().default([]), // Sort order
  calculations: jsonb("calculations").$type<Array<{type: 'sum' | 'avg' | 'count' | 'min' | 'max', field: string}>>().default([]), // Aggregate calculations
  
  // Visualization
  visualizationType: text("visualization_type").default("table"), // 'table' | 'bar_chart' | 'line_chart' | 'pie_chart'
  chartConfig: jsonb("chart_config").$type<Record<string, any>>().default({}), // Chart-specific configuration
  
  // Scheduling
  isScheduled: boolean("is_scheduled").default(false).notNull(),
  scheduleFrequency: text("schedule_frequency"), // 'daily' | 'weekly' | 'monthly'
  scheduleDayOfWeek: integer("schedule_day_of_week"), // 0-6 for weekly
  scheduleDayOfMonth: integer("schedule_day_of_month"), // 1-31 for monthly
  scheduleTime: text("schedule_time"), // HH:MM format
  emailRecipients: jsonb("email_recipients").$type<string[]>().default([]), // Email addresses to send to
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  
  // Sharing
  isPublic: boolean("is_public").default(false).notNull(), // Can other users view this report
  sharedWithUsers: jsonb("shared_with_users").$type<number[]>().default([]), // User IDs with access
  
  // Tracking
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  updatedBy: text("updated_by"),
});

export const insertSavedReportSchema = createInsertSchema(savedReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastRunAt: true,
  nextRunAt: true,
});

export type SavedReport = typeof savedReports.$inferSelect;
export type InsertSavedReport = z.infer<typeof insertSavedReportSchema>;


// Damage Check Templates table - for creating custom vehicle inspection templates
export const damageCheckTemplates = pgTable("damage_check_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  
  // Vehicle targeting - all optional for flexibility
  vehicleMake: text("vehicle_make"), // e.g., "Toyota", "BMW", "Audi", null for generic
  vehicleModel: text("vehicle_model"), // e.g., "Camry", "X5", "A3", null for generic
  vehicleType: text("vehicle_type"), // e.g., "sedan", "suv", "van", null for generic
  buildYearFrom: text("build_year_from"), // e.g., "2015" - start of year range
  buildYearTo: text("build_year_to"), // e.g., "2020" - end of year range
  
  // Background page image (optional layer behind the canvas fields) — same
  // shape as pdfTemplates/transportReportTemplates.
  backgroundPath: text("background_path"),
  backgroundPreviewPath: text("background_preview_path"),
  templatePreviewPath: text("template_preview_path"),
  
  // Header / footer text rendered on every page of the generated PDF.
  headerText: text("header_text"),
  footerText: text("footer_text"),

  // Canvas-mode fields — when present (length > 0), the PDF generator renders
  // these free-positioned fields on a blank A4 page instead of the legacy
  // structured (categories + inspection points) layout. Each field has page
  // coordinates (x/y in PDF points, top-left origin) and a type-specific
  // payload. This powers the visual drag-and-drop template editor.
  canvasFields: jsonb("canvas_fields").$type<Array<{
    id: string;
    type: "text" | "dynamic" | "inspection" | "checkbox" | "signature" | "line" | "box" | "diagram";
    x: number;
    y: number;
    width?: number;
    height?: number;
    name: string;         // visible label / static text
    source?: string;      // for type="dynamic": e.g., licensePlate, customerName
    fontSize: number;
    isBold: boolean;
    textAlign: "left" | "center" | "right";
    damageTypes?: string[]; // for type="inspection"
    diagramTemplateId?: number | null; // for type="diagram"; null = auto-match by vehicle
    locked?: boolean;
    page?: number;        // 1-based; defaults to 1 if absent
  }>>().default([]).notNull(),

  // Template settings
  isDefault: boolean("is_default").default(false).notNull(),
  language: text("language").default("nl").notNull(), // "nl" | "en" for Dutch or English
  
  // Tracking
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
}, (table) => ({
  // Enforce the "at most one default template" invariant at the database
  // level. Application-level transactions still unset the previous default
  // for ergonomics, but this partial unique index is the source of truth
  // and prevents race conditions where two concurrent requests could each
  // succeed in marking a different template as default.
  onlyOneDefault: uniqueIndex("damage_check_templates_only_one_default")
    .on(table.isDefault)
    .where(sql`${table.isDefault} = true`),
}));

export const insertDamageCheckTemplateSchema = createInsertSchema(damageCheckTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DamageCheckTemplate = typeof damageCheckTemplates.$inferSelect;
export type InsertDamageCheckTemplate = z.infer<typeof insertDamageCheckTemplateSchema>;

// Damage Check Template Backgrounds — per-template background image library,
// same shape as templateBackgrounds / transportReportTemplateBackgrounds.
export const damageCheckTemplateBackgrounds = pgTable("damage_check_template_backgrounds", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => damageCheckTemplates.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  backgroundPath: text("background_path").notNull(),
  previewPath: text("preview_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertDamageCheckTemplateBackgroundSchema = createInsertSchema(damageCheckTemplateBackgrounds)
  .omit({ id: true, createdAt: true });

export type DamageCheckTemplateBackground = typeof damageCheckTemplateBackgrounds.$inferSelect;
export type InsertDamageCheckTemplateBackground = z.infer<typeof insertDamageCheckTemplateBackgroundSchema>;

// Vehicle Diagram Templates - for uploading vehicle diagrams by make/model/year
export const vehicleDiagramTemplates = pgTable("vehicle_diagram_templates", {
  id: serial("id").primaryKey(),
  make: text("make").notNull(), // e.g., "RENAULT"
  model: text("model").notNull(), // e.g., "TWINGO"
  yearFrom: integer("year_from"), // e.g., 2015 - start of year range
  yearTo: integer("year_to"), // e.g., 2020 - end of year range
  
  // Vehicle diagram image storage
  diagramPath: text("diagram_path"), // Legacy local path (optional for backward compatibility)
  objectStorageKey: text("object_storage_key"), // Object storage path (persistent)
  
  // Metadata
  description: text("description"), // Optional description
  
  // Tracking
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});

export const insertVehicleDiagramTemplateSchema = createInsertSchema(vehicleDiagramTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type VehicleDiagramTemplate = typeof vehicleDiagramTemplates.$inferSelect;
export type InsertVehicleDiagramTemplate = z.infer<typeof insertVehicleDiagramTemplateSchema>;

// Interactive Damage Checks - for storing completed damage inspections
export const interactiveDamageChecks = pgTable("interactive_damage_checks", {
  id: serial("id").primaryKey(),
  
  // Links to vehicle and reservation
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id),
  reservationId: integer("reservation_id").references(() => reservations.id),
  
  // Damage check data
  checkType: text("check_type").notNull(), // "pickup" | "return"
  checkDate: timestamp("check_date", { withTimezone: true }).notNull(),
  
  // Diagram template reference
  diagramTemplateId: integer("diagram_template_id").references(() => vehicleDiagramTemplates.id),
  
  // Interactive damage markers - JSON array of damage points
  damageMarkers: text("damage_markers"), // JSON string of marker objects
  
  // Drawing paths - JSON array of drawing data
  drawingPaths: text("drawing_paths"), // JSON string of path objects
  
  // Final diagram with annotations - base64 or path
  diagramWithAnnotations: text("diagram_with_annotations"), // Base64 encoded final image
  
  // Inspection checklist data - JSON object with interior/exterior/delivery checklists
  checklistData: text("checklist_data"), // JSON string of checklist selections
  
  // Vehicle details
  notes: text("notes"),
  mileage: integer("mileage"),
  fuelLevel: text("fuel_level"), // e.g., "Full", "3/4", "1/2", "1/4", "Empty"
  
  // Signatures - base64 encoded images
  renterSignature: text("renter_signature"), // Renter/staff signature
  customerSignature: text("customer_signature"), // Customer signature
  
  // Staff who completed the check
  completedBy: text("completed_by"),
  
  // Tracking
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
}, (table) => ({
  // Enforce single damage check per reservation per type
  reservationCheckTypeUnique: uniqueIndex('interactive_damage_checks_reservation_id_check_type_unique')
    .on(table.reservationId, table.checkType),
}));

export const insertInteractiveDamageCheckSchema = createInsertSchema(interactiveDamageChecks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export type InteractiveDamageCheck = typeof interactiveDamageChecks.$inferSelect;
export type InsertInteractiveDamageCheck = z.infer<typeof insertInteractiveDamageCheckSchema>;

// Security Tables

// Audit Logs - Track all critical actions for compliance and security
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  username: text("username"), // Denormalized for deleted users
  action: text("action").notNull(), // e.g., 'user.login', 'user.create', 'vehicle.delete'
  resourceType: text("resource_type"), // e.g., 'user', 'vehicle', 'customer', 'reservation'
  resourceId: text("resource_id"), // ID of affected resource
  details: jsonb("details").$type<Record<string, any>>(), // Additional context
  ipAddress: text("ip_address"), // User's IP address
  userAgent: text("user_agent"), // Browser/client info
  status: text("status").notNull().default("success"), // 'success' | 'failure'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// Recycle bin for destructive deletes. Deleting a vehicle cascades into its
// reservations, documents and expenses, which used to be unrecoverable and
// left no trace. Every such delete now snapshots the full row set here first,
// so it can be restored and so there is a record of who removed what.
export const deletedRecords = pgTable("deleted_records", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // 'vehicle'
  entityId: integer("entity_id").notNull(), // original primary key
  label: text("label").notNull(), // human-readable, e.g. "HND-55-N Kia Picanto"
  payload: jsonb("payload").$type<Record<string, any>>().notNull(), // full row snapshot incl. related rows
  relatedCounts: jsonb("related_counts").$type<Record<string, number>>(), // {reservations: 1, documents: 0, expenses: 0}
  deletedAt: timestamp("deleted_at", { withTimezone: true }).defaultNow().notNull(),
  deletedBy: text("deleted_by"),
  deletedByUserId: integer("deleted_by_user_id"),
  restoredAt: timestamp("restored_at", { withTimezone: true }),
  restoredBy: text("restored_by"),
}, (table) => ({
  entityIdx: index("deleted_records_entity_idx").on(table.entityType, table.entityId),
  deletedAtIdx: index("deleted_records_deleted_at_idx").on(table.deletedAt),
}));

export const insertDeletedRecordSchema = createInsertSchema(deletedRecords).omit({
  id: true,
  deletedAt: true,
});

export type DeletedRecord = typeof deletedRecords.$inferSelect;
export type InsertDeletedRecord = z.infer<typeof insertDeletedRecordSchema>;

// Password History - Prevent password reuse (last 5 passwords)
export const passwordHistory = pgTable("password_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertPasswordHistorySchema = createInsertSchema(passwordHistory).omit({
  id: true,
  createdAt: true,
});

export type PasswordHistory = typeof passwordHistory.$inferSelect;
export type InsertPasswordHistory = z.infer<typeof insertPasswordHistorySchema>;

// Login Attempts - Track failed login attempts for rate limiting
export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  success: boolean("success").notNull(),
  failureReason: text("failure_reason"), // e.g., 'invalid_password', 'account_locked', 'invalid_username'
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertLoginAttemptSchema = createInsertSchema(loginAttempts).omit({
  id: true,
  attemptedAt: true,
});

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type InsertLoginAttempt = z.infer<typeof insertLoginAttemptSchema>;

// Active Sessions - Track user sessions for revocation capability
export const activeSessions = pgTable("active_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(), // Express session ID
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  username: text("username").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  lastActivity: timestamp("last_activity", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const insertActiveSessionSchema = createInsertSchema(activeSessions).omit({
  id: true,
  createdAt: true,
});

export type ActiveSession = typeof activeSessions.$inferSelect;
export type InsertActiveSession = z.infer<typeof insertActiveSessionSchema>;

// Settings table - System-wide configuration
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  contractNumberStart: integer("contract_number_start").notNull().default(1),
  contractNumberOverride: integer("contract_number_override"), // Manual override for next contract number
  // Maintenance Calendar Settings
  maintenanceExcludedStatuses: text("maintenance_excluded_statuses").array().default(["not_for_rental"]),
  showApkReminders: boolean("show_apk_reminders").notNull().default(true),
  apkReminderDays: integer("apk_reminder_days").notNull().default(30),
  showWarrantyReminders: boolean("show_warranty_reminders").notNull().default(true),
  warrantyReminderDays: integer("warranty_reminder_days").notNull().default(30),
  showMaintenanceBlocks: boolean("show_maintenance_blocks").notNull().default(true),
  // Regular-service reminders: default interval (per vehicle overridable) and the
  // window before the due point in which "due soon" reminders start.
  showServiceReminders: boolean("show_service_reminders").notNull().default(true),
  defaultServiceIntervalKm: integer("default_service_interval_km").notNull().default(30000),
  defaultServiceIntervalMonths: integer("default_service_interval_months").notNull().default(12),
  serviceReminderKm: integer("service_reminder_km").notNull().default(1000),
  serviceReminderDays: integer("service_reminder_days").notNull().default(30),
  // Dutch road toll ("vrachtwagenheffing"), charged per km — used to suggest a toll
  // cost when logging a vehicle transport, editable per transport if the actual
  // cost differs.
  tollRatePerKm: numeric("toll_rate_per_km").notNull().default("0.15"),
  // Depot / home base address, used as the starting point for route optimization
  depotAddress: text("depot_address"),
  depotCity: text("depot_city"),
  depotPostalCode: text("depot_postal_code"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: text("updated_by"),
  updatedByUser: integer("updated_by_user_id").references(() => users.id),
});

export const insertSettingsSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
  updatedByUser: true,
});

export const updateSettingsSchema = createInsertSchema(settings).pick({
  contractNumberStart: true,
  contractNumberOverride: true,
  maintenanceExcludedStatuses: true,
  showApkReminders: true,
  apkReminderDays: true,
  showWarrantyReminders: true,
  warrantyReminderDays: true,
  showMaintenanceBlocks: true,
  showServiceReminders: true,
  defaultServiceIntervalKm: true,
  defaultServiceIntervalMonths: true,
  serviceReminderKm: true,
  serviceReminderDays: true,
  tollRatePerKm: true,
  depotAddress: true,
  depotCity: true,
  depotPostalCode: true,
  updatedBy: true,
}).partial();

export type Settings = typeof settings.$inferSelect;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type UpdateSettings = z.infer<typeof updateSettingsSchema>;

// Vehicle-Customer Blacklist - Prevent specific customers from renting specific vehicles
export const vehicleCustomerBlacklist = pgTable("vehicle_customer_blacklist", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: 'cascade' }),
  reason: text("reason"), // Optional reason for blacklisting
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
}, (table) => ({
  uniqueVehicleCustomer: uniqueIndex("vehicle_customer_blacklist_unique").on(table.vehicleId, table.customerId),
}));

export const insertVehicleCustomerBlacklistSchema = createInsertSchema(vehicleCustomerBlacklist).omit({
  id: true,
  createdAt: true,
});

export type VehicleCustomerBlacklist = typeof vehicleCustomerBlacklist.$inferSelect;
export type InsertVehicleCustomerBlacklist = z.infer<typeof insertVehicleCustomerBlacklistSchema>;

// Legacy Session table (connect-pg-simple sessions)
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
});

// ==================== FISCALE MOBILITEITSCHECK ====================
// docs/fiscaal/03-schema-en-dataflow.md — seven additive tables. Statuses and
// codes are text columns validated against shared/fiscal-types.ts (no pgEnum,
// like the rest of this schema). Periods and reference dates are real `date`
// columns because the rules engine compares day and month boundaries; the API
// still exchanges them as yyyy-MM-dd. Foreign keys and indexes are created by
// the explicit step in startup-migration.js, since the manifest sync does not.

/** One version of one fiscal rule. Published rows are immutable (rule-versions.ts enforces it). */
export const fiscalRuleVersions = pgTable("fiscal_rule_versions", {
  id: serial("id").primaryKey(),
  ruleKey: text("rule_key").notNull(),
  versionNumber: integer("version_number").notNull(),
  status: text("status").notNull().default("draft"),
  title: text("title").notNull(),
  effectiveFrom: date("effective_from"),
  effectiveUntil: date("effective_until"),
  reasonCategory: text("reason_category").notNull(),
  reasonText: text("reason_text").notNull(),
  sourceOrganisation: text("source_organisation"),
  sourceUrl: text("source_url"),
  legalReference: text("legal_reference"),
  sourceVerifiedAt: timestamp("source_verified_at", { withTimezone: true }),
  sourceVerifiedByName: text("source_verified_by_name"),
  assumptions: text("assumptions"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdByName: text("created_by_name").notNull(),
  submittedBy: integer("submitted_by").references(() => users.id, { onDelete: "set null" }),
  submittedByName: text("submitted_by_name"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedBy: integer("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedByName: text("approved_by_name"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  publishedBy: integer("published_by").references(() => users.id, { onDelete: "set null" }),
  publishedByName: text("published_by_name"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  rejectedBy: integer("rejected_by").references(() => users.id, { onDelete: "set null" }),
  rejectedByName: text("rejected_by_name"),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  supersededById: integer("superseded_by_id").references((): AnyPgColumn => fiscalRuleVersions.id, { onDelete: "set null" }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedByName: text("archived_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  ruleVersionUnique: uniqueIndex("fiscal_rule_versions_rule_version_idx").on(table.ruleKey, table.versionNumber),
  ruleStatusIdx: index("fiscal_rule_versions_rule_status_idx").on(table.ruleKey, table.status),
  ruleFromIdx: index("fiscal_rule_versions_rule_from_idx").on(table.ruleKey, table.effectiveFrom),
}));
export type FiscalRuleVersion = typeof fiscalRuleVersions.$inferSelect;

/** One parameter value of one rule version. Exactly one value column is filled, matching the definition's data type. */
export const fiscalParameterValues = pgTable("fiscal_parameter_values", {
  id: serial("id").primaryKey(),
  ruleVersionId: integer("rule_version_id").notNull().references(() => fiscalRuleVersions.id, { onDelete: "cascade" }),
  parameterKey: text("parameter_key").notNull(),
  valueDecimal: numeric("value_decimal", { precision: 14, scale: 4 }),
  valueInteger: integer("value_integer"),
  valueBoolean: boolean("value_boolean"),
  valueDate: date("value_date"),
  valueText: text("value_text"),
  valueList: jsonb("value_list").$type<string[]>(),
  unit: text("unit").notNull(),
  legalStatus: text("legal_status").notNull(),
  sourceUrl: text("source_url"),
  sourceReference: text("source_reference"),
  sourceVerifiedAt: timestamp("source_verified_at", { withTimezone: true }),
  sourceVerifiedByName: text("source_verified_by_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  versionKeyUnique: uniqueIndex("fiscal_parameter_values_version_key_idx").on(table.ruleVersionId, table.parameterKey),
}));
export type FiscalParameterValue = typeof fiscalParameterValues.$inferSelect;

/** Fiscally relevant vehicle facts with their provenance. The vehicles table itself stays untouched. */
export const vehicleFiscalProfiles = pgTable("vehicle_fiscal_profiles", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull().unique().references(() => vehicles.id, { onDelete: "cascade" }),
  catalogValue: numeric("catalog_value", { precision: 12, scale: 2 }),
  catalogValueSource: text("catalog_value_source").notNull().default("unknown"),
  catalogValueRetrievedAt: timestamp("catalog_value_retrieved_at", { withTimezone: true }),
  catalogValueVerifiedAt: timestamp("catalog_value_verified_at", { withTimezone: true }),
  catalogValueVerifiedByName: text("catalog_value_verified_by_name"),
  marketValue: numeric("market_value", { precision: 12, scale: 2 }),
  marketValueNote: text("market_value_note"),
  marketValueVerifiedAt: timestamp("market_value_verified_at", { withTimezone: true }),
  marketValueVerifiedByName: text("market_value_verified_by_name"),
  firstAdmissionDate: date("first_admission_date"),
  firstAdmissionSource: text("first_admission_source").notNull().default("unknown"),
  fuelCategory: text("fuel_category").notNull().default("unknown"),
  fuelDescriptions: jsonb("fuel_descriptions").$type<string[]>(),
  hybridClass: text("hybrid_class"),
  co2GKm: integer("co2_g_km"),
  co2SourceField: text("co2_source_field"),
  europeanCategory: text("european_category"),
  europeanCategoryAddition: text("european_category_addition"),
  vehicleKind: text("vehicle_kind"),
  bodyType: text("body_type"),
  isDrivingSchoolManual: boolean("is_driving_school_manual").notNull().default(false),
  rdwRaw: jsonb("rdw_raw").$type<Record<string, unknown>>(),
  rdwRetrievedAt: timestamp("rdw_retrieved_at", { withTimezone: true }),
  rdwError: text("rdw_error"),
  rdwVerifiedAt: timestamp("rdw_verified_at", { withTimezone: true }),
  rdwVerifiedByName: text("rdw_verified_by_name"),
  manualOverride: jsonb("manual_override").$type<Record<string, { value: unknown; byName: string; at: string; reason: string }>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  fuelIdx: index("vehicle_fiscal_profiles_fuel_idx").on(table.fuelCategory),
  categoryIdx: index("vehicle_fiscal_profiles_category_idx").on(table.europeanCategory),
}));
export type VehicleFiscalProfile = typeof vehicleFiscalProfiles.$inferSelect;

/** A "terbeschikkingstellingsperiode": derived from a reservation, enriched with what only people know. Never deleted. */
export const vehicleUsagePeriods = pgTable("vehicle_usage_periods", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id").notNull().unique().references(() => reservations.id, { onDelete: "cascade" }),
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  primaryDriverId: integer("primary_driver_id").references(() => drivers.id, { onDelete: "set null" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  dateBasis: text("date_basis").notNull().default("planned"),
  /** 'planned' (from the booking), 'actual' (the car is back: the final calculation applies), null while open (besluit F-15). */
  endBasis: text("end_basis"),
  usageType: text("usage_type").notNull().default("unknown"),
  privateUse: text("private_use").notNull().default("unknown"),
  commuting: text("commuting").notNull().default("unknown"),
  isPool: boolean("is_pool").notNull().default(false),
  driverCount: integer("driver_count").notNull().default(0),
  isReplacement: boolean("is_replacement").notNull().default(false),
  replacementReason: text("replacement_reason").notNull().default("unknown"),
  replacedReservationId: integer("replaced_reservation_id").references(() => reservations.id, { onDelete: "set null" }),
  replacedVehicleText: text("replaced_vehicle_text"),
  providedBeforeCutoff: text("provided_before_cutoff").notNull().default("unknown"),
  providedBeforeCutoffHint: boolean("provided_before_cutoff_hint").notNull().default(false),
  source: text("source").notNull().default("derived"),
  derivedAt: timestamp("derived_at", { withTimezone: true }),
  confirmedByKind: text("confirmed_by_kind").notNull().default("none"),
  confirmedById: integer("confirmed_by_id"),
  confirmedByName: text("confirmed_by_name"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  reconfirmRequired: boolean("reconfirm_required").notNull().default(false),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedReason: text("closed_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  customerVehicleStartIdx: index("vehicle_usage_periods_customer_vehicle_start_idx").on(table.customerId, table.vehicleId, table.startDate),
  vehicleStartIdx: index("vehicle_usage_periods_vehicle_start_idx").on(table.vehicleId, table.startDate),
}));
export type VehicleUsagePeriod = typeof vehicleUsagePeriods.$inferSelect;

/** One completed assessment. Immutable: a recalculation inserts a new row with sequence + 1. */
export const fiscalAssessments = pgTable("fiscal_assessments", {
  id: serial("id").primaryKey(),
  usagePeriodId: integer("usage_period_id").notNull().references(() => vehicleUsagePeriods.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").notNull(),
  vehicleId: integer("vehicle_id"),
  reservationId: integer("reservation_id"),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end"),
  periodEndEffective: date("period_end_effective").notNull(),
  calculationDate: date("calculation_date").notNull(),
  ruleKey: text("rule_key").notNull(),
  ruleVersionId: integer("rule_version_id").references(() => fiscalRuleVersions.id, { onDelete: "set null" }),
  status: text("status").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  /** Besluit F-15: the part of `amount` in months that are over, and the part in the current and later months. */
  settledAmount: numeric("settled_amount", { precision: 12, scale: 2 }),
  provisionalAmount: numeric("provisional_amount", { precision: 12, scale: 2 }),
  /** The final calculation: the period has an actual end date, every month is settled. */
  isFinal: boolean("is_final").notNull().default(false),
  monthsCharged: integer("months_charged").notNull().default(0),
  months: jsonb("months").$type<Array<{ month: string; days: number; charged: boolean; reason: string; amount: string | null; settled: boolean }>>().notNull(),
  dataQuality: text("data_quality").notNull(),
  explanation: text("explanation").notNull(),
  missingData: jsonb("missing_data").$type<string[]>().notNull().default([]),
  reviewReasons: jsonb("review_reasons").$type<string[]>().notNull().default([]),
  inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull(),
  parameters: jsonb("parameters").$type<Array<Record<string, unknown>>>().notNull(),
  inputHash: text("input_hash").notNull(),
  sequence: integer("sequence").notNull().default(1),
  supersedesId: integer("supersedes_id").references((): AnyPgColumn => fiscalAssessments.id, { onDelete: "set null" }),
  trigger: text("trigger").notNull(),
  requestedById: integer("requested_by_id"),
  requestedByName: text("requested_by_name"),
  requestReason: text("request_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  periodSequenceIdx: index("fiscal_assessments_period_sequence_idx").on(table.usagePeriodId, table.sequence),
  customerVehicleStartIdx: index("fiscal_assessments_customer_vehicle_start_idx").on(table.customerId, table.vehicleId, table.periodStart),
  ruleVersionIdx: index("fiscal_assessments_rule_version_idx").on(table.ruleVersionId),
  statusIdx: index("fiscal_assessments_status_idx").on(table.status),
  createdAtIdx: index("fiscal_assessments_created_at_idx").on(table.createdAt),
}));
export type FiscalAssessment = typeof fiscalAssessments.$inferSelect;

/** A case for a human: opened when an assessment cannot decide on its own. One open case per period. */
export const fiscalReviewCases = pgTable("fiscal_review_cases", {
  id: serial("id").primaryKey(),
  usagePeriodId: integer("usage_period_id").notNull().references(() => vehicleUsagePeriods.id, { onDelete: "cascade" }),
  assessmentId: integer("assessment_id").references(() => fiscalAssessments.id, { onDelete: "set null" }),
  customerId: integer("customer_id").notNull(),
  vehicleId: integer("vehicle_id"),
  reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("open"),
  assignedToId: integer("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
  assignedToName: text("assigned_to_name"),
  resolution: text("resolution"),
  resolutionNote: text("resolution_note"),
  resolvedById: integer("resolved_by_id"),
  resolvedByName: text("resolved_by_name"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("fiscal_review_cases_status_idx").on(table.status),
  customerIdx: index("fiscal_review_cases_customer_idx").on(table.customerId),
  openPeriodUnique: uniqueIndex("fiscal_review_cases_open_period_idx").on(table.usagePeriodId).where(sql`status in ('open', 'in_progress')`),
}));
export type FiscalReviewCase = typeof fiscalReviewCases.$inferSelect;

/** Append-only. No route updates or deletes a row; the service only inserts. */
export const fiscalAuditEvents = pgTable("fiscal_audit_events", {
  id: serial("id").primaryKey(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  userId: integer("user_id"),
  username: text("username").notNull(),
  role: text("role"),
  permissionUsed: text("permission_used"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  ruleKey: text("rule_key"),
  ruleVersionId: integer("rule_version_id"),
  parameterKey: text("parameter_key"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  unit: text("unit"),
  scope: text("scope").notNull().default("GLOBAL"),
  effectiveFrom: date("effective_from"),
  effectiveUntil: date("effective_until"),
  reasonCategory: text("reason_category"),
  reasonText: text("reason_text"),
  sourceUrl: text("source_url"),
  customerId: integer("customer_id"),
  vehicleId: integer("vehicle_id"),
  validationResult: jsonb("validation_result").$type<Record<string, unknown>>(),
  ipAddress: text("ip_address"),
  details: jsonb("details").$type<Record<string, unknown>>(),
}, (table) => ({
  occurredAtIdx: index("fiscal_audit_events_occurred_at_idx").on(table.occurredAt),
  ruleVersionIdx: index("fiscal_audit_events_rule_version_idx").on(table.ruleVersionId),
  entityIdx: index("fiscal_audit_events_entity_idx").on(table.entityType, table.entityId),
  customerIdx: index("fiscal_audit_events_customer_idx").on(table.customerId),
}));
export type FiscalAuditEvent = typeof fiscalAuditEvents.$inferSelect;
