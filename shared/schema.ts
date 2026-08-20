import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb, index, varchar, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod";

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
  
  // Maintenance & Expenses
  MANAGE_MAINTENANCE: 'manage_maintenance',
  MANAGE_EXPENSES: 'manage_expenses',
  
  // Documents & Templates
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
  mileageOverridePasswordHash: text("mileage_override_password_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  mileageOverridePasswordHash: true,
  updatedBy: true,
}).partial();

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
  
  // Mileage decrease tracking (admin-only visibility)
  mileageDecreasedBy: text("mileage_decreased_by"), // Username who decreased the mileage
  mileageDecreasedAt: timestamp("mileage_decreased_at"), // When mileage was decreased
  previousMileage: integer("previous_mileage"), // Mileage before the decrease
  
  // Fuel level tracking (independent of reservations)
  currentFuelLevel: varchar("current_fuel_level"), // 'empty' | '1/4' | '1/2' | '3/4' | 'full'
  fuelRefillCost: numeric("fuel_refill_cost", { precision: 10, scale: 2 }), // Cost of last refill
  fuelRefillReceipt: text("fuel_refill_receipt"), // Path to receipt image/PDF
  fuelRefillNotes: text("fuel_refill_notes"), // Notes about the refill
  fuelRefillDate: timestamp("fuel_refill_date"), // When the refill was done
  
  // Oil specification
  recommendedOil: text("recommended_oil"), // e.g., "5W-30", "10W-40", or custom specification
  
  // Availability status (manual control with 5 states)
  // 'available' - ready for rental (no reservations)
  // 'scheduled' - has a reservation within 30 days (auto-set by system)
  // 'needs_fixing' - in workshop or needs repairs
  // 'not_for_rental' - owned but not being rented out
  // 'rented' - currently rented (auto-set by system)
  availabilityStatus: text("availability_status").default("available").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVehicleSchema = createInsertSchema(vehicles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  // No longer omit these fields so they can be set during insert/update
  // createdBy: true,
  // updatedBy: true,
}).extend({
  currentMileage: z.number().int().min(0, "Mileage cannot be negative").nullable().optional(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  placeholderSpare: boolean("placeholder_spare").default(false).notNull(), // True when vehicleId is null and spare vehicle assignment is pending
  spareVehicleStatus: text("spare_vehicle_status").default("assigned"), // 'assigned', 'ready', 'picked_up', 'returned'
  
  // Maintenance-specific fields
  maintenanceDuration: integer("maintenance_duration"), // Duration in days for maintenance_block type
  maintenanceStatus: text("maintenance_status"), // 'scheduled' | 'in' | 'out' for maintenance_block type
  maintenanceCategory: text("maintenance_category"), // 'scheduled_maintenance' | 'repair' to distinguish service types
  spareAssignmentDecision: text("spare_assignment_decision"), // 'spare_assigned' | 'customer_arranging' | 'not_handled' for maintenance tracking
  affectedRentalId: integer("affected_rental_id"), // FK to the rental that's affected by this maintenance
  
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdByUser: integer("created_by_user_id").references(() => users.id),
  updatedByUser: integer("updated_by_user_id").references(() => users.id),
  
  // Soft delete tracking
  deletedAt: timestamp("deleted_at"),
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
  totalPrice: z.number().optional().or(
    z.string().transform(val => {
      // Convert empty strings to undefined, otherwise convert to number
      if (val === '' || val === null) {
        return undefined;
      }
      
      const num = Number(val);
      // Check if the result is NaN and return undefined instead
      return isNaN(num) ? undefined : num;
    })
  ),
  endDate: z.string().optional().or(z.null()), // Make end date optional for open-ended rentals
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM").optional().or(z.literal('')).or(z.null()),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM").optional().or(z.literal('')).or(z.null()),
  type: z.enum(["standard", "replacement", "maintenance_block"]).optional(),
  replacementForReservationId: z.number().optional().or(z.null()), // Allow null
  customerId: z.number().optional().or(z.null()), // Make customerId optional for maintenance blocks
  vehicleId: z.number().optional().or(z.null()), // Allow null for placeholder spare vehicles
  placeholderSpare: z.boolean().optional().default(false), // Default to false for normal reservations
  affectedRentalId: z.number().optional().or(z.null()), // Allow null
  maintenanceDuration: z.number().optional().or(z.null()), // Allow null
  maintenanceStatus: z.string().optional().or(z.null()), // Allow null
  maintenanceCategory: z.string().optional().or(z.null()), // Allow null
  spareAssignmentDecision: z.string().optional().or(z.null()), // Allow null
  contractNumber: z.string().optional().or(z.null()), // Contract number is assigned during pickup, not creation
});

// Fully validated schema with business rules for server-side use
export const insertReservationSchema = insertReservationSchemaBase
.refine((data) => {
  const type = data.type ?? 'standard'; // Handle default type
  const noVehicle = data.vehicleId == null; // Handles both null and undefined
  
  // If placeholderSpare is true, then vehicleId must be null/undefined, type must be 'replacement', and replacementForReservationId must be present
  if (data.placeholderSpare === true) {
    return noVehicle && 
           type === 'replacement' && 
           data.replacementForReservationId != null;
  }
  return true;
}, {
  message: "Placeholder spare reservations must have no vehicleId, type 'replacement', and a replacementForReservationId",
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
  
  // All replacement reservations (placeholder or not) must have replacementForReservationId
  if (type === 'replacement') {
    return data.replacementForReservationId != null;
  }
  return true;
}, {
  message: "Replacement reservations must have a replacementForReservationId",
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
  
  // Tracking
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
}).extend({
  amount: z.union([
    z.number(),
    z.string().transform(val => parseFloat(val) || 0)
  ]).refine(val => val > 0 && val <= 1000000, {
    message: "Amount must be greater than 0 and no more than €1,000,000",
  }),
  receiptPath: z.string().nullable().optional(),
});

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
  uploadDate: timestamp("upload_date").defaultNow().notNull(),
  notes: text("notes"),
  
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  fields: jsonb("fields").default([])
});

export const insertPdfTemplateSchema = createInsertSchema(pdfTemplates)
  .omit({ id: true });

export type PdfTemplate = typeof pdfTemplates.$inferSelect;
export type InsertPdfTemplate = z.infer<typeof insertPdfTemplateSchema>;

// Template Backgrounds table - per-template background library
export const templateBackgrounds = pgTable("template_backgrounds", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => pdfTemplates.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // User-friendly label for the background
  backgroundPath: text("background_path").notNull(), // Path to PDF file
  previewPath: text("preview_path").notNull(), // Path to PNG preview
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  fields: jsonb("fields").default([])
});

export const insertTransportReportTemplateSchema = createInsertSchema(transportReportTemplates)
  .omit({ id: true });

export type TransportReportTemplate = typeof transportReportTemplates.$inferSelect;
export type InsertTransportReportTemplate = z.infer<typeof insertTransportReportTemplateSchema>;

export const transportReportTemplateBackgrounds = pgTable("transport_report_template_backgrounds", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => transportReportTemplates.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  backgroundPath: text("background_path").notNull(),
  previewPath: text("preview_path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTransportReportTemplateBackgroundSchema = createInsertSchema(transportReportTemplateBackgrounds)
  .omit({ id: true, createdAt: true });

export type TransportReportTemplateBackground = typeof transportReportTemplateBackgrounds.$inferSelect;
export type InsertTransportReportTemplateBackground = z.infer<typeof insertTransportReportTemplateBackgroundSchema>;

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
});

export const insertEmailLogSchema = createInsertSchema(emailLogs)
  .omit({ id: true });

export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;

// Backup Settings table
export const backupSettings = pgTable("backup_settings", {
  id: serial("id").primaryKey(),
  storageType: text("storage_type").notNull().default("object_storage"), // 'object_storage', 'local_filesystem'
  localPath: text("local_path"), // Path for local filesystem backups
  enableAutoBackup: boolean("enable_auto_backup").notNull().default(true),
  backupSchedule: text("backup_schedule").notNull().default("0 2 * * *"), // Cron expression
  retentionDays: integer("retention_days").notNull().default(30),
  settings: jsonb("settings").$type<Record<string, any>>().default({}).notNull(), // Additional settings
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

// App Settings table - for general application settings
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // Setting identifier (e.g., 'email_config', 'smtp_config')
  value: jsonb("value").$type<Record<string, any>>().default({}).notNull(), // Setting value as JSON
  category: text("category").notNull().default("general"), // 'email', 'general', 'notifications', etc.
  description: text("description"), // Human-readable description
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  contactedAt: timestamp("contacted_at"),
  fulfilledAt: timestamp("fulfilled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  scheduledDeliveryTime: timestamp("scheduled_delivery_time"),
  scheduledPickupTime: timestamp("scheduled_pickup_time"),
  estimatedDeliveryTime: timestamp("estimated_delivery_time"),
  estimatedPickupTime: timestamp("estimated_pickup_time"),
  
  // Status tracking
  status: text("status").default("scheduled").notNull(), // 'scheduled' | 'en_route_delivery' | 'delivered' | 'en_route_pickup' | 'completed' | 'cancelled'
  deliveryCompletedAt: timestamp("delivery_completed_at"),
  pickupCompletedAt: timestamp("pickup_completed_at"),
  
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  relatedVehicleId: integer("related_vehicle_id").references(() => vehicles.id, { onDelete: "set null" }), // the other vehicle in a swap
  reservationId: integer("reservation_id").references(() => reservations.id, { onDelete: "set null" }), // optional link
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }), // who to bill, if billable

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
  // A swap caused by a breakdown or scheduled maintenance is our own cost, not the
  // customer's — checking this defaults billable off. Only meaningful for type 'swap'.
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

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
}).extend({
  distanceKm: z.union([z.number(), z.string().transform(v => v === '' ? null : parseFloat(v))]).nullish()
    .refine(v => v === null || v === undefined || v >= 0, { message: "Distance cannot be negative" }),
  tollCost: z.union([z.number(), z.string().transform(v => v === '' ? null : parseFloat(v))]).nullish()
    .refine(v => v === null || v === undefined || v >= 0, { message: "Toll cost cannot be negative" }),
  billableAmount: z.union([z.number(), z.string().transform(v => v === '' ? null : parseFloat(v))]).nullish()
    .refine(v => v === null || v === undefined || v >= 0, { message: "Billable amount cannot be negative" }),
});

export type VehicleTransport = typeof vehicleTransports.$inferSelect & {
  vehicle?: Vehicle;
  relatedVehicle?: Vehicle;
  customer?: Customer;
  reservation?: Reservation;
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
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  
  // Sharing
  isPublic: boolean("is_public").default(false).notNull(), // Can other users view this report
  sharedWithUsers: jsonb("shared_with_users").$type<number[]>().default([]), // User IDs with access
  
  // Tracking
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  
  // Vehicle diagram images (paths or URLs)
  diagramTopView: text("diagram_top_view"), // Path to top-view diagram image
  diagramFrontView: text("diagram_front_view"), // Path to front-view diagram image
  diagramRearView: text("diagram_rear_view"), // Path to rear-view diagram image
  diagramSideView: text("diagram_side_view"), // Path to side-view diagram image
  
  // Inspection points - array of check areas with damage type options
  inspectionPoints: jsonb("inspection_points").$type<Array<{
    id: string;
    name: string; // e.g., "Voorruit" (Windshield), "Bumper voor" (Front Bumper)
    category: string; // categoryId — must match one of the template's categories
    damageTypes: string[]; // e.g., ["Kapot", "Gat", "Kras", "Deuk", "Ster"] - available damage type checkboxes
    position?: { x: number; y: number }; // Position on vehicle diagram for marking damage
    description?: string; // Optional description of what to check
    required: boolean; // Whether this point must be checked
    // New extensible fields (Phase 1):
    notes?: string; // Inspector notes / instructions specific to this point
    photoPaths?: string[]; // Reference photos uploaded for this point
    inputType?: "checkbox" | "text" | "dropdown"; // Default "checkbox" (i.e., damage type checkboxes)
    dropdownOptions?: string[]; // For inputType="dropdown" — selectable values
    order?: number; // Ordering hint within the category
  }>>().default([]).notNull(),

  // Configurable categories (per template). Replaces the hardcoded list of
  // Interieur / Exterieur / Afweez Check / Documents. If empty the system
  // falls back to that default list.
  categories: jsonb("categories").$type<Array<{
    id: string; // stable identifier referenced by inspectionPoints.category
    label: string; // human-readable label shown in the editor/PDF
    order: number;
    // Phase 2 — layout controls (per category):
    columns?: 1 | 2 | 3 | 4; // number of columns when rendered on the PDF (default 1)
    alignment?: "left" | "center" | "right"; // horizontal alignment of column content
  }>>().default([]).notNull(),

  // Handover checklist — items handed over with the vehicle (keys, fuel card,
  // jack, registration documents, etc.). Each item is rendered on the PDF.
  handoverChecklist: jsonb("handover_checklist").$type<Array<{
    id: string;
    label: string;
    type: "checkbox" | "text"; // checkbox = present/absent; text = free-form (e.g., "fuel card #")
    order: number;
  }>>().default([]).notNull(),

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
    type: "text" | "dynamic" | "inspection" | "checkbox" | "signature" | "line" | "box";
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
    locked?: boolean;
    page?: number;        // 1-based; defaults to 1 if absent
  }>>().default([]).notNull(),

  // Template settings
  isDefault: boolean("is_default").default(false).notNull(),
  language: text("language").default("nl").notNull(), // "nl" | "en" for Dutch or English
  
  // Tracking
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  checkDate: timestamp("check_date").notNull(),
  
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

// Template Section type with extended styling options
export interface TemplateSectionStyle {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textColor?: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  padding?: number;
  rotation?: number;
  opacity?: number;
}

export interface TemplateSection {
  id: string;
  type: 'header' | 'contractInfo' | 'vehicleData' | 'checklist' | 'diagram' | 'remarks' | 'signatures' | 'customField' | 'table' | 'image' | 'qrCode' | 'barcode';
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  locked?: boolean;
  page?: number;
  condition?: {
    field: string;
    operator: 'equals' | 'notEquals' | 'contains' | 'isEmpty' | 'isNotEmpty';
    value?: string;
  };
  style?: TemplateSectionStyle;
  settings: {
    fontSize?: number;
    checkboxSize?: number;
    companyName?: string;
    headerColor?: string;
    headerFontSize?: number;
    showLogo?: boolean;
    customLabel?: string;
    textAlign?: 'left' | 'center' | 'right';
    columnCount?: number;
    imageUrl?: string;
    qrCodeValue?: string;
    barcodeValue?: string;
    tableRows?: number;
    tableCols?: number;
    tableData?: string[][];
    variables?: string[];
    customItems?: Array<{
      id: string;
      text: string;
      hasCheckbox: boolean;
      fieldKey?: string;
    }>;
    [key: string]: any;
  };
}

// Damage Check PDF Layout Templates - for customizing damage check PDF appearance with drag-and-drop sections
export const damageCheckPdfTemplates = pgTable("damage_check_pdf_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  
  // Sections layout - JSON array of draggable sections with extended styling
  sections: jsonb("sections").notNull().$type<TemplateSection[]>(),
  
  // Page settings
  pageMargins: integer("page_margins").default(15).notNull(),
  pageOrientation: text("page_orientation").default("portrait").$type<'portrait' | 'landscape'>(),
  pageSize: text("page_size").default("A4").$type<'A4' | 'Letter' | 'A5' | 'custom'>(),
  customPageWidth: integer("custom_page_width"),
  customPageHeight: integer("custom_page_height"),
  pageCount: integer("page_count").default(1),
  
  // Organization
  tags: text("tags").array(),
  category: text("category"),
  
  // Theming
  themeId: integer("theme_id"),
  backgroundImage: text("background_image"),
  
  // Usage tracking
  usageCount: integer("usage_count").default(0),
  lastUsedAt: timestamp("last_used_at"),
  
  // Tracking
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});

export const insertDamageCheckPdfTemplateSchema = createInsertSchema(damageCheckPdfTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DamageCheckPdfTemplate = typeof damageCheckPdfTemplates.$inferSelect;
export type InsertDamageCheckPdfTemplate = z.infer<typeof insertDamageCheckPdfTemplateSchema>;

// Template Versions - for template versioning/history
export const damageCheckPdfTemplateVersions = pgTable("damage_check_pdf_template_versions", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => damageCheckPdfTemplates.id, { onDelete: 'cascade' }),
  version: integer("version").notNull(),
  name: text("name").notNull(),
  sections: jsonb("sections").notNull().$type<TemplateSection[]>(),
  settings: jsonb("settings").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by"),
});

export type DamageCheckPdfTemplateVersion = typeof damageCheckPdfTemplateVersions.$inferSelect;

// Template Themes - reusable color schemes
export const damageCheckPdfTemplateThemes = pgTable("damage_check_pdf_template_themes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  palette: jsonb("palette").notNull().$type<{
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    border: string;
  }>(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DamageCheckPdfTemplateTheme = typeof damageCheckPdfTemplateThemes.$inferSelect;

// Section Presets Library - pre-made section layouts
export const damageCheckPdfSectionPresets = pgTable("damage_check_pdf_section_presets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  config: jsonb("config").notNull().$type<TemplateSection>(),
  category: text("category"),
  isBuiltIn: boolean("is_built_in").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DamageCheckPdfSectionPreset = typeof damageCheckPdfSectionPresets.$inferSelect;

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// Password History - Prevent password reuse (last 5 passwords)
export const passwordHistory = pgTable("password_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
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
  lastActivity: timestamp("last_activity").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
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
  // Dutch road toll ("vrachtwagenheffing"), charged per km — used to suggest a toll
  // cost when logging a vehicle transport, editable per transport if the actual
  // cost differs.
  tollRatePerKm: numeric("toll_rate_per_km").notNull().default("0.15"),
  // Depot / home base address, used as the starting point for route optimization
  depotAddress: text("depot_address"),
  depotCity: text("depot_city"),
  depotPostalCode: text("depot_postal_code"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  expire: timestamp("expire").notNull(),
});
