import { isMaintenanceType, maintenanceTypeFromNotes } from "../shared/maintenance-type";
import { 
  users, type User, type InsertUser,
  vehicles, type Vehicle, type InsertVehicle,
  customers, type Customer, type InsertCustomer,
  reservations, type Reservation, type InsertReservation,
  expenses, type Expense, type InsertExpense,
  documents, type Document, type InsertDocument,
  pdfTemplates, type PdfTemplate, type InsertPdfTemplate,
  templateBackgrounds, type TemplateBackground, type InsertTemplateBackground,
  type DamageCheckTemplateBackground, type InsertDamageCheckTemplateBackground,
  transportReportTemplates, type TransportReportTemplate, type InsertTransportReportTemplate,
  transportReportTemplateBackgrounds, type TransportReportTemplateBackground, type InsertTransportReportTemplateBackground,
  barcodeLabelTemplates, type BarcodeLabelTemplate, type InsertBarcodeLabelTemplate,
  scanEvents, type ScanEvent, type InsertScanEvent,
  customNotifications, type CustomNotification, type InsertCustomNotification,
  backupSettings, type BackupSettings, type InsertBackupSettings,
  appSettings, type AppSettings, type InsertAppSettings,
  apkDateChanges, type ApkDateChange, type InsertApkDateChange,
  settings, type Settings, type UpdateSettings,
  drivers, type Driver, type InsertDriver,
  savedReports, type SavedReport, type InsertSavedReport,

  damageCheckTemplates, type DamageCheckTemplate, type InsertDamageCheckTemplate,
  damageCheckTemplateBackgrounds,
  vehicleDiagramTemplates, type VehicleDiagramTemplate, type InsertVehicleDiagramTemplate,
  interactiveDamageChecks, type InteractiveDamageCheck, type InsertInteractiveDamageCheck,
  vehicleCustomerBlacklist, type VehicleCustomerBlacklist, type InsertVehicleCustomerBlacklist,
  vehicleTransports, type VehicleTransport, type InsertVehicleTransport,
  vehicleWaitlist,
  deletedRecords, type DeletedRecord, fines,
  vehicleMileageReadings,
  reservationDriverAssignments, type ReservationDriverAssignment,
  auditLogs, type AuditLog
} from "../shared/schema";
import {
  getVehicleStatusContext,
  VehicleAvailabilityStatus
} from "./vehicle-status-helper";
import {
  deriveVehicleAvailability,
  decideHandover,
  assertTransportTransition,
  isoToday,
  assertReservationStatusValue,
  normalizeReservationStatus,
  CLOSED_RESERVATION_STATUSES,
  LEGACY_RESERVATION_STATUS_ALIASES,
  selectMaintenanceBlocksToClose,
  isCheckedInBlockMaintenanceStatus,
  type AvailabilityReservation,
  type VehicleAvailability,
  type HandoverOverride,
} from "./services/lifecycle";

/**
 * B-32 aanvulling (besluiten.md, 2026-09-23) — every stored spelling that
 * means "booked, never picked up" (`confirmed`, `pending`, `scheduled`),
 * derived from `LEGACY_RESERVATION_STATUS_ALIASES` above.
 * `getNotCollectedReservations` below is the only reader of this list.
 */
const BOOKED_STATUSES: string[] = [
  "booked",
  ...Object.entries(LEGACY_RESERVATION_STATUS_ALIASES)
    .filter(([, canonical]) => canonical === "booked")
    .map(([stored]) => stored),
];
import {
  overlapWhere,
  partitionOverlaps,
  vehicleLockSql,
  bookableVerdict,
  refusedVerdict,
  BookingConflictError,
  type BookingRequest,
  type BookabilityVerdict,
} from "./services/bookability";
import { HttpError } from "./utils/route-errors";

/**
 * besluiten **B-09** — the checked writers hand their verdict back so the route
 * can turn `verdict.maintenanceBlocks` into the warning of
 * `shared/booking-warnings.ts` without running the predicate a second time.
 */
export interface CheckedWriteOptions {
  onVerdict?: (verdict: BookabilityVerdict) => void;
}
import {
  collectCascadeSnapshot,
  restoreCascadeSnapshot,
  snapshotCounts,
  type CascadeSnapshot,
} from "./services/cascade-snapshot";
import { getDataSource, getField as getReportField, RENAMED_REPORT_FIELDS, REMOVED_REPORT_FIELDS, isReportPeriodField, type ReportScope } from "../shared/report-builder-config";
import { officeDaySql, textDaySql, isRealDate } from "./services/reports/report-kit";
import { buildDefaultDamageCheckCanvasFields } from "../shared/damage-check-default-layout";

export class ReportValidationError extends Error {
  constructor(message: string, public code?: string, public field?: string) {
    super(message);
    this.name = "ReportValidationError";
  }
}

/**
 * Report builder whitelist, keyed on the config table name. `from` is what
 * goes after FROM (columns are always written "<config table>"."<column>",
 * so a virtual table needs an alias); `baseWhere` adds the source's fixed
 * conditions. One source per report: a fixed condition may use a subquery,
 * but never shows a column from another table.
 */
interface ReportSourceTable {
  table: Record<string, any>;
  from: SQL;
  baseWhere?: (filters: unknown[]) => SQL[];
}

const REPORT_SOURCE_TABLES: Record<string, ReportSourceTable> = {
  vehicles: { table: vehicles, from: sql`vehicles` },
  customers: { table: customers, from: sql`customers` },
  // Reservations support soft-delete — never report on deleted rows.
  reservations: {
    table: reservations,
    from: sql`reservations`,
    baseWhere: () => [sql`reservations.deleted_at IS NULL`],
  },
  expenses: { table: expenses, from: sql`expenses` },
  drivers: { table: drivers, from: sql`drivers` },
  // Fines and transports have no recycle bin: every row, also cancelled ones.
  fines: { table: fines, from: sql`fines` },
  vehicle_transports: { table: vehicleTransports, from: sql`vehicle_transports` },
  // A workshop visit is a maintenance block that is not in the recycle bin
  // (same rule as /api/reports/workshop-downtime).
  workshop_visits: {
    table: reservations,
    from: sql`reservations AS workshop_visits`,
    baseWhere: () => [
      sql`workshop_visits.type = 'maintenance_block'`,
      sql`workshop_visits.deleted_at IS NULL`,
    ],
  },
  // A damage check on a reservation in the recycle bin does not count; a
  // check without a reservation does.
  interactive_damage_checks: {
    table: interactiveDamageChecks,
    from: sql`interactive_damage_checks`,
    baseWhere: () => [
      sql`NOT EXISTS (SELECT 1 FROM reservations r WHERE r.id = interactive_damage_checks.reservation_id AND r.deleted_at IS NOT NULL)`,
    ],
  },
  // Voided readings do not count (like the km history), unless the report
  // filters on voidedAt itself; then that filter decides.
  vehicle_mileage_readings: {
    table: vehicleMileageReadings,
    from: sql`vehicle_mileage_readings`,
    baseWhere: (filters) =>
      filters.some((f: any) => f?.table === "vehicle_mileage_readings" && f?.field === "voidedAt")
        ? []
        : [sql`vehicle_mileage_readings.voided_at IS NULL`],
  },
};

/**
 * FIX-G — a restore that must be rolled back with a named reason. Thrown inside
 * `restoreDeletedRecord`'s transaction so the claim on `deleted_records` is
 * undone with everything else.
 */
class RestoreAbort extends Error {
  // besluiten B-35 — `detail` carries the extra fact a reason code alone
  // cannot (which live customer holds the debtor number), so the route can
  // name them in the message without a second query.
  constructor(readonly reason: string, readonly detail?: Record<string, unknown>) {
    super(reason);
    this.name = "RestoreAbort";
  }
}
import { addMonths, addDays, parseISO, isBefore, isAfter, isEqual } from "date-fns";
import { db, type DbTransaction } from "./db";
import { eq, ne, and, gte, lte, asc, desc, sql, inArray, not, or, ilike, isNull, isNotNull, getTableColumns, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { COLLECTION_LEG_REASON } from "../shared/portal-handover";
import { IStorage, type CompleteMaintenanceResult, type CompleteMaintenanceFile, type ExpenseFilters, type ExpenseListOptions, type ExpenseSortKey, type ExpensePage, type ExpenseSummary, type ExpenseFacets, type ExpenseVehicleGroup } from "./storage";
import { getRelativePath } from "./services/document-paths";
import { formatVehicleBarcode, parseBarcode, normalizeScannedCode, expandShortKeyCode } from "../shared/barcode";
// besluiten B-16 + B-07: one day count and one total, shared with the form.
import { recalculateTotalPrice } from "../shared/rental-pricing";
import { normalizeExpenseCategory } from "../shared/expense-categories";
import { syncUsagePeriodSafely } from "./services/fiscal/usage-periods";
import { recordMileageReading, readingInstantForOfficeDate, voidReadingsOfDeletedReservation, unvoidReadingsOfRestoredReservation } from "./services/mileage-history";
import * as fs from "fs";
import * as path from "path";

/** Thrown inside the completion transaction when another completion got there first (rolls it back). */
class AlreadyCompletedSignal extends Error {}

// Helper function for NOT IN array since drizzle-orm doesn't have a direct equivalent
function notInArray(column: any, values: any[]) {
  if (values.length === 0) return sql`1=1`; // Always true if no values
  return not(inArray(column, values));
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.username);
  }

  async getAuditLogs(options: {
    limit: number;
    offset: number;
    username?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    search?: string;
    from?: string;
    to?: string;
    /**
     * Which rows: `changes` (default) leaves out the screens and dialogs the
     * client reports (resource_type 'ui'), `ui` is only those, `all` is both.
     * The default keeps the activity log readable: one afternoon at the counter
     * opens more dialogs than a week of edits.
     */
    scope?: 'changes' | 'ui' | 'all';
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const conditions = [];

    const scope = options.scope ?? 'changes';
    if (scope === 'changes') conditions.push(sql`${auditLogs.resourceType} IS DISTINCT FROM 'ui'`);
    if (scope === 'ui') conditions.push(eq(auditLogs.resourceType, 'ui'));

    if (options.username) conditions.push(eq(auditLogs.username, options.username));
    if (options.action) conditions.push(eq(auditLogs.action, options.action));
    if (options.resourceType) conditions.push(eq(auditLogs.resourceType, options.resourceType));
    // OPT-022 - the filter the workflow report found ignored: asking for one
    // reservation's history answered with all 906 rows. `resource_id` is text,
    // so the caller's id is compared as text, exactly as it is written.
    if (options.resourceId) conditions.push(eq(auditLogs.resourceId, options.resourceId));
    if (options.from) conditions.push(gte(auditLogs.createdAt, new Date(`${options.from}T00:00:00`)));
    if (options.to) conditions.push(lte(auditLogs.createdAt, new Date(`${options.to}T23:59:59.999`)));

    if (options.search) {
      const term = `%${options.search}%`;
      conditions.push(
        or(
          ilike(auditLogs.username, term),
          ilike(auditLogs.action, term),
          ilike(auditLogs.resourceType, term),
          ilike(auditLogs.resourceId, term),
          // The label ("12XT102") and the changed fields live in the JSON blob
          sql`${auditLogs.details}::text ILIKE ${term}`,
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const logs = await db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(options.limit)
      .offset(options.offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where);

    return { logs, total: Number(count) || 0 };
  }

  async getAuditLogFilterOptions(): Promise<{ users: string[]; actions: string[]; resourceTypes: string[] }> {
    const [usersRows, actionRows, resourceRows] = await Promise.all([
      db.selectDistinct({ value: auditLogs.username }).from(auditLogs).orderBy(auditLogs.username),
      db.selectDistinct({ value: auditLogs.action }).from(auditLogs).orderBy(auditLogs.action),
      db.selectDistinct({ value: auditLogs.resourceType }).from(auditLogs).orderBy(auditLogs.resourceType),
    ]);

    const values = (rows: Array<{ value: string | null }>) =>
      rows.map((row) => row.value).filter((value): value is string => !!value);

    return {
      users: values(usersRows),
      actions: values(actionRows),
      resourceTypes: values(resourceRows),
    };
  }
  
  async updateUser(id: number, userData: Partial<InsertUser>): Promise<User | undefined> {
    // Never write a password through this method, whatever its value. Password
    // updates go through updateUserPassword / updateUserPasswordIfCurrent, which
    // are handed an already hashed value. An empty string used to slip through a
    // truthiness check here and was stored as the hash (user locked out).
    const { password: _ignoredPassword, ...safeUserData } = userData;

    // Add updatedAt timestamp
    const updateData = {
      ...safeUserData,
      updatedAt: new Date()
    };
    
    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
      
    return updatedUser;
  }
  
  /**
   * FIX-G (BUG-189) — a password change from two tabs used to succeed twice:
   * both verified the same old password and both wrote, so the winner was
   * whichever finished last and the user was told both had worked. The current
   * hash is the precondition of the write, so exactly one of them can win.
   */
  async updateUserPasswordIfCurrent(id: number, currentHash: string, hashedPassword: string): Promise<boolean> {
    const result = await db
      .update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.password, currentHash)));
    return (result.rowCount ?? 0) > 0;
  }

  async updateUserPassword(id: number, hashedPassword: string): Promise<boolean> {
    const result = await db
      .update(users)
      .set({
        password: hashedPassword,
        updatedAt: new Date()
      })
      .where(eq(users.id, id));
      
    return (result.rowCount ?? 0) > 0;
  }
  
  
  // Vehicle methods
  async getAllVehicles(searchQuery?: string): Promise<Vehicle[]> {
    if (!searchQuery) {
      return await db.select().from(vehicles);
    }
    
    // Sanitize the search query to handle license plates with or without dashes
    const sanitizedQuery = searchQuery.replace(/-/g, "").toUpperCase();
    const shortCodeSql = expandShortKeyCode(searchQuery)?.replace(/-S$/, "") ?? null;

    // Search by license plate (without dashes), brand, model, or barcode (so a
    // barcode scanner "typing" VEH-000123 into any search box finds the vehicle)
    return await db.select()
      .from(vehicles)
      .where(
        or(
          // Handle license plate search with or without dashes - using upper for case insensitivity
          sql`UPPER(replace(${vehicles.licensePlate}, '-', '')) LIKE ${`%${sanitizedQuery}%`}`,
          sql`UPPER(${vehicles.brand}) LIKE ${`%${sanitizedQuery}%`}`,
          sql`UPPER(${vehicles.model}) LIKE ${`%${sanitizedQuery}%`}`,
          sql`UPPER(replace(${vehicles.barcode}, '-', '')) LIKE ${`%${sanitizedQuery}%`}`,
          // a short key-label code (V123, S123R2) matches the stored VEH- code exactly
          ...(shortCodeSql ? [sql`UPPER(${vehicles.barcode}) = ${shortCodeSql}`] : [])
        )
      )
      .limit(10);
  }

  /**
   * FIX-H — the **one** writer of `vehicles.availability_status`.
   *
   * Before this, three unrelated pieces of code wrote the column: this sync
   * (called from inside two GET handlers, BUG-217), `markVehicleForService`,
   * and pickup/return. They disagreed, so a deliberate `not_for_rental`
   * vanished after a workshop visit (BUG-109) and a completed rental left the
   * car on `rented` for ever (BUG-130 — the old priority-3 reset only touched
   * vehicles with *no* reservation at all, so `rented -> scheduled` was
   * unreachable).
   *
   * The value is derived by `deriveVehicleAvailability()` and written here and
   * only here. The sweep loads the vehicles and their live reservations once
   * and issues at most one UPDATE per target status, for the differences only.
   */
  async syncVehicleAvailabilityWithReservations(): Promise<void> {
    const today = isoToday();

    const vehicleRows = await db
      .select({
        id: vehicles.id,
        availabilityStatus: vehicles.availabilityStatus,
        maintenanceStatus: vehicles.maintenanceStatus,
      })
      .from(vehicles);
    if (vehicleRows.length === 0) return;

    const reservationRows = await db
      .select({
        vehicleId: reservations.vehicleId,
        status: reservations.status,
        type: reservations.type,
        startDate: reservations.startDate,
        endDate: reservations.endDate,
        maintenanceStatus: reservations.maintenanceStatus,
      })
      .from(reservations)
      .where(and(
        isNull(reservations.deletedAt),
        sql`${reservations.vehicleId} IS NOT NULL`,
        sql`${reservations.status} NOT IN ('cancelled','completed','returned')`,
      ));

    const byVehicle = new Map<number, AvailabilityReservation[]>();
    for (const row of reservationRows) {
      if (row.vehicleId == null) continue;
      const list = byVehicle.get(row.vehicleId);
      if (list) list.push(row as AvailabilityReservation);
      else byVehicle.set(row.vehicleId, [row as AvailabilityReservation]);
    }

    const targets = new Map<VehicleAvailability, number[]>();
    for (const vehicle of vehicleRows) {
      const next = deriveVehicleAvailability({
        currentStatus: vehicle.availabilityStatus,
        maintenanceStatus: vehicle.maintenanceStatus,
        reservations: byVehicle.get(vehicle.id) ?? [],
        today,
      });
      if (next === vehicle.availabilityStatus) continue;
      const bucket = targets.get(next);
      if (bucket) bucket.push(vehicle.id);
      else targets.set(next, [vehicle.id]);
    }

    for (const [status, ids] of Array.from(targets.entries())) {
      await db.update(vehicles).set({ availabilityStatus: status }).where(inArray(vehicles.id, ids));
    }
  }

  /**
   * FIX-H — recompute one vehicle's availability from the same rule, right
   * after the mutation that could have changed it. This is what replaces the
   * sync call that used to sit inside `GET /api/vehicles` (BUG-217): the write
   * happens where the change happens, not on the hottest read path.
   *
   * `clearWorkshopFlag` is passed by the single caller that deliberately ends a
   * workshop job; without it a manual `needs_fixing` is sticky, which is what
   * besluiten B-03 asks for.
   */
  async recomputeVehicleAvailability(
    vehicleId: number | null | undefined,
    options: { executor?: any; clearWorkshopFlag?: boolean } = {},
  ): Promise<VehicleAvailability | undefined> {
    if (vehicleId == null) return undefined;
    const executor = options.executor ?? db;

    const [vehicle] = await executor
      .select({
        id: vehicles.id,
        availabilityStatus: vehicles.availabilityStatus,
        maintenanceStatus: vehicles.maintenanceStatus,
      })
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId));
    if (!vehicle) return undefined;

    const rows = await executor
      .select({
        status: reservations.status,
        type: reservations.type,
        startDate: reservations.startDate,
        endDate: reservations.endDate,
        maintenanceStatus: reservations.maintenanceStatus,
        deletedAt: reservations.deletedAt,
      })
      .from(reservations)
      .where(and(eq(reservations.vehicleId, vehicleId), isNull(reservations.deletedAt)));

    const next = deriveVehicleAvailability({
      currentStatus: vehicle.availabilityStatus,
      maintenanceStatus: vehicle.maintenanceStatus,
      reservations: rows as AvailabilityReservation[],
      clearWorkshopFlag: options.clearWorkshopFlag,
    });

    if (next !== vehicle.availabilityStatus) {
      await executor.update(vehicles).set({ availabilityStatus: next }).where(eq(vehicles.id, vehicleId));
    }
    return next;
  }

  async getVehicle(id: number): Promise<Vehicle | undefined> {
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id));
    return vehicle || undefined;
  }

  async createVehicle(vehicleData: InsertVehicle): Promise<Vehicle> {
    // BUG-125 — the barcode is server-owned. It used to come straight from
    // the request body, so a create could claim another vehicle's code (or
    // its license plate, which lookups match before the plate fallback) and
    // make that car unscannable. Whatever the body says is dropped here; the
    // only writers left are this line and regenerateVehicleBarcode().
    const { barcode: _clientBarcode, ...safeVehicleData } = vehicleData as InsertVehicle & { barcode?: unknown };
    const [vehicle] = await db.insert(vehicles).values(safeVehicleData as InsertVehicle).returning();
    const [updated] = await db
      .update(vehicles)
      .set({ barcode: formatVehicleBarcode(vehicle.id) })
      .where(eq(vehicles.id, vehicle.id))
      .returning();
    return updated;
  }

  async getVehicleByBarcode(barcode: string): Promise<Vehicle | undefined> {
    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.barcode, barcode));
    return vehicle;
  }

  async regenerateVehicleBarcode(id: number, updatedBy?: string): Promise<Vehicle | undefined> {
    const vehicle = await this.getVehicle(id);
    if (!vehicle) return undefined;
    // Parse current revision from an existing -R<n> suffix; bump it.
    const match = /-R(\d+)$/.exec(vehicle.barcode ?? "");
    // BUG-125: the next revision was computed from this vehicle's own suffix
    // only, so a code already taken elsewhere collided with the unique index and
    // the route answered 500. Walk forward until a free revision is found.
    let revision = match ? parseInt(match[1], 10) + 1 : 2;
    for (let attempt = 0; attempt < 50; attempt++, revision++) {
      const candidate = formatVehicleBarcode(id, revision);
      const taken = await this.getVehicleByBarcode(candidate);
      if (taken && taken.id !== id) continue;
      const [updated] = await db
        .update(vehicles)
        .set({ barcode: candidate, updatedBy: updatedBy ?? vehicle.updatedBy, updatedAt: new Date() })
        .where(eq(vehicles.id, id))
        .returning();
      return updated;
    }
    throw new Error("No free barcode revision found for this vehicle");
  }

  async updateVehicle(id: number, vehicleData: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    // BUG-125 — same rule on the way in: a PATCH may not move a barcode.
    // Admins regenerate through POST /api/vehicles/:id/barcode/regenerate,
    // which writes the column directly and is unaffected by this.
    if (vehicleData && "barcode" in vehicleData) {
      const { barcode: _clientBarcode, ...rest } = vehicleData as Partial<InsertVehicle> & { barcode?: unknown };
      vehicleData = rest as Partial<InsertVehicle>;
    }
    console.log(`Database updateVehicle called for ID ${id} with data:`, JSON.stringify(vehicleData, null, 2));
    try {
      // Explicitly debug the updatedBy value
      if ('updatedBy' in vehicleData) {
        console.log(`updatedBy value before database call: "${vehicleData.updatedBy}"`);
        
        // Try a direct SQL update to ensure the updated_by field is set
        console.log("Executing direct SQL update for updated_by field");
        const updateResult = await db.execute(sql`
          UPDATE vehicles
          SET updated_by = ${vehicleData.updatedBy}
          WHERE id = ${id}
        `);
        console.log("Direct SQL update result:", updateResult);
      } else {
        console.log("No updatedBy field in update data");
      }
      
      // Handle other properties normally
      const updateObject = {...vehicleData};
      if ('updatedBy' in updateObject) {
        delete updateObject.updatedBy; // Remove since we're handling separately
      }
      
      // Normal update for all other fields
      if (Object.keys(updateObject).length > 0) {
        const [updatedVehicle] = await db
          .update(vehicles)
          .set(updateObject)
          .where(eq(vehicles.id, id))
          .returning();
        
        console.log("Database returned vehicle:", JSON.stringify(updatedVehicle, null, 2));
        return updatedVehicle || undefined;
      } else {
        // If we only updated updatedBy, we need to return the vehicle anyway
        const [vehicle] = await db
          .select()
          .from(vehicles)
          .where(eq(vehicles.id, id));
        
        return vehicle || undefined;
      }
    } catch (error) {
      console.error("Error in database updateVehicle:", error);
      throw error;
    }
  }
  
  // Complete rewrite with basic direct statements to update vehicle registration
  async updateVehicleRegistrationStatus(id: number, status: string, userData: {
    username: string;
    date: string;
  }): Promise<Vehicle | undefined> {
    try {
      // Simple backup approach without any SQL parameters
      if (status === 'opnaam') {
        await this.updateVehicle(id, {
          registeredTo: "true",
          registeredToDate: userData.date,
          registeredToBy: userData.username,
          company: "false"
        });
      }
      else if (status === 'not-opnaam') {
        await this.updateVehicle(id, {
          registeredTo: "false",
          registeredToDate: userData.date,
          registeredToBy: userData.username
        });
      }
      else if (status === 'bv') {
        await this.updateVehicle(id, {
          company: "true",
          companyDate: userData.date,
          companyBy: userData.username,
          registeredTo: "false"
        });
      }
      else if (status === 'not-bv') {
        await this.updateVehicle(id, {
          company: "false",
          companyDate: userData.date,
          companyBy: userData.username
        });
      }
      else {
        throw new Error(`Invalid registration status: ${status}`);
      }
      
      // Get the updated vehicle data
      const updatedVehicle = await this.getVehicle(id);
      
      console.log("Database returned vehicle after status update:", JSON.stringify(updatedVehicle, null, 2));
      return updatedVehicle || undefined;
    } catch (error) {
      console.error(`Error in updateVehicleRegistrationStatus for ${status}:`, error);
      throw error;
    }
  }
  
  /**
   * The tables the vehicle snapshot builds by hand, in their own payload keys.
   * The generic FK walk skips them so nothing is captured twice, but still
   * descends *through* them to find their own dependants (BUG-110).
   */
  private static readonly VEHICLE_SNAPSHOT_TABLES = [
    "reservations", "documents", "expenses", "interactive_damage_checks",
    "vehicle_waitlist", "vehicle_transports", "vehicle_customer_blacklist",
  ];

  /**
   * besluiten **B-14** — "lopend of toekomstig" for a vehicle, by exactly the
   * rule B-08 already uses for a customer: a live row (not cancelled, not
   * completed, not returned, not in the recycle bin) whose period has not ended
   * yet, plus anything that is physically out (`picked_up`) whatever its dates
   * say — that is BUG-211's lesson.
   *
   * A maintenance block counts: the car is spoken for by the workshop, and
   * deleting it would take the block with it.
   */
  private blockingVehicleReservations(rows: Reservation[], today: string): Reservation[] {
    return rows.filter((r) => {
      if (r.deletedAt) return false;
      const status = normalizeReservationStatus(r.status);
      if (status && CLOSED_RESERVATION_STATUSES.has(status)) return false;
      if (status === 'picked_up') return true;
      const end = r.endDate && r.endDate !== '' && r.endDate !== 'undefined' ? r.endDate : null;
      return end === null || end >= today;
    });
  }

  async getVehicleDeleteImpact(id: number): Promise<{
    vehicle: Vehicle;
    counts: Record<string, number>;
    blockingReservations: Reservation[];
  } | undefined> {
    const vehicle = await this.getVehicle(id);
    if (!vehicle) return undefined;

    const [res, docs, exp, checks, waitlist, transports, blacklist] = await Promise.all([
      db.select().from(reservations).where(eq(reservations.vehicleId, id)),
      db.select().from(documents).where(eq(documents.vehicleId, id)),
      db.select().from(expenses).where(eq(expenses.vehicleId, id)),
      db.select().from(interactiveDamageChecks).where(eq(interactiveDamageChecks.vehicleId, id)),
      db.select().from(vehicleWaitlist).where(eq(vehicleWaitlist.vehicleId, id)),
      db.select().from(vehicleTransports).where(eq(vehicleTransports.vehicleId, id)),
      db.select().from(vehicleCustomerBlacklist).where(eq(vehicleCustomerBlacklist.vehicleId, id)),
    ]);

    // BUG-110 — the seven hand-listed tables were never the whole story.
    // `reservation_driver_assignments` and `apk_date_changes` go with a
    // CASCADE, and `fines`/`vehicle_transports` columns of *other* vehicles
    // are quietly set to NULL. None of it was counted, so "this will delete 3
    // documents" was simply wrong. The rest is discovered from the FK graph.
    const cascade = await collectCascadeSnapshot(db, "vehicles", id, {
      skipTables: DatabaseStorage.VEHICLE_SNAPSHOT_TABLES,
      // reservations.vehicle_id has no FK (BUG-039), so the graph walk cannot
      // reach them on its own - yet deleteVehicle removes them by hand and
      // Postgres then cascades their driver assignments away.
      seeds: [{ table: 'reservations', ids: res.map((r) => r.id) }],
    });

    return {
      vehicle,
      counts: {
        reservations: res.length,
        documents: docs.length,
        expenses: exp.length,
        damageChecks: checks.length,
        waitlist: waitlist.length,
        transports: transports.length,
        blacklist: blacklist.length,
        ...snapshotCounts(cascade),
      },
      // besluiten B-14 (BUG-022) — what refuses the delete.
      blockingReservations: this.blockingVehicleReservations(res, isoToday()),
    };
  }

  /**
   * Deleting a vehicle wipes its reservations, documents, expenses and damage
   * checks with it. Everything is snapshotted into `deleted_records` inside the
   * same transaction first, so the delete stays reversible via
   * restoreDeletedRecord() and always leaves a trace of who did it.
   *
   * besluiten **B-14** (BUG-022) — and it is refused outright while a rental is
   * running or planned on the car. The check sits inside the same transaction
   * as the snapshot, behind the `FOR UPDATE` below, so a booking created a
   * millisecond earlier cannot be wiped by a delete that read "no bookings"
   * before it.
   */
  async deleteVehicle(
    id: number,
    actor?: { username?: string | null; userId?: number | null }
  ): Promise<{ deleted: boolean; reason?: 'not_found' | 'has_live_reservations'; blockingReservations?: Reservation[] }> {
    // Start a transaction to ensure all related records are deleted
    return await db.transaction(async (tx) => {
      try {
        // FIX-G (BUG-188): SELECT … FOR UPDATE, so two parallel deletes of the
        // same vehicle serialise here. The second one re-reads after the first
        // commits, finds no row, and returns false (404) instead of writing a
        // second snapshot into the recycle bin.
        const [vehicle] = await tx.select().from(vehicles).where(eq(vehicles.id, id)).for('update');
        if (!vehicle) return { deleted: false, reason: 'not_found' as const };

        // Snapshot everything that is about to disappear, including the rows
        // Postgres would cascade away without us touching them.
        const [
          vehicleReservations,
          vehicleDocuments,
          vehicleExpenses,
          vehicleDamageChecks,
          vehicleWaitlistEntries,
          vehicleTransportRows,
          vehicleBlacklistRows,
        ] = await Promise.all([
          tx.select().from(reservations).where(eq(reservations.vehicleId, id)),
          tx.select().from(documents).where(eq(documents.vehicleId, id)),
          tx.select().from(expenses).where(eq(expenses.vehicleId, id)),
          tx.select().from(interactiveDamageChecks).where(eq(interactiveDamageChecks.vehicleId, id)),
          tx.select().from(vehicleWaitlist).where(eq(vehicleWaitlist.vehicleId, id)),
          tx.select().from(vehicleTransports).where(eq(vehicleTransports.vehicleId, id)),
          tx.select().from(vehicleCustomerBlacklist).where(eq(vehicleCustomerBlacklist.vehicleId, id)),
        ]);

        // besluiten B-14 (BUG-022) — refuse while a rental is live or planned.
        // Before this, deleting a car hard-deleted the bookings of every
        // customer on it without asking.
        const blocking = this.blockingVehicleReservations(vehicleReservations as Reservation[], isoToday());
        if (blocking.length > 0) {
          return { deleted: false, reason: 'has_live_reservations' as const, blockingReservations: blocking };
        }

        // BUG-110 — everything else the delete takes with it, discovered from
        // the foreign-key graph rather than from a list that goes stale.
        const cascade = await collectCascadeSnapshot(tx, "vehicles", id, {
          skipTables: DatabaseStorage.VEHICLE_SNAPSHOT_TABLES,
          seeds: [{ table: 'reservations', ids: vehicleReservations.map((r) => r.id) }],
        });

        await tx.insert(deletedRecords).values({
          entityType: 'vehicle',
          entityId: id,
          label: `${vehicle.licensePlate} ${vehicle.brand} ${vehicle.model}`.trim(),
          payload: {
            vehicle,
            reservations: vehicleReservations,
            documents: vehicleDocuments,
            expenses: vehicleExpenses,
            damageChecks: vehicleDamageChecks,
            waitlist: vehicleWaitlistEntries,
            transports: vehicleTransportRows,
            blacklist: vehicleBlacklistRows,
            cascade,
          },
          relatedCounts: {
            ...snapshotCounts(cascade),
            reservations: vehicleReservations.length,
            documents: vehicleDocuments.length,
            expenses: vehicleExpenses.length,
            damageChecks: vehicleDamageChecks.length,
            waitlist: vehicleWaitlistEntries.length,
            transports: vehicleTransportRows.length,
            blacklist: vehicleBlacklistRows.length,
          },
          deletedBy: actor?.username || null,
          deletedByUserId: actor?.userId ?? null,
        });

        // Delete related documents first
        await tx.delete(documents).where(eq(documents.vehicleId, id));

        // Delete related expenses
        await tx.delete(expenses).where(eq(expenses.vehicleId, id));

        // Delete related reservations
        await tx.delete(reservations).where(eq(reservations.vehicleId, id));

        // These two have ON DELETE NO ACTION foreign keys, so leaving them in
        // place made the whole delete fail with a constraint violation.
        await tx.delete(interactiveDamageChecks).where(eq(interactiveDamageChecks.vehicleId, id));
        await tx.delete(vehicleWaitlist).where(eq(vehicleWaitlist.vehicleId, id));

        // Finally delete the vehicle
        const [deleted] = await tx
          .delete(vehicles)
          .where(eq(vehicles.id, id))
          .returning();

        return { deleted: !!deleted, ...(deleted ? {} : { reason: 'not_found' as const }) };
      } catch (error) {
        console.error("Error during vehicle deletion transaction:", error);
        throw error;
      }
    });
  }

  /**
   * Newest first, restored rows included. Sub-project C (B-36): with an
   * `entityType` the filter runs in the database, so a kind's cap applies to
   * that kind alone (a bin full of fines no longer pushes the one vehicle out
   * of the list); without it the list is mixed, as before.
   */
  async getDeletedRecords(limit = 100, entityType?: string, filter?: { customerId?: number }): Promise<DeletedRecord[]> {
    // Sub-project D (B-41 D8): the driver bin of one customer's details screen. The customer
    // id lives in the snapshot (the driver row is gone), so the filter reads the payload.
    const ofCustomer = filter?.customerId != null
      ? sql`(${deletedRecords.payload}->'driver'->>'customerId')::int = ${filter.customerId}`
      : undefined;
    return await db
      .select()
      .from(deletedRecords)
      .where(and(entityType ? eq(deletedRecords.entityType, entityType) : undefined, ofCustomer))
      .orderBy(desc(deletedRecords.deletedAt), desc(deletedRecords.id))
      .limit(limit);
  }

  async getDeletedRecord(id: number): Promise<DeletedRecord | undefined> {
    const [record] = await db.select().from(deletedRecords).where(eq(deletedRecords.id, id));
    return record;
  }

  /**
   * Puts a deleted vehicle and everything that went with it back, keeping the
   * original ids so existing references (contract PDFs, notes) still line up.
   */
  async restoreDeletedRecord(
    id: number,
    actor?: { username?: string | null }
  ): Promise<{ restored: boolean; reason?: string; record?: DeletedRecord; conflicts?: number[]; conflictingCustomerName?: string; warnings?: string[] }> {
    const record = await this.getDeletedRecord(id);
    if (!record) return { restored: false, reason: 'not_found' };
    if (record.restoredAt) return { restored: false, reason: 'already_restored', record };
    if (record.entityType === 'fine') return this.restoreDeletedFine(record, actor);
    // besluiten B-08 — a customer goes to the recycle bin like a vehicle, and
    // comes back the same way.
    if (record.entityType === 'customer') return this.restoreDeletedCustomer(record, actor);
    // besluiten B-15 — and so do a reservation (BUG-151) and a transport
    // (BUG-140), both through the bookability predicate.
    // Sub-project C (B-36): a maintenance block has a bin kind of its own but is
    // the same reservation row underneath, restored the same way.
    if (record.entityType === 'reservation' || record.entityType === 'maintenance_block') {
      return this.restoreDeletedReservation(record, actor);
    }
    if (record.entityType === 'transport') return this.restoreDeletedTransport(record, actor);
    // Sub-project D (B-41 D8): a driver and an expense have their own bins.
    if (record.entityType === 'driver') return this.restoreDeletedDriver(record, actor);
    if (record.entityType === 'expense') return this.restoreDeletedExpense(record, actor);
    if (record.entityType !== 'vehicle') return { restored: false, reason: 'unsupported_type', record };

    const payload = record.payload as any;
    const vehicle = payload?.vehicle;
    if (!vehicle) return { restored: false, reason: 'empty_snapshot', record };
    let restoreConflicts: number[] = [];

    try {
      await db.transaction(async (tx) => {
      // FIX-G (BUG-043): claim the record first, with the precondition in the
      // WHERE clause. Five parallel restores used to read "not restored yet"
      // together and then all insert the same ids, which surfaced as raw 500s
      // from the primary key. Now exactly one claim succeeds; the others find
      // the row already claimed and get a clean 409.
      const [claimed] = await tx
        .update(deletedRecords)
        .set({ restoredAt: new Date(), restoredBy: actor?.username || null })
        .where(and(eq(deletedRecords.id, id), isNull(deletedRecords.restoredAt)))
        .returning();
      if (!claimed) throw new RestoreAbort('already_restored');

      // The id may have been taken by a later insert, and the license plate may
      // have been re-created by hand after the delete (which is exactly what
      // people do when a vehicle disappears). Both block a clean restore, and
      // so does the barcode (BUG-126) — which used to be the one unique column
      // nobody checked, so the collision came back as a 500.
      const [idTaken] = await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, vehicle.id));
      if (idTaken) throw new RestoreAbort('id_taken');

      const [plateTaken] = await tx
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(eq(vehicles.licensePlate, vehicle.licensePlate));
      if (plateTaken) throw new RestoreAbort('license_plate_taken');

      if (vehicle.barcode) {
        const [barcodeTaken] = await tx
          .select({ id: vehicles.id })
          .from(vehicles)
          .where(eq(vehicles.barcode, vehicle.barcode));
        if (barcodeTaken) throw new RestoreAbort('barcode_taken');
      }

      // JSON has no date type, so every timestamp came back out of the
      // snapshot as a string. Which columns those are is read from the table
      // definition — hand-listing them missed uploadDate, checkDate and the
      // transport times, and drizzle then threw "value.toISOString is not a
      // function" halfway through the restore.
      const revive = (table: any, rows: any[] | undefined) => {
        const columns = getTableColumns(table);
        const dateKeys = Object.entries(columns)
          .filter(([, column]: [string, any]) => column?.dataType === 'date')
          .map(([key]) => key);

        return (rows || []).map((row) => {
          const revived = { ...row };
          for (const key of dateKeys) {
            const value = revived[key];
            if (typeof value === 'string' || typeof value === 'number') {
              revived[key] = new Date(value);
            }
          }
          return revived;
        });
      };

      await tx.insert(vehicles).values(revive(vehicles, [vehicle])[0]);

      // BUG-108 — the snapshotted bookings used to be re-inserted blind, on top
      // of whatever had been booked on that vehicle in the meantime: restore a
      // wrongly deleted car and you silently had two customers on the same days.
      // Every live snapshotted booking is checked against what is there now; a
      // clash comes back as `cancelled` with a note, so the row is preserved and
      // visible instead of double-booking the car.
      const snapshotReservations: any[] = payload.reservations || [];
      const conflictedIds = new Set<number>();
      for (const row of snapshotReservations) {
        if (!row || row.vehicleId == null && row.vehicle_id == null) continue;
        const status = normalizeReservationStatus(row.status ?? 'booked');
        if (status && CLOSED_RESERVATION_STATUSES.has(status)) continue;
        const verdict = await this.isVehicleBookable({
          vehicleId: row.vehicleId ?? row.vehicle_id,
          startDate: row.startDate ?? row.start_date,
          endDate: row.endDate ?? row.end_date ?? null,
          isMaintenanceBlock: (row.type ?? 'standard') === 'maintenance_block',
        }, tx);
        if (!verdict.bookable && verdict.reason === "CONFLICT") {
          conflictedIds.add(row.id);
          row.status = 'cancelled';
          row.notes = `${row.notes ?? ''}\n[RESTORE] Niet hersteld als actieve boeking: het voertuig was in de tussentijd geboekt (${verdict.conflicts.map((c) => `#${c.id}`).join(', ')}).`.trim();
        }
      }
      restoreConflicts = Array.from(conflictedIds);

      for (const [table, rows] of [
        [reservations, payload.reservations],
        [documents, payload.documents],
        [expenses, payload.expenses],
        [interactiveDamageChecks, payload.damageChecks],
        [vehicleWaitlist, payload.waitlist],
        [vehicleTransports, payload.transports],
        [vehicleCustomerBlacklist, payload.blacklist],
      ] as const) {
        const values = revive(table, rows as any[]);
        if (values.length > 0) {
          await tx.insert(table as any).values(values);
        }
      }

      // Keep the serial sequences ahead of the ids we just forced back in.
      // BUG-110 — and everything the FK walk captured: driver assignments, APK
      // date changes, the fines that pointed here, and the transport columns of
      // other vehicles that a SET NULL had blanked.
      await restoreCascadeSnapshot(tx, payload.cascade as CascadeSnapshot | undefined);

      for (const tableName of [
        'vehicles', 'reservations', 'documents', 'expenses',
        'interactive_damage_checks', 'vehicle_waitlist', 'vehicle_transports',
        'vehicle_customer_blacklist',
      ]) {
        await tx.execute(sql`
          SELECT setval(
            pg_get_serial_sequence(${tableName}, 'id'),
            GREATEST((SELECT COALESCE(MAX(id), 1) FROM ${sql.raw(`"${tableName}"`)}), 1)
          )
        `);
      }
      });
    } catch (error) {
      // A failed precondition rolls the claim back with the transaction, so the
      // record stays restorable once the clash is cleared up.
      if (error instanceof RestoreAbort) {
        return { restored: false, reason: error.reason, record };
      }
      throw error;
    }

    return { restored: true, record, conflicts: restoreConflicts };
  }

  /**
   * besluiten **B-08** — the customer half of the recycle bin.
   *
   * `deleteCustomer` was a bare `db.delete(customers)`: no impact check, no
   * snapshot, and — because `reservations.customer_id` has no foreign key — a
   * `booked` reservation simply kept pointing at a customer that no longer
   * existed, with no UI path back (BUG-007).
   */
  /**
   * besluiten **B-15** (BUG-151) — the reservation half of the recycle bin.
   *
   * The row itself never left the table (the delete is soft), so the restore is
   * "clear `deleted_at`" — but only after the bookability predicate has said
   * the period is still free. That is wave 3's BUG-108 rule: the audit's own
   * manual `update reservations set deleted_at = null` produced a double
   * booking within seconds, and a restore button must not be able to repeat it.
   */
  private async restoreDeletedReservation(
    record: DeletedRecord,
    actor?: { username?: string | null }
  ): Promise<{ restored: boolean; reason?: string; record?: DeletedRecord }> {
    const payload = record.payload as any;
    const snapshot = payload?.reservation;
    if (!snapshot) return { restored: false, reason: 'empty_snapshot', record };

    try {
      await db.transaction(async (tx) => {
        const [claimed] = await tx
          .update(deletedRecords)
          .set({ restoredAt: new Date(), restoredBy: actor?.username || null })
          .where(and(eq(deletedRecords.id, record.id), isNull(deletedRecords.restoredAt)))
          .returning();
        if (!claimed) throw new RestoreAbort('already_restored');

        const [current] = await tx.select().from(reservations)
          .where(eq(reservations.id, record.entityId)).for('update');
        if (!current) throw new RestoreAbort('not_found');
        if (!current.deletedAt) throw new RestoreAbort('already_restored');

        // BUG-108's rule: a restore may never re-create a double booking.
        if (current.vehicleId != null) {
          const verdict = await this.isVehicleBookable({
            vehicleId: current.vehicleId,
            startDate: current.startDate,
            endDate: current.endDate ?? null,
            startTime: current.startTime ?? null,
            endTime: current.endTime ?? null,
            excludeReservationId: current.id,
            isMaintenanceBlock: current.type === 'maintenance_block',
          }, tx);
          if (!verdict.bookable && verdict.reason === 'CONFLICT') {
            throw new RestoreAbort('reservation_conflict');
          }
        }

        // The contract number was blanked by the delete so it could be reused.
        // Give it back only when it is still free — never at the cost of the
        // unique index (BUG-038's class of failure).
        let contractNumber: string | null = null;
        const snapshotNumber = typeof snapshot.contractNumber === 'string' ? snapshot.contractNumber : null;
        if (snapshotNumber) {
          const [taken] = await tx.select({ id: reservations.id }).from(reservations)
            .where(eq(reservations.contractNumber, snapshotNumber));
          if (!taken) contractNumber = snapshotNumber;
        }

        await tx.update(reservations).set({
          deletedAt: null,
          deletedBy: null,
          deletedByUser: null,
          updatedBy: actor?.username ?? null,
          updatedAt: new Date(),
          ...(contractNumber ? { contractNumber } : {}),
        }).where(eq(reservations.id, record.entityId));

        // Rapporten fase 1 - the readings the delete voided count again.
        await unvoidReadingsOfRestoredReservation(tx, record.entityId, current.deletedAt);
      });
    } catch (error) {
      if (error instanceof RestoreAbort) return { restored: false, reason: error.reason, record };
      throw error;
    }

    // Fiscal mobility check: a restored rental reopens its usage period (docs/fiscaal §4.3).
    await syncUsagePeriodSafely(record.entityId);
    return { restored: true, record };
  }

  /**
   * besluiten **B-15** (BUG-140) — the transport half. `vehicle_transports` has
   * no soft-delete column, so the row is inserted back from the snapshot under
   * its original id, and the spare reservation the delete closed is reopened
   * with it — through the same predicate, so the spare cannot come back onto
   * days another car was booked for in the meantime.
   */
  private async restoreDeletedTransport(
    record: DeletedRecord,
    actor?: { username?: string | null }
  ): Promise<{ restored: boolean; reason?: string; record?: DeletedRecord }> {
    const payload = record.payload as any;
    const snapshot = payload?.transport;
    if (!snapshot) return { restored: false, reason: 'empty_snapshot', record };

    try {
      await db.transaction(async (tx) => {
        const [claimed] = await tx
          .update(deletedRecords)
          .set({ restoredAt: new Date(), restoredBy: actor?.username || null })
          .where(and(eq(deletedRecords.id, record.id), isNull(deletedRecords.restoredAt)))
          .returning();
        if (!claimed) throw new RestoreAbort('already_restored');

        const [idTaken] = await tx.select({ id: vehicleTransports.id }).from(vehicleTransports)
          .where(eq(vehicleTransports.id, record.entityId));
        if (idTaken) throw new RestoreAbort('id_taken');

        // JSON has no date type — the same revival the vehicle restore does.
        const columns = getTableColumns(vehicleTransports);
        const dateKeys = Object.entries(columns)
          .filter(([, column]: [string, any]) => column?.dataType === 'date')
          .map(([key]) => key);
        const row: any = { ...snapshot };
        for (const key of dateKeys) {
          const value = row[key];
          if (typeof value === 'string' || typeof value === 'number') row[key] = new Date(value);
        }

        // The spare reservation may itself have been deleted for good since;
        // the transport comes back either way, with the link it had.
        const spare = payload?.spareReservation;
        if (spare?.id != null) {
          const [current] = await tx.select().from(reservations)
            .where(eq(reservations.id, spare.id)).for('update');
          if (!current) {
            row.spareReservationId = null;
          } else if (current.deletedAt) {
            let bookable = true;
            if (current.vehicleId != null) {
              const verdict = await this.isVehicleBookable({
                vehicleId: current.vehicleId,
                startDate: current.startDate,
                endDate: current.endDate ?? null,
                excludeReservationId: current.id,
                isMaintenanceBlock: current.type === 'maintenance_block',
              }, tx);
              bookable = verdict.bookable || verdict.reason !== 'CONFLICT';
            }
            if (bookable) {
              await tx.update(reservations)
                .set({ deletedAt: null, deletedBy: null, deletedByUser: null, updatedBy: actor?.username ?? null, updatedAt: new Date() })
                .where(eq(reservations.id, current.id));
            } else {
              // Visible and explained, never a silent second booking.
              await tx.update(reservations).set({
                status: 'cancelled',
                notes: `${current.notes ?? ''}\n[RESTORE] Vervanger niet heropend: de auto was in de tussentijd geboekt.`.trim(),
                updatedAt: new Date(),
              }).where(eq(reservations.id, current.id));
            }
          }
        }

        await tx.insert(vehicleTransports).values(row);
        await tx.execute(sql`
          SELECT setval(
            pg_get_serial_sequence('vehicle_transports', 'id'),
            GREATEST((SELECT COALESCE(MAX(id), 1) FROM "vehicle_transports"), 1)
          )
        `);
      });
    } catch (error) {
      if (error instanceof RestoreAbort) return { restored: false, reason: error.reason, record };
      throw error;
    }

    return { restored: true, record };
  }

  private async restoreDeletedCustomer(
    record: DeletedRecord,
    actor?: { username?: string | null }
  ): Promise<{ restored: boolean; reason?: string; record?: DeletedRecord; conflictingCustomerName?: string }> {
    const payload = record.payload as any;
    const customer = payload?.customer;
    if (!customer) return { restored: false, reason: 'empty_snapshot', record };

    try {
      await db.transaction(async (tx) => {
        const [claimed] = await tx
          .update(deletedRecords)
          .set({ restoredAt: new Date(), restoredBy: actor?.username || null })
          .where(and(eq(deletedRecords.id, record.id), isNull(deletedRecords.restoredAt)))
          .returning();
        if (!claimed) throw new RestoreAbort('already_restored');

        const [idTaken] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, customer.id));
        if (idTaken) throw new RestoreAbort('id_taken');

        // besluiten B-35 — the debtor number was reserved for this customer
        // while it sat in the bin; something else may have claimed it since.
        const debtorNumber = typeof customer.debtorNumber === 'string' ? customer.debtorNumber.trim() : '';
        if (debtorNumber) {
          const [holder] = await tx
            .select({ id: customers.id, name: customers.name })
            .from(customers)
            .where(sql`lower(btrim(${customers.debtorNumber})) = lower(btrim(${debtorNumber}))`);
          if (holder) throw new RestoreAbort('debtor_number_taken', { conflictingCustomerName: holder.name });
        }

        const revived: any = { ...customer };
        // besluiten B-35 — normalise the same way POST/PATCH do (trim; ""
        // becomes null) before reviving. A snapshot taken before this feature
        // shipped can hold an un-trimmed or blank value verbatim; reinserting
        // it as-is would let a pre-feature snapshot bypass the write-time
        // normalisation every other path already enforces.
        revived.debtorNumber = debtorNumber || null;
        for (const key of Object.keys(revived)) {
          if ((key === 'createdAt' || key === 'updatedAt') && typeof revived[key] === 'string') {
            revived[key] = new Date(revived[key]);
          }
        }
        await tx.insert(customers).values(revived);
        await restoreCascadeSnapshot(tx, payload.cascade as CascadeSnapshot | undefined);
        await tx.execute(sql`
          SELECT setval(
            pg_get_serial_sequence('customers', 'id'),
            GREATEST((SELECT COALESCE(MAX(id), 1) FROM customers), 1)
          )
        `);
      });
    } catch (error) {
      if (error instanceof RestoreAbort) {
        return { restored: false, reason: error.reason, record, ...(error.detail ?? {}) };
      }
      throw error;
    }

    return { restored: true, record };
  }

  /** Puts a deleted fine back with its original id; the snapshot holds the full row. */
  private async restoreDeletedFine(
    record: DeletedRecord,
    actor?: { username?: string | null }
  ): Promise<{ restored: boolean; reason?: string; record?: DeletedRecord }> {
    const fine = (record.payload as any)?.fine;
    if (!fine) return { restored: false, reason: 'empty_snapshot', record };
    const [idTaken] = await db.select({ id: fines.id }).from(fines).where(eq(fines.id, fine.id));
    if (idTaken) return { restored: false, reason: 'id_taken', record };

    const dateKeys = Object.entries(getTableColumns(fines))
      .filter(([, column]: [string, any]) => column?.dataType === 'date')
      .map(([key]) => key);
    const revived: any = { ...fine };
    for (const key of dateKeys) {
      if (typeof revived[key] === 'string' || typeof revived[key] === 'number') revived[key] = new Date(revived[key]);
    }
    // Links may point at rows that vanished in the meantime; drop those instead of failing.
    if (revived.customerId && !(await db.select({ id: customers.id }).from(customers).where(eq(customers.id, revived.customerId)))[0]) revived.customerId = null;
    if (revived.reservationId && !(await db.select({ id: reservations.id }).from(reservations).where(eq(reservations.id, revived.reservationId)))[0]) revived.reservationId = null;
    if (revived.driverId && !(await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, revived.driverId)))[0]) revived.driverId = null;
    if (revived.vehicleId && !(await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, revived.vehicleId)))[0]) revived.vehicleId = null;
    if (revived.importFileId) revived.importFileId = null;

    try {
      await db.transaction(async (tx) => {
        // FIX-G (BUG-043): same claim-first rule as the vehicle restore.
        const [claimed] = await tx.update(deletedRecords)
          .set({ restoredAt: new Date(), restoredBy: actor?.username || null })
          .where(and(eq(deletedRecords.id, record.id), isNull(deletedRecords.restoredAt)))
          .returning();
        if (!claimed) throw new RestoreAbort('already_restored');
        await tx.insert(fines).values(revived);
        await tx.execute(sql`SELECT setval(pg_get_serial_sequence('fines', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM "fines"), 1))`);
      });
    } catch (error) {
      if (error instanceof RestoreAbort) return { restored: false, reason: error.reason, record };
      throw error;
    }
    return { restored: true, record };
  }

  /** Timestamp columns of a table come back from the JSON snapshot as ISO strings; make them Dates again. */
  private reviveDates(table: any, row: Record<string, any>): Record<string, any> {
    const revived: Record<string, any> = { ...row };
    for (const [key, column] of Object.entries(getTableColumns(table)) as Array<[string, any]>) {
      if (column?.dataType === 'date' && (typeof revived[key] === 'string' || typeof revived[key] === 'number')) {
        revived[key] = new Date(revived[key]);
      }
    }
    return revived;
  }

  /**
   * Sub-project D (B-41 D8) — puts a deleted driver back with its original id. The customer
   * must exist (the foreign key; `customer_missing` tells the client to restore the customer
   * first). The links the delete blanked (`cascade.nulled`) are put back only where the other row
   * still exists and the column is still empty, so a reservation that got another driver in the
   * meantime keeps it. A licence document that is gone is dropped from the row.
   */
  private async restoreDeletedDriver(
    record: DeletedRecord,
    actor?: { username?: string | null }
  ): Promise<{ restored: boolean; reason?: string; record?: DeletedRecord }> {
    const payload = record.payload as any;
    const driver = payload?.driver;
    if (!driver) return { restored: false, reason: 'empty_snapshot', record };
    const [idTaken] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, driver.id));
    if (idTaken) return { restored: false, reason: 'id_taken', record };
    const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, driver.customerId));
    if (!customer) return { restored: false, reason: 'customer_missing', record };

    const revived = this.reviveDates(drivers, driver);
    if (revived.licenseDocumentId != null
      && !(await db.select({ id: documents.id }).from(documents).where(eq(documents.id, revived.licenseDocumentId)))[0]) {
      revived.licenseDocumentId = null;
    }

    try {
      await db.transaction(async (tx) => {
        // FIX-G (BUG-043): same claim-first rule as the other kinds.
        const [claimed] = await tx.update(deletedRecords)
          .set({ restoredAt: new Date(), restoredBy: actor?.username || null })
          .where(and(eq(deletedRecords.id, record.id), isNull(deletedRecords.restoredAt)))
          .returning();
        if (!claimed) throw new RestoreAbort('already_restored');
        await tx.insert(drivers).values(revived as any);
        await tx.execute(sql`SELECT setval(pg_get_serial_sequence('drivers', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM "drivers"), 1))`);
        // Only the blanked links: a driver has no cascaded rows of its own.
        await restoreCascadeSnapshot(tx, { deleted: [], nulled: payload?.cascade?.nulled ?? [] });
      });
    } catch (error) {
      if (error instanceof RestoreAbort) return { restored: false, reason: error.reason, record };
      throw error;
    }
    return { restored: true, record };
  }

  /**
   * Sub-project D (B-41 D8) — puts a deleted expense back with its original id. There is no
   * foreign key from `expenses.vehicle_id`, so an expense whose vehicle is gone still comes back,
   * with the warning `vehicle_missing`. `inbox_item_id` returns only when that inbox item still
   * exists (otherwise it is dropped), and the id goes back into `invoice_inbox_items.expense_ids`
   * of the items that listed it.
   */
  private async restoreDeletedExpense(
    record: DeletedRecord,
    actor?: { username?: string | null }
  ): Promise<{ restored: boolean; reason?: string; record?: DeletedRecord; warnings?: string[] }> {
    const payload = record.payload as any;
    const expense = payload?.expense;
    if (!expense) return { restored: false, reason: 'empty_snapshot', record };
    const [idTaken] = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.id, expense.id));
    if (idTaken) return { restored: false, reason: 'id_taken', record };

    const warnings: string[] = [];
    const [vehicle] = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, expense.vehicleId));
    if (!vehicle) warnings.push('vehicle_missing');

    const revived = this.reviveDates(expenses, expense);
    const listedBy: number[] = Array.isArray(payload?.inboxItemIds) ? payload.inboxItemIds.map(Number) : [];
    const candidates = [...new Set([...listedBy, ...(revived.inboxItemId != null ? [Number(revived.inboxItemId)] : [])])];

    try {
      await db.transaction(async (tx) => {
        const [claimed] = await tx.update(deletedRecords)
          .set({ restoredAt: new Date(), restoredBy: actor?.username || null })
          .where(and(eq(deletedRecords.id, record.id), isNull(deletedRecords.restoredAt)))
          .returning();
        if (!claimed) throw new RestoreAbort('already_restored');

        // Which of the inbox items the expense belonged to still exist.
        const present = new Set<number>(candidates.length === 0 ? [] : (await tx.execute(
          sql`SELECT id FROM invoice_inbox_items WHERE id IN (${sql.join(candidates.map((i) => sql`${i}`), sql`, `)})`,
        )).rows.map((r: any) => Number(r.id)));
        if (revived.inboxItemId != null && !present.has(Number(revived.inboxItemId))) revived.inboxItemId = null;

        await tx.insert(expenses).values(revived as any);
        await tx.execute(sql`SELECT setval(pg_get_serial_sequence('expenses', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM "expenses"), 1))`);
        for (const itemId of listedBy.filter((i) => present.has(i))) {
          await tx.execute(sql`UPDATE invoice_inbox_items SET expense_ids = array_append(expense_ids, ${expense.id}) WHERE id = ${itemId} AND NOT (${expense.id} = ANY(expense_ids))`);
        }
      });
    } catch (error) {
      if (error instanceof RestoreAbort) return { restored: false, reason: error.reason, record };
      throw error;
    }
    return { restored: true, record, ...(warnings.length > 0 ? { warnings } : {}) };
  }

  async getAvailableVehicles(): Promise<Vehicle[]> {
    const today = new Date().toISOString().split('T')[0];
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const threeDaysFromNowStr = threeDaysFromNow.toISOString().split('T')[0];
    
    // Get all vehicles that don't have a non-cancelled, non-returned, non-completed, non-deleted reservation 
    // that either includes today OR starts within the next 3 days
    // Exclude maintenance blocks - rentals continue during maintenance (monthly payment)
    const reservedVehicleIds = await db
      .select({ vehicleId: reservations.vehicleId })
      .from(reservations)
      .where(
        and(
          sql`${reservations.status} != 'cancelled'`,
          sql`${reservations.status} != 'returned'`,
          sql`${reservations.status} != 'completed'`,
          sql`${reservations.type} != 'maintenance_block'`, // Exclude maintenance - rentals continue
          isNull(reservations.deletedAt),
          sql`${reservations.vehicleId} IS NOT NULL`, // Exclude placeholder reservations
          // Vehicle is reserved if: starts today or earlier AND (ends today or later OR is open-ended)
          // OR starts within next 3 days
          or(
            and(
              sql`${reservations.startDate} <= ${today}`,
              or(
                sql`${reservations.endDate} >= ${today}`,
                isNull(reservations.endDate) // Include open-ended rentals
              )
            ),
            // Also exclude vehicles with bookings starting within next 3 days
            and(
              sql`${reservations.startDate} > ${today}`,
              sql`${reservations.startDate} <= ${threeDaysFromNowStr}`
            )
          )
        )
      );
    
    const reservedIds = new Set(reservedVehicleIds.map(row => row.vehicleId));
    
    if (reservedIds.size === 0) {
      // No reserved vehicles, return all vehicles that are available for rental
      return await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.availabilityStatus, 'available'));
    }
    
    // When we have reserved vehicles, query for all those not in the reserved list AND available for rental
    const reservedIdsArray = Array.from(reservedIds);
    
    // Handle each vehicle separately with individual OR conditions to avoid array parameter issues
    const vehicleConditions = reservedIdsArray.map(id => sql`${vehicles.id} != ${id}`);
    const combinedCondition = sql.join(vehicleConditions, sql` AND `);
    
    return await db
      .select()
      .from(vehicles)
      .where(
        and(
          combinedCondition,
          eq(vehicles.availabilityStatus, 'available')
        )
      );
  }

  async getVehiclesWithApkExpiringSoon(options?: { 
    daysAhead?: number; 
    excludedStatuses?: string[] 
  }): Promise<Vehicle[]> {
    const today = new Date();
    const daysAhead = options?.daysAhead ?? 60; // Default 60 days (2 months)
    const twoMonthsAgo = addMonths(today, -2);
    const futureDate = addDays(today, daysAhead);
    const pastStr = twoMonthsAgo.toISOString().split('T')[0];
    const futureStr = futureDate.toISOString().split('T')[0];
    
    // Build conditions for the query
    const conditions: any[] = [
      sql`${vehicles.apkDate} IS NOT NULL`,
      sql`${vehicles.apkDate} >= ${pastStr}`, // Not more than 2 months overdue
      sql`${vehicles.apkDate} <= ${futureStr}` // Within specified days ahead
    ];
    
    // Add exclusion for specified vehicle statuses
    if (options?.excludedStatuses && options.excludedStatuses.length > 0) {
      for (const status of options.excludedStatuses) {
        conditions.push(sql`${vehicles.availabilityStatus} != ${status}`);
      }
    }
    
    // Get all vehicles with APK expiring soon (including overdue up to 2 months)
    const expiringVehicles = await db
      .select()
      .from(vehicles)
      .where(and(...conditions));
    
    // Get all vehicles that already have a scheduled APK inspection (exclude soft-deleted)
    const scheduledApkInspections = await db
      .select({ vehicleId: reservations.vehicleId })
      .from(reservations)
      .where(
        and(
          eq(reservations.type, 'maintenance_block'),
          sql`${reservations.notes} LIKE '%apk_inspection:%'`,
          or(
            eq(reservations.maintenanceStatus, 'scheduled'),
            eq(reservations.maintenanceStatus, 'in_progress')
          ),
          sql`${reservations.deletedAt} IS NULL` // Exclude soft-deleted reservations
        )
      );
    
    const vehiclesWithScheduledApk = new Set(
      scheduledApkInspections.map(row => row.vehicleId).filter(id => id !== null)
    );
    
    // Filter out vehicles that already have a scheduled APK inspection
    return expiringVehicles.filter(vehicle => !vehiclesWithScheduledApk.has(vehicle.id));
  }

  async getVehiclesWithWarrantyExpiringSoon(options?: { 
    daysAhead?: number; 
    excludedStatuses?: string[] 
  }): Promise<Vehicle[]> {
    const today = new Date();
    const daysAhead = options?.daysAhead ?? 60; // Default 60 days (2 months)
    const twoMonthsAgo = addMonths(today, -2);
    const futureDate = addDays(today, daysAhead);
    const pastStr = twoMonthsAgo.toISOString().split('T')[0];
    const futureStr = futureDate.toISOString().split('T')[0];
    
    // Build conditions for the query
    const conditions: any[] = [
      sql`${vehicles.warrantyEndDate} IS NOT NULL`,
      sql`${vehicles.warrantyEndDate} >= ${pastStr}`, // Not more than 2 months overdue
      sql`${vehicles.warrantyEndDate} <= ${futureStr}` // Within specified days ahead
    ];
    
    // Add exclusion for specified vehicle statuses
    if (options?.excludedStatuses && options.excludedStatuses.length > 0) {
      for (const status of options.excludedStatuses) {
        conditions.push(sql`${vehicles.availabilityStatus} != ${status}`);
      }
    }
    
    // Get all vehicles with warranty expiring soon (including overdue up to 2 months)
    return await db
      .select()
      .from(vehicles)
      .where(and(...conditions));
  }

  // Customer methods
  async getAllCustomers(searchQuery?: string): Promise<Customer[]> {
    if (!searchQuery) {
      return await db.select().from(customers);
    }

    // Barcode-scanner input: a scanned vehicle or reservation barcode resolves
    // to the customers linked to it through reservations, so scanning a key
    // label into the customer search shows who is renting that vehicle.
    const parsedCode = parseBarcode(searchQuery);
    if (parsedCode.kind === "reservation") {
      const [reservation] = await db.select()
        .from(reservations)
        .where(and(eq(reservations.id, parsedCode.reservationId), isNull(reservations.deletedAt)));
      if (!reservation?.customerId) return [];
      return await db.select().from(customers).where(eq(customers.id, reservation.customerId));
    }
    if (parsedCode.kind === "vehicle") {
      const vehicle = await this.getVehicleByBarcode(normalizeScannedCode(searchQuery));
      if (!vehicle) return [];
      const linked = await db.select({ customerId: reservations.customerId })
        .from(reservations)
        .where(and(eq(reservations.vehicleId, vehicle.id), isNull(reservations.deletedAt)));
      const customerIds = Array.from(new Set(
        linked.map(r => r.customerId).filter((id): id is number => id !== null && id !== undefined)
      ));
      if (customerIds.length === 0) return [];
      return await db.select().from(customers).where(inArray(customers.id, customerIds)).limit(10);
    }

    // Convert to uppercase for case-insensitivity
    const upperQuery = searchQuery.toUpperCase();
    
    // Search by name, email, or phone - using UPPER for consistent case-insensitivity
    return await db.select()
      .from(customers)
      .where(
        or(
          sql`UPPER(${customers.name}) LIKE ${`%${upperQuery}%`}`,
          sql`UPPER(${customers.email}) LIKE ${`%${upperQuery}%`}`,
          sql`UPPER(${customers.phone}) LIKE ${`%${upperQuery}%`}`,
          sql`UPPER(${customers.debtorNumber}) LIKE ${`%${upperQuery}%`}`
        )
      )
      .limit(10);
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer || undefined;
  }

  async createCustomer(customerData: InsertCustomer): Promise<Customer> {
    const [customer] = await db.insert(customers).values(customerData).returning();
    return customer;
  }

  async updateCustomer(id: number, customerData: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [updatedCustomer] = await db
      .update(customers)
      .set(customerData)
      .where(eq(customers.id, id))
      .returning();

    return updatedCustomer || undefined;
  }

  /**
   * besluiten B-35 — the pre-check that gives POST/PATCH /api/customers a
   * named 409 instead of letting the partial unique index answer with a raw
   * 23505 (copied from `findVehicleByNormalisedPlate`, server/routes.ts).
   * `debtorNumber` must already be trimmed and non-empty; routes.ts never
   * calls this for a blank one, since blank is never a clash.
   */
  async findCustomerByDebtorNumber(
    debtorNumber: string,
    excludeId?: number | null
  ): Promise<{ id: number; name: string } | undefined> {
    const conditions = [sql`lower(btrim(${customers.debtorNumber})) = lower(btrim(${debtorNumber}))`];
    if (excludeId != null) conditions.push(ne(customers.id, excludeId));
    const [row] = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(...conditions))
      .limit(1);
    return row;
  }

  /**
   * besluiten B-35 — a debtor number held by a customer sitting in the
   * recycle bin stays reserved until that customer is purged (no purge route
   * exists yet, B-38). `deleted_records.payload` snapshots the customer row
   * whole (see `deleteCustomer` below), so this reads the same JSON path.
   */
  async findDebtorNumberInRecycleBin(
    debtorNumber: string
  ): Promise<{ deletedRecordId: number; name: string } | undefined> {
    const [row] = await db
      .select({ id: deletedRecords.id, payload: deletedRecords.payload })
      .from(deletedRecords)
      .where(and(
        eq(deletedRecords.entityType, "customer"),
        isNull(deletedRecords.restoredAt),
        sql`lower(btrim(${deletedRecords.payload}->'customer'->>'debtorNumber')) = lower(btrim(${debtorNumber}))`
      ))
      .limit(1);
    if (!row) return undefined;
    const name = (row.payload as any)?.customer?.name ?? "";
    return { deletedRecordId: row.id, name };
  }

  /**
   * besluiten **B-08** — what disappears if this customer is deleted, and what
   * blocks the delete.
   *
   * The vehicle side has had `GET /api/vehicles/:id/delete-impact` and a typed
   * confirmation since before the audit; the customer side had nothing at all —
   * a 204 and a `booked` reservation left pointing at a row that no longer
   * exists (BUG-007, CRITICAL).
   */
  async getCustomerDeleteImpact(id: number): Promise<{
    customer: Customer;
    counts: Record<string, number>;
    blockingReservations: Reservation[];
  } | undefined> {
    const customer = await this.getCustomer(id);
    if (!customer) return undefined;

    const today = isoToday();
    const customerReservations = await db
      .select()
      .from(reservations)
      .where(and(eq(reservations.customerId, id), isNull(reservations.deletedAt)));

    // "Lopend of toekomstig": not closed, and not already over.
    const blockingReservations = customerReservations.filter((r) => {
      const status = normalizeReservationStatus(r.status);
      if (status && CLOSED_RESERVATION_STATUSES.has(status)) return false;
      const end = r.endDate && r.endDate !== '' && r.endDate !== 'undefined' ? r.endDate : null;
      return end === null || end >= today;
    });

    const cascade = await collectCascadeSnapshot(db, "customers", id);

    return {
      customer,
      counts: {
        reservations: customerReservations.length,
        ...snapshotCounts(cascade),
      },
      blockingReservations,
    };
  }

  /**
   * besluiten **B-08** — "prullenbak plus blokkade bij een lopende of
   * toekomstige huur". Refused while such a reservation exists; otherwise the
   * customer and everything Postgres cascades away are snapshotted into
   * `deleted_records` first, exactly like a vehicle.
   */
  async deleteCustomer(
    id: number,
    actor?: { username?: string | null; userId?: number | null }
  ): Promise<{ deleted: boolean; reason?: 'not_found' | 'has_live_reservations'; blockingReservations?: Reservation[] }> {
    const impact = await this.getCustomerDeleteImpact(id);
    if (!impact) return { deleted: false, reason: 'not_found' };
    if (impact.blockingReservations.length > 0) {
      return { deleted: false, reason: 'has_live_reservations', blockingReservations: impact.blockingReservations };
    }

    return db.transaction(async (tx) => {
      const [customer] = await tx.select().from(customers).where(eq(customers.id, id)).for('update');
      if (!customer) return { deleted: false, reason: 'not_found' as const };

      const cascade = await collectCascadeSnapshot(tx, "customers", id);

      await tx.insert(deletedRecords).values({
        entityType: 'customer',
        entityId: id,
        label: `${customer.name}${customer.companyName ? ` (${customer.companyName})` : ''}`.trim(),
        payload: { customer, cascade },
        relatedCounts: snapshotCounts(cascade),
        deletedBy: actor?.username || null,
        deletedByUserId: actor?.userId ?? null,
      });

      const deletedRows = await tx.delete(customers).where(eq(customers.id, id));
      return { deleted: (deletedRows.rowCount ?? 0) > 0 };
    });
  }

  // Reservation methods

  /**
   * OPT-012 - what a contract number looks like when it is typed into a search
   * box: digits, with the dashes and spaces people add stripped off. Kept
   * deliberately narrow so an ordinary word never triggers the exact lookup.
   */
  private static readonly CONTRACT_NUMBER_SHAPE = /^[0-9][0-9/-]{1,19}$/;

  async getAllReservations(searchQuery?: string): Promise<Reservation[]> {
    let reservationsData;
    
    // A scanned reservation barcode (RES-000123) resolves straight to that
    // reservation by id, so scanner input works in reservation search boxes.
    const parsedCode = searchQuery ? parseBarcode(searchQuery) : null;

    // OPT-012 - the number the customer reads out over the phone. Searching for
    // it used to be a dead end: the box matched vehicles, customers, dates and
    // statuses, and the indexed `find-by-contract` lookup was wired only to the
    // duplicate check in the pickup dialog. One row read (BUG-226's index), and
    // only for input shaped like a contract number, so an ordinary word never
    // pays for it.
    let contractMatch: typeof reservations.$inferSelect | undefined;
    if (searchQuery && !parsedCode && DatabaseStorage.CONTRACT_NUMBER_SHAPE.test(searchQuery.trim())) {
      [contractMatch] = await db.select()
        .from(reservations)
        .where(and(eq(reservations.contractNumber, searchQuery.trim()), isNull(reservations.deletedAt)))
        .limit(1);
    }

    if (searchQuery && parsedCode?.kind === "reservation") {
      reservationsData = await db.select()
        .from(reservations)
        .where(and(eq(reservations.id, parsedCode.reservationId), isNull(reservations.deletedAt)))
        .limit(1);
    } else if (contractMatch) {
      reservationsData = [contractMatch];
    } else if (searchQuery) {
      // Sanitize the search query to handle license plates with or without dashes
      const sanitizedQuery = searchQuery.replace(/-/g, "").toUpperCase();
      const shortCodeSql = expandShortKeyCode(searchQuery)?.replace(/-S$/, "") ?? null;

      // First, search for vehicles and customers matching the query (barcode
      // included so scanning a vehicle key label lists its reservations)
      const matchingVehicles = await db.select()
        .from(vehicles)
        .where(
          or(
            // Handle license plate search with or without dashes - using upper for case insensitivity
            sql`UPPER(replace(${vehicles.licensePlate}, '-', '')) LIKE ${`%${sanitizedQuery}%`}`,
            sql`UPPER(${vehicles.brand}) LIKE ${`%${sanitizedQuery}%`}`,
            sql`UPPER(${vehicles.model}) LIKE ${`%${sanitizedQuery}%`}`,
            sql`UPPER(replace(${vehicles.barcode}, '-', '')) LIKE ${`%${sanitizedQuery}%`}`,
            // a short key-label code (V123, S123R2) matches the stored VEH- code exactly
            ...(shortCodeSql ? [sql`UPPER(${vehicles.barcode}) = ${shortCodeSql}`] : [])
          )
        );
      
      const matchingCustomers = await db.select()
        .from(customers)
        .where(
          or(
            sql`UPPER(${customers.name}) LIKE ${`%${sanitizedQuery}%`}`,
            sql`UPPER(${customers.email}) LIKE ${`%${sanitizedQuery}%`}`,
            sql`UPPER(${customers.phone}) LIKE ${`%${sanitizedQuery}%`}`
          )
        );
      
      const vehicleIds = matchingVehicles.map(v => v.id);
      const customerIds = matchingCustomers.map(c => c.id);
      
      // Query reservations that match either vehicle or customer
      if (vehicleIds.length > 0 || customerIds.length > 0) {
        const conditions = [];
        if (vehicleIds.length > 0) {
          conditions.push(inArray(reservations.vehicleId, vehicleIds));
        }
        if (customerIds.length > 0) {
          conditions.push(inArray(reservations.customerId, customerIds));
        }
        
        reservationsData = await db.select()
          .from(reservations)
          .where(and(or(...conditions), isNull(reservations.deletedAt)))
          .limit(10);
      } else {
        // If no matching vehicles or customers, check if search matches a date
        reservationsData = await db.select()
          .from(reservations)
          .where(
            and(
              or(
                sql`UPPER(${reservations.startDate}) LIKE ${`%${sanitizedQuery}%`}`,
                sql`UPPER(${reservations.endDate}) LIKE ${`%${sanitizedQuery}%`}`,
                sql`UPPER(${reservations.status}) LIKE ${`%${sanitizedQuery}%`}`,
                // OPT-012 - a partial contract number still finds the booking.
                sql`UPPER(${reservations.contractNumber}) LIKE ${`%${sanitizedQuery}%`}`
              ),
              isNull(reservations.deletedAt)
            )
          )
          .limit(10);
      }
    } else {
      reservationsData = await db.select().from(reservations).where(isNull(reservations.deletedAt));
    }

    return this.withVehicleAndCustomer(reservationsData);
  }

  /**
   * BUG-205 phase B (2026-10-19): the rows a screen asks for, filtered in the database, with the same
   * embedded vehicle and customer as getAllReservations. Soft-deleted rows are never included.
   */
  async getReservationsWhere(where: SQL | undefined): Promise<Reservation[]> {
    const rows = await db.select().from(reservations).where(and(isNull(reservations.deletedAt), where));
    return this.withVehicleAndCustomer(rows);
  }

  private async withVehicleAndCustomer(reservationsData: Array<typeof reservations.$inferSelect>): Promise<Reservation[]> {
    
    // Batch-load the related rows. Fetching them per reservation meant two
    // sequential queries per row — ~3k round-trips for 1.5k reservations, which
    // put this endpoint into the multi-second range and grew linearly with the
    // booking history.
    const vehicleIds = Array.from(new Set(
      reservationsData
        .map(r => r.vehicleId)
        .filter((id): id is number => id !== null && id !== undefined)
    ));
    const customerIds = Array.from(new Set(
      reservationsData
        .map(r => r.customerId)
        .filter((id): id is number => id !== null && id !== undefined)
    ));

    const [vehicleRows, customerRows] = await Promise.all([
      vehicleIds.length
        ? db.select().from(vehicles).where(inArray(vehicles.id, vehicleIds))
        : Promise.resolve([]),
      customerIds.length
        ? db.select().from(customers).where(inArray(customers.id, customerIds))
        : Promise.resolve([]),
    ]);

    const vehicleById = new Map(vehicleRows.map(v => [v.id, v]));
    const customerById = new Map(customerRows.map(c => [c.id, c]));

    return reservationsData.map(reservation => ({
      ...reservation,
      // Placeholder spare reservations have no vehicle yet
      vehicle: reservation.vehicleId !== null && reservation.vehicleId !== undefined
        ? vehicleById.get(reservation.vehicleId)
        : undefined,
      customer: reservation.customerId !== null && reservation.customerId !== undefined
        ? customerById.get(reservation.customerId)
        : undefined,
    }));
  }

  async getReservation(id: number): Promise<Reservation | undefined> {
    const [reservation] = await db.select().from(reservations).where(and(eq(reservations.id, id), isNull(reservations.deletedAt)));
    
    if (!reservation) {
      return undefined;
    }
    
    // Handle null vehicleId for placeholder spare reservations
    let vehicle: Vehicle | undefined = undefined;
    if (reservation.vehicleId !== null) {
      const [v] = await db.select().from(vehicles).where(eq(vehicles.id, reservation.vehicleId));
      vehicle = v ?? undefined;
    }
    
    const c = reservation.customerId !== null
      ? (await db.select().from(customers).where(eq(customers.id, reservation.customerId)))[0]
      : undefined;
    
    return {
      ...reservation,
      vehicle,
      customer: c ?? undefined
    };
  }

  /**
   * FIX-T (BUG-226) — the ids of customers with a rental running right now.
   *
   * `GET /api/customers/with-reservations` used to materialise every
   * reservation (plus every embedded vehicle and customer — 8 MB of objects in
   * process) to compute one boolean per customer. The same predicate runs in
   * Postgres and returns a few hundred integers.
   *
   * The comparison is deliberately the old one, instant-for-instant: the JS
   * code parsed `yyyy-MM-dd` as UTC midnight and compared it against `new
   * Date()`, so `(date || 'T00:00:00Z')::timestamptz` against `now()` is the
   * same test and the boundary behaviour does not shift. Rows whose dates are
   * not a plain date (the literal string `'undefined'`, an empty string) were
   * excluded before and are excluded here — that is the open-ended-rental
   * case, which this endpoint has never counted as active.
   */
  async getCustomerIdsWithActiveReservation(): Promise<Set<number>> {
    const rows = await db.execute<{ customer_id: number }>(sql`
      SELECT DISTINCT ${reservations.customerId} AS customer_id
      FROM ${reservations}
      WHERE ${reservations.deletedAt} IS NULL
        AND ${reservations.customerId} IS NOT NULL
        AND ${reservations.startDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        AND ${reservations.endDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        AND (${reservations.startDate} || 'T00:00:00Z')::timestamptz <= now()
        AND (${reservations.endDate} || 'T00:00:00Z')::timestamptz >= now()
    `);
    const ids = new Set<number>();
    for (const row of (rows as any).rows ?? rows) {
      if (row.customer_id !== null && row.customer_id !== undefined) ids.add(Number(row.customer_id));
    }
    return ids;
  }

  /**
   * FIX-T (BUG-226) — one reservation by its contract number.
   *
   * `GET /api/reservations/find-by-contract/:n` used to call
   * `getAllReservations()` and `Array.find` the result, i.e. load and enrich
   * every reservation in the database to return one row. The column is
   * uniquely indexed; look it up. The shape returned is the same one
   * `getAllReservations` produced: the row plus its vehicle and customer.
   */
  async getReservationByContractNumber(contractNumber: string): Promise<Reservation | undefined> {
    const [row] = await db
      .select()
      .from(reservations)
      .where(and(eq(reservations.contractNumber, contractNumber), isNull(reservations.deletedAt)))
      .limit(1);
    if (!row) return undefined;

    const [vehicleRows, customerRows] = await Promise.all([
      row.vehicleId !== null && row.vehicleId !== undefined
        ? db.select().from(vehicles).where(eq(vehicles.id, row.vehicleId))
        : Promise.resolve([] as Vehicle[]),
      row.customerId !== null && row.customerId !== undefined
        ? db.select().from(customers).where(eq(customers.id, row.customerId))
        : Promise.resolve([] as Customer[]),
    ]);
    return { ...row, vehicle: vehicleRows[0] ?? undefined, customer: customerRows[0] ?? undefined };
  }

  /**
   * FIX-H (BUG-016, BUG-129) - the enum gate every reservation writer passes.
   *
   * `PATCH /:id` and `/basic` used to write `status` straight through, so
   * `"garbage"` reached the column and `GET` served it back; the storage
   * layer itself wrote `active`/`pending`, values the transition table did
   * not know, which is what stranded 278 live rows. The value is validated
   * and canonicalised here, so no writer can get past it.
   */
  private gateReservationStatus<T extends Record<string, any>>(data: T): T {
    data = this.withMaintenanceType(data);
    if (data == null || !('status' in data) || data.status === undefined || data.status === null) return data;
    return { ...data, status: assertReservationStatusValue(data.status) };
  }

  /**
   * Round 2 punt 11: a workshop visit's kind is its own column. A write that sends no
   * (known) kind but notes starting with one ("breakdown: ...", the dialog's shape)
   * gets it from there; an unknown kind is dropped rather than stored. Only for writes
   * that are about a maintenance block, so a rental's notes never set it.
   */
  private withMaintenanceType<T extends Record<string, any>>(data: T): T {
    if (data == null) return data;
    const aboutBlock = data.type === 'maintenance_block' || data.maintenanceDuration != null || data.maintenanceStatus != null;
    if ('maintenanceType' in data && !isMaintenanceType(data.maintenanceType)) {
      const { maintenanceType: _dropped, ...rest } = data;
      data = rest as T;
    }
    if (!aboutBlock || 'maintenanceType' in data || typeof data.notes !== 'string') return data;
    const fromNotes = maintenanceTypeFromNotes(data.notes);
    return fromNotes ? { ...data, maintenanceType: fromNotes } : data;
  }

  async createReservation(reservationData: InsertReservation): Promise<Reservation> {
    reservationData = this.gateReservationStatus(reservationData);
    // Convert totalPrice to string if it's a number
    const dataToInsert = {
      ...reservationData,
      // Convert totalPrice to string if present
      totalPrice: reservationData.totalPrice !== undefined
        ? String(reservationData.totalPrice)
        : undefined
    };

    const [reservation] = await db.insert(reservations).values(dataToInsert).returning();
    await this.syncDeliveryTransport(reservation);
    // Fiscal mobility check: the reservation's usage period follows every write (docs/fiscaal §4.3).
    await syncUsagePeriodSafely(reservation.id);

    // Handle null vehicleId for placeholder spare reservations
    let vehicle: Vehicle | undefined = undefined;
    if (reservation.vehicleId !== null) {
      const [v] = await db.select().from(vehicles).where(eq(vehicles.id, reservation.vehicleId));
      vehicle = v ?? undefined;
    }

    const c = reservation.customerId !== null
      ? (await db.select().from(customers).where(eq(customers.id, reservation.customerId)))[0]
      : undefined;

    return {
      ...reservation,
      vehicle,
      customer: c ?? undefined
    };
  }

  // Keeps a delivery-flagged reservation's transport leg (vehicle_transports,
  // linked via reservationId) in sync — auto-creates one the first time
  // deliveryRequired is set, mirrors address/date/fee changes into it on later
  // edits, and cancels it if deliveryRequired is turned back off. A transport
  // that's already completed or cancelled is left alone rather than resurrected
  // or overwritten, since that's a real handled/finished job, not a stale draft.
  private async syncDeliveryTransport(reservation: typeof reservations.$inferSelect): Promise<void> {
    await this.syncDeliveryLeg(reservation);
    await this.syncCollectionLeg(reservation);
  }

  /**
   * The other end of the rental: when we collect the car from the customer (collectionRequired) it gets a transport
   * of its own, the same way the delivery does — type "repossession" (Terughalen), from the collection address, on the
   * end date. It is recognised by its reason, so a repossession a person linked to the reservation by hand is never
   * taken over or cancelled here. A rental without an end date has no date to plan it on yet: nothing is created
   * until there is one. Finished or cancelled transports are left alone.
   */
  private async syncCollectionLeg(reservation: typeof reservations.$inferSelect): Promise<void> {
    const [existing] = await db.select().from(vehicleTransports).where(and(
      eq(vehicleTransports.reservationId, reservation.id),
      eq(vehicleTransports.transportType, 'repossession'),
      eq(vehicleTransports.reason, COLLECTION_LEG_REASON),
    ));

    if (!reservation.collectionRequired) {
      if (existing && existing.status !== 'completed' && existing.status !== 'cancelled') {
        await db.update(vehicleTransports).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(vehicleTransports.id, existing.id));
      }
      return;
    }
    if (reservation.vehicleId == null || !reservation.endDate) return;

    const fields = {
      vehicleId: reservation.vehicleId,
      customerId: reservation.customerId,
      transportType: 'repossession' as const,
      originAddress: reservation.collectionAddress,
      originCity: reservation.collectionCity,
      scheduledDate: reservation.endDate,
      reason: COLLECTION_LEG_REASON,
      billable: false,
      reservationId: reservation.id,
    };

    if (existing) {
      if (existing.status === 'completed' || existing.status === 'cancelled') return;
      await db.update(vehicleTransports).set({ ...fields, updatedAt: new Date() }).where(eq(vehicleTransports.id, existing.id));
    } else {
      await db.insert(vehicleTransports).values({
        ...fields,
        status: 'scheduled',
        isExternalVehicle: false,
        spareRequired: false,
        isBreakdownOrMaintenance: false,
        invoiced: false,
      });
    }
  }

  private async syncDeliveryLeg(reservation: typeof reservations.$inferSelect): Promise<void> {
    // Only the delivery transport of this reservation. Any other transport linked to it (the collection leg, a swap, a
    // repossession someone planned by hand) is not this leg and must never be changed or cancelled from here.
    const [existing] = await db.select().from(vehicleTransports).where(and(
      eq(vehicleTransports.reservationId, reservation.id),
      eq(vehicleTransports.transportType, 'delivery'),
    ));

    if (!reservation.deliveryRequired) {
      if (existing && existing.status !== 'completed' && existing.status !== 'cancelled') {
        await db.update(vehicleTransports)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(vehicleTransports.id, existing.id));
      }
      return;
    }

    // Nothing to deliver without a vehicle (e.g. a placeholder spare reservation).
    if (reservation.vehicleId == null) return;

    const fields = {
      vehicleId: reservation.vehicleId,
      customerId: reservation.customerId,
      transportType: 'delivery' as const,
      destinationAddress: reservation.deliveryAddress,
      destinationCity: reservation.deliveryCity,
      scheduledDate: reservation.startDate,
      billable: !!reservation.deliveryFee,
      billableAmount: reservation.deliveryFee,
      reservationId: reservation.id,
    };

    if (existing) {
      if (existing.status === 'completed' || existing.status === 'cancelled') return;
      await db.update(vehicleTransports).set({ ...fields, updatedAt: new Date() }).where(eq(vehicleTransports.id, existing.id));
    } else {
      await db.insert(vehicleTransports).values({
        ...fields,
        status: 'scheduled',
        isExternalVehicle: false,
        spareRequired: false,
        isBreakdownOrMaintenance: false,
        invoiced: false,
      });
    }
  }

  async updateReservation(id: number, reservationData: Partial<InsertReservation>): Promise<Reservation | undefined> {
    reservationData = this.gateReservationStatus(reservationData);
    // Clean up numeric fields - convert empty strings and "undefined" to null
    const dataToUpdate: any = { ...reservationData };
    
    // Handle totalPrice
    if ('totalPrice' in dataToUpdate) {
      const val = dataToUpdate.totalPrice;
      dataToUpdate.totalPrice = (val === '' || val === null || val === undefined || val === 'undefined') 
        ? null 
        : String(val);
    }
    
    // Handle all numeric and integer fields that might be empty strings or "undefined"
    const numericFields = [
      'deliveryFee', 'fuelCost', 'departureMileage', 'startMileage',
      'deliveryStaffId', 'driverId', 'replacementForReservationId', 
      'affectedRentalId', 'recurringParentId', 'maintenanceDuration'
    ];
    numericFields.forEach(field => {
      if (field in dataToUpdate) {
        const val = dataToUpdate[field];
        if (val === '' || val === null || val === undefined || val === 'undefined') {
          dataToUpdate[field] = null;
        }
      }
    });
    
    const [updatedReservation] = await db
      .update(reservations)
      .set(dataToUpdate)
      .where(
        and(
          eq(reservations.id, id),
          isNull(reservations.deletedAt)
        )
      )
      .returning();
    
    if (!updatedReservation) {
      return undefined;
    }
    await this.syncDeliveryTransport(updatedReservation);

    // Handle null vehicleId for placeholder spare reservations
    let vehicle: Vehicle | undefined = undefined;
    if (updatedReservation.vehicleId !== null) {
      const [v] = await db.select().from(vehicles).where(eq(vehicles.id, updatedReservation.vehicleId));
      vehicle = v ?? undefined;
    }

    const c = updatedReservation.customerId !== null
      ? (await db.select().from(customers).where(eq(customers.id, updatedReservation.customerId)))[0]
      : undefined;

    await syncUsagePeriodSafely(updatedReservation.id);

    return {
      ...updatedReservation,
      vehicle,
      customer: c ?? undefined
    };
  }
  
  /**
   * besluiten **B-04** — what hangs off a reservation, so the app can ask per
   * item whether it goes too.
   *
   * Cancelling used to touch nothing else at all (BUG-112): the delivery
   * transport stayed `scheduled` and a driver was sent out for a rental that
   * was off, the driver assignment stayed open, and the spare car plus the
   * placeholder stayed booked for a customer who had cancelled.
   */
  async getReservationCancelImpact(id: number): Promise<{
    transports: VehicleTransport[];
    spares: Reservation[];
    placeholders: Reservation[];
    drivers: ReservationDriverAssignment[];
  }> {
    const [transportRows, replacementRows, driverRows] = await Promise.all([
      db.select().from(vehicleTransports).where(and(
        eq(vehicleTransports.reservationId, id),
        ne(vehicleTransports.status, 'completed'),
        ne(vehicleTransports.status, 'cancelled'),
      )),
      db.select().from(reservations).where(and(
        eq(reservations.type, 'replacement'),
        eq(reservations.replacementForReservationId, id),
        isNull(reservations.deletedAt),
        sql`${reservations.status} NOT IN ('cancelled','completed','returned')`,
      )),
      db.select().from(reservationDriverAssignments).where(and(
        eq(reservationDriverAssignments.reservationId, id),
        isNull(reservationDriverAssignments.assignedUntil),
      )),
    ]);

    return {
      transports: transportRows as VehicleTransport[],
      spares: replacementRows.filter((r) => !r.placeholderSpare) as Reservation[],
      placeholders: replacementRows.filter((r) => r.placeholderSpare) as Reservation[],
      drivers: driverRows as ReservationDriverAssignment[],
    };
  }

  /**
   * besluiten **B-04** — "vragen wat er mee moet, daarna uitvoeren".
   *
   * Nothing cascades unless the caller says so, per kind. That is deliberate:
   * the owner chose an explicit question over a silent sweep, and the dialog
   * that asks it is phase-34 work (OPT-028). Until then every caller gets the
   * impact list back and decides.
   */
  async applyReservationCancelCascade(
    id: number,
    cascade: { transports?: boolean; spares?: boolean; placeholders?: boolean; drivers?: boolean } = {},
    actor?: { username?: string | null },
  ): Promise<{ impact: Awaited<ReturnType<DatabaseStorage['getReservationCancelImpact']>>; applied: Record<string, number> }> {
    const impact = await this.getReservationCancelImpact(id);
    const applied: Record<string, number> = { transports: 0, spares: 0, placeholders: 0, drivers: 0 };
    const freedVehicleIds: number[] = [];

    const closeReplacements = async (tx: any, rows: Reservation[], key: string) => {
      for (const row of rows) {
        // A spare that is really at the customer is a physical fact; the same
        // rule FIX-V applies everywhere else.
        if (normalizeReservationStatus(row.status) === 'picked_up') continue;
        await tx.update(reservations)
          .set({ status: 'cancelled', placeholderSpare: false, updatedBy: actor?.username ?? null, updatedAt: new Date() })
          .where(eq(reservations.id, row.id));
        if (row.vehicleId != null) freedVehicleIds.push(row.vehicleId);
        applied[key] += 1;
      }
    };

    await db.transaction(async (tx) => {
      if (cascade.transports && impact.transports.length > 0) {
        const result = await tx.update(vehicleTransports)
          .set({ status: 'cancelled', updatedBy: actor?.username ?? null, updatedAt: new Date() })
          .where(and(
            inArray(vehicleTransports.id, impact.transports.map((t) => t.id)),
            ne(vehicleTransports.status, 'completed'),
            ne(vehicleTransports.status, 'cancelled'),
          ));
        applied.transports = result.rowCount ?? impact.transports.length;
      }
      if (cascade.spares) await closeReplacements(tx, impact.spares, "spares");
      if (cascade.placeholders) await closeReplacements(tx, impact.placeholders, "placeholders");
      if (cascade.drivers && impact.drivers.length > 0) {
        const result = await tx.update(reservationDriverAssignments)
          .set({ assignedUntil: new Date() })
          .where(and(
            inArray(reservationDriverAssignments.id, impact.drivers.map((d) => d.id)),
            isNull(reservationDriverAssignments.assignedUntil),
          ));
        applied.drivers = result.rowCount ?? impact.drivers.length;
      }
    });

    for (const vehicleId of Array.from(new Set(freedVehicleIds))) {
      await this.recomputeVehicleAvailability(vehicleId);
    }
    await syncUsagePeriodSafely(id);
    return { impact, applied };
  }

  /**
   * FIX-X (BUG-090, BUG-055) — the soft delete as **one** conditional write.
   *
   * The route read the row, ran a 70-line cascade, and only then wrote: two
   * parallel deletes both passed the `deletedAt` guard and the loser came back
   * as a 500 carrying `error.message`. The precondition travels with the write
   * now, and zero rows means "someone else just deleted it".
   *
   * The open driver assignment is closed in the same transaction — it used to
   * stay open for ever on a deleted rental, so every "current drivers" screen
   * kept showing it (BUG-055).
   */
  async softDeleteReservation(
    id: number,
    actor?: { username?: string | null; userId?: number | null },
  ): Promise<Reservation | undefined> {
    return db.transaction(async (tx) => {
      // besluiten B-15 (BUG-151) — the row as it was, before the delete blanks
      // the contract number, so the recycle bin can put it back exactly.
      const [before] = await tx.select().from(reservations)
        .where(and(eq(reservations.id, id), isNull(reservations.deletedAt)));

      const [row] = await tx
        .update(reservations)
        .set({
          deletedAt: new Date(),
          deletedBy: actor?.username ?? null,
          deletedByUser: actor?.userId ?? null,
          updatedBy: actor?.username ?? null,
          contractNumber: null,
        })
        .where(and(eq(reservations.id, id), isNull(reservations.deletedAt)))
        .returning();
      if (!row) return undefined;

      // Rapporten fase 1 - a deleted reservation's readings (handovers, service,
      // its damage checks) stop counting, stamped with the delete moment so a
      // restore from the bin brings back exactly these.
      await voidReadingsOfDeletedReservation(tx, id, actor?.username ?? 'systeem', row.deletedAt!);

      // besluiten **B-15** — "ja, allebei herstelbaar". Until this, a
      // soft-deleted reservation was filtered out everywhere and surfaced
      // nowhere; the only way back was a hand-written UPDATE, which is exactly
      // how the audit produced a double booking (BUG-151).
      const vehicle = row.vehicleId != null ? await this.getVehicle(row.vehicleId) : undefined;
      // Sub-project C (B-36): the Onderhoud screen has a bin of its own, so a
      // workshop block is filed as `maintenance_block` and labelled "Onderhoud".
      const isBlock = row.type === 'maintenance_block';
      await tx.insert(deletedRecords).values({
        entityType: isBlock ? 'maintenance_block' : 'reservation',
        entityId: id,
        label: `${isBlock ? 'Onderhoud' : 'Reservering'} #${id}${vehicle ? ` — ${vehicle.licensePlate}` : ''} ${row.startDate}`.trim(),
        payload: { reservation: before ?? row },
        relatedCounts: {},
        deletedBy: actor?.username || null,
        deletedByUserId: actor?.userId ?? null,
      });

      await tx.update(reservationDriverAssignments)
        .set({ assignedUntil: new Date() })
        .where(and(
          eq(reservationDriverAssignments.reservationId, id),
          isNull(reservationDriverAssignments.assignedUntil),
        ));

      await tx.update(vehicleTransports)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(
          eq(vehicleTransports.reservationId, id),
          ne(vehicleTransports.status, 'completed'),
          ne(vehicleTransports.status, 'cancelled'),
        ));

      return row as Reservation;
    }).then(async (row) => {
      if (row) await syncUsagePeriodSafely(id);
      return row;
    });
  }

  async deleteReservation(id: number): Promise<boolean> {
    // Cancel (not delete) any transport this reservation auto-created via
    // syncDeliveryTransport, so it doesn't linger referencing a reservation that
    // no longer exists — same as what happens when deliveryRequired is unchecked.
    await db.update(vehicleTransports)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(vehicleTransports.reservationId, id), ne(vehicleTransports.status, 'completed'), ne(vehicleTransports.status, 'cancelled')));

    const result = await db
      .delete(reservations)
      .where(eq(reservations.id, id));

    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getReservationsInDateRange(startDate: string, endDate: string): Promise<Reservation[]> {
    // BUG-205 follow-up (2026-10-19): a running rental without an end date that started before the
    // range belongs in it too; NULL never compares, so it used to fall out. Rentals only: a maintenance
    // block without an end date is a one-day block. (The calendar draws an open-ended rental on its
    // start day only, so its grid does not change; lookups on this route now see the rental.)
    const reservationsData = await db
      .select()
      .from(reservations)
      .where(
        sql`((${reservations.startDate} <= ${endDate} AND ${reservations.endDate} >= ${startDate})
            OR (${reservations.startDate} >= ${startDate} AND ${reservations.startDate} <= ${endDate})
            OR (${reservations.endDate} >= ${startDate} AND ${reservations.endDate} <= ${endDate})
            OR (${reservations.endDate} IS NULL AND ${reservations.startDate} <= ${endDate}
                AND ${reservations.status} IN ('booked', 'picked_up') AND ${reservations.type} IN ('standard', 'replacement')))
            AND ${reservations.deletedAt} IS NULL`
      );
    
    // BUG-203 (HIGH): this used to run two to three `await db.select()` calls
    // *inside the loop* — 924 statements for one month view (462 rows) and
    // 3 774 for a year, growing linearly with the calendar's contents. The
    // related rows are now batch-loaded with the same `inArray()` pattern
    // `getAllReservations` already uses, so the statement count is constant
    // (five) whatever the range holds. The returned shape is unchanged.
    //
    // BUG-227: the per-row console.log went with it. The September grid has
    // 114 customer-less maintenance blocks, and each one wrote four lines —
    // one of them a full `util.inspect` of a reservation row — so every
    // dashboard, reservations and maintenance page load produced ~17.6 KB of
    // container log for nothing.
    const uniq = (ids: Array<number | null | undefined>): number[] =>
      Array.from(new Set(ids.filter((id): id is number => id !== null && id !== undefined)));

    const vehicleIds = uniq(reservationsData.map((r) => r.vehicleId));
    const driverIds = uniq(reservationsData.map((r) => r.driverId));

    // Maintenance blocks with no customer of their own borrow the customer of
    // the vehicle's open-ended rental. That was one extra query per block;
    // it is now one query for all of them.
    const blockVehicleIds = uniq(
      reservationsData
        .filter((r) => r.type === 'maintenance_block' && !r.customerId && r.vehicleId)
        .map((r) => r.vehicleId),
    );

    const [vehicleRows, driverRows, openEndedRentals] = await Promise.all([
      vehicleIds.length
        ? db.select().from(vehicles).where(inArray(vehicles.id, vehicleIds))
        : Promise.resolve([] as Vehicle[]),
      driverIds.length
        ? db.select().from(drivers).where(inArray(drivers.id, driverIds))
        : Promise.resolve([] as Driver[]),
      blockVehicleIds.length
        ? db
            .select({ vehicleId: reservations.vehicleId, customerId: reservations.customerId })
            .from(reservations)
            .where(
              and(
                inArray(reservations.vehicleId, blockVehicleIds),
                eq(reservations.type, 'standard'),
                sql`(${reservations.endDate} IS NULL OR ${reservations.endDate} = 'undefined')`,
                sql`${reservations.status} IN ('confirmed', 'pending')`,
                isNull(reservations.deletedAt),
              ),
            )
        : Promise.resolve([] as Array<{ vehicleId: number | null; customerId: number | null }>),
    ]);

    // One open-ended rental per vehicle, first one wins — the same row the
    // per-row `.limit(1)` would have returned.
    const openEndedCustomerByVehicle = new Map<number, number>();
    for (const row of openEndedRentals) {
      if (row.vehicleId === null || row.customerId === null) continue;
      if (!openEndedCustomerByVehicle.has(row.vehicleId)) {
        openEndedCustomerByVehicle.set(row.vehicleId, row.customerId);
      }
    }

    const customerIds = uniq([
      ...reservationsData.map((r) => r.customerId),
      ...openEndedCustomerByVehicle.values(),
    ]);
    const customerRows = customerIds.length
      ? await db.select().from(customers).where(inArray(customers.id, customerIds))
      : [];

    const vehicleById = new Map(vehicleRows.map((v) => [v.id, v]));
    const customerById = new Map(customerRows.map((c) => [c.id, c]));
    const driverById = new Map(driverRows.map((d) => [d.id, d]));

    return reservationsData.map((reservation) => {
      let customer: Customer | undefined = undefined;
      if (reservation.type === 'maintenance_block' && !reservation.customerId && reservation.vehicleId) {
        const borrowedId = openEndedCustomerByVehicle.get(reservation.vehicleId);
        customer = borrowedId !== undefined ? customerById.get(borrowedId) : undefined;
      } else if (reservation.customerId) {
        customer = customerById.get(reservation.customerId);
      }

      return {
        ...reservation,
        vehicle: reservation.vehicleId !== null ? vehicleById.get(reservation.vehicleId) : undefined,
        customer,
        driver: reservation.driverId ? driverById.get(reservation.driverId) : undefined,
      };
    });
  }

  async getUpcomingReservations(): Promise<Reservation[]> {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await db
      .select({
        reservation: reservations,
        vehicle: vehicles,
        customer: customers,
      })
      .from(reservations)
      .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
      .leftJoin(customers, eq(reservations.customerId, customers.id))
      .where(
        and(
          sql`${reservations.startDate} >= ${today}`,
          sql`${reservations.status} != 'cancelled'`,
          sql`${reservations.status} != 'completed'`,
          sql`(${reservations.type} != 'maintenance_block' OR ${reservations.type} IS NULL)`,
          isNull(reservations.deletedAt),
          isNotNull(reservations.vehicleId) // Exclude placeholder reservations (vehicleId is null)
        )
      )
      .orderBy(reservations.startDate)
      .limit(5);
    
    return result.map(row => ({
      ...row.reservation,
      vehicle: row.vehicle ?? undefined,
      customer: row.customer ?? undefined,
    }));
  }

  async getUpcomingMaintenanceReservations(): Promise<Reservation[]> {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await db
      .select({
        reservation: reservations,
        vehicle: vehicles,
        customer: customers,
      })
      .from(reservations)
      .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
      .leftJoin(customers, eq(reservations.customerId, customers.id))
      .where(
        and(
          sql`${reservations.startDate} >= ${today}`,
          sql`${reservations.type} = 'maintenance_block'`,
          sql`(${reservations.maintenanceStatus} = 'scheduled' OR ${reservations.maintenanceStatus} = 'in')`,
          sql`${reservations.status} != 'cancelled'`,
          isNull(reservations.deletedAt)
        )
      )
      .orderBy(reservations.startDate);
    
    return result.map(row => ({
      ...row.reservation,
      vehicle: row.vehicle ?? undefined,
      customer: row.customer ?? undefined,
    }));
  }

  async getReservationsByVehicle(vehicleId: number): Promise<Reservation[]> {
    const result = await db
      .select({
        reservation: reservations,
        vehicle: vehicles,
        customer: customers,
      })
      .from(reservations)
      .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
      .leftJoin(customers, eq(reservations.customerId, customers.id))
      .where(and(eq(reservations.vehicleId, vehicleId), isNull(reservations.deletedAt)))
      .orderBy(desc(reservations.startDate));
    
    return result.map(row => ({
      ...row.reservation,
      vehicle: row.vehicle ?? undefined,
      customer: row.customer ?? undefined,
    }));
  }

  async getReservationsByCustomer(customerId: number): Promise<Reservation[]> {
    const result = await db
      .select({
        reservation: reservations,
        vehicle: vehicles,
        customer: customers,
      })
      .from(reservations)
      .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
      .leftJoin(customers, eq(reservations.customerId, customers.id))
      .where(and(eq(reservations.customerId, customerId), isNull(reservations.deletedAt)))
      .orderBy(desc(reservations.startDate));
    
    return result.map(row => ({
      ...row.reservation,
      vehicle: row.vehicle ?? undefined,
      customer: row.customer ?? undefined,
    }));
  }

  // Get ALL overdue reservations: picked_up status but past end date (customer still has the vehicle)
  // Excludes open-ended rentals (null or empty endDate) since they have no defined return date
  async getAllOverdueReservations(): Promise<Reservation[]> {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await db
      .select({
        reservation: reservations,
        vehicle: vehicles,
        customer: customers,
      })
      .from(reservations)
      .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
      .leftJoin(customers, eq(reservations.customerId, customers.id))
      .where(
        and(
          isNull(reservations.deletedAt),
          eq(reservations.status, 'picked_up'),
          sql`${reservations.endDate} IS NOT NULL`,
          sql`${reservations.endDate} != ''`,
          sql`${reservations.endDate} < ${today}`
        )
      )
      .orderBy(desc(reservations.endDate));
    
    return result.map(row => ({
      ...row.reservation,
      vehicle: row.vehicle ?? undefined,
      customer: row.customer ?? undefined,
    }));
  }

  // Get overdue reservations for a vehicle: a picked-up rental whose end date
  // is in the past (besluiten B-32 — reviewed 2026-09-23: the three overdue
  // surfaces — this gate, `getAllOverdueReservations` (dashboard widget) and
  // `buildPickupWorklist` (pickup worklist) — now share one definition on
  // purpose, so status matches the literal `picked_up` only, same as the
  // other two. Legacy spellings (`active`, `in`) are neither shown nor
  // blocking anywhere, which is today's behaviour on the widget already. A
  // `booked` row that was never picked up does NOT count either: the
  // customer never had the car, so it cannot still be "with the customer".
  // Excludes maintenance blocks (BUG-129 wrote some with the legacy status
  // `active`, which would otherwise look like an overdue rental if it were
  // included) and open-ended rentals (null/empty endDate), which have no
  // defined return date.
  async getOverdueReservationsByVehicle(vehicleId: number, daysOverdue: number = 0): Promise<Reservation[]> {
    // Office time (lifecycle.ts), not `new Date()`: the cutoff must land on
    // the same calendar day the rest of the app calls "today".
    const today = isoToday();
    const cutoff = new Date(`${today}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - daysOverdue);
    const cutoffDateStr = cutoff.toISOString().split('T')[0];

    const result = await db
      .select({
        reservation: reservations,
        vehicle: vehicles,
        customer: customers,
      })
      .from(reservations)
      .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
      .leftJoin(customers, eq(reservations.customerId, customers.id))
      .where(
        and(
          eq(reservations.vehicleId, vehicleId),
          isNull(reservations.deletedAt),
          ne(reservations.type, 'maintenance_block'),
          eq(reservations.status, 'picked_up'),
          sql`${reservations.endDate} IS NOT NULL`,
          sql`${reservations.endDate} != ''`,
          sql`${reservations.endDate} < ${cutoffDateStr}`
        )
      )
      .orderBy(desc(reservations.endDate));

    return result.map(row => ({
      ...row.reservation,
      vehicle: row.vehicle ?? undefined,
      customer: row.customer ?? undefined,
    }));
  }

  // Never-collected bookings a month old (besluiten B-32 aanvulling,
  // 2026-09-23): a `booked` reservation (nobody ever picked it up) whose
  // start date is 30 days or more in the past. Shown as a popup in the
  // reservation calendar so it does not sit forgotten forever — unlike the
  // booking gate above, this never blocks anything: B-32's base decision is
  // that a never-collected booking stays "booked". Excludes maintenance
  // blocks and soft-deleted rows, same as `getOverdueReservationsByVehicle`.
  async getNotCollectedReservations(): Promise<Reservation[]> {
    const today = isoToday();
    const cutoff = new Date(`${today}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);
    const cutoffDateStr = cutoff.toISOString().split('T')[0];

    const result = await db
      .select({
        reservation: reservations,
        vehicle: vehicles,
        customer: customers,
      })
      .from(reservations)
      .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
      .leftJoin(customers, eq(reservations.customerId, customers.id))
      .where(
        and(
          isNull(reservations.deletedAt),
          ne(reservations.type, 'maintenance_block'),
          inArray(reservations.status, BOOKED_STATUSES),
          sql`${reservations.startDate} <= ${cutoffDateStr}`
        )
      )
      .orderBy(asc(reservations.startDate));

    return result.map(row => ({
      ...row.reservation,
      vehicle: row.vehicle ?? undefined,
      customer: row.customer ?? undefined,
    }));
  }

  /**
   * FIX-F — the one bookability predicate (CQ-006). Every writer and every
   * read-only availability check goes through this; the SQL lives in
   * `server/services/bookability.ts`.
   *
   * Pass `executor` an open transaction to have the check read inside the same
   * transaction (and behind the same advisory lock) as the write it guards —
   * that, and not the check itself, is what stops two concurrent writers from
   * both winning (BUG-006, BUG-159, BUG-160, BUG-173).
   */
  async isVehicleBookable(request: BookingRequest, executor: any = db): Promise<BookabilityVerdict> {
    const rows: Reservation[] = await executor
      .select()
      .from(reservations)
      .where(overlapWhere(request));

    const [vehicle] = await executor.select().from(vehicles).where(eq(vehicles.id, request.vehicleId));
    const { conflicts, maintenanceBlocks } = partitionOverlaps(rows, !!request.isMaintenanceBlock);

    // Batch-load customers instead of one query per reservation.
    const customerIds = Array.from(new Set(
      rows.map(r => r.customerId).filter((id): id is number => id !== null && id !== undefined)
    ));
    const customerRows: Customer[] = customerIds.length
      ? await executor.select().from(customers).where(inArray(customers.id, customerIds))
      : [];
    const customerById = new Map(customerRows.map(c => [c.id, c]));
    const enrich = (list: Reservation[]) => list.map(reservation => ({
      ...reservation,
      vehicle: vehicle ?? undefined,
      customer: reservation.customerId !== null && reservation.customerId !== undefined
        ? customerById.get(reservation.customerId)
        : undefined,
    }));

    const enrichedConflicts = enrich(conflicts);
    const enrichedBlocks = enrich(maintenanceBlocks);

    // besluiten.md B-01 — "beschikbaar" is free in the period AND status ok.
    // A vehicle that is no longer in `vehicles` is in the recycle bin (the
    // delete snapshots the row into `deleted_records`); booking onto it is what
    // produced the ghost reservations of BUG-108.
    if (!vehicle) {
      return refusedVerdict("VEHICLE_NOT_FOUND", null, [], enrichedBlocks);
    }
    if (enrichedConflicts.length > 0) {
      return refusedVerdict("CONFLICT", vehicle, enrichedConflicts, enrichedBlocks);
    }
    // BUG-018 — `not_for_rental` stayed bookable through the API. Scheduling
    // the workshop on such a vehicle must stay possible, so the gate applies to
    // rentals only, never to a maintenance block.
    if (!request.isMaintenanceBlock && vehicle.availabilityStatus === 'not_for_rental') {
      return refusedVerdict("NOT_FOR_RENTAL", vehicle, [], enrichedBlocks);
    }
    return bookableVerdict(vehicle, enrichedBlocks);
  }

  /**
   * The read-only half of the predicate, kept under its old name and shape for
   * the ~20 existing callers (check-conflicts, check-availability, the overlap
   * screens). It is the same SQL the writers run — that identity is the point
   * of FIX-F: the screen that says "conflict" and the save that refuses it can
   * no longer disagree.
   */
  async checkReservationConflicts(
    vehicleId: number,
    startDate: string,
    endDate: string | null,
    excludeReservationId: number | null,
    isMaintenanceBlock: boolean = false,
    startTime: string | null = null,
    endTime: string | null = null
  ): Promise<Reservation[]> {
    const verdict = await this.isVehicleBookable({
      vehicleId,
      startDate,
      endDate,
      startTime,
      endTime,
      excludeReservationId,
      isMaintenanceBlock,
    });
    return verdict.conflicts;
  }

  /**
   * Runs `fn` inside one transaction holding a transaction-scoped advisory lock
   * on every vehicle involved, taken in **ascending id order** so two requests
   * touching the same pair can never take them in opposite orders (the deadlock
   * rule of plan §9.1). Pass `executor` to join a transaction that is already
   * open instead of nesting a new one.
   */
  private async withBookingLocks<T>(
    vehicleIds: Array<number | null | undefined>,
    fn: (tx: any) => Promise<T>,
    executor?: any,
  ): Promise<T> {
    const ids = Array.from(new Set(
      vehicleIds.filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
    )).sort((a, b) => a - b);

    const run = async (tx: any): Promise<T> => {
      for (const id of ids) {
        await tx.execute(vehicleLockSql(id));
      }
      return fn(tx);
    };

    if (executor && executor !== db) return run(executor);
    return db.transaction(run as any) as Promise<T>;
  }

  /** The `totalPrice` coercion `createReservation` has always done. */
  private normalizeReservationInsert(reservationData: InsertReservation): any {
    reservationData = this.gateReservationStatus(reservationData);
    return {
      ...reservationData,
      totalPrice: reservationData.totalPrice !== undefined
        ? String(reservationData.totalPrice)
        : undefined,
    };
  }

  /** The empty-string/"undefined" cleanup `updateReservation` has always done. */
  private normalizeReservationUpdate(reservationData: Partial<InsertReservation>): any {
    const dataToUpdate: any = { ...this.gateReservationStatus(reservationData) };

    if ('totalPrice' in dataToUpdate) {
      const val = dataToUpdate.totalPrice;
      dataToUpdate.totalPrice = (val === '' || val === null || val === undefined || val === 'undefined')
        ? null
        : String(val);
    }

    const numericFields = [
      'deliveryFee', 'fuelCost', 'departureMileage', 'startMileage',
      'deliveryStaffId', 'driverId', 'replacementForReservationId',
      'affectedRentalId', 'recurringParentId', 'maintenanceDuration'
    ];
    numericFields.forEach(field => {
      if (field in dataToUpdate) {
        const val = dataToUpdate[field];
        if (val === '' || val === null || val === undefined || val === 'undefined') {
          dataToUpdate[field] = null;
        }
      }
    });

    return dataToUpdate;
  }

  /** Attaches the vehicle and customer a reservation response carries. */
  private async attachReservationRelations(reservation: typeof reservations.$inferSelect): Promise<Reservation> {
    let vehicle: Vehicle | undefined = undefined;
    if (reservation.vehicleId !== null) {
      const [v] = await db.select().from(vehicles).where(eq(vehicles.id, reservation.vehicleId));
      vehicle = v ?? undefined;
    }
    const c = reservation.customerId !== null
      ? (await db.select().from(customers).where(eq(customers.id, reservation.customerId)))[0]
      : undefined;
    return { ...reservation, vehicle, customer: c ?? undefined };
  }

  /**
   * FIX-F — create a reservation with the bookability check **inside** the same
   * transaction as the insert, behind the vehicle's advisory lock. This is the
   * only create path a rental should use; `createReservation` stays for the
   * rows that are not a booking decision (placeholders, restores, imports).
   *
   * Throws `BookingConflictError` (409/404) when the vehicle is not bookable.
   */
  async createReservationChecked(
    reservationData: InsertReservation,
    options?: CheckedWriteOptions,
  ): Promise<Reservation> {
    const vehicleId = reservationData.vehicleId ?? null;
    if (vehicleId === null) {
      // A placeholder spare has no vehicle yet — nothing to check or lock.
      return this.createReservation(reservationData);
    }

    const inserted = await this.withBookingLocks([vehicleId], async (tx) => {
      const verdict = await this.isVehicleBookable({
        vehicleId,
        startDate: reservationData.startDate,
        endDate: reservationData.endDate ?? null,
        startTime: reservationData.startTime ?? null,
        endTime: reservationData.endTime ?? null,
        isMaintenanceBlock: reservationData.type === 'maintenance_block',
      }, tx);
      // besluiten B-09: the overlapping maintenance blocks are not a refusal,
      // but the caller has to be able to say so (BUG-013, BUG-037).
      options?.onVerdict?.(verdict);
      if (!verdict.bookable) throw new BookingConflictError(verdict);

      const [row] = await tx
        .insert(reservations)
        .values(this.normalizeReservationInsert(reservationData))
        .returning();
      return row as typeof reservations.$inferSelect;
    });

    await this.syncDeliveryTransport(inserted);
    await syncUsagePeriodSafely(inserted.id);
    return this.attachReservationRelations(inserted);
  }

  /**
   * FIX-F — update a reservation with the bookability check inside the same
   * transaction as the UPDATE (BUG-106, BUG-159). `check` is the *effective*
   * row after the patch, computed by the caller; pass `null` for a patch that
   * does not move the booking.
   */
  async updateReservationChecked(
    id: number,
    reservationData: Partial<InsertReservation>,
    check: BookingRequest | null,
    options?: CheckedWriteOptions,
  ): Promise<Reservation | undefined> {
    const updated = await this.withBookingLocks([check?.vehicleId ?? null], async (tx) => {
      if (check) {
        const verdict = await this.isVehicleBookable({ ...check, excludeReservationId: id }, tx);
        // besluiten B-09 — see createReservationChecked.
        options?.onVerdict?.(verdict);
        if (!verdict.bookable) throw new BookingConflictError(verdict);
      }
      const [row] = await tx
        .update(reservations)
        .set(this.normalizeReservationUpdate(reservationData))
        .where(and(eq(reservations.id, id), isNull(reservations.deletedAt)))
        .returning();
      return (row ?? null) as typeof reservations.$inferSelect | null;
    });

    if (!updated) return undefined;
    await this.syncDeliveryTransport(updated);
    await syncUsagePeriodSafely(updated.id);
    return this.attachReservationRelations(updated);
  }

  /**
   * FIX-F — the whole `maintenance-with-spare` write as one transaction
   * (BUG-121, BUG-160, BUG-173).
   *
   * The route used to pre-validate every spare against the database on separate
   * connections and then create the block and the replacements one by one, so
   * (a) two assignments in one payload never saw each other, (b) a double click
   * created everything twice and (c) a failure halfway left a maintenance block
   * without its spares. Here every vehicle involved is locked in ascending id
   * order, each replacement is judged against the rows the *same transaction*
   * has already inserted, and a refusal rolls the entire payload back.
   */
  async applyMaintenanceWithSpares(input: {
    maintenanceId?: number | null;
    maintenanceData: any;
    replacements: Array<Record<string, any>>;
    replacedOriginalIds?: number[];
  }): Promise<{
    maintenanceBefore: Reservation | null;
    maintenanceReservation: Reservation | undefined;
    replacements: Reservation[];
  }> {
    const spareVehicleIds = input.replacements.map((r) => r.vehicleId as number);
    const lockIds = [input.maintenanceData?.vehicleId ?? null, ...spareVehicleIds];
    // Spare vehicles whose reservation this call cancels — their availability is
    // recomputed after the commit (BUG-014: they used to stay `scheduled`).
    const freedVehicleIds: number[] = [];

    const result = await this.withBookingLocks(lockIds, async (tx) => {
      let maintenanceBefore: typeof reservations.$inferSelect | null = null;
      let maintenanceRow: typeof reservations.$inferSelect | null = null;

      if (input.maintenanceId) {
        const [before] = await tx.select().from(reservations).where(eq(reservations.id, input.maintenanceId));
        maintenanceBefore = before ?? null;

        // FIX-V — replace the previous spares **of this block**.
        //
        // BUG-118: the old rule was "every replacement of every rental in this
        // payload", which on a vehicle with two live blocks threw away the
        // other block's spare too. The link is now explicit; the
        // replacementForReservationId fallback only covers rows written before
        // the column existed.
        const originalIds = input.replacedOriginalIds ?? [];
        const oldReplacements = await tx
          .select({ id: reservations.id, status: reservations.status, vehicleId: reservations.vehicleId })
          .from(reservations)
          .where(and(
            eq(reservations.type, 'replacement'),
            isNull(reservations.deletedAt),
            or(
              eq(reservations.maintenanceBlockId, input.maintenanceId),
              originalIds.length > 0
                ? and(
                    isNull(reservations.maintenanceBlockId),
                    inArray(reservations.replacementForReservationId, originalIds),
                  )
                : sql`false`,
            ),
          ));

        // BUG-004 (CRITICAL) — a spare that has actually been handed over is
        // a physical fact, not a draft. The old code ran an unconditional
        // `db.delete` on it: the row, its mileage, its pickup date and its
        // contract link disappeared without a soft delete, a cancellation or
        // an audit entry. Same refusal `applyTransportUpdate` already gives.
        const handedOver = oldReplacements.find(
          (r: { status: string }) => normalizeReservationStatus(r.status) === 'picked_up',
        );
        if (handedOver) {
          throw new HttpError(
            409,
            'Cannot change the replacement vehicle — the current one has already been picked up. Return it first, or leave it as-is.',
            { code: 'SPARE_ALREADY_PICKED_UP' },
          );
        }

        const oldIds = oldReplacements.map((r: { id: number }) => r.id);
        if (oldIds.length > 0) {
          await tx.update(vehicleTransports)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(and(
              inArray(vehicleTransports.reservationId, oldIds),
              ne(vehicleTransports.status, 'completed'),
              ne(vehicleTransports.status, 'cancelled'),
            ));
          // Cancelled, not deleted: the calendar and the audit trail keep the
          // record that this spare was once planned.
          await tx.update(reservations)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(inArray(reservations.id, oldIds));
          freedVehicleIds.push(
            ...oldReplacements
              .map((r: { vehicleId: number | null }) => r.vehicleId)
              .filter((v: number | null): v is number => v != null),
          );
        }
      }

      // The block is written **first**, so its id can be stamped on every
      // replacement it owns (BUG-118).
      if (input.maintenanceId) {
        const [row] = await tx
          .update(reservations)
          .set(this.normalizeReservationUpdate(input.maintenanceData))
          .where(and(eq(reservations.id, input.maintenanceId), isNull(reservations.deletedAt)))
          .returning();
        maintenanceRow = row ?? null;
      } else {
        const [row] = await tx
          .insert(reservations)
          .values(this.normalizeReservationInsert(input.maintenanceData))
          .returning();
        maintenanceRow = row ?? null;
      }

      const replacementRows: Array<typeof reservations.$inferSelect> = [];
      for (const replacement of input.replacements) {
        const verdict = await this.isVehicleBookable({
          vehicleId: replacement.vehicleId,
          startDate: replacement.startDate,
          endDate: replacement.endDate ?? null,
          startTime: replacement.startTime ?? null,
          endTime: replacement.endTime ?? null,
        }, tx);
        if (!verdict.bookable) throw new BookingConflictError(verdict);

        const [row] = await tx.insert(reservations).values({
          ...replacement,
          maintenanceBlockId: maintenanceRow?.id ?? null,
        }).returning();
        replacementRows.push(row);
      }

      return { maintenanceBefore, maintenanceRow, replacementRows };
    });

    for (const vehicleId of Array.from(new Set(freedVehicleIds))) {
      await this.recomputeVehicleAvailability(vehicleId);
    }

    return {
      maintenanceBefore: result.maintenanceBefore
        ? await this.attachReservationRelations(result.maintenanceBefore)
        : null,
      maintenanceReservation: result.maintenanceRow
        ? await this.attachReservationRelations(result.maintenanceRow)
        : undefined,
      replacements: await Promise.all(result.replacementRows.map((r) => this.attachReservationRelations(r))),
    };
  }

  /**
   * FIX-H (BUG-120, BUG-109, besluiten B-03) - the handover, in one
   * transaction, with every check evaluated **before** the first write.
   *
   * The old shape was: UPDATE the reservation, then look at the vehicle, then
   * throw. A refused pickup therefore left the rental on `picked_up` with a
   * burnt contract number and an untouched vehicle, and the retry failed on
   * the status. Nothing is written now until the vehicle has been judged, and
   * a refusal rolls the whole thing back.
   */
  async pickupReservation(
    reservationId: number,
    pickupData: {
      contractNumber: string;
      pickupMileage: number;
      fuelLevelPickup: string;
      pickupDate?: string;
      pickupNotes?: string;
      // Set by the pickup route only after a mileage decrease was authorized
      // with an admin/manager account password - see POST /api/reservations/:id/pickup.
      allowMileageDecrease?: boolean;
      mileageDecreaseAuthorizedBy?: string;
      /** besluiten B-03 - the administrator override for a blocked vehicle. */
      workshopOverride?: HandoverOverride;
      /**
       * besluiten **B-16** - the employee answered "ja, de huur gaat eerder in".
       * The start date moves to this day and, per **B-07**, the total follows
       * from the new period. Only ever set by the pickup route, and only after
       * the confirmation; without it an early pickup is refused (BUG-211).
       */
      shiftStartDateTo?: string;
      /** Who handed the car over; written to the km history (rapporten fase 1). */
      actorName?: string | null;
    }
  ): Promise<Reservation | undefined> {
    const reservation = await this.getReservation(reservationId);
    if (!reservation) {
      throw new Error('Reservation not found');
    }

    if (normalizeReservationStatus(reservation.status) !== 'booked') {
      throw new Error(`Cannot pickup reservation with status: ${reservation.status}. Only 'booked' reservations can be picked up.`);
    }

    if (!reservation.vehicleId) {
      throw new Error('Cannot pickup reservation without a vehicle');
    }
    const vehicleId = reservation.vehicleId;
    const pickupDate = pickupData.pickupDate || isoToday();

    await db.transaction(async (tx) => {
      const [vehicle] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).for('update');
      if (!vehicle) {
        throw new Error('Vehicle not found');
      }

      const isMileageDecrease = !!vehicle.currentMileage && pickupData.pickupMileage < vehicle.currentMileage;
      if (isMileageDecrease && !pickupData.allowMileageDecrease) {
        throw new Error(`Pickup mileage (${pickupData.pickupMileage}) cannot be less than vehicle's current mileage (${vehicle.currentMileage})`);
      }

      // besluiten B-03 - blocked unless an administrator forces it with a
      // reason. This throws (409/400) before anything is written; the old code
      // only looked at `not_for_rental`, and only after the reservation row had
      // already been updated.
      const handover = decideHandover(vehicle, pickupData.workshopOverride ?? {});
      const overrideNote = handover.overrideNote;
      const noteParts = [
        reservation.notes || '',
        pickupData.pickupNotes ? `[PICKUP ${pickupDate}] ${pickupData.pickupNotes}` : '',
        overrideNote ?? '',
        // Filled in just below, once the shift has been decided.
      ].filter((part) => part && part.length > 0);

      // besluiten **B-16** (BUG-211) — the rental really starts today, so the
      // period says so and, per **B-07**, the total follows from it. The day
      // count is the one the booking form has always used (shared/rental-
      // pricing.ts); no rate on file means no invented price.
      const shiftTo = pickupData.shiftStartDateTo && pickupData.shiftStartDateTo < reservation.startDate
        ? pickupData.shiftStartDateTo
        : null;
      const shiftedTotal = shiftTo
        ? recalculateTotalPrice(vehicle.dailyPrice, shiftTo, reservation.endDate ?? null)
        : null;
      const shiftNote = shiftTo
        ? `[B-16 ${shiftTo}] Huur eerder ingegaan: startdatum verplaatst van ${reservation.startDate} naar ${shiftTo}${shiftedTotal != null ? `, totaal herberekend naar € ${shiftedTotal.toFixed(2)}` : ''}.`
        : '';

      const [updatedReservation] = await tx
        .update(reservations)
        .set({
          contractNumber: pickupData.contractNumber,
          pickupMileage: pickupData.pickupMileage,
          fuelLevelPickup: pickupData.fuelLevelPickup,
          actualPickupDate: pickupDate,
          status: 'picked_up',
          // The vehicle's readings as they stand right now, from the row locked
          // above - the pickup is about to overwrite them and a reversal has to
          // put them back (spec 2026-10-09 section 2.1). Null when the vehicle
          // had no reading; nothing is invented.
          vehicleMileageBeforePickup: vehicle.currentMileage ?? null,
          vehicleFuelBeforePickup: vehicle.currentFuelLevel || null,
          ...(shiftTo ? { startDate: shiftTo } : {}),
          ...(shiftedTotal != null ? { totalPrice: String(shiftedTotal) } : {}),
          // Kept in lockstep with `status` here - the widget's Actief tab reads
          // spareVehicleStatus, not status, and this is its only write path for
          // a real pickup.
          ...(reservation.type === 'replacement' ? { spareVehicleStatus: 'picked_up' } : {}),
          notes: (() => {
            const parts = shiftNote ? [...noteParts, shiftNote] : noteParts;
            return parts.length > 0 ? parts.join('\n').trim() : reservation.notes;
          })(),
          updatedAt: new Date()
        })
        // FIX-G (BUG-174): the precondition travels with the write. Two pickups
        // of the same reservation - two tabs, two counters, two contract numbers
        // - used to both succeed, and the second silently overwrote the first's
        // contract number. Now the second one updates nothing and is told so.
        .where(and(eq(reservations.id, reservationId), eq(reservations.status, 'booked')))
        .returning();

      if (!updatedReservation) {
        throw new HttpError(409, 'This reservation has already been picked up.', { code: 'ALREADY_PICKED_UP' });
      }

      const vehicleUpdate: any = {
        currentMileage: pickupData.pickupMileage,
        currentFuelLevel: pickupData.fuelLevelPickup,
        updatedAt: new Date()
      };

      // Same audit trail the vehicle edit form writes - Vehicle Details shows
      // this to admins as the mileage-decrease banner.
      if (isMileageDecrease) {
        vehicleUpdate.mileageDecreasedBy = pickupData.mileageDecreaseAuthorizedBy || 'unknown';
        vehicleUpdate.mileageDecreasedAt = new Date();
        vehicleUpdate.previousMileage = vehicle.currentMileage;
      }

      await tx.update(vehicles).set(vehicleUpdate).where(eq(vehicles.id, vehicleId));

      // Rapporten fase 1 - the reading goes into the km history in the same
      // transaction, keyed on the reservation so a re-pickup overwrites it.
      await recordMileageReading(tx, {
        vehicleId,
        mileage: pickupData.pickupMileage,
        recordedAt: readingInstantForOfficeDate(pickupDate),
        source: 'pickup',
        sourceTable: 'reservations',
        sourceId: reservationId,
        actorName: pickupData.actorName ?? 'systeem',
      });

      // FIX-H - the single writer decides what the status becomes. BUG-211: a
      // rental picked up before its start date now makes the vehicle `rented`,
      // where the date-window rule left it advertised as free. B-03: a forced
      // handover keeps the workshop flag visible.
      await this.recomputeVehicleAvailability(vehicleId, { executor: tx });
    });

    await syncUsagePeriodSafely(reservationId);
    return this.getReservation(reservationId);
  }

  /**
   * FIX-H - the return, in one transaction.
   *
   * besluiten **B-02**: taking the vehicle back closes the rental. The row goes
   * straight to `completed`, so the car is bookable again the same second and
   * the overdue guard can never mistake a normal return for a customer who
   * still has the car, four days later (BUG-113).
   *
   * BUG-019/BUG-128: `endDate` is the *planned* end and is never rewritten; the
   * actual return day lives in `actualReturnDate`/`completionDate`, which the
   * row has always had.
   */
  async returnReservation(
    reservationId: number,
    returnData: {
      returnMileage: number;
      fuelLevelReturn: string;
      returnDate?: string;
      returnNotes?: string;
      /** Punt 1 (Kees, 2026-10-19): extra costs settled at return; null = none. Left alone when absent. */
      extraCosts?: { fuelCost: number | null; extraKm: number | null; extraKmCost: number | null };
      /** Who took the car back; written to the km history (rapporten fase 1). */
      actorName?: string | null;
    }
  ): Promise<Reservation | undefined> {
    const reservation = await this.getReservation(reservationId);
    if (!reservation) {
      throw new Error('Reservation not found');
    }

    if (normalizeReservationStatus(reservation.status) !== 'picked_up') {
      throw new Error(`Cannot return reservation with status: ${reservation.status}. Only 'picked_up' reservations can be returned.`);
    }

    if (!reservation.vehicleId) {
      throw new Error('Cannot return reservation without a vehicle');
    }
    const vehicleId = reservation.vehicleId;

    if (reservation.pickupMileage && returnData.returnMileage < reservation.pickupMileage) {
      throw new Error(`Return mileage (${returnData.returnMileage}) cannot be less than pickup mileage (${reservation.pickupMileage})`);
    }

    const returnDate = returnData.returnDate || isoToday();

    await db.transaction(async (tx) => {
      const [updatedReservation] = await tx
        .update(reservations)
        .set({
          returnMileage: returnData.returnMileage,
          fuelLevelReturn: returnData.fuelLevelReturn,
          ...(returnData.extraCosts ? {
            fuelCost: returnData.extraCosts.fuelCost != null ? String(returnData.extraCosts.fuelCost) : null,
            extraKm: returnData.extraCosts.extraKm,
            extraKmCost: returnData.extraCosts.extraKmCost != null ? String(returnData.extraCosts.extraKmCost) : null,
          } : {}),
          actualReturnDate: returnDate,
          // besluiten B-02 - the return closes the rental.
          status: 'completed',
          ...(reservation.type === 'replacement' ? { spareVehicleStatus: 'returned' } : {}),
          // BUG-019: endDate stays the planned end. It used to be overwritten
          // with the return day, which produced end < start on every early
          // return and on every backdated one.
          completionDate: returnDate,
          notes: returnData.returnNotes
            ? `${reservation.notes || ''}\n[RETURN ${returnDate}] ${returnData.returnNotes}`.trim()
            : reservation.notes,
          updatedAt: new Date()
        })
        // FIX-G: the precondition travels with the write, so two returns of one
        // rental cannot both succeed.
        .where(and(eq(reservations.id, reservationId), eq(reservations.status, 'picked_up')))
        .returning();

      if (!updatedReservation) {
        throw new HttpError(409, 'This reservation has already been returned.', { code: 'ALREADY_RETURNED' });
      }

      // Unlike the pickup, the return did not read the vehicle at all. Lock it
      // now - after the reservation row, the order this transaction has always
      // used, so no new lock order appears - and keep the readings the return is
      // about to overwrite (spec 2026-10-09 section 2.1). The pickup pair on the
      // row is left alone; rows picked up before this existed keep it null.
      // FOR NO KEY UPDATE, not FOR UPDATE: it is exactly the strength the
      // UPDATE of the vehicle below takes anyway, so the lock is no stronger than
      // before this read existed. FOR UPDATE would also stall every insert or
      // update of a row that references the vehicle (they take FOR KEY SHARE).
      const [vehicleBefore] = await tx
        .select({ currentMileage: vehicles.currentMileage, currentFuelLevel: vehicles.currentFuelLevel })
        .from(vehicles)
        .where(eq(vehicles.id, vehicleId))
        .for('no key update');
      await tx
        .update(reservations)
        .set({
          vehicleMileageBeforeReturn: vehicleBefore?.currentMileage ?? null,
          vehicleFuelBeforeReturn: vehicleBefore?.currentFuelLevel || null,
        })
        .where(eq(reservations.id, reservationId));

      await tx
        .update(vehicles)
        .set({
          currentMileage: returnData.returnMileage,
          currentFuelLevel: returnData.fuelLevelReturn,
          updatedAt: new Date()
        })
        .where(eq(vehicles.id, vehicleId));

      // Rapporten fase 1 - same transaction, keyed on the reservation.
      await recordMileageReading(tx, {
        vehicleId,
        mileage: returnData.returnMileage,
        recordedAt: readingInstantForOfficeDate(returnDate),
        source: 'return',
        sourceTable: 'reservations',
        sourceId: reservationId,
        actorName: returnData.actorName ?? 'systeem',
      });

      // besluiten B-03 - the workshop flag survives the return: the derivation
      // reads `maintenance_status` and the sticky manual status, so it cannot be
      // washed away by an unconditional 'available' the way the old branch did.
      await this.recomputeVehicleAvailability(vehicleId, { executor: tx });
    });

    await syncUsagePeriodSafely(reservationId);
    return this.getReservation(reservationId);
  }

  // Expense methods

  /**
   * A-9-8: the Kosten list narrows on vehicle, period and category. `date` is a
   * YYYY-MM-DD text column, so the bounds compare lexically; the category is
   * compared case-insensitively because rows older than A-9-1 may still be capitalised.
   * The free-text search (2026-10-16) looks at the plate without dashes, the
   * category, the description and the brand and model, so "04vkd6", "Banden",
   * "olie" and "ford transit" all find rows.
   * Every list query joins `vehicles`, so the plate can be searched and sorted on.
   */
  private expenseConditions(filters: ExpenseFilters): SQL | undefined {
    const conditions: SQL[] = [];
    if (filters.vehicleId !== undefined) conditions.push(eq(expenses.vehicleId, filters.vehicleId));
    if (filters.from) conditions.push(gte(expenses.date, filters.from));
    if (filters.to) conditions.push(lte(expenses.date, filters.to));
    if (filters.category) conditions.push(sql`lower(btrim(${expenses.category})) = ${filters.category.trim().toLowerCase()}`);
    if (filters.noReceipt) conditions.push(sql`coalesce(btrim(${expenses.receiptFilePath}), '') = '' and coalesce(btrim(${expenses.receiptUrl}), '') = ''`);
    const q = (filters.q ?? "").trim().toLowerCase();
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const plateLike = `%${q.replace(/[-\s]/g, "").replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      conditions.push(sql`(
        lower(coalesce(${expenses.description}, '')) like ${like}
        or lower(coalesce(${expenses.category}, '')) like ${like}
        or replace(replace(lower(coalesce(${vehicles.licensePlate}, '')), '-', ''), ' ', '') like ${plateLike}
        or lower(coalesce(${vehicles.brand}, '') || ' ' || coalesce(${vehicles.model}, '')) like ${like}
      )`);
    }
    return conditions.length ? and(...conditions) : undefined;
  }

  /** The ORDER BY for a sort key; the id breaks every tie so pages never overlap or skip a row. */
  private expenseOrder(sort: ExpenseSortKey, dir: "asc" | "desc"): SQL[] {
    const direction = dir === "asc" ? asc : desc;
    const column: SQL | typeof expenses.date = {
      date: expenses.date,
      plate: sql`coalesce(${vehicles.licensePlate}, '')`,
      category: sql`lower(btrim(${expenses.category}))`,
      description: sql`lower(coalesce(${expenses.description}, ''))`,
      amount: sql`${expenses.amount}::numeric`,
    }[sort];
    return sort === "date"
      ? [direction(expenses.date), direction(expenses.id)]
      : [direction(column), desc(expenses.date), desc(expenses.id)];
  }

  private expenseWithVehicle(row: { expense: typeof expenses.$inferSelect; vehicle: typeof vehicles.$inferSelect | null }): Expense {
    return { ...row.expense, vehicle: row.vehicle ?? undefined } as Expense;
  }

  async getAllExpenses(filters: ExpenseFilters = {}, options: ExpenseListOptions = {}): Promise<Expense[]> {
    const rows = await db
      .select({ expense: expenses, vehicle: vehicles })
      .from(expenses)
      .leftJoin(vehicles, eq(expenses.vehicleId, vehicles.id))
      .where(this.expenseConditions(filters))
      .orderBy(...this.expenseOrder(options.sort ?? "date", options.dir ?? (options.sort ? "asc" : "desc")));
    return rows.map((row) => this.expenseWithVehicle(row));
  }

  async getExpensePage(filters: ExpenseFilters, options: Required<ExpenseListOptions>): Promise<ExpensePage> {
    const where = this.expenseConditions(filters);
    const [[totals], rows] = await Promise.all([
      db
        .select({ total: sql<number>`count(*)::int`, totalCents: sql<number>`coalesce(sum(round(${expenses.amount}::numeric * 100)), 0)::bigint` })
        .from(expenses)
        .leftJoin(vehicles, eq(expenses.vehicleId, vehicles.id))
        .where(where),
      db
        .select({ expense: expenses, vehicle: vehicles })
        .from(expenses)
        .leftJoin(vehicles, eq(expenses.vehicleId, vehicles.id))
        .where(where)
        .orderBy(...this.expenseOrder(options.sort, options.dir))
        .limit(options.pageSize)
        .offset((options.page - 1) * options.pageSize),
    ]);
    return {
      rows: rows.map((row) => this.expenseWithVehicle(row)),
      total: Number(totals?.total ?? 0),
      totalAmount: Number(totals?.totalCents ?? 0) / 100,
      page: options.page,
      pageSize: options.pageSize,
    };
  }

  async getExpenseSummary(filters: ExpenseFilters, recentPerCategory: number): Promise<ExpenseSummary> {
    const where = this.expenseConditions(filters);
    const categoryKey = sql`lower(btrim(${expenses.category}))`;
    const groups = await db
      .select({ category: sql<string>`${categoryKey}`, count: sql<number>`count(*)::int`, cents: sql<number>`coalesce(sum(round(${expenses.amount}::numeric * 100)), 0)::bigint` })
      .from(expenses)
      .leftJoin(vehicles, eq(expenses.vehicleId, vehicles.id))
      .where(where)
      .groupBy(categoryKey);

    // The newest few rows of every category in one pass: a window function ranks
    // the rows within their category, the outer query keeps the first N ids.
    const ranked = db
      .select({ id: expenses.id, rank: sql<number>`row_number() over (partition by ${categoryKey} order by ${expenses.date} desc, ${expenses.id} desc)`.as("rank") })
      .from(expenses)
      .leftJoin(vehicles, eq(expenses.vehicleId, vehicles.id))
      .where(where)
      .as("ranked");
    const recentIds = recentPerCategory > 0
      ? (await db.select({ id: ranked.id }).from(ranked).where(lte(ranked.rank, recentPerCategory))).map((r) => r.id)
      : [];
    const recentRows = recentIds.length
      ? await db
        .select({ expense: expenses, vehicle: vehicles })
        .from(expenses)
        .leftJoin(vehicles, eq(expenses.vehicleId, vehicles.id))
        .where(inArray(expenses.id, recentIds))
        .orderBy(desc(expenses.date), desc(expenses.id))
      : [];
    const recentByCategory = new Map<string, Expense[]>();
    for (const row of recentRows) {
      const key = (row.expense.category ?? "").trim().toLowerCase();
      recentByCategory.set(key, [...(recentByCategory.get(key) ?? []), this.expenseWithVehicle(row)]);
    }

    const byCategory = groups
      .map((g) => ({ category: g.category ?? "", count: Number(g.count), amount: Number(g.cents) / 100, recent: recentByCategory.get(g.category ?? "") ?? [] }))
      .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
    return {
      total: byCategory.reduce((n, g) => n + g.count, 0),
      totalAmount: Math.round(byCategory.reduce((cents, g) => cents + Math.round(g.amount * 100), 0)) / 100,
      byCategory,
    };
  }

  /**
   * Kosten (2026-10-18): the selection per vehicle, so a category section shows a
   * vehicle once with its count and sum instead of a row per bill. The newest
   * cost's description comes along for a vehicle with one cost.
   */
  async getExpenseVehicleGroups(filters: ExpenseFilters): Promise<ExpenseVehicleGroup[]> {
    const lastDate = sql<string>`max(${expenses.date})`;
    const rows = await db
      .select({
        vehicleId: expenses.vehicleId,
        licensePlate: sql<string | null>`max(${vehicles.licensePlate})`,
        brand: sql<string | null>`max(${vehicles.brand})`,
        model: sql<string | null>`max(${vehicles.model})`,
        count: sql<number>`count(*)::int`,
        cents: sql<number>`coalesce(sum(round(${expenses.amount}::numeric * 100)), 0)::bigint`,
        firstDate: sql<string>`min(${expenses.date})`,
        lastDate,
        lastDescription: sql<string | null>`(array_agg(${expenses.description} order by ${expenses.date} desc, ${expenses.id} desc))[1]`,
      })
      .from(expenses)
      .leftJoin(vehicles, eq(expenses.vehicleId, vehicles.id))
      .where(this.expenseConditions(filters))
      .groupBy(expenses.vehicleId)
      .orderBy(desc(lastDate), sql`max(${vehicles.licensePlate})`, asc(expenses.vehicleId));
    return rows.map(({ cents, ...row }) => ({ ...row, count: Number(row.count), amount: Number(cents) / 100 }));
  }

  async getExpenseFacets(): Promise<ExpenseFacets> {
    const [vehicleRows, categoryRows] = await Promise.all([
      db
        .selectDistinct({ id: vehicles.id, licensePlate: vehicles.licensePlate, brand: vehicles.brand, model: vehicles.model })
        .from(vehicles)
        .innerJoin(expenses, eq(expenses.vehicleId, vehicles.id))
        .orderBy(asc(vehicles.licensePlate)),
      db
        .selectDistinct({ category: sql<string>`lower(btrim(${expenses.category}))` })
        .from(expenses),
    ]);
    return {
      vehicles: vehicleRows,
      categories: categoryRows.map((r) => r.category ?? "").filter(Boolean).sort(),
    };
  }

  async getExpense(id: number): Promise<Expense | undefined> {
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, id));
    
    if (!expense) {
      return undefined;
    }
    
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, expense.vehicleId));
    
    return {
      ...expense,
      vehicle
    };
  }

  async createExpense(expenseData: InsertExpense, tx?: DbTransaction): Promise<Expense> {
    const conn = tx ?? db;
    // Ensure amount is a string if it's a number
    const finalData = {
      ...expenseData,
      // A-9-1: every writer (form, invoice inbox, scanner) passes through here,
      // so the category is stored as one canonical lower-case key.
      category: normalizeExpenseCategory(expenseData.category),
      amount: typeof expenseData.amount === 'number' ? String(expenseData.amount) : expenseData.amount
    };
    
    console.log("Database - creating expense with data:", finalData);
    const [expense] = await conn.insert(expenses).values(finalData).returning();
    
    const [vehicle] = await conn.select().from(vehicles).where(eq(vehicles.id, expense.vehicleId));
    
    return {
      ...expense,
      vehicle
    };
  }

  async updateExpense(id: number, expenseData: Partial<InsertExpense>): Promise<Expense | undefined> {
    // Ensure amount is a string if it's a number
    const finalData: any = {
      ...expenseData
    };

    // A-9-1: same canonical key as on create (only when the category is part of the update).
    if (finalData.category !== undefined) finalData.category = normalizeExpenseCategory(finalData.category);
    
    if (finalData.amount !== undefined && typeof finalData.amount === 'number') {
      finalData.amount = String(finalData.amount);
    }
    
    console.log("Database - updating expense with data:", finalData);
    const [updatedExpense] = await db
      .update(expenses)
      .set(finalData)
      .where(eq(expenses.id, id))
      .returning();
    
    if (!updatedExpense) {
      return undefined;
    }
    
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, updatedExpense.vehicleId));
    
    return {
      ...updatedExpense,
      vehicle
    };
  }

  async getExpensesByVehicle(vehicleId: number): Promise<Expense[]> {
    const expensesData = await db
      .select()
      .from(expenses)
      .where(eq(expenses.vehicleId, vehicleId));
    
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
    
    return expensesData.map(expense => ({
      ...expense,
      vehicle
    }));
  }

  async getRecentExpenses(limit: number): Promise<Expense[]> {
    const result = await db
      .select({
        expense: expenses,
        vehicle: vehicles,
      })
      .from(expenses)
      .leftJoin(vehicles, eq(expenses.vehicleId, vehicles.id))
      .orderBy(desc(expenses.createdAt))
      .limit(limit);
    
    return result.map(row => ({
      ...row.expense,
      vehicle: row.vehicle ?? undefined,
    }));
  }
  
  /**
   * Sub-project D (B-41 D8) — an expense goes to the recycle bin: the row and the inbox items
   * that listed it in `expense_ids` are snapshotted in the same transaction as the delete, so a
   * restore can relink them. The receipt file stays on disk until the bin is emptied.
   */
  async deleteExpense(
    id: number,
    actor?: { username?: string | null; userId?: number | null },
  ): Promise<boolean> {
    try {
      return await db.transaction(async (tx) => {
        const [expense] = await tx.select().from(expenses).where(eq(expenses.id, id)).for('update');
        if (!expense) return false;
        const [vehicle] = await tx.select({ licensePlate: vehicles.licensePlate }).from(vehicles).where(eq(vehicles.id, expense.vehicleId));

        // The inbox items that list this expense (the array is a cache next to expenses.inbox_item_id).
        const listed = await tx.execute(sql`
          UPDATE invoice_inbox_items SET expense_ids = array_remove(expense_ids, ${id})
          WHERE ${id} = ANY(expense_ids)
          RETURNING id
        `);
        const inboxItemIds = listed.rows.map((r: any) => Number(r.id));

        const amount = Number(expense.amount);
        const shownAmount = Number.isFinite(amount) ? amount.toFixed(2).replace('.', ',') : expense.amount;
        await tx.insert(deletedRecords).values({
          entityType: 'expense',
          entityId: id,
          label: `Kostenpost #${id} — ${vehicle?.licensePlate ?? `voertuig ${expense.vehicleId}`} ${expense.category} € ${shownAmount} ${expense.date}`,
          payload: { expense, inboxItemIds },
          relatedCounts: inboxItemIds.length > 0 ? { invoice_inbox_items: inboxItemIds.length } : {},
          deletedBy: actor?.username || null,
          deletedByUserId: actor?.userId ?? null,
        });

        const result = await tx.delete(expenses).where(eq(expenses.id, id));
        return result.rowCount !== null && result.rowCount > 0;
      });
    } catch (error) {
      console.error("Error deleting expense:", error);
      return false;
    }
  }

  // Batch-loads vehicles/customers instead of one query per transport (same
  // pattern used for reservations — see checkReservationConflicts history).
  private async attachTransportRelations(rows: (typeof vehicleTransports.$inferSelect)[]): Promise<VehicleTransport[]> {
    const vehicleIds = Array.from(new Set(
      rows.flatMap(t => [t.vehicleId, t.relatedVehicleId]).filter((id): id is number => id != null)
    ));
    const customerIds = Array.from(new Set(
      rows.map(t => t.customerId).filter((id): id is number => id != null)
    ));
    const spareReservationIds = Array.from(new Set(
      rows.map(t => t.spareReservationId).filter((id): id is number => id != null)
    ));

    const [vehicleRows, customerRows, spareReservationRows] = await Promise.all([
      vehicleIds.length ? db.select().from(vehicles).where(inArray(vehicles.id, vehicleIds)) : Promise.resolve([]),
      customerIds.length ? db.select().from(customers).where(inArray(customers.id, customerIds)) : Promise.resolve([]),
      spareReservationIds.length ? db.select().from(reservations).where(inArray(reservations.id, spareReservationIds)) : Promise.resolve([]),
    ]);
    const vehicleById = new Map(vehicleRows.map(v => [v.id, v]));
    const customerById = new Map(customerRows.map(c => [c.id, c]));
    // PickupDialog (the real pickup form — contract number, mileage, fuel, damage
    // check) expects reservation.vehicle populated for sensible defaults, so hydrate
    // that here rather than making the frontend fetch it separately.
    const spareReservationById = new Map(
      spareReservationRows.map(r => [r.id, { ...r, vehicle: r.vehicleId != null ? vehicleById.get(r.vehicleId) : undefined }])
    );

    return rows.map(t => ({
      ...t,
      vehicle: t.vehicleId != null ? vehicleById.get(t.vehicleId) : undefined,
      relatedVehicle: t.relatedVehicleId != null ? vehicleById.get(t.relatedVehicleId) : undefined,
      customer: t.customerId != null ? customerById.get(t.customerId) : undefined,
      spareReservation: t.spareReservationId != null ? spareReservationById.get(t.spareReservationId) : undefined,
    }));
  }

  async getAllTransports(): Promise<VehicleTransport[]> {
    const rows = await db.select().from(vehicleTransports).orderBy(desc(vehicleTransports.scheduledDate), desc(vehicleTransports.id));
    return this.attachTransportRelations(rows);
  }

  async getTransport(id: number): Promise<VehicleTransport | undefined> {
    const [row] = await db.select().from(vehicleTransports).where(eq(vehicleTransports.id, id));
    if (!row) return undefined;
    const [withRelations] = await this.attachTransportRelations([row]);
    return withRelations;
  }

  // For the barcode scan lookup — the transport a scanned vehicle is currently
  // open on (not yet completed/cancelled), earliest-scheduled first. No
  // deletedAt column on this table, so no soft-delete filter is needed.
  async getActiveTransportByVehicle(vehicleId: number): Promise<VehicleTransport | undefined> {
    const [row] = await db.select().from(vehicleTransports)
      .where(and(
        eq(vehicleTransports.vehicleId, vehicleId),
        or(eq(vehicleTransports.status, 'scheduled'), eq(vehicleTransports.status, 'in_progress')),
      ))
      .orderBy(vehicleTransports.scheduledDate)
      .limit(1);
    if (!row) return undefined;
    const [withRelations] = await this.attachTransportRelations([row]);
    return withRelations;
  }

  async createTransport(transportData: InsertVehicleTransport): Promise<VehicleTransport> {
    const [row] = await db.insert(vehicleTransports).values(transportData as unknown as typeof vehicleTransports.$inferInsert).returning();
    const [withRelations] = await this.attachTransportRelations([row]);
    return withRelations;
  }

  async updateTransport(id: number, transportData: Partial<InsertVehicleTransport>): Promise<VehicleTransport | undefined> {
    const [row] = await db
      .update(vehicleTransports)
      .set({ ...(transportData as unknown as Partial<typeof vehicleTransports.$inferInsert>), updatedAt: new Date() })
      .where(eq(vehicleTransports.id, id))
      .returning();
    if (!row) return undefined;
    const [withRelations] = await this.attachTransportRelations([row]);
    return withRelations;
  }

  /**
   * besluiten **B-15** (BUG-140) — a transport is snapshotted into the recycle
   * bin before it goes, together with the spare reservation the delete closed,
   * so "de vervangingsreservering houdt zijn herkomst" is true again. There is
   * no `deleted_at` column on `vehicle_transports`; the snapshot is what makes
   * the delete reversible.
   */
  async deleteTransport(
    id: number,
    actor?: { username?: string | null; userId?: number | null },
  ): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [transport] = await tx.select().from(vehicleTransports)
        .where(eq(vehicleTransports.id, id)).for('update');
      if (!transport) return false;

      const [spareReservation] = transport.spareReservationId != null
        ? await tx.select().from(reservations).where(eq(reservations.id, transport.spareReservationId))
        : [undefined];

      const vehicle = transport.vehicleId != null ? await this.getVehicle(transport.vehicleId) : undefined;
      const plate = vehicle?.licensePlate ?? transport.externalLicensePlate ?? null;

      await tx.insert(deletedRecords).values({
        entityType: 'transport',
        entityId: id,
        label: `Transport #${id}${plate ? ` — ${plate}` : ''} ${transport.scheduledDate ?? ''}`.trim(),
        payload: { transport, spareReservation: spareReservation ?? null },
        relatedCounts: { spareReservations: spareReservation ? 1 : 0 },
        deletedBy: actor?.username || null,
        deletedByUserId: actor?.userId ?? null,
      });

      const result = await tx.delete(vehicleTransports).where(eq(vehicleTransports.id, id));
      return result.rowCount !== null && result.rowCount > 0;
    });
  }

  // Applies any partial transport update, handling the spare/replacement-vehicle
  // workflow atomically alongside plain field changes:
  //  - relatedVehicleId null -> X: conflict-checks X for scheduledDate, creates a
  //    'standard' reservation for it (so it participates in normal double-booking
  //    checks, unlike 'maintenance_block' rows), and — if isBreakdownOrMaintenance —
  //    puts the original vehicle into service via markVehicleForService.
  //  - relatedVehicleId X -> Y: cancels the old spare reservation, creates a new one.
  //  - relatedVehicleId X -> null (back to TBD), or spareRequired -> false: cancels
  //    the spare reservation and clears the spare columns. The original vehicle's
  //    maintenance status is left as-is — only the specific spare choice changed,
  //    not the underlying breakdown/maintenance reason.
  //  - status -> completed/cancelled while isBreakdownOrMaintenance: restores the
  //    original vehicle via markVehicleForService(..., 'ok').
  // Everything happens inside one db.transaction so a conflict or failed write can
  // never leave the spare reserved without the original vehicle updated, or vice versa.
  async applyTransportUpdate(
    id: number,
    changes: Partial<InsertVehicleTransport>,
    options?: { create?: InsertVehicleTransport },
  ): Promise<VehicleTransport> {
    let restoreMaintenanceAfterCommit = false;
    let markServiceAfterCommit = false;
    // Spare vehicles released by this update — recomputed after the commit so
    // they do not stay `scheduled` (BUG-115).
    const freedSpareVehicleIds: number[] = [];

    const updatedRow = await db.transaction(async (tx) => {
      // FIX-G (BUG-142): `POST /api/transports` used to insert the transport on
      // one connection and then apply the spare workflow in this transaction.
      // When the spare turned out to be taken, the 409 rolled back only the
      // second half and left an orphan transport behind — which staff then
      // duplicated by retrying. Creating the row inside this same transaction
      // means a refusal leaves nothing at all.
      if (options?.create) {
        const [createdRow] = await tx
          .insert(vehicleTransports)
          .values(options.create as unknown as typeof vehicleTransports.$inferInsert)
          .returning();
        id = createdRow.id;
      }

      const [current] = await tx.select().from(vehicleTransports).where(eq(vehicleTransports.id, id));
      if (!current) {
        throw new Error('Transport not found');
      }

      const nextSpareRequired = changes.spareRequired ?? current.spareRequired;
      const nextRelatedVehicleId = changes.relatedVehicleId !== undefined ? changes.relatedVehicleId : current.relatedVehicleId;
      const nextIsBreakdown = changes.isBreakdownOrMaintenance ?? current.isBreakdownOrMaintenance;

      // FIX-W (BUG-136) — `status` was free text: `garbage_status` was stored,
      // and `completed -> in_progress` reopened a closed transport without
      // undoing any of the side effects closing it had. One table, one place.
      if (changes.status !== undefined) {
        changes = { ...changes, status: assertTransportTransition(current.status, changes.status) };
      }

      // Hoisted: the spare branches below have to know that this update closes
      // the transport (BUG-137 — completing one used to *create* a placeholder).
      const closingNow = changes.status !== undefined && changes.status !== current.status &&
        (changes.status === 'completed' || changes.status === 'cancelled');
      const cancellingNow = changes.status === 'cancelled' && current.status !== 'cancelled';

      // FIX-W (BUG-114) — the day the transport happens, after this update.
      const nextScheduledDate = changes.scheduledDate ?? current.scheduledDate;
      const scheduledDateChanged = nextScheduledDate !== current.scheduledDate;
      // FIX-W (BUG-116) — the guard compared the *incoming* replacement with the
      // *current* original, so `PATCH {vehicleId: <the replacement>}` was
      // accepted and produced a transport where the car replaces itself — after
      // which every further vehicleId edit answered 400 and only a call that
      // also changed relatedVehicleId could get it out again.
      const nextVehicleId = changes.vehicleId !== undefined ? changes.vehicleId : current.vehicleId;
      const vehicleChanged = nextVehicleId !== current.vehicleId;

      if (nextRelatedVehicleId != null && nextRelatedVehicleId === nextVehicleId) {
        throw new Error('Replacement vehicle cannot be the same as the original vehicle');
      }

      let spareReservationId = current.spareReservationId;
      const relatedVehicleChanged = nextRelatedVehicleId !== current.relatedVehicleId;
      const spareTurnedOff = current.spareRequired && !nextSpareRequired;

      // The spare reservation is now created once (as a TBD placeholder if no
      // vehicle is picked yet) and kept for the transport's whole lifecycle,
      // updated in place as the assignment changes — never cancelled and
      // recreated — so it stays visible in the Rental Calendar and "Beheer
      // vervangende voertuigen" the entire time (both key off a reservation
      // actually existing with type 'replacement').
      if (spareReservationId && (spareTurnedOff || relatedVehicleChanged)) {
        const [currentSpareReservation] = await tx.select().from(reservations).where(eq(reservations.id, spareReservationId));
        // Only a still-'booked' reservation is safe to silently cancel/reassign —
        // once the spare has actually been picked up (or already returned) it's a
        // real handover on record, not a placeholder to swap out from under the
        // driver.
        if (currentSpareReservation && currentSpareReservation.status !== 'booked') {
          const message = currentSpareReservation.status === 'picked_up'
            ? 'Cannot change the replacement vehicle — the current one has already been picked up. Return it first, or leave it as-is.'
            : 'Cannot change the replacement vehicle — the current one has already been returned. This transport now reflects a completed handover; leave it as-is.';
          throw new Error(message);
        }

        if (spareTurnedOff) {
          await tx.update(reservations)
            // BUG-137: `placeholderSpare` stayed true on the cancelled row, so
            // the assignment widget kept offering it and `assign-vehicle`
            // happily booked a real car onto a cancelled reservation.
            .set({ status: 'cancelled', placeholderSpare: false, updatedAt: new Date() })
            .where(eq(reservations.id, spareReservationId));
          spareReservationId = null;
        } else if (nextRelatedVehicleId == null) {
          // Assigned -> back to TBD: revert to placeholder shape rather than
          // cancelling, so it keeps showing as a TBD reminder.
          await tx.update(reservations)
            .set({ vehicleId: null, placeholderSpare: true, startTime: null, endTime: null, updatedAt: new Date() })
            .where(eq(reservations.id, spareReservationId));
        } else {
          // TBD -> assigned, or reassigned to a different vehicle. Same
          // same-day-turnover-exception workaround as below — explicit full-day
          // window so two different transports can't both claim this vehicle on
          // the same day — and exclude this reservation from its own conflict
          // check since it's being updated, not inserted fresh.
          // FIX-F (BUG-160): the check now runs on `tx`, behind this vehicle's
          // advisory lock, so it sees (and blocks) a concurrent assignment of
          // the same spare instead of reading a stale free slot on another
          // connection.
          await tx.execute(vehicleLockSql(nextRelatedVehicleId));
          const verdict = await this.isVehicleBookable({
            vehicleId: nextRelatedVehicleId,
            startDate: current.scheduledDate,
            endDate: current.scheduledDate,
            startTime: '00:00',
            endTime: '23:59',
            excludeReservationId: spareReservationId,
          }, tx);
          if (!verdict.bookable) {
            throw new BookingConflictError(verdict, 'Replacement vehicle has conflicting reservations for this date');
          }
          await tx.update(reservations)
            .set({ vehicleId: nextRelatedVehicleId, placeholderSpare: false, startTime: '00:00', endTime: '23:59', updatedAt: new Date() })
            .where(eq(reservations.id, spareReservationId));
        }
      }

      if (closingNow && spareReservationId) {
        // BUG-137: completing or cancelling a transport left its TBD placeholder
        // `booked` and in `needing-assignment` for ever, and a real vehicle could
        // still be booked onto a transport that had already happened. A spare
        // that was actually assigned is left alone — that is a real handover.
        const [openSpare] = await tx.select().from(reservations).where(eq(reservations.id, spareReservationId));
        if (openSpare && openSpare.placeholderSpare && normalizeReservationStatus(openSpare.status) === 'booked') {
          await tx.update(reservations)
            .set({ status: 'cancelled', placeholderSpare: false, updatedAt: new Date() })
            .where(eq(reservations.id, spareReservationId));
          spareReservationId = null;
        }
      }

      // BUG-137: `applyTransportUpdate` runs on *every* update, so a PATCH that
      // only said `status: completed` created a brand-new placeholder for a
      // transport that was finished.
      if (nextSpareRequired && !spareReservationId && !closingNow) {
        if (nextRelatedVehicleId != null) {
          // A transport's spare reservation spans a single calendar day (startDate
          // === endDate). checkReservationConflicts has a deliberate "same-day
          // turnover" exception for exactly that shape (return this morning, new
          // pickup this afternoon) — it does NOT count as a conflict when neither
          // side has a time. That's correct for real rental handovers, but two
          // DIFFERENT transports both wanting the same spare on the same day must
          // actually conflict, so give the reservation an explicit full-day window
          // rather than leaving times null.
          // FIX-F (BUG-160): tx-scoped and lock-protected, see above.
          await tx.execute(vehicleLockSql(nextRelatedVehicleId));
          const verdict = await this.isVehicleBookable({
            vehicleId: nextRelatedVehicleId,
            startDate: current.scheduledDate,
            endDate: current.scheduledDate,
            startTime: '00:00',
            endTime: '23:59',
          }, tx);
          if (!verdict.bookable) {
            throw new BookingConflictError(verdict, 'Replacement vehicle has conflicting reservations for this date');
          }
        }

        // If the transport's own vehicle is currently out on an active rental, this
        // spare is really standing in for THAT reservation/customer — not for the
        // transport in the abstract — so link it the same way the reservation-side
        // spare workflow always has (replacementForReservationId), which is also
        // what makes the Rental Calendar / "Beheer vervangende voertuigen" show the
        // customer/original-vehicle it's replacing instead of just "Transport #N".
        // replacementForTransportId is still recorded either way, so the
        // assign-vehicle guard (server/database-storage.ts assignVehicleToPlaceholder)
        // keeps blocking cross-UI writes to vehicleId regardless of which label wins.
        let affectedRentalReservation: Reservation | undefined;
        let originalVehicle: typeof vehicles.$inferSelect | undefined;
        if (current.vehicleId != null) {
          [affectedRentalReservation] = await tx.select().from(reservations).where(
            and(
              eq(reservations.vehicleId, current.vehicleId),
              eq(reservations.status, 'picked_up'),
              isNull(reservations.deletedAt)
            )
          );
          [originalVehicle] = await tx.select().from(vehicles).where(eq(vehicles.id, current.vehicleId));
        }
        // Describes the vehicle being replaced, not internal ids — this is what
        // shows in the Rental Calendar's Notes section, where staff read it, not
        // a debugging trail. The "replacing {plate}" badge elsewhere on that same
        // dialog already covers this for reservation-linked spares; this note is
        // what carries that context for the external/no-active-rental case too.
        const replacingLabel = originalVehicle
          ? `${originalVehicle.brand} ${originalVehicle.model} (${originalVehicle.licensePlate})`
          : current.isExternalVehicle
            ? `${[current.externalBrand, current.externalModel].filter(Boolean).join(' ')}${current.externalLicensePlate ? ` (${current.externalLicensePlate})` : ''} — external vehicle`.trim()
            : null;

        const spareReservationData: InsertReservation = {
          vehicleId: nextRelatedVehicleId,
          customerId: affectedRentalReservation?.customerId ?? current.customerId,
          startDate: current.scheduledDate,
          endDate: current.scheduledDate,
          startTime: nextRelatedVehicleId != null ? '00:00' : null,
          endTime: nextRelatedVehicleId != null ? '23:59' : null,
          // 'booked' (not 'pending') — pickupReservation()/PickupDialog, the real
          // pickup flow this spare goes through for its actual handover, only
          // accepts reservations in 'booked' status.
          status: 'booked',
          // 'replacement' (not 'standard') is what makes the Rental Calendar and
          // "Beheer vervangende voertuigen" recognize it as a spare at all;
          // checkReservationConflicts treats 'replacement' the same as 'standard'
          // (only 'maintenance_block' is excluded), so this doesn't change
          // double-booking protection.
          type: 'replacement',
          replacementForReservationId: affectedRentalReservation?.id ?? null,
          replacementForTransportId: id,
          placeholderSpare: nextRelatedVehicleId == null,
          totalPrice: undefined,
          notes: replacingLabel
            ? `Replacement vehicle for ${replacingLabel}`
            : `Replacement vehicle for transport #${id}`,
          damageCheckPath: null,
        };
        const [spareReservation] = await tx.insert(reservations).values(spareReservationData as unknown as typeof reservations.$inferInsert).returning();
        spareReservationId = spareReservation.id;
      }

      // FIX-W (BUG-114) — moving the transport moves its replacement booking.
      // Without this branch the spare stayed reserved on the *old* day (blocked
      // for nothing) while being free on the day it was actually needed, so a
      // second transport could claim the same car for the same day.
      if (scheduledDateChanged && spareReservationId) {
        const [spareRow] = await tx.select().from(reservations).where(eq(reservations.id, spareReservationId));
        if (spareRow && normalizeReservationStatus(spareRow.status) === 'booked') {
          if (spareRow.vehicleId != null) {
            await tx.execute(vehicleLockSql(spareRow.vehicleId));
            const verdict = await this.isVehicleBookable({
              vehicleId: spareRow.vehicleId,
              startDate: nextScheduledDate,
              endDate: nextScheduledDate,
              startTime: '00:00',
              endTime: '23:59',
              excludeReservationId: spareReservationId,
            }, tx);
            if (!verdict.bookable) {
              throw new BookingConflictError(verdict, 'Replacement vehicle has conflicting reservations for this date');
            }
          }
          await tx.update(reservations)
            .set({ startDate: nextScheduledDate, endDate: nextScheduledDate, updatedAt: new Date() })
            .where(eq(reservations.id, spareReservationId));
        } else if (spareRow) {
          // Already handed over: moving the paperwork under the driver is not a
          // date edit, it is a new decision. Same refusal as reassignment.
          throw new HttpError(
            409,
            'Cannot move this transport — its replacement vehicle has already been picked up. Return it first, or leave the date as-is.',
            { code: 'SPARE_ALREADY_PICKED_UP' },
          );
        }
      }

      // FIX-W (BUG-115) — cancelling frees the replacement. `DELETE
      // /api/transports/:id` has always done this; `PATCH {status:'cancelled'}`
      // did not, so every cancelled transport kept a spare car blocked for that
      // day and the calendar kept showing a replacement for a trip that never
      // happened. A spare that is already picked up is a real handover and is
      // left alone.
      if (cancellingNow && spareReservationId) {
        const [spareRow] = await tx.select().from(reservations).where(eq(reservations.id, spareReservationId));
        if (spareRow && normalizeReservationStatus(spareRow.status) === 'booked') {
          await tx.update(reservations)
            .set({ status: 'cancelled', placeholderSpare: false, updatedAt: new Date() })
            .where(eq(reservations.id, spareReservationId));
          if (spareRow.vehicleId != null) freedSpareVehicleIds.push(spareRow.vehicleId);
          spareReservationId = null;
        }
      }

      // FIX-W (BUG-135) — the transport changed car. The workshop flag, and the
      // "replacing <plate>" note on the spare, described the *old* one: the wrong
      // car stayed marked `needs_service` with a note naming this transport, the
      // new one was never flagged, and the transport letter named a vehicle that
      // is no longer part of it.
      if (vehicleChanged) {
        if (current.vehicleId != null && !current.isExternalVehicle && current.isBreakdownOrMaintenance) {
          await this.markVehicleForService(current.vehicleId, 'ok', undefined, tx);
          restoreMaintenanceAfterCommit = true;
        }
        if (nextVehicleId != null && !(changes.isExternalVehicle ?? current.isExternalVehicle) && nextIsBreakdown) {
          await this.markVehicleForService(
            nextVehicleId,
            'needs_service',
            `Replacement vehicle required for transport #${id}`,
            tx,
          );
          markServiceAfterCommit = true;
        }
        if (spareReservationId) {
          const [newOriginal] = nextVehicleId != null
            ? await tx.select().from(vehicles).where(eq(vehicles.id, nextVehicleId))
            : [undefined];
          const [affectedRental] = nextVehicleId != null
            ? await tx.select().from(reservations).where(and(
                eq(reservations.vehicleId, nextVehicleId),
                eq(reservations.status, 'picked_up'),
                isNull(reservations.deletedAt),
              ))
            : [undefined];
          await tx.update(reservations)
            .set({
              replacementForReservationId: affectedRental?.id ?? null,
              customerId: affectedRental?.customerId ?? current.customerId ?? null,
              notes: newOriginal
                ? `Replacement vehicle for ${newOriginal.brand} ${newOriginal.model} (${newOriginal.licensePlate})`
                : `Replacement vehicle for transport #${id}`,
              updatedAt: new Date(),
            })
            .where(eq(reservations.id, spareReservationId));
        }
      }

      // isBreakdownOrMaintenance is what actually means "the original vehicle needs
      // service" — independent of whether a replacement has been assigned yet or is
      // still TBD, and independent of relatedVehicleId changing in this same call.
      // Toggling the flag on is what puts the original vehicle into service;
      // toggling it off, or closing the transport while it was on, restores it.
      const breakdownFlagTurnedOn = !current.isBreakdownOrMaintenance && nextIsBreakdown;
      const breakdownFlagTurnedOff = current.isBreakdownOrMaintenance && !nextIsBreakdown;

      // An external/outside vehicle never enters the fleet, so there's no vehicle
      // record here to put into maintenance status — everything else about the
      // spare workflow above still applies to it unchanged.
      const canMarkOriginalForService = !current.isExternalVehicle && current.vehicleId != null;

      if (breakdownFlagTurnedOn && canMarkOriginalForService) {
        markServiceAfterCommit = true;
        await this.markVehicleForService(
          current.vehicleId!,
          'needs_service',
          `Replacement vehicle required for transport #${id}`,
          tx
        );
      } else if ((breakdownFlagTurnedOff || (closingNow && nextIsBreakdown)) && canMarkOriginalForService) {
        restoreMaintenanceAfterCommit = true;
        await this.markVehicleForService(current.vehicleId!, 'ok', undefined, tx);
      }

      // Same numeric-column-vs-zod-number typing gap that the pre-existing
      // updateTransport() above already has (distanceKm/tollCost/billableAmount are
      // `number` in the zod schema but `string` in the drizzle column type) — cast
      // rather than fight a codebase-wide drizzle-zod mismatch outside this feature's
      // scope.
      // BUG-136 — the dashboard sends `completedDate`; every API caller forgot
      // to, and the row was recorded as completed with no date at all. The
      // server fills it in on the transition, and clears it when the transport
      // leaves `completed`.
      const completedDatePatch: Record<string, unknown> = {};
      if (changes.status !== undefined && changes.status !== current.status) {
        if (changes.status === 'completed' && changes.completedDate == null && current.completedDate == null) {
          completedDatePatch.completedDate = isoToday();
        } else if (current.status === 'completed' && changes.status !== 'completed') {
          completedDatePatch.completedDate = null;
        }
      }

      const [row] = await tx.update(vehicleTransports)
        .set({
          ...changes,
          ...completedDatePatch,
          relatedVehicleId: nextRelatedVehicleId,
          spareRequired: nextSpareRequired,
          isBreakdownOrMaintenance: nextIsBreakdown,
          spareReservationId,
          updatedAt: new Date(),
        } as any)
        .where(eq(vehicleTransports.id, id))
        .returning();

      return row;
    });

    for (const vehicleId of Array.from(new Set(freedSpareVehicleIds))) {
      await this.recomputeVehicleAvailability(vehicleId);
    }
    if (markServiceAfterCommit || restoreMaintenanceAfterCommit) {
      await this.syncVehicleAvailabilityWithReservations();
    }

    const [withRelations] = await this.attachTransportRelations([updatedRow]);
    return withRelations;
  }

  // Document methods
  async getAllDocuments(): Promise<Document[]> {
    // General reports (vehicleId null) always included; vehicle-tied documents
    // only if their vehicle still exists (filters out orphaned FK references).
    const result = await db
      .select({ document: documents })
      .from(documents)
      .leftJoin(vehicles, eq(documents.vehicleId, vehicles.id))
      .where(or(isNull(documents.vehicleId), isNotNull(vehicles.id)));

    return result.map(row => row.document);
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document || undefined;
  }

  async createDocument(documentData: InsertDocument): Promise<Document> {
    const [document] = await db.insert(documents).values(documentData).returning();
    // besluiten B-06 (BUG-134), event 4 — "nieuw document beschikbaar". Wired
    // here rather than at the eight routes that generate or upload a document,
    // because a ninth generator would otherwise be silent again — which is how
    // the first three events of B-06 came to be missing.
    //
    // Imported lazily: this module is what `server/storage.ts` instantiates, and
    // the notification service reaches back to that same `storage` singleton. A
    // static import would be a load-time cycle; a call-time one is not.
    void import("./services/portal-reservation-events")
      .then((m) => m.onDocumentAvailable(document))
      .catch((e) => console.error("document notification failed:", e));
    return document;
  }

  async updateDocument(id: number, documentData: Partial<InsertDocument>): Promise<Document | undefined> {
    const [updatedDocument] = await db
      .update(documents)
      .set(documentData)
      .where(eq(documents.id, id))
      .returning();
    
    return updatedDocument || undefined;
  }

  async getDocumentsByVehicle(vehicleId: number): Promise<Document[]> {
    return await db
      .select()
      .from(documents)
      .where(eq(documents.vehicleId, vehicleId));
  }

  async getDocumentsByReservation(reservationId: number): Promise<Document[]> {
    return await db
      .select()
      .from(documents)
      .where(eq(documents.reservationId, reservationId));
  }

  async deleteDocument(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(documents)
      .where(eq(documents.id, id))
      .returning();
    
    return !!deleted;
  }
  
  // PDF Template methods
  async getAllPdfTemplates(): Promise<PdfTemplate[]> {
    // Use raw SQL to ensure we get ALL columns including background_preview_path
    const result = await db.execute(
      sql`SELECT id, name, is_default, background_path, background_preview_path, created_at, updated_at, fields FROM pdf_templates`
    );
    
    // Map the raw result rows to PdfTemplate type with proper camelCase field names
    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      isDefault: row.is_default,
      backgroundPath: row.background_path,
      backgroundPreviewPath: row.background_preview_path,
      templatePreviewPath: row.template_preview_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      fields: typeof row.fields === 'string' ? JSON.parse(row.fields) : row.fields
    }));
  }
  
  async getPdfTemplate(id: number): Promise<PdfTemplate | undefined> {
    const [template] = await db.select().from(pdfTemplates).where(eq(pdfTemplates.id, id));
    return template || undefined;
  }
  
  async getDefaultPdfTemplate(): Promise<PdfTemplate | undefined> {
    try {
      // NOTE: an earlier raw `SELECT ... WHERE is_default = true` branch here
      // never ran (it read `.length` on a pg QueryResult), so callers have
      // always received the camelCase drizzle row selected below. Keep that.
      const allTemplates = await db.select().from(pdfTemplates);

      // B-34/BUG-181a: this used to fall back to `allTemplates[0]` — whatever
      // Postgres happened to return first, with no ORDER BY — whenever
      // nothing was actually flagged default. That silent "insertion order"
      // guess is exactly the bug `selectContractTemplate()` (FIX-N/FIX-P) was
      // meant to remove; it kept living here underneath it, so the picker's
      // own "no default" branch never ran. `undefined` now means what it
      // says: nothing is marked default. The picker decides what to do about
      // that (one template: use it; several: refuse).
      const defaultTemplate = allTemplates.find(t => t.isDefault === true);
      if (defaultTemplate) {
        console.log(`Using default template: ${defaultTemplate.name} with ID: ${defaultTemplate.id}`);

        // Process fields if it is a string
        if (defaultTemplate.fields && typeof defaultTemplate.fields === "string") {
          try {
            const parsedFields = JSON.parse(defaultTemplate.fields);
            console.log(`Successfully parsed ${parsedFields.length} fields`);
            defaultTemplate.fields = parsedFields;
          } catch (error) {
            console.error("Error parsing template fields:", error);
          }
        }

        return defaultTemplate;
      }

      console.log("No template is marked as default");
      return undefined;
    } catch (error) {
      console.error("Error getting default template:", error);
      return undefined;
    }
  }
  
  async createPdfTemplate(templateData: InsertPdfTemplate): Promise<PdfTemplate> {
    try {
      console.log('Creating PDF template with data:', templateData);
      
      // If setting as default, update all other templates to not be default
      if (templateData.isDefault) {
        await db.execute(sql`UPDATE pdf_templates SET is_default = false`);
      }
      
      // Ensure fields is always an array (start with empty array for new templates)
      let fieldsToStore = templateData.fields || [];
      if (typeof fieldsToStore === 'string') {
        try {
          fieldsToStore = JSON.parse(fieldsToStore);
        } catch {
          fieldsToStore = [];
        }
      }
      
      // Convert fields to JSON string for storage
      const fieldsJson = JSON.stringify(fieldsToStore);
      const isDefault = templateData.isDefault || false;
      const templateName = templateData.name || 'Untitled Template';
      
      console.log('Inserting template:', {
        name: templateName,
        fields: fieldsJson,
        is_default: isDefault
      });
      
      // Use parameterized query for safety
      const result = await db.execute(sql`
        INSERT INTO pdf_templates (name, fields, is_default) 
        VALUES (${templateName}, ${fieldsJson}, ${isDefault})
        RETURNING *
      `);
      
      console.log('Insert result:', result);
      
      if (result.rows.length > 0) {
        const template = result.rows[0] as PdfTemplate;
        console.log('Template created successfully:', template);
        return template;
      }
      
      throw new Error('Failed to create PDF template - no rows returned');
    } catch (error) {
      console.error('Error creating PDF template:', error);
      console.error('Template data:', templateData);
      throw new Error(`Failed to create PDF template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  async updatePdfTemplate(id: number, templateData: Partial<InsertPdfTemplate>, expectedUpdatedAt?: Date | null): Promise<PdfTemplate | undefined> {
    try {
      console.log('💾 Storage layer received:', {
        id,
        hasBackgroundPath: 'backgroundPath' in templateData,
        backgroundPathValue: templateData.backgroundPath,
        keys: Object.keys(templateData)
      });
      
      // If setting as default, update all other templates to not be default
      if (templateData.isDefault) {
        await db.execute(sql`UPDATE pdf_templates SET is_default = false`);
      }
      
      // Process fields to ensure it's a string for storage
      let processedFields = templateData.fields;
      if (templateData.fields !== undefined && typeof templateData.fields === 'object') {
        processedFields = JSON.stringify(templateData.fields);
      }
      
      // Build update object, handling column name mapping
      const updateData: any = {};
      
      if (templateData.name !== undefined) {
        updateData.name = templateData.name;
      }
      
      if (processedFields !== undefined) {
        updateData.fields = processedFields;
      }
      
      if (templateData.isDefault !== undefined) {
        updateData.is_default = templateData.isDefault;
      }
      
      if (templateData.backgroundPath !== undefined) {
        console.log('✅ Converting backgroundPath to background_path:', templateData.backgroundPath);
        updateData.background_path = templateData.backgroundPath;
      } else {
        console.log('⚠️ backgroundPath is undefined - will not be updated');
      }
      
      if ('backgroundPreviewPath' in templateData) {
        console.log('✅ Converting backgroundPreviewPath to background_preview_path:', (templateData as any).backgroundPreviewPath);
        updateData.background_preview_path = (templateData as any).backgroundPreviewPath;
      }
      
      // Always update timestamp
      updateData.updated_at = new Date();
      
      console.log('Updating template with processed data:', {
        id,
        name: templateData.name,
        isDefault: templateData.isDefault,
        fields: typeof processedFields === 'string' ? 'JSON string' : processedFields,
        updatedBy: (templateData as any).updatedBy
      });
      
      // Build dynamic SQL using Drizzle's sql template
      const setClauses: SQL[] = [];
      
      if (updateData.name !== undefined) {
        setClauses.push(sql`name = ${updateData.name}`);
      }
      
      if (updateData.fields !== undefined) {
        setClauses.push(sql`fields = ${updateData.fields}`);
      }
      
      if (updateData.is_default !== undefined) {
        setClauses.push(sql`is_default = ${updateData.is_default}`);
      }
      
      if (updateData.background_path !== undefined) {
        setClauses.push(sql`background_path = ${updateData.background_path}`);
      }
      
      if (updateData.background_preview_path !== undefined) {
        setClauses.push(sql`background_preview_path = ${updateData.background_preview_path}`);
      }
      
      // Always update timestamp
      setClauses.push(sql`updated_at = ${updateData.updated_at}`);
      
      if (setClauses.length === 0) {
        console.log('No fields to update');
        return undefined;
      }
      
      console.log('Updating template with ID:', id);
      console.log('Update data:', updateData);
      
      // Use proper Drizzle SQL template syntax.
      // FIX-G (BUG-175): with an `expectedUpdatedAt` the row is locked and
      // compared first, so two people saving one template no longer silently
      // overwrite each other's fields — the second is told to reload.
      const result = await db.transaction(async (tx) => {
        if (expectedUpdatedAt) {
          const locked = await tx.execute(sql`SELECT updated_at FROM pdf_templates WHERE id = ${id} FOR UPDATE`);
          const current = (locked.rows[0] as any)?.updated_at;
          if (current && new Date(current).getTime() !== expectedUpdatedAt.getTime()) {
            throw new HttpError(409, "Someone else saved this template while you were editing. Reload and try again.", { code: "STALE_WRITE" });
          }
        }
        return await tx.execute(sql`
        UPDATE pdf_templates
        SET ${sql.join(setClauses, sql`, `)}
        WHERE id = ${id}
        RETURNING *
      `);
      });

      if (result.rows.length > 0) {
        const row: any = result.rows[0];
        console.log('Template updated successfully:', row);
        
        // Map snake_case column names to camelCase for consistency
        const template: PdfTemplate = {
          id: row.id,
          name: row.name,
          isDefault: row.is_default,
          backgroundPath: row.background_path,
          backgroundPreviewPath: row.background_preview_path,
          templatePreviewPath: row.template_preview_path,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          fields: typeof row.fields === 'string' ? JSON.parse(row.fields) : row.fields
        };
        
        return template;
      }
      
      console.log('Template not found for update');
      return undefined;
    } catch (error) {
      // A refused stale write is an answer, not a failure to be swallowed.
      if (error instanceof HttpError) throw error;
      console.error('Error updating PDF template:', error);
      return undefined;
    }
  }
  
  async deletePdfTemplate(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(pdfTemplates)
      .where(eq(pdfTemplates.id, id))
      .returning();
    
    return !!deleted;
  }
  
  // Template Background Library methods
  async getAllTemplateBackgrounds(): Promise<TemplateBackground[]> {
    return await db
      .select()
      .from(templateBackgrounds)
      .orderBy(desc(templateBackgrounds.createdAt));
  }
  
  async getTemplateBackgrounds(templateId: number): Promise<TemplateBackground[]> {
    return await db
      .select()
      .from(templateBackgrounds)
      .where(eq(templateBackgrounds.templateId, templateId))
      .orderBy(desc(templateBackgrounds.createdAt));
  }
  
  async getTemplateBackground(id: number): Promise<TemplateBackground | undefined> {
    const [background] = await db
      .select()
      .from(templateBackgrounds)
      .where(eq(templateBackgrounds.id, id));
    
    return background || undefined;
  }
  
  async createTemplateBackground(backgroundData: InsertTemplateBackground): Promise<TemplateBackground> {
    const [background] = await db
      .insert(templateBackgrounds)
      .values(backgroundData)
      .returning();
    
    return background;
  }
  
  async deleteTemplateBackground(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(templateBackgrounds)
      .where(eq(templateBackgrounds.id, id))
      .returning();
    
    return !!deleted;
  }
  
  async selectTemplateBackground(templateId: number, backgroundId: number): Promise<PdfTemplate | undefined> {
    // Get the background to retrieve its paths
    const background = await this.getTemplateBackground(backgroundId);
    if (!background) {
      return undefined;
    }
    
    // Update the template to use this background
    return await this.updatePdfTemplate(templateId, {
      backgroundPath: background.backgroundPath,
      backgroundPreviewPath: background.previewPath,
    });
  }

  // Transport Report Template methods — same shape as the pdf_templates
  // methods above, but a plain Drizzle query builder implementation since
  // this table has no legacy column-naming history to work around.
  async getAllTransportReportTemplates(): Promise<TransportReportTemplate[]> {
    return await db.select().from(transportReportTemplates).orderBy(desc(transportReportTemplates.createdAt));
  }

  async getTransportReportTemplate(id: number): Promise<TransportReportTemplate | undefined> {
    const [template] = await db.select().from(transportReportTemplates).where(eq(transportReportTemplates.id, id));
    return template || undefined;
  }

  async getDefaultTransportReportTemplate(): Promise<TransportReportTemplate | undefined> {
    const [defaultTemplate] = await db.select().from(transportReportTemplates).where(eq(transportReportTemplates.isDefault, true)).limit(1);
    if (defaultTemplate) return defaultTemplate;
    const [first] = await db.select().from(transportReportTemplates).orderBy(transportReportTemplates.id).limit(1);
    return first || undefined;
  }

  async createTransportReportTemplate(templateData: InsertTransportReportTemplate): Promise<TransportReportTemplate> {
    if (templateData.isDefault) {
      await db.update(transportReportTemplates).set({ isDefault: false });
    }
    const [template] = await db.insert(transportReportTemplates).values(templateData).returning();
    return template;
  }

  async updateTransportReportTemplate(id: number, templateData: Partial<InsertTransportReportTemplate>): Promise<TransportReportTemplate | undefined> {
    if (templateData.isDefault) {
      await db.update(transportReportTemplates).set({ isDefault: false });
    }
    const [template] = await db
      .update(transportReportTemplates)
      .set({ ...templateData, updatedAt: new Date() })
      .where(eq(transportReportTemplates.id, id))
      .returning();
    return template || undefined;
  }

  async deleteTransportReportTemplate(id: number): Promise<boolean> {
    const [deleted] = await db.delete(transportReportTemplates).where(eq(transportReportTemplates.id, id)).returning();
    return !!deleted;
  }

  async getAllTransportReportTemplateBackgrounds(): Promise<TransportReportTemplateBackground[]> {
    return await db.select().from(transportReportTemplateBackgrounds).orderBy(desc(transportReportTemplateBackgrounds.createdAt));
  }

  async getTransportReportTemplateBackgrounds(templateId: number): Promise<TransportReportTemplateBackground[]> {
    return await db
      .select()
      .from(transportReportTemplateBackgrounds)
      .where(eq(transportReportTemplateBackgrounds.templateId, templateId))
      .orderBy(desc(transportReportTemplateBackgrounds.createdAt));
  }

  async getTransportReportTemplateBackground(id: number): Promise<TransportReportTemplateBackground | undefined> {
    const [background] = await db.select().from(transportReportTemplateBackgrounds).where(eq(transportReportTemplateBackgrounds.id, id));
    return background || undefined;
  }

  async createTransportReportTemplateBackground(backgroundData: InsertTransportReportTemplateBackground): Promise<TransportReportTemplateBackground> {
    const [background] = await db.insert(transportReportTemplateBackgrounds).values(backgroundData).returning();
    return background;
  }

  async deleteTransportReportTemplateBackground(id: number): Promise<boolean> {
    const [deleted] = await db.delete(transportReportTemplateBackgrounds).where(eq(transportReportTemplateBackgrounds.id, id)).returning();
    return !!deleted;
  }

  async selectTransportReportTemplateBackground(templateId: number, backgroundId: number): Promise<TransportReportTemplate | undefined> {
    const background = await this.getTransportReportTemplateBackground(backgroundId);
    if (!background) return undefined;
    return await this.updateTransportReportTemplate(templateId, {
      backgroundPath: background.backgroundPath,
      backgroundPreviewPath: background.previewPath,
    });
  }

  // Barcode Label Template methods — mirror of the transport report template
  // methods above (same isDefault-is-exclusive behavior), for the key-label
  // sticker templates. No backgrounds: labels print on blank sticker stock.
  async getBarcodeLabelTemplates(): Promise<BarcodeLabelTemplate[]> {
    return await db.select().from(barcodeLabelTemplates).orderBy(desc(barcodeLabelTemplates.createdAt));
  }

  async getBarcodeLabelTemplate(id: number): Promise<BarcodeLabelTemplate | undefined> {
    const [template] = await db.select().from(barcodeLabelTemplates).where(eq(barcodeLabelTemplates.id, id));
    return template || undefined;
  }

  async getDefaultBarcodeLabelTemplate(): Promise<BarcodeLabelTemplate | undefined> {
    const [defaultTemplate] = await db.select().from(barcodeLabelTemplates).where(eq(barcodeLabelTemplates.isDefault, true)).limit(1);
    if (defaultTemplate) return defaultTemplate;
    const [first] = await db.select().from(barcodeLabelTemplates).orderBy(barcodeLabelTemplates.id).limit(1);
    return first || undefined;
  }

  // A template plays one role or none: main key (isDefault), spare key (isDefaultSpare) or
  // car sticker (isDefaultCar). Each role lives on at most one template, and taking a role
  // drops the other two on that template.
  private async takeBarcodeLabelRole<T extends Partial<InsertBarcodeLabelTemplate>>(templateData: T): Promise<T> {
    const roles = ["isDefault", "isDefaultSpare", "isDefaultCar"] as const;
    const taken = roles.find(role => templateData[role] === true);
    if (!taken) return templateData;
    await db.update(barcodeLabelTemplates).set({ [taken]: false });
    const cleared = Object.fromEntries(roles.filter(role => role !== taken).map(role => [role, false]));
    return { ...templateData, ...cleared };
  }

  async createBarcodeLabelTemplate(templateData: InsertBarcodeLabelTemplate): Promise<BarcodeLabelTemplate> {
    const data = await this.takeBarcodeLabelRole(templateData);
    const [template] = await db.insert(barcodeLabelTemplates).values(data).returning();
    return template;
  }

  async updateBarcodeLabelTemplate(id: number, templateData: Partial<InsertBarcodeLabelTemplate>): Promise<BarcodeLabelTemplate | undefined> {
    const data = await this.takeBarcodeLabelRole(templateData);
    const [template] = await db
      .update(barcodeLabelTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(barcodeLabelTemplates.id, id))
      .returning();
    return template || undefined;
  }

  async deleteBarcodeLabelTemplate(id: number): Promise<boolean> {
    const [deleted] = await db.delete(barcodeLabelTemplates).where(eq(barcodeLabelTemplates.id, id)).returning();
    return !!deleted;
  }

  // Scan event history — best-effort logging from the barcode lookup route;
  // a failure here must never break the scan itself, so errors are swallowed.
  async logScanEvent(event: InsertScanEvent): Promise<void> {
    try {
      await db.insert(scanEvents).values(event);
    } catch (error) {
      console.warn("Failed to log scan event:", error);
    }
  }

  async getRecentScanEvents(limit: number = 20): Promise<ScanEvent[]> {
    return await db.select().from(scanEvents).orderBy(desc(scanEvents.createdAt)).limit(limit);
  }

  async getAllDamageCheckTemplateBackgrounds(): Promise<DamageCheckTemplateBackground[]> {
    return await db.select().from(damageCheckTemplateBackgrounds).orderBy(desc(damageCheckTemplateBackgrounds.createdAt));
  }

  async getDamageCheckTemplateBackgrounds(templateId: number): Promise<DamageCheckTemplateBackground[]> {
    return await db
      .select()
      .from(damageCheckTemplateBackgrounds)
      .where(eq(damageCheckTemplateBackgrounds.templateId, templateId))
      .orderBy(desc(damageCheckTemplateBackgrounds.createdAt));
  }

  async getDamageCheckTemplateBackground(id: number): Promise<DamageCheckTemplateBackground | undefined> {
    const [background] = await db.select().from(damageCheckTemplateBackgrounds).where(eq(damageCheckTemplateBackgrounds.id, id));
    return background || undefined;
  }

  async createDamageCheckTemplateBackground(backgroundData: InsertDamageCheckTemplateBackground): Promise<DamageCheckTemplateBackground> {
    const [background] = await db.insert(damageCheckTemplateBackgrounds).values(backgroundData).returning();
    return background;
  }

  async deleteDamageCheckTemplateBackground(id: number): Promise<boolean> {
    const [deleted] = await db.delete(damageCheckTemplateBackgrounds).where(eq(damageCheckTemplateBackgrounds.id, id)).returning();
    return !!deleted;
  }

  async selectDamageCheckTemplateBackground(templateId: number, backgroundId: number): Promise<DamageCheckTemplate | undefined> {
    const background = await this.getDamageCheckTemplateBackground(backgroundId);
    if (!background) return undefined;
    return await this.updateDamageCheckTemplate(templateId, {
      backgroundPath: background.backgroundPath,
      backgroundPreviewPath: background.previewPath,
    });
  }

  // Custom Notifications methods
  async getAllCustomNotifications(): Promise<CustomNotification[]> {
    return await db
      .select()
      .from(customNotifications)
      .orderBy(desc(customNotifications.createdAt));
  }
  
  async getCustomNotification(id: number): Promise<CustomNotification | undefined> {
    const [notification] = await db
      .select()
      .from(customNotifications)
      .where(eq(customNotifications.id, id));
    
    return notification || undefined;
  }
  
  async getUnreadCustomNotifications(): Promise<CustomNotification[]> {
    return await db
      .select()
      .from(customNotifications)
      .where(eq(customNotifications.isRead, false))
      .orderBy(desc(customNotifications.createdAt));
  }
  
  async getCustomNotificationsByType(type: string): Promise<CustomNotification[]> {
    return await db
      .select()
      .from(customNotifications)
      .where(eq(customNotifications.type, type))
      .orderBy(desc(customNotifications.createdAt));
  }
  
  async getCustomNotificationsByUser(userId: number): Promise<CustomNotification[]> {
    return await db
      .select()
      .from(customNotifications)
      .where(eq(customNotifications.userId, userId))
      .orderBy(desc(customNotifications.createdAt));
  }
  
  async createCustomNotification(notificationData: InsertCustomNotification): Promise<CustomNotification> {
    const [notification] = await db
      .insert(customNotifications)
      .values(notificationData)
      .returning();
    
    return notification;
  }
  
  async updateCustomNotification(id: number, notificationData: Partial<InsertCustomNotification>): Promise<CustomNotification | undefined> {
    const [updatedNotification] = await db
      .update(customNotifications)
      .set(notificationData)
      .where(eq(customNotifications.id, id))
      .returning();
    
    return updatedNotification || undefined;
  }
  
  async markCustomNotificationAsRead(id: number): Promise<boolean> {
    const result = await db
      .update(customNotifications)
      .set({ isRead: true })
      .where(eq(customNotifications.id, id));
    
    return result.rowCount ? result.rowCount > 0 : false;
  }
  
  async markCustomNotificationAsUnread(id: number): Promise<boolean> {
    const result = await db
      .update(customNotifications)
      .set({ isRead: false })
      .where(eq(customNotifications.id, id));
    
    return result.rowCount ? result.rowCount > 0 : false;
  }
  
  async deleteCustomNotification(id: number): Promise<boolean> {
    const result = await db
      .delete(customNotifications)
      .where(eq(customNotifications.id, id));
    
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async deleteNotificationsByTypeAndPattern(type: string, pattern: string): Promise<number> {
    // Find and delete notifications matching the type and pattern
    const matchingNotifications = await db
      .select()
      .from(customNotifications)
      .where(
        and(
          eq(customNotifications.type, type),
          sql`${customNotifications.description} LIKE ${'%' + pattern + '%'}`
        )
      );
    
    if (matchingNotifications.length === 0) {
      return 0;
    }

    const idsToDelete = matchingNotifications.map(n => n.id);
    const result = await db
      .delete(customNotifications)
      .where(sql`${customNotifications.id} IN (${sql.join(idsToDelete.map(id => sql`${id}`), sql`, `)})`);
    
    return result.rowCount || 0;
  }
  
  // Backup Settings methods
  async getBackupSettings(): Promise<BackupSettings | undefined> {
    const [settings] = await db.select().from(backupSettings);
    return settings || undefined;
  }
  
  async createBackupSettings(settings: InsertBackupSettings): Promise<BackupSettings> {
    const [newSettings] = await db.insert(backupSettings).values(settings).returning();
    return newSettings;
  }
  
  async updateBackupSettings(id: number, settingsData: Partial<InsertBackupSettings>): Promise<BackupSettings | undefined> {
    const [updatedSettings] = await db
      .update(backupSettings)
      .set(settingsData)
      .where(eq(backupSettings.id, id))
      .returning();
    
    return updatedSettings || undefined;
  }

  // Placeholder spare vehicle methods (Missing implementations)
  async getPlaceholderReservations(startDate?: string, endDate?: string): Promise<Reservation[]> {
    const conditions = [
      eq(reservations.placeholderSpare, true),
      eq(reservations.type, 'replacement'),
      sql`${reservations.vehicleId} IS NULL`,
      isNull(reservations.deletedAt)
    ];

    if (startDate) {
      conditions.push(gte(reservations.startDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(reservations.startDate, endDate));
    }

    return await db
      .select()
      .from(reservations)
      .where(and(...conditions));
  }

  /**
   * A-2-6 — what the dashboard's spare-vehicle widget needs, and nothing more:
   * the replacement reservations that still have a spare out or coming (a
   * vehicle assigned, not cancelled, not yet returned) plus the rentals they
   * stand in for. The widget used to download every reservation to find these.
   * Rows carry the same embedded `vehicle` / `customer` as getAllReservations.
   */
  async getSpareOverviewReservations(): Promise<Reservation[]> {
    const spares = await db.select().from(reservations).where(and(
      eq(reservations.type, 'replacement'),
      isNotNull(reservations.vehicleId),
      ne(reservations.status, 'cancelled'),
      isNull(reservations.deletedAt),
      sql`(${reservations.spareVehicleStatus} IS NULL OR ${reservations.spareVehicleStatus} <> 'returned')`,
    ));

    const parentIds = Array.from(new Set(
      spares.map(s => s.replacementForReservationId).filter((id): id is number => id != null),
    ));
    const parents = parentIds.length
      ? await db.select().from(reservations).where(and(inArray(reservations.id, parentIds), isNull(reservations.deletedAt)))
      : [];

    const rows = [...spares];
    const seen = new Set(rows.map(r => r.id));
    for (const p of parents) if (!seen.has(p.id)) rows.push(p);

    const vehicleIds = Array.from(new Set(rows.map(r => r.vehicleId).filter((id): id is number => id != null)));
    const customerIds = Array.from(new Set(rows.map(r => r.customerId).filter((id): id is number => id != null)));
    const [vehicleRows, customerRows] = await Promise.all([
      vehicleIds.length ? db.select().from(vehicles).where(inArray(vehicles.id, vehicleIds)) : Promise.resolve([]),
      customerIds.length ? db.select().from(customers).where(inArray(customers.id, customerIds)) : Promise.resolve([]),
    ]);
    const vehicleById = new Map(vehicleRows.map(v => [v.id, v]));
    const customerById = new Map(customerRows.map(c => [c.id, c]));

    return rows.map(r => ({
      ...r,
      vehicle: r.vehicleId != null ? vehicleById.get(r.vehicleId) : undefined,
      customer: r.customerId != null ? customerById.get(r.customerId) : undefined,
    }));
  }

  async getPlaceholderReservationsNeedingAssignment(daysAhead: number = 7): Promise<Reservation[]> {
    const cutoffDate = addDays(new Date(), daysAhead);
    const cutoffDateString = cutoffDate.toISOString().split('T')[0];
    
    const results = await db
      .select({
        id: reservations.id,
        vehicleId: reservations.vehicleId,
        customerId: reservations.customerId,
        startDate: reservations.startDate,
        endDate: reservations.endDate,
        status: reservations.status,
        type: reservations.type,
        placeholderSpare: reservations.placeholderSpare,
        replacementForReservationId: reservations.replacementForReservationId,
        replacementForTransportId: reservations.replacementForTransportId,
        customer: customers,
      })
      .from(reservations)
      .leftJoin(customers, eq(reservations.customerId, customers.id))
      .where(
        and(
          eq(reservations.placeholderSpare, true),
          eq(reservations.type, 'replacement'),
          sql`${reservations.vehicleId} IS NULL`,
          lte(reservations.startDate, cutoffDateString),
          isNull(reservations.deletedAt),
          // BUG-137: the widget showed cancelled placeholders (and offered
          // them for assignment), and kept asking for a spare for a transport
          // that had already been completed or cancelled.
          eq(reservations.status, 'booked'),
          sql`(
            ${reservations.replacementForTransportId} IS NULL
            OR EXISTS (
              SELECT 1 FROM vehicle_transports t
              WHERE t.id = ${reservations.replacementForTransportId}
                AND t.status NOT IN ('completed','cancelled')
                AND t.spare_required = true
            )
          )`
        )
      );
    
    return results as any;
  }

  /**
   * FIX-V (BUG-035) — `customerId` is **derived** from the original rental, not
   * taken from the body. A placeholder stands in for the real renter; letting
   * the caller name a different customer produced a spare booked to someone
   * who had nothing to do with the rental it replaced.
   */
  async createPlaceholderReservation(originalReservationId: number, customerId: number, startDate: string, endDate?: string, options: { maintenanceBlockId?: number | null } = {}): Promise<Reservation> {
    // Verify the original reservation exists
    const [originalReservation] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.id, originalReservationId));
    
    if (!originalReservation) {
      throw new Error('Original reservation not found');
    }

    // Check for duplicate placeholder (only active, non-deleted ones)
    const [duplicate] = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.replacementForReservationId, originalReservationId),
          eq(reservations.placeholderSpare, true),
          isNull(reservations.deletedAt) // Only check non-deleted placeholders
        )
      );

    if (duplicate) {
      throw new Error('A placeholder spare reservation already exists for this original reservation');
    }

    const placeholderData: InsertReservation = {
      vehicleId: null,
      // BUG-035: the rental decides who this spare belongs to.
      customerId: originalReservation.customerId ?? customerId,
      startDate,
      endDate: endDate || null,
      status: 'booked',
      type: 'replacement',
      replacementForReservationId: originalReservationId,
      placeholderSpare: true,
      maintenanceBlockId: options.maintenanceBlockId ?? null,
      notes: `TBD spare vehicle for reservation #${originalReservationId}`,
      totalPrice: undefined,
      damageCheckPath: null
    };

    const [placeholder] = await db
      .insert(reservations)
      .values(placeholderData as unknown as typeof reservations.$inferInsert)
      .returning();

    // Create notification for pending spare assignment with reservation ID reference
    await this.createCustomNotification({
      title: "Spare Vehicle Assignment Required",
      description: `TBD spare vehicle needs assignment for ${startDate}${endDate ? ` - ${endDate}` : ''} [placeholder:${placeholder.id}]`,
      date: startDate,
      type: "spare_assignment",
      isRead: false,
      link: "/dashboard",
      icon: "Car",
      priority: "high",
      userId: null // System-wide notification
    });

    await syncUsagePeriodSafely(placeholder.id);
    return placeholder;
  }

  async assignVehicleToPlaceholder(reservationId: number, vehicleId: number, endDate?: string): Promise<Reservation | undefined> {
    // Get the placeholder reservation (excluding soft-deleted)
    const [reservation] = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.id, reservationId),
          isNull(reservations.deletedAt)
        )
      );

    if (!reservation || !reservation.placeholderSpare || reservation.vehicleId != null || reservation.type !== 'replacement') {
      return undefined;
    }

    // BUG-137: a cancelled placeholder was still assignable — the result was a
    // `cancelled` row carrying a real vehicle, and a transport reading
    // `spare_required=false` next to a filled-in `related_vehicle_id`.
    if (normalizeReservationStatus(reservation.status) !== 'booked') {
      throw new HttpError(409, 'This spare request is no longer open.', { code: 'PLACEHOLDER_CLOSED' });
    }

    // A placeholder created from a Transport is still just a normal spare
    // reservation from here on — assignable from this widget exactly like any
    // other. The Transport that created it is kept in sync below (its own
    // relatedVehicleId mirrors whatever gets assigned here), same direction as
    // the sync that already runs the other way when assigning from the
    // Transport dialog.
    if (reservation.replacementForTransportId != null) {
      const [linkedTransport] = await db.select().from(vehicleTransports).where(eq(vehicleTransports.id, reservation.replacementForTransportId));
      if (linkedTransport && linkedTransport.vehicleId === vehicleId) {
        throw new Error('Replacement vehicle cannot be the same as the original vehicle');
      }
      // BUG-137: booking a real car for a transport that has already happened,
      // or whose spare was explicitly switched off, is not an assignment — it
      // is a vehicle taken out of the fleet for nothing.
      if (linkedTransport && (linkedTransport.status === 'completed' || linkedTransport.status === 'cancelled')) {
        throw new HttpError(409, 'This transport is already closed; its spare request no longer applies.', { code: 'TRANSPORT_CLOSED' });
      }
      if (linkedTransport && !linkedTransport.spareRequired) {
        throw new HttpError(409, 'This transport no longer needs a replacement vehicle.', { code: 'SPARE_NOT_REQUIRED' });
      }
    }

    // Verify the target vehicle exists
    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId));

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    // Check if vehicle is available (not in service)
    if (vehicle.maintenanceStatus === 'in_service') {
      throw new Error('Vehicle is currently in service and not available');
    }

    // For open-ended placeholders, require an explicit endDate for assignment
    const assignmentEndDate = endDate || reservation.endDate;
    if (!assignmentEndDate && !reservation.endDate) {
      throw new Error('End date must be specified when assigning vehicle to open-ended placeholder reservation');
    }

    // FIX-F / FIX-G (BUG-158, BUG-160) — the conflict check and the write are
    // one transaction behind the vehicle's advisory lock, and the UPDATE
    // carries its own precondition: the row must still be an unassigned
    // placeholder. Two callers assigning the same placeholder, or the same
    // vehicle to two placeholders, no longer both succeed — the loser gets a
    // 409 instead of silently overwriting the winner.
    const updatedReservation = await this.withBookingLocks([vehicleId], async (tx) => {
      const verdict = await this.isVehicleBookable({
        vehicleId,
        startDate: reservation.startDate,
        endDate: assignmentEndDate || reservation.startDate,
        excludeReservationId: reservationId,
      }, tx);
      if (!verdict.bookable) throw new BookingConflictError(verdict);

      const [row] = await tx
        .update(reservations)
        .set({
          vehicleId,
          endDate: assignmentEndDate,
          placeholderSpare: false,
          notes: reservation.replacementForReservationId != null
            ? `Spare vehicle ${vehicle.licensePlate} (${vehicle.brand} ${vehicle.model}) assigned for reservation #${reservation.replacementForReservationId}`
            : `Spare vehicle ${vehicle.licensePlate} (${vehicle.brand} ${vehicle.model}) assigned`,
          updatedAt: new Date()
        })
        .where(and(
          eq(reservations.id, reservationId),
          eq(reservations.placeholderSpare, true),
          isNull(reservations.vehicleId),
          isNull(reservations.deletedAt),
        ))
        .returning();
      return row as typeof reservations.$inferSelect | undefined;
    });

    if (!updatedReservation) {
      // Someone else assigned this placeholder between the read above and the
      // write — report it as a conflict, never as a silent success.
      throw new BookingConflictError(
        refusedVerdict("CONFLICT", vehicle, [], []),
        "This placeholder has already been assigned a vehicle.",
      );
    }

    // Keep the originating Transport's relatedVehicleId mirrored to whatever
    // just got assigned here, so the Transports page reflects it too.
    if (reservation.replacementForTransportId != null) {
      await db.update(vehicleTransports)
        .set({ relatedVehicleId: vehicleId, updatedAt: new Date() })
        .where(eq(vehicleTransports.id, reservation.replacementForTransportId));
    }

    // Delete the spare assignment notification when vehicle is assigned
    await this.deleteNotificationsByTypeAndPattern("spare_assignment", `[placeholder:${reservationId}]`);

    if (updatedReservation) await syncUsagePeriodSafely(updatedReservation.id);
    return updatedReservation || undefined;
  }

  // Other missing spare vehicle methods
  async getAvailableVehiclesInRange(startDate: string, endDate: string, excludeVehicleId?: number): Promise<Vehicle[]> {
    // Get all vehicles
    let vehicleQuery = db.select().from(vehicles).$dynamic();

    if (excludeVehicleId) {
      vehicleQuery = vehicleQuery.where(not(eq(vehicles.id, excludeVehicleId)));
    }

    const allVehicles = await vehicleQuery;

    // Get conflicting reservations in the date range (excluding soft-deleted and maintenance blocks)
    // Maintenance blocks don't conflict since rentals continue during maintenance (monthly payment)
    // Also exclude returned and completed reservations as they don't block availability
    const conflictingReservations = await db
      .select()
      .from(reservations)
      .where(
        and(
          not(eq(reservations.status, 'cancelled')),
          not(eq(reservations.status, 'completed')),
          not(eq(reservations.status, 'returned')),
          not(eq(reservations.type, 'maintenance_block')), // Exclude maintenance - rentals continue
          isNull(reservations.deletedAt),
          sql`${reservations.vehicleId} IS NOT NULL`,
          or(
            and(
              lte(reservations.startDate, endDate),
              gte(reservations.endDate, startDate)
            ),
            and(
              lte(reservations.startDate, endDate),
              sql`${reservations.endDate} IS NULL`
            )
          )
        )
      );

    const unavailableVehicleIds = new Set(
      conflictingReservations.map(r => r.vehicleId).filter(id => id !== null)
    );

    // Filter out vehicles that are not meant for rental and those in service
    // Allow both 'available' and 'rented' vehicles as long as they don't have date conflicts
    return allVehicles.filter(vehicle => 
      !unavailableVehicleIds.has(vehicle.id) && 
      vehicle.maintenanceStatus !== 'in_service' &&
      vehicle.availabilityStatus !== 'not_for_rental' &&
      vehicle.availabilityStatus !== 'needs_fixing'
    );
  }

  async getActiveReplacementByOriginal(originalReservationId: number): Promise<Reservation | undefined> {
    const [replacement] = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.replacementForReservationId, originalReservationId),
          eq(reservations.type, 'replacement'),
          not(eq(reservations.status, 'cancelled')),
          not(eq(reservations.status, 'completed')),
          isNull(reservations.deletedAt)
        )
      )
      .orderBy(desc(reservations.id));
    
    return replacement || undefined;
  }

  /**
   * FIX-V (BUG-032, BUG-014) — assign a spare to a rental or a block.
   *
   * `assign-spare` could be called twice and left **two** live replacements on
   * two different vehicles for the same rental: nobody could tell which car the
   * customer actually had, both were blocked, and neither had a closing path.
   * A second assignment now cancels the first in the same transaction, the way
   * `applyTransportUpdate` has always done for transports — unless that first
   * one has really been handed over, which is refused (BUG-004's rule).
   */
  async createReplacementReservation(originalReservationId: number, spareVehicleId: number, startDate: string, endDate?: string, options: { maintenanceBlockId?: number | null } = {}): Promise<Reservation> {
    const [original] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.id, originalReservationId));
      
    if (!original) {
      throw new Error('Original reservation not found');
    }

    // Ensure spare vehicle is not the same as original
    if (spareVehicleId === original.vehicleId) {
      throw new Error('Spare vehicle cannot be the same as original vehicle');
    }

    // Get vehicle details for meaningful notes
    const [originalVehicle] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, original.vehicleId!));

    const [spareVehicle] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, spareVehicleId));

    const finalEndDate = endDate || original.endDate;

    const originalVehicleInfo = originalVehicle
      ? `${originalVehicle.licensePlate} (${originalVehicle.brand} ${originalVehicle.model})`
      : `Vehicle ID ${original.vehicleId}`;
    const spareVehicleInfo = spareVehicle 
      ? `${spareVehicle.licensePlate} (${spareVehicle.brand} ${spareVehicle.model})`
      : `Vehicle ID ${spareVehicleId}`;

    const replacementData: InsertReservation = {
      vehicleId: spareVehicleId,
      customerId: original.customerId,
      startDate,
      endDate: finalEndDate,
      // BUG-129: 'active'/'pending' are not statuses the machine knows, so the
      // four rows written like that could never be picked up, closed or
      // cancelled. A spare is a booking like any other until it is handed over.
      status: 'booked',
      type: 'replacement',
      replacementForReservationId: originalReservationId,
      placeholderSpare: false,
      totalPrice: undefined,
      notes: `Spare vehicle ${spareVehicleInfo} for reservation #${originalReservationId}`,
      damageCheckPath: null
    };

    // FIX-F (BUG-160) — the availability of the spare is decided inside the
    // same transaction as the insert, behind the spare's advisory lock, so two
    // staff members assigning the same spare at the same moment cannot both
    // win. A refusal is a `BookingConflictError` (409), not a bare Error the
    // route turned into a 400 carrying a sentence.
    const freed: number[] = [];
    const created = await this.withBookingLocks([spareVehicleId], async (tx) => {
      // BUG-032 — close whatever is already standing in for this rental first.
      const existing = await tx
        .select({ id: reservations.id, status: reservations.status, vehicleId: reservations.vehicleId })
        .from(reservations)
        .where(and(
          eq(reservations.type, 'replacement'),
          eq(reservations.replacementForReservationId, originalReservationId),
          isNull(reservations.deletedAt),
          sql`${reservations.status} NOT IN ('cancelled','completed','returned')`,
        ));
      if (existing.some((r: { status: string }) => normalizeReservationStatus(r.status) === 'picked_up')) {
        throw new HttpError(
          409,
          'Cannot assign another replacement — the current one has already been picked up. Return it first.',
          { code: 'SPARE_ALREADY_PICKED_UP' },
        );
      }
      if (existing.length > 0) {
        await tx.update(reservations)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(inArray(reservations.id, existing.map((r: { id: number }) => r.id)));
        freed.push(...existing.map((r: { vehicleId: number | null }) => r.vehicleId).filter((v: number | null): v is number => v != null));
      }

      const verdict = await this.isVehicleBookable({
        vehicleId: spareVehicleId,
        startDate,
        endDate: finalEndDate || startDate,
      }, tx);
      if (!verdict.bookable) throw new BookingConflictError(verdict);

      const [replacement] = await tx
        .insert(reservations)
        .values({
          ...replacementData,
          // BUG-118: when the spare stands in for a maintenance block, say so.
          maintenanceBlockId: options.maintenanceBlockId
            ?? (original.type === 'maintenance_block' ? original.id : null),
        } as unknown as typeof reservations.$inferInsert)
        .returning();
      return replacement as Reservation;
    });

    for (const vehicleId of Array.from(new Set(freed))) {
      await this.recomputeVehicleAvailability(vehicleId);
    }
    await syncUsagePeriodSafely(created.id);
    return created;
  }

  async updateLegacyNotesWithVehicleDetails(): Promise<number> {
    // This is a maintenance method - for DatabaseStorage, return 0 as no legacy data to update
    return 0;
  }

  async closeReplacementReservation(replacementReservationId: number, endDate: string): Promise<Reservation | undefined> {
    const [updatedReservation] = await db
      .update(reservations)
      .set({
        endDate,
        status: 'completed',
        updatedAt: new Date()
      })
      .where(
        and(
          eq(reservations.id, replacementReservationId),
          isNull(reservations.deletedAt),
          // Only genuine replacement reservations may be closed here. Without
          // this the id of an ordinary rental would close that rental instead,
          // marking a live customer booking 'completed' and reporting success.
          isNotNull(reservations.replacementForReservationId)
        )
      )
      .returning();

    if (updatedReservation) await syncUsagePeriodSafely(updatedReservation.id);
    return updatedReservation || undefined;
  }

  /**
   * PHASE 57 / WAVE 13 item 4 — "Terug van onderhoud" as the whole handling.
   *
   * `closeReplacementReservation()` above closes the spare and nothing else,
   * which is exactly what the button did: the original car kept
   * `maintenance_status = in_service`, stayed `needs_fixing`, and the employee
   * was told in the manual to go and free it by hand afterwards. Half a
   * business event, done twice a day.
   *
   * This is the event: the spare is handed back, the repair that was running
   * on the return date is closed, and the car's availability is derived again
   * by the one owner (`markVehicleForService` → `recomputeVehicleAvailability`
   * → `deriveVehicleAvailability`). A block planned for a later date is left
   * standing — `selectMaintenanceBlocksToClose()` is the rule, shared with the
   * scan screen.
   *
   * All writes are in one transaction, like `completeMaintenance()`: a failure
   * halfway leaves none of them.
   */
  async returnVehicleFromService(
    replacementReservationId: number,
    returnDate: string,
    actor?: { username?: string | null },
  ): Promise<
    | { ok: false; status: number; message: string }
    | { ok: true; spare: Reservation; vehicle: Vehicle | null; closedBlocks: Reservation[] }
  > {
    const [spare] = await db.select().from(reservations).where(
      and(eq(reservations.id, replacementReservationId), isNull(reservations.deletedAt)),
    );
    if (!spare) {
      return { ok: false, status: 404, message: 'Deze reservering bestaat niet (meer).' };
    }
    if (!spare.replacementForReservationId) {
      // The guard that used to live in the `where` clause of the UPDATE: the id
      // of an ordinary rental must never close that rental.
      return {
        ok: false,
        status: 404,
        message: 'Deze reservering is geen vervangingsreservering, dus er is hier niets terug te nemen van onderhoud.',
      };
    }

    const [original] = await db.select().from(reservations).where(
      and(eq(reservations.id, spare.replacementForReservationId), isNull(reservations.deletedAt)),
    );
    const originalVehicleId = original?.vehicleId ?? null;

    // Read outside the transaction: this walks the reservation table and must
    // not hold the block's row lock while it does.
    const blocksToClose = originalVehicleId
      ? selectMaintenanceBlocksToClose(
          await db.select().from(reservations).where(
            and(
              eq(reservations.vehicleId, originalVehicleId),
              eq(reservations.type, 'maintenance_block'),
              isNull(reservations.deletedAt),
            ),
          ),
          returnDate,
        )
      : [];

    const result = await db.transaction(async (tx) => {
      const [closedSpare] = await tx
        .update(reservations)
        .set({
          endDate: returnDate,
          status: 'completed',
          spareVehicleStatus: 'returned',
          updatedBy: actor?.username ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(reservations.id, replacementReservationId), isNull(reservations.deletedAt)))
        .returning();

      const closedBlocks: Reservation[] = [];
      for (const block of blocksToClose) {
        const [row] = await tx
          .update(reservations)
          .set({
            // Same date convention as completeMaintenance(): the completion
            // date is the end date and the start is never rewritten.
            endDate: returnDate,
            maintenanceStatus: 'out',
            status: 'completed',
            updatedBy: actor?.username ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(reservations.id, block.id), isNull(reservations.deletedAt)))
          .returning();
        if (row) closedBlocks.push(row);
      }

      // Closing the job is the one moment B-03's sticky workshop flag may be
      // cleared, and markVehicleForService() is where that rule lives. It
      // recomputes availability from deriveVehicleAvailability() — by now the
      // blocks above are closed inside this same transaction, so the derivation
      // sees the state that will actually be committed.
      const vehicle = originalVehicleId
        ? await this.markVehicleForService(originalVehicleId, 'ok', undefined, tx)
        : null;

      return { closedSpare, vehicle: vehicle ?? null, closedBlocks };
    });

    // The spare's own car only became free a moment ago; its derivation runs on
    // its own connection, outside the transaction, for the same reason
    // completeMaintenance() does it here.
    if (result.closedSpare?.vehicleId) {
      await this.recomputeVehicleAvailability(result.closedSpare.vehicleId);
    }

    return {
      ok: true,
      spare: result.closedSpare,
      vehicle: result.vehicle,
      closedBlocks: result.closedBlocks,
    };
  }

  // dbExecutor lets a caller pass an open `tx` (from db.transaction(...)) so this
  // write participates in that transaction instead of its own connection — needed
  // for callers that must roll everything back together (e.g. transport spare
  // assignment). The reconciliation pass is always skipped when tx-scoped, since
  // running it on a separate connection mid-transaction could deadlock against our
  // own not-yet-committed row lock; callers that pass a tx are responsible for
  // calling syncVehicleAvailabilityWithReservations() themselves after it commits.
  async markVehicleForService(vehicleId: number, maintenanceStatus: string, maintenanceNote?: string, dbExecutor: any = db): Promise<Vehicle | undefined> {
    // Get current vehicle to check its status
    const [currentVehicle] = await dbExecutor.select().from(vehicles).where(eq(vehicles.id, vehicleId));
    if (!currentVehicle) {
      return undefined;
    }

    const updateData: any = {
      maintenanceStatus,
      maintenanceNote: maintenanceNote || null,
      // D6: a plain status write has no block behind it. The writers that do
      // (check-in with a blockId, mark-needs-service with service dates) call
      // setMaintenanceStatusBlock() right after.
      maintenanceStatusBlockId: null,
      updatedAt: new Date()
    };

    // FIX-H - this used to be the *second* writer of availability_status, with
    // its own rules ('needs_fixing' unless rented, 'available' when the job
    // closes). Both of those disagreed with the sync, which is how a manual
    // `not_for_rental` ended up washed away (BUG-109). The workshop flag is
    // written here; what the availability then *is* is decided in one place.
    const [updatedVehicle] = await dbExecutor
      .update(vehicles)
      .set(updateData)
      .where(eq(vehicles.id, vehicleId))
      .returning();

    // Closing the job is the one moment a sticky manual `needs_fixing` may be
    // cleared - besluiten B-03 makes it survive everything else.
    const closingJob = maintenanceStatus === 'ok' || maintenanceStatus === 'completed';
    await this.recomputeVehicleAvailability(vehicleId, {
      executor: dbExecutor,
      clearWorkshopFlag: closingJob,
    });

    if (updatedVehicle) {
      const [fresh] = await dbExecutor.select().from(vehicles).where(eq(vehicles.id, vehicleId));
      return fresh || updatedVehicle;
    }
    return undefined;
  }

  /**
   * D6 (besluiten B-41): record which maintenance block the car's current
   * workshop flag (`vehicles.maintenance_status`) came from. Call it right after
   * the status write; `null` clears it.
   */
  async setMaintenanceStatusBlock(vehicleId: number, blockId: number | null, dbExecutor: any = db): Promise<void> {
    await dbExecutor.update(vehicles).set({ maintenanceStatusBlockId: blockId }).where(eq(vehicles.id, vehicleId));
  }

  /**
   * D6 (besluiten B-41): a maintenance block was deleted, cancelled or aborted.
   * When it is the block that checked the car in (`maintenance_status_block_id`)
   * and no other block the car is "Binnen" for covers today, the workshop job is
   * closed: `markVehicleForService('ok')` clears the flag and re-derives the
   * availability. A flag set by hand, by a transport, or by another block stays.
   * Returns true when the car was released.
   */
  async releaseVehicleFromRemovedBlock(block: { id: number; vehicleId?: number | null; type?: string | null }): Promise<boolean> {
    if (block.type !== 'maintenance_block' || block.vehicleId == null) return false;
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, block.vehicleId));
    if (!vehicle || vehicle.maintenanceStatusBlockId !== block.id) return false;

    const today = isoToday();
    const stillIn = (await this.getReservationsByVehicle(block.vehicleId)).some((r) => {
      if (r.id === block.id || r.type !== 'maintenance_block' || r.deletedAt) return false;
      if (CLOSED_RESERVATION_STATUSES.has(normalizeReservationStatus(r.status) ?? '')) return false;
      if (!isCheckedInBlockMaintenanceStatus(r.maintenanceStatus)) return false;
      return r.startDate <= today && (!r.endDate || r.endDate === 'undefined' || r.endDate >= today);
    });
    if (stillIn) return false;

    await this.markVehicleForService(block.vehicleId, 'ok');
    return true;
  }

  async createMaintenanceBlock(vehicleId: number, startDate: string, endDate?: string, customerId?: number | null): Promise<Reservation> {
    const maintenanceData: InsertReservation = {
      vehicleId,
      customerId: customerId ?? null,
      startDate,
      endDate: endDate || null,
      // BUG-129: this wrote 'active', a value no transition in the table starts
      // from, so 265 blocks could never be closed or cancelled through any UI
      // action and kept their vehicles on `rented`.
      status: 'booked',
      type: 'maintenance_block',
      // Match the fields the maintenance scheduler sets so these blocks show
      // and behave the same on the maintenance calendar (its filters and
      // status flow key off maintenanceStatus/maintenanceCategory).
      maintenanceStatus: 'scheduled',
      maintenanceCategory: 'repair',
      replacementForReservationId: null,
      placeholderSpare: false,
      totalPrice: undefined,
      // WAVE 13 item 7 — this string is shown to the desk on the block itself.
      notes: 'Onderhoudsblok',
      damageCheckPath: null
    };

    const [maintenanceBlock] = await db
      .insert(reservations)
      .values(maintenanceData as unknown as typeof reservations.$inferInsert)
      .returning();

    return maintenanceBlock;
  }

  /**
   * OPT-015 — "Onderhoud afronden" as one handling instead of three.
   *
   * Closing one repair cost three actions across two screens: put the block on
   * `out`, put the vehicle's `maintenance_status` back to `ok`, and run
   * `return-from-service` on the spare. Nothing enforced the order and nothing
   * warned when one was skipped — skip the second and the car stays "in de
   * werkplaats" forever; skip the first and the block stays open and keeps
   * blocking the calendar (44 vehicles with an unclosed block in the clone).
   * The two closing paths also wrote different dates.
   *
   * One date convention, stated once: the completion date is the block's
   * **end date**. The start date is never rewritten — the repair started when
   * it started, and the old calendar path overwrote both, destroying that.
   *
   * All three writes are in one transaction: a failure halfway leaves none of
   * them, which is the acceptance criterion in the plan.
   *
   * B-37 puts what the workshop hands over in the same transaction: the APK
   * date and the odometer reading on the vehicle (`lastServiceDate` /
   * `lastServiceMileage` too when the job was a scheduled service) and the APK
   * file as a `documents` row tied to the vehicle and to this block. A mileage
   * below the vehicle's current reading is refused with
   * MILEAGE_LOWER_THAN_CURRENT and nothing changes. The file has already been
   * written by the upload middleware when this runs; it is unlinked again on
   * every path that does not end in a committed document row.
   */
  async completeMaintenance(blockId: number, input: {
    completionDate: string;
    maintenanceCategory?: string | null;
    notes?: string | null;
    currentMileage?: number | null;
    apkDate?: string | null;
    apkFile?: CompleteMaintenanceFile | null;
    username?: string | null;
  }): Promise<CompleteMaintenanceResult> {
    const discardFile = () => {
      if (!input.apkFile) return;
      try {
        fs.unlinkSync(input.apkFile.path);
      } catch (error: any) {
        if (error?.code !== 'ENOENT') console.error('Could not remove the unused APK file:', error);
      }
    };
    const refuse = (refusal: Extract<CompleteMaintenanceResult, { ok: false }>): CompleteMaintenanceResult => {
      discardFile();
      return refusal;
    };

    const [block] = await db.select().from(reservations).where(
      and(eq(reservations.id, blockId), isNull(reservations.deletedAt)),
    );
    if (!block) {
      return refuse({ ok: false, status: 404, message: 'Maintenance block not found' });
    }
    if (block.type !== 'maintenance_block') {
      return refuse({
        ok: false,
        status: 400,
        message: 'This reservation is not a maintenance block, so there is no repair to finish here.',
      });
    }
    if (!block.vehicleId) {
      return refuse({ ok: false, status: 400, message: 'This maintenance block has no vehicle.' });
    }
    // D7: Afronden is the only way to finish a block, and only once. "Finished" is the
    // block's maintenance status `out`: the history's "Terugdraaien" puts a finished block back
    // to `in` and leaves its status `completed`, and that block has to be finishable again.
    const alreadyCompleted = {
      ok: false as const,
      status: 409,
      code: 'ALREADY_COMPLETED',
      message: 'This maintenance block has already been completed.',
    };
    if (String(block.maintenanceStatus ?? '').toLowerCase() === 'out') {
      return refuse(alreadyCompleted);
    }
    if (block.endDate && input.completionDate < block.startDate) {
      return refuse({
        ok: false,
        status: 400,
        message: 'The completion date cannot be before the block started.',
      });
    }

    const vehicleId = block.vehicleId;
    // Looked up before the transaction: this read walks the reservation table
    // and must not hold the block's row lock while it does.
    //
    // Deliberately NOT getSpareVehicleForVehicle(): that one only sees a spare
    // whose period contains *today*, which is right for a dashboard widget and
    // wrong here. Finishing a repair returns the spare that belongs to it,
    // whenever the repair happens to be finished.
    const openSpares = await db
      .select({ id: reservations.id, vehicleId: reservations.vehicleId })
      .from(reservations)
      .innerJoin(
        alias(reservations, 'original'),
        eq(reservations.replacementForReservationId, sql`original.id`),
      )
      .where(and(
        eq(reservations.type, 'replacement'),
        isNull(reservations.deletedAt),
        sql`${reservations.status} NOT IN ('completed','cancelled')`,
        sql`original.vehicle_id = ${vehicleId}`,
        sql`original.deleted_at IS NULL`,
      ));
    const spare = openSpares[0] ?? null;

    const givenMileage = input.currentMileage ?? null;
    const isScheduledService = input.maintenanceCategory === 'scheduled_maintenance';
    // What the workshop hands over, written onto the vehicle in the same transaction.
    const vehicleReadings: Partial<typeof vehicles.$inferInsert> = {
      ...(input.apkDate ? { apkDate: input.apkDate } : {}),
      ...(givenMileage != null ? { currentMileage: givenMileage } : {}),
      ...(isScheduledService ? { lastServiceDate: input.completionDate } : {}),
      ...(isScheduledService && givenMileage != null ? { lastServiceMileage: givenMileage } : {}),
    };

    const result = await db.transaction(async (tx) => {
      // The readings go first, in one statement that carries the mileage rule in
      // its WHERE clause: a reading below the vehicle's current one touches nothing
      // (no lock to order against the other writers, and no window between a
      // check and the write).
      if (Object.keys(vehicleReadings).length > 0) {
        const written = await tx
          .update(vehicles)
          .set({ ...vehicleReadings, updatedBy: input.username ?? null, updatedAt: new Date() })
          .where(and(
            eq(vehicles.id, vehicleId),
            givenMileage != null
              ? or(isNull(vehicles.currentMileage), lte(vehicles.currentMileage, givenMileage))
              : undefined,
          ))
          .returning({ id: vehicles.id });
        if (written.length === 0) {
          const [current] = await tx
            .select({ currentMileage: vehicles.currentMileage })
            .from(vehicles)
            .where(eq(vehicles.id, vehicleId));
          if (!current) {
            return { refusal: { ok: false as const, status: 404, message: 'Vehicle not found' } };
          }
          return {
            refusal: {
              ok: false as const,
              status: 400,
              code: 'MILEAGE_LOWER_THAN_CURRENT',
              message: "The mileage is lower than the vehicle's current reading.",
              details: { current: current.currentMileage, given: givenMileage },
            },
          };
        }
      }

      const [closedBlock] = await tx
        .update(reservations)
        .set({
          endDate: input.completionDate,
          maintenanceStatus: 'out',
          status: 'completed',
          ...(input.maintenanceCategory ? { maintenanceCategory: input.maintenanceCategory } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
          updatedBy: input.username ?? null,
          updatedAt: new Date(),
        })
        // The guard travels with the write: a double submit loses here, after waiting for the
        // first one's row lock, and its whole transaction (readings included) rolls back.
        .where(and(
          eq(reservations.id, blockId),
          isNull(reservations.deletedAt),
          sql`${reservations.maintenanceStatus} IS DISTINCT FROM 'out'`,
        ))
        .returning();
      if (!closedBlock) throw new AlreadyCompletedSignal();

      // Rapporten fase 1 - a reading taken by the workshop goes into the km
      // history, in this transaction, keyed on the block.
      if (givenMileage != null) {
        await recordMileageReading(tx, {
          vehicleId,
          mileage: givenMileage,
          recordedAt: readingInstantForOfficeDate(input.completionDate),
          source: 'service',
          sourceTable: 'reservations',
          sourceId: blockId,
          actorName: input.username ?? 'systeem',
        });
      }

      // The APK file: tied to the vehicle AND to this block. Written before the
      // commit; the catch below unlinks the file when this transaction fails.
      let documentId: number | null = null;
      if (input.apkFile) {
        const [document] = await tx
          .insert(documents)
          .values({
            vehicleId,
            reservationId: blockId,
            documentType: 'APK Inspection',
            fileName: path.basename(input.apkFile.path),
            filePath: getRelativePath(input.apkFile.path),
            fileSize: input.apkFile.size,
            contentType: input.apkFile.mimeType,
            notes: `APK inspection completed on ${input.completionDate}${input.apkDate ? `; APK valid until ${input.apkDate}` : ''}`,
            createdBy: input.username ?? null,
          })
          .returning({ id: documents.id });
        documentId = document.id;
      }

      // The workshop flag. besluiten B-03 makes it survive an inname and a
      // completed transport; closing the job is the one moment it is cleared,
      // and markVehicleForService() is where that rule lives.
      const vehicle = await this.markVehicleForService(vehicleId, 'ok', undefined, tx);

      let closedSpare: Reservation | null = null;
      if (spare) {
        const [row] = await tx
          .update(reservations)
          .set({
            endDate: input.completionDate,
            status: 'completed',
            spareVehicleStatus: 'returned',
            updatedBy: input.username ?? null,
            updatedAt: new Date(),
          })
          .where(and(
            eq(reservations.id, spare.id),
            isNull(reservations.deletedAt),
            isNotNull(reservations.replacementForReservationId),
          ))
          .returning();
        closedSpare = row ?? null;
      }

      return { closedBlock, vehicle, closedSpare, documentId };
    }).catch((error) => {
      // The file was written before this transaction; nothing references it now.
      discardFile();
      if (error instanceof AlreadyCompletedSignal) return { refusal: alreadyCompleted };
      throw error;
    });
    if (result.refusal) {
      return refuse(result.refusal);
    }

    // The derivation is deliberately outside the transaction: it runs on its
    // own connection and would deadlock against the rows just locked. The
    // vehicle's own recompute already ran inside markVehicleForService(); the
    // spare's has to be asked for here, because its reservation only closed a
    // moment ago.
    //
    // Everything is committed by now (the block, the spare, the document row the
    // APK file belongs to), so a failure here must not surface as a failed
    // completion: the route would answer 500 and unlink a file a committed row
    // points at. The sweeps derive the spare car's availability again anyway.
    if (result.closedSpare?.vehicleId) {
      try {
        await this.recomputeVehicleAvailability(result.closedSpare.vehicleId);
      } catch (error) {
        console.error('Could not recompute the availability of the returned spare vehicle after completing maintenance:', error);
      }
    }

    return {
      ok: true,
      block: result.closedBlock,
      vehicle: result.vehicle ?? null,
      spareReservation: result.closedSpare,
      documentId: result.documentId,
    };
  }

  async closeMaintenanceBlock(blockReservationId: number, endDate: string): Promise<Reservation | undefined> {
    const [updatedBlock] = await db
      .update(reservations)
      .set({
        endDate,
        status: 'completed',
        updatedAt: new Date()
      })
      .where(
        and(
          eq(reservations.id, blockReservationId),
          isNull(reservations.deletedAt)
        )
      )
      .returning();

    return updatedBlock || undefined;
  }

  async getSpareVehicleForVehicle(vehicleId: number): Promise<{ spareVehicle: Vehicle; replacementReservation: Reservation; customer: Customer | null; originalReservation: Reservation } | null> {
    const today = new Date().toISOString().split('T')[0];
    
    // Find active reservations for this vehicle that might have spare vehicles assigned (all active statuses)
    const activeReservations = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.vehicleId, vehicleId),
          eq(reservations.type, 'standard'),
          or(
            eq(reservations.status, 'picked_up'),
            eq(reservations.status, 'booked'),
            eq(reservations.status, 'rented'),
            eq(reservations.status, 'confirmed'),
            eq(reservations.status, 'pending')
          ),
          isNull(reservations.deletedAt)
        )
      );
    
    for (const originalRes of activeReservations) {
      // Find active replacement reservation for this original reservation
      const [replacement] = await db
        .select()
        .from(reservations)
        .where(
          and(
            eq(reservations.type, 'replacement'),
            eq(reservations.replacementForReservationId, originalRes.id),
            not(eq(reservations.status, 'cancelled')),
            not(eq(reservations.status, 'completed')),
            isNull(reservations.deletedAt),
            lte(reservations.startDate, today),
            or(
              isNull(reservations.endDate),
              gte(reservations.endDate, today)
            )
          )
        );
      
      if (replacement && replacement.vehicleId) {
        const [spareVehicle] = await db
          .select()
          .from(vehicles)
          .where(eq(vehicles.id, replacement.vehicleId));
        
        let customer = null;
        if (originalRes.customerId) {
          const [cust] = await db
            .select()
            .from(customers)
            .where(eq(customers.id, originalRes.customerId));
          customer = cust || null;
        }
        
        if (spareVehicle) {
          return {
            spareVehicle,
            replacementReservation: replacement,
            customer,
            originalReservation: originalRes
          };
        }
      }
    }
    
    return null;
  }

  async getActingAsSpareInfo(vehicleId: number): Promise<{ originalVehicle: Vehicle; originalReservation: Reservation; replacementReservation: Reservation; customer: Customer | null } | null> {
    const today = new Date().toISOString().split('T')[0];
    
    // Find active replacement reservation where this vehicle is the spare
    const [replacement] = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.vehicleId, vehicleId),
          eq(reservations.type, 'replacement'),
          not(eq(reservations.status, 'cancelled')),
          not(eq(reservations.status, 'completed')),
          isNull(reservations.deletedAt),
          lte(reservations.startDate, today),
          or(
            isNull(reservations.endDate),
            gte(reservations.endDate, today)
          )
        )
      );
    
    if (!replacement || !replacement.replacementForReservationId) {
      return null;
    }
    
    // Get the original reservation
    const [originalRes] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.id, replacement.replacementForReservationId));
    
    if (!originalRes || !originalRes.vehicleId) {
      return null;
    }
    
    const [originalVehicle] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, originalRes.vehicleId));
    
    if (!originalVehicle) {
      return null;
    }
    
    let customer = null;
    if (originalRes.customerId) {
      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, originalRes.customerId));
      customer = cust || null;
    }
    
    return {
      originalVehicle,
      originalReservation: originalRes,
      replacementReservation: replacement,
      customer
    };
  }

  // App Settings methods
  async getAllAppSettings(): Promise<AppSettings[]> {
    return await db.select().from(appSettings).orderBy(appSettings.category, appSettings.key);
  }

  async getAppSetting(id: number): Promise<AppSettings | undefined> {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.id, id));
    return setting || undefined;
  }

  async getAppSettingByKey(key: string): Promise<AppSettings | undefined> {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return setting || undefined;
  }

  async getAppSettingsByCategory(category: string): Promise<AppSettings[]> {
    return await db.select().from(appSettings).where(eq(appSettings.category, category)).orderBy(appSettings.key);
  }

  async createAppSetting(insertSetting: InsertAppSettings): Promise<AppSettings> {
    const [setting] = await db.insert(appSettings).values(insertSetting).returning();
    return setting;
  }

  async updateAppSetting(id: number, settingData: Partial<InsertAppSettings>): Promise<AppSettings | undefined> {
    const updateData = {
      ...settingData,
      updatedAt: new Date()
    };
    
    const [updatedSetting] = await db
      .update(appSettings)
      .set(updateData)
      .where(eq(appSettings.id, id))
      .returning();
      
    return updatedSetting || undefined;
  }

  async deleteAppSetting(id: number): Promise<boolean> {
    const result = await db.delete(appSettings).where(eq(appSettings.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // RDW APK date change methods
  async getPendingApkDateChanges(): Promise<Array<ApkDateChange & { licensePlate: string; brand: string; model: string }>> {
    const rows = await db
      .select({
        id: apkDateChanges.id,
        vehicleId: apkDateChanges.vehicleId,
        previousApkDate: apkDateChanges.previousApkDate,
        newApkDate: apkDateChanges.newApkDate,
        status: apkDateChanges.status,
        detectedAt: apkDateChanges.detectedAt,
        resolvedAt: apkDateChanges.resolvedAt,
        resolvedBy: apkDateChanges.resolvedBy,
        licensePlate: vehicles.licensePlate,
        brand: vehicles.brand,
        model: vehicles.model,
      })
      .from(apkDateChanges)
      .innerJoin(vehicles, eq(apkDateChanges.vehicleId, vehicles.id))
      .where(eq(apkDateChanges.status, "pending"))
      .orderBy(desc(apkDateChanges.detectedAt));
    return rows;
  }

  async getPendingApkDateChangeForVehicle(vehicleId: number): Promise<ApkDateChange | undefined> {
    const [row] = await db
      .select()
      .from(apkDateChanges)
      .where(and(eq(apkDateChanges.vehicleId, vehicleId), eq(apkDateChanges.status, "pending")));
    return row || undefined;
  }

  async getApkDateChange(id: number): Promise<ApkDateChange | undefined> {
    const [row] = await db.select().from(apkDateChanges).where(eq(apkDateChanges.id, id));
    return row || undefined;
  }

  async createApkDateChange(data: InsertApkDateChange): Promise<ApkDateChange> {
    const [row] = await db.insert(apkDateChanges).values(data).returning();
    return row;
  }

  async updateApkDateChange(id: number, data: Partial<InsertApkDateChange>): Promise<ApkDateChange | undefined> {
    const [row] = await db.update(apkDateChanges).set(data).where(eq(apkDateChanges.id, id)).returning();
    return row || undefined;
  }

  // Settings methods (contract numbers, etc.)
  async getSettings(): Promise<Settings | undefined> {
    const [settingsRecord] = await db.select().from(settings).limit(1);
    return settingsRecord || undefined;
  }

  /**
   * FIX-G (BUG-175) — optional optimistic concurrency. When the caller passes
   * the `updatedAt` it loaded, that value becomes the precondition of the
   * write: two settings screens saving from the same starting point no longer
   * silently overwrite each other, the second gets a 409 STALE_WRITE and can
   * reload. Callers that pass nothing keep the old last-writer-wins behaviour.
   */
  async updateSettings(settingData: UpdateSettings, expectedUpdatedAt?: Date | null): Promise<Settings | undefined> {
    const updateData = {
      ...settingData,
      updatedAt: new Date()
    };

    // First, try to get existing settings
    const existingSettings = await this.getSettings();

    if (existingSettings) {
      // Update existing record. With an expected stamp the row is locked, the
      // comparison happens on the same value the API published (a JS Date on
      // both sides, so no timestamp-precision or time-zone games), and the
      // write follows inside the same transaction.
      return await db.transaction(async (tx) => {
        if (expectedUpdatedAt) {
          const [locked] = await tx.select().from(settings).where(eq(settings.id, existingSettings.id)).for('update');
          if (locked && locked.updatedAt && locked.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
            throw new HttpError(409, "Someone else saved these settings while you were editing. Reload and try again.", { code: "STALE_WRITE" });
          }
        }
        const [updatedSettings] = await tx
          .update(settings)
          .set(updateData)
          .where(eq(settings.id, existingSettings.id))
          .returning();
        return updatedSettings || undefined;
      });
    } else {
      // Create new record if none exists
      const [newSettings] = await db
        .insert(settings)
        .values({ contractNumberStart: settingData.contractNumberStart || 1 })
        .returning();
      return newSettings;
    }
  }

  async getNextContractNumber(): Promise<string> {
    // Get current settings
    const settingsRecord = await this.getSettings();
    const startNumber = settingsRecord?.contractNumberStart || 1;
    
    // Check if there's a manual override set
    if (settingsRecord?.contractNumberOverride) {
      return String(settingsRecord.contractNumberOverride);
    }
    
    // Find the highest contract number by checking live reservations.
    // Deleted ones are skipped: their number is freed on delete, so counting
    // them would keep the sequence permanently ahead of reality.
    const allReservations = await db.select({ contractNumber: reservations.contractNumber })
      .from(reservations)
      .where(isNull(reservations.deletedAt));

    let maxNumber = startNumber - 1;

    // Filter and find the highest numeric contract number.
    // One mistyped number (e.g. 234234234 instead of 23423) used to poison the
    // sequence forever, because every later number was derived from it. Values
    // far above the running series are treated as typos and ignored here; use
    // the contract-number override in settings for a deliberate jump.
    const plausible: number[] = [];
    for (const res of allReservations) {
      if (res.contractNumber) {
        const num = parseInt(res.contractNumber, 10);
        if (!isNaN(num) && num >= startNumber) {
          plausible.push(num);
        }
      }
    }

    if (plausible.length > 0) {
      plausible.sort((a, b) => a - b);
      // Median of the live numbers describes where the series actually sits.
      const median = plausible[Math.floor(plausible.length / 2)];
      const ceiling = Math.max(median * 10, startNumber * 10, 1000);
      for (const num of plausible) {
        if (num <= ceiling && num > maxNumber) {
          maxNumber = num;
        }
      }
    }

    return String(maxNumber + 1);
  }
  
  async getConflictingContractNumbers(proposedNumber: number): Promise<string[]> {
    // Find all contract numbers that are >= proposedNumber
    const allReservations = await db.select({ contractNumber: reservations.contractNumber })
      .from(reservations);
    
    const conflicting: string[] = [];
    
    for (const res of allReservations) {
      if (res.contractNumber) {
        const num = parseInt(res.contractNumber, 10);
        if (!isNaN(num) && num >= proposedNumber) {
          conflicting.push(res.contractNumber);
        }
      }
    }
    
    // Sort numerically
    return conflicting.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }
  
  async setContractNumberOverride(overrideNumber: number | null, updatedBy?: string): Promise<Settings | undefined> {
    const existingSettings = await this.getSettings();
    
    const updateData = {
      contractNumberOverride: overrideNumber,
      updatedAt: new Date(),
      updatedBy: updatedBy || null
    };
    
    if (existingSettings) {
      const [updatedSettings] = await db
        .update(settings)
        .set(updateData)
        .where(eq(settings.id, existingSettings.id))
        .returning();
      return updatedSettings || undefined;
    } else {
      // Create new record if none exists
      const [newSettings] = await db
        .insert(settings)
        .values({ 
          contractNumberStart: 1,
          contractNumberOverride: overrideNumber
        })
        .returning();
      return newSettings;
    }
  }
  
  async clearContractNumberOverride(updatedBy?: string): Promise<Settings | undefined> {
    return this.setContractNumberOverride(null, updatedBy);
  }

  async checkContractNumberExists(contractNumber: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.contractNumber, contractNumber))
      .limit(1);
    return !!existing;
  }

  // Driver methods
  async getAllDrivers(): Promise<Driver[]> {
    return await db.select().from(drivers).orderBy(desc(drivers.createdAt));
  }

  async getDriver(id: number): Promise<Driver | undefined> {
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, id));
    return driver || undefined;
  }

  async getDriversByCustomer(customerId: number): Promise<Driver[]> {
    return await db.select().from(drivers)
      .where(eq(drivers.customerId, customerId))
      .orderBy(desc(drivers.isPrimaryDriver), drivers.displayName);
  }

  async getActiveDriversByCustomer(customerId: number): Promise<Driver[]> {
    return await db.select().from(drivers)
      .where(and(eq(drivers.customerId, customerId), eq(drivers.status, 'active')))
      .orderBy(desc(drivers.isPrimaryDriver), drivers.displayName);
  }

  async getPrimaryDriverByCustomer(customerId: number): Promise<Driver | undefined> {
    const [driver] = await db.select().from(drivers)
      .where(and(eq(drivers.customerId, customerId), eq(drivers.isPrimaryDriver, true)))
      .limit(1);
    return driver || undefined;
  }

  async createDriver(insertDriver: InsertDriver): Promise<Driver> {
    const [driver] = await db.insert(drivers).values(insertDriver).returning();
    return driver;
  }

  async updateDriver(id: number, driverData: Partial<InsertDriver>): Promise<Driver | undefined> {
    const updateData = {
      ...driverData,
      updatedAt: new Date()
    };
    
    const [updatedDriver] = await db
      .update(drivers)
      .set(updateData)
      .where(eq(drivers.id, id))
      .returning();
      
    return updatedDriver || undefined;
  }

  /**
   * Sub-project D (B-41 D8) — a driver goes to the recycle bin: the row and the links the
   * foreign keys are about to blank (reservations, fines, portal users, assignments, usage
   * periods) are snapshotted in the same transaction as the delete, so a restore can put
   * them back.
   */
  async deleteDriver(
    id: number,
    actor?: { username?: string | null; userId?: number | null },
  ): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [driver] = await tx.select().from(drivers).where(eq(drivers.id, id)).for('update');
      if (!driver) return false;
      const [customer] = await tx.select({ name: customers.name, companyName: customers.companyName })
        .from(customers).where(eq(customers.id, driver.customerId));
      const owner = customer ? (customer.companyName || customer.name) : null;

      const cascade = await collectCascadeSnapshot(tx, "drivers", id);

      await tx.insert(deletedRecords).values({
        entityType: 'driver',
        entityId: id,
        label: `Chauffeur ${driver.displayName}${owner ? ` — ${owner}` : ''}`,
        payload: { driver, cascade },
        relatedCounts: snapshotCounts(cascade),
        deletedBy: actor?.username || null,
        deletedByUserId: actor?.userId ?? null,
      });

      const result = await tx.delete(drivers).where(eq(drivers.id, id));
      return (result.rowCount ?? 0) > 0;
    });
  }

  async getDriverCountryUsageStats(): Promise<{ country: string; count: number }[]> {
    const result = await db
      .select({
        country: drivers.licenseOrigin,
        count: sql<number>`count(*)::int`
      })
      .from(drivers)
      .where(sql`${drivers.licenseOrigin} IS NOT NULL AND ${drivers.licenseOrigin} != ''`)
      .groupBy(drivers.licenseOrigin)
      .orderBy(desc(sql`count(*)`));
    
    return result.map(row => ({
      country: row.country || '',
      count: row.count
    }));
  }

  // Saved Reports methods
  async getAllSavedReports(): Promise<SavedReport[]> {
    return await db.select().from(savedReports).orderBy(desc(savedReports.createdAt));
  }

  async getSavedReport(id: number): Promise<SavedReport | undefined> {
    const [report] = await db.select().from(savedReports).where(eq(savedReports.id, id));
    return report || undefined;
  }

  async createSavedReport(report: InsertSavedReport): Promise<SavedReport> {
    const [newReport] = await db.insert(savedReports).values(report).returning();
    return newReport;
  }

  async updateSavedReport(id: number, report: Partial<InsertSavedReport>): Promise<SavedReport | undefined> {
    const [updated] = await db.update(savedReports).set({ ...report, updatedAt: new Date() }).where(eq(savedReports.id, id)).returning();
    return updated || undefined;
  }

  async deleteSavedReport(id: number): Promise<boolean> {
    const result = await db.delete(savedReports).where(eq(savedReports.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async executeReport(configuration: any, scope?: ReportScope): Promise<any[]> {
    const { columns, filters, groupBy, dataSources } = configuration ?? {};

    if (!Array.isArray(columns) || columns.length === 0) {
      return [];
    }
    // A null or non-object entry is a malformed report, not a server fault.
    const isEntry = (x: unknown) => !!x && typeof x === "object" && !Array.isArray(x);
    for (const list of [columns, groupBy, filters]) {
      if (list !== undefined && list !== null && (!Array.isArray(list) || !list.every(isEntry))) {
        throw new ReportValidationError("Columns, grouping and filters must be lists of objects", "INVALID_REPORT");
      }
    }
    if (!Array.isArray(dataSources) || dataSources.length === 0) {
      throw new ReportValidationError("No data source specified");
    }

    const mainSource = getDataSource(String(dataSources[0]));
    if (!mainSource) {
      throw new ReportValidationError(`Unknown data source: ${dataSources[0]}`);
    }
    const mainTable = mainSource.table;
    const reportSource = REPORT_SOURCE_TABLES[mainTable];
    const tableObj = reportSource?.table;
    if (!reportSource || !tableObj) {
      throw new ReportValidationError(`Data source not queryable: ${mainTable}`);
    }

    // Validates a table/field pair against the shared report-builder config
    // and returns the real (snake_case) database column name.
    const canonField = (table: string, field: string): string => {
      const key = `${table}.${field}`;
      if (REMOVED_REPORT_FIELDS.has(key)) {
        throw new ReportValidationError(
          `Het veld ${key} bestaat niet meer en kan niet in een rapport worden gebruikt. Verwijder het uit dit rapport.`,
          "REPORT_FIELD_REMOVED",
          key,
        );
      }
      return RENAMED_REPORT_FIELDS[key] ?? field;
    };

    const resolveColumn = (table: string, rawField: string): string => {
      const field = canonField(table, rawField);
      const def = getReportField(table, field);
      if (!def) {
        throw new ReportValidationError(`Unknown field: ${table}.${field}`);
      }
      if (table !== mainTable) {
        throw new ReportValidationError(
          `Field ${table}.${field} does not belong to the selected data source (${mainTable})`
        );
      }
      const col = tableObj[field];
      if (!col || typeof col.name !== "string") {
        throw new ReportValidationError(`Field not queryable: ${table}.${field}`);
      }
      return col.name;
    };

    const identFor = (table: string, field: string) =>
      sql`${sql.identifier(mainTable)}.${sql.identifier(resolveColumn(table, field))}`;

    // The office day of a date field, per column type (the same reading the month grouping uses):
    // a real date as is, a timestamp in office time, a yyyy-mm-dd text through textDaySql.
    const dayExpr = (table: string, field: string): SQL => {
      const ident = identFor(table, field);
      const col = tableObj[canonField(table, field)];
      const isTimestamp = col?.columnType === "PgTimestamp" || col?.columnType === "PgTimestampString";
      const isRealDate = col?.columnType === "PgDate" || col?.columnType === "PgDateString";
      if (isRealDate) return ident;
      return isTimestamp ? officeDaySql(ident) : textDaySql(ident);
    };

    // A group expression. Per month: the calendar month in office time for a timestamp
    // column, the month of a yyyy-mm-dd text for a text date; plain: the column itself.
    const groupExpr = (table: string, field: string, period?: string) => {
      if (!period) return identFor(table, field);
      return sql`to_char(${dayExpr(table, field)}, 'YYYY-MM')`;
    };

    // Grouping: validate the period and the field, canonicalise the field name.
    const groups: { table: string; field: string; period?: "month" }[] = (Array.isArray(groupBy) ? groupBy : []).map((g: any) => {
      const field = canonField(g.table, g.field);
      resolveColumn(g.table, field);
      const key = `${g.table}.${field}`;
      let period: "month" | undefined;
      if (g.period !== undefined && g.period !== null) {
        if (g.period !== "month") {
          throw new ReportValidationError(
            `Groeperen per ${String(g.period)} kan niet; kies per maand.`,
            "REPORT_PERIOD_UNKNOWN",
            key,
          );
        }
        if (getReportField(g.table, field)?.type !== "date") {
          throw new ReportValidationError(
            `Groeperen per maand kan alleen op een datumveld, en ${key} is geen datum.`,
            "REPORT_PERIOD_NOT_DATE",
            key,
          );
        }
        period = "month";
      }
      return { table: g.table, field, period };
    });
    const findGroup = (table: string, field: string) =>
      groups.find((g) => g.table === table && g.field === canonField(table, field));

    // With a grouping or a calculated column, every plain column must be in the grouping.
    if (groups.length > 0 || columns.some((c: any) => c.aggregation)) {
      for (const col of columns) {
        if (!col.aggregation && !findGroup(col.table, col.field)) {
          const key = `${col.table}.${canonField(col.table, col.field)}`;
          throw new ReportValidationError(
            `De kolom ${key} staat niet in de groepering. Kies er een berekening bij of groepeer erop.`,
            "REPORT_COLUMN_NOT_GROUPED",
            key,
          );
        }
      }
    }

    // The same plain column twice cannot be grouped (one alias, one expression per month).
    if (groups.length > 0 || columns.some((c: any) => c.aggregation)) {
      const seen = new Set<string>();
      for (const col of columns) {
        if (col.aggregation) continue;
        const key = `${col.table}.${canonField(col.table, col.field)}`;
        if (seen.has(key)) {
          throw new ReportValidationError(
            `De kolom ${key} staat twee keer in het rapport. Haal de dubbele kolom weg.`,
            "REPORT_COLUMN_DUPLICATE",
            key,
          );
        }
        seen.add(key);
      }
    }

    // SELECT list — every column is aliased to its camelCase config name so the
    // frontend can read row[col.field] regardless of the DB column casing.
    const selectParts: SQL[] = columns.map((col: any) => {
      const ident = identFor(col.table, col.field);
      const alias = sql.identifier(String(col.field));
      if (col.aggregation) {
        const def = getReportField(col.table, canonField(col.table, col.field))!;
        const agg = String(col.aggregation).toUpperCase();
        if (agg !== "COUNT" && agg !== "COUNT_DISTINCT" && !def.aggregatable) {
          throw new ReportValidationError(
            `Field ${col.table}.${col.field} cannot be aggregated with ${agg}`
          );
        }
        switch (agg) {
          case "SUM":
            return sql`SUM(${ident}) AS ${alias}`;
          case "AVG":
            return sql`AVG(${ident}) AS ${alias}`;
          case "COUNT":
            return sql`COUNT(${ident}) AS ${alias}`;
          case "MIN":
            return sql`MIN(${ident}) AS ${alias}`;
          case "MAX":
            return sql`MAX(${ident}) AS ${alias}`;
          case "COUNT_DISTINCT":
            return sql`COUNT(DISTINCT ${ident}) AS ${alias}`;
          default:
            throw new ReportValidationError(`Unknown aggregation: ${col.aggregation}`);
        }
      }
      const group = findGroup(col.table, col.field);
      return sql`${group?.period ? groupExpr(col.table, col.field, group.period) : ident} AS ${alias}`;
    });

    // WHERE clause — operators validated per-field against the config,
    // all values passed as bound parameters (never string-concatenated).
    const whereParts: ReturnType<typeof sql>[] = [];
    for (const filter of Array.isArray(filters) ? filters : []) {
      const def = getReportField(filter.table, canonField(filter.table, filter.field));
      if (!def) {
        throw new ReportValidationError(`Unknown filter field: ${filter.table}.${filter.field}`);
      }
      const operator = String(filter.operator);
      if (!def.operators.includes(operator as any)) {
        throw new ReportValidationError(
          `Operator ${operator} is not allowed for ${filter.table}.${filter.field}`
        );
      }
      const ident = identFor(filter.table, filter.field);
      const value = filter.value;

      switch (operator) {
        case "equals":
          whereParts.push(sql`${ident} = ${value}`);
          break;
        case "not_equals":
          whereParts.push(sql`${ident} != ${value}`);
          break;
        case "contains":
          whereParts.push(sql`${ident} LIKE ${"%" + String(value) + "%"}`);
          break;
        case "not_contains":
          whereParts.push(sql`${ident} NOT LIKE ${"%" + String(value) + "%"}`);
          break;
        case "starts_with":
          whereParts.push(sql`${ident} LIKE ${String(value) + "%"}`);
          break;
        case "ends_with":
          whereParts.push(sql`${ident} LIKE ${"%" + String(value)}`);
          break;
        case "greater_than":
          whereParts.push(sql`${ident} > ${value}`);
          break;
        case "less_than":
          whereParts.push(sql`${ident} < ${value}`);
          break;
        case "greater_or_equal":
          whereParts.push(sql`${ident} >= ${value}`);
          break;
        case "less_or_equal":
          whereParts.push(sql`${ident} <= ${value}`);
          break;
        case "between": {
          const value2 = filter.value2;
          if (value === undefined || value === null || value2 === undefined || value2 === null) {
            throw new ReportValidationError(`Operator between requires two values`);
          }
          whereParts.push(sql`${ident} BETWEEN ${value} AND ${value2}`);
          break;
        }
        case "in":
        case "not_in": {
          const values = Array.isArray(value)
            ? value
            : String(value ?? "")
                .split(",")
                .map((v) => v.trim())
                .filter((v) => v.length > 0);
          if (values.length === 0) {
            throw new ReportValidationError(`Operator ${operator} requires at least one value`);
          }
          const list = sql.join(
            values.map((v: any) => sql`${v}`),
            sql`, `
          );
          whereParts.push(
            operator === "in" ? sql`${ident} IN (${list})` : sql`${ident} NOT IN (${list})`
          );
          break;
        }
        case "is_null":
          whereParts.push(sql`${ident} IS NULL`);
          break;
        case "is_not_null":
          whereParts.push(sql`${ident} IS NOT NULL`);
          break;
        default:
          throw new ReportValidationError(`Unknown operator: ${operator}`);
      }
    }

    // The scope of a tab: the period on the report's own date field and one vehicle. Always
    // bound parameters. No period field (or no scope) means the whole table; a source without
    // a vehicle column ignores the vehicle.
    if (scope !== undefined && scope !== null) {
      const YMD = /^\d{4}-\d{2}-\d{2}$/;
      const validDay = (v: unknown) => typeof v === "string" && isRealDate(v);
      // No from and to at all: no period (a report without a period field, or all data).
      const noPeriod = typeof scope === "object" && scope.from === undefined && scope.to === undefined;
      if (typeof scope !== "object" || (!noPeriod && (!validDay(scope.from) || !validDay(scope.to)))
        || (scope.vehicleId !== undefined && scope.vehicleId !== null && !Number.isInteger(scope.vehicleId))) {
        throw new ReportValidationError("De periode klopt niet; kies een begin- en einddatum.", "REPORT_SCOPE_INVALID");
      }
      const periodField = configuration?.periodField;
      if (periodField !== undefined && periodField !== null && periodField !== "") {
        if (!isReportPeriodField(mainSource.id, canonField(mainTable, String(periodField)))) {
          throw new ReportValidationError(
            `Het periodeveld ${mainTable}.${String(periodField)} is geen datumveld van deze bron.`,
            "REPORT_PERIOD_FIELD_INVALID",
            `${mainTable}.${String(periodField)}`,
          );
        }
        if (!noPeriod) {
          const day = dayExpr(mainTable, String(periodField));
          whereParts.push(sql`${day} >= ${scope.from}::date AND ${day} <= ${scope.to}::date`);
        }
      }
      if (scope.vehicleId !== undefined && scope.vehicleId !== null && mainSource.vehicleField) {
        whereParts.push(sql`${identFor(mainTable, mainSource.vehicleField)} = ${scope.vehicleId}`);
      }
    }

    // The source's fixed conditions (recycle bin, maintenance blocks only, voided).
    whereParts.push(...(reportSource.baseWhere?.(Array.isArray(filters) ? filters : []) ?? []));

    // A per-month expression holds a bound time zone; the same expression written twice
    // would get two parameters and Postgres would not see them as equal. So a month group
    // is referred to by its position in the select list (a hidden column when the report
    // does not show it); a plain group is the column itself.
    const hiddenAliases: string[] = [];
    const groupRefs: SQL[] = groups.map((g) => {
      if (!g.period) return identFor(g.table, g.field);
      const position = columns.findIndex((c: any) => !c.aggregation && c.table === g.table && canonField(c.table, c.field) === g.field);
      if (position >= 0) return sql.raw(String(position + 1));
      const alias = `__group_${hiddenAliases.length}`;
      hiddenAliases.push(alias);
      selectParts.push(sql`${groupExpr(g.table, g.field, g.period)} AS ${sql.identifier(alias)}`);
      return sql.raw(String(selectParts.length));
    });

    let query = sql`SELECT ${sql.join(selectParts, sql`, `)} FROM ${reportSource.from}`;
    if (whereParts.length > 0) {
      query = sql`${query} WHERE ${sql.join(whereParts, sql` AND `)}`;
    }
    if (groupRefs.length > 0) {
      query = sql`${query} GROUP BY ${sql.join(groupRefs, sql`, `)}`;
      query = sql`${query} ORDER BY ${sql.join(groupRefs.map((g) => sql`${g} ASC NULLS LAST`), sql`, `)}`;
    }
    query = sql`${query} LIMIT 1000`;

    const results = await db.execute(query);
    if (hiddenAliases.length > 0) {
      for (const row of results.rows as Record<string, unknown>[]) {
        for (const alias of hiddenAliases) delete row[alias];
      }
    }
    return results.rows;
  }

  // Damage Check Template methods
  async getAllDamageCheckTemplates(): Promise<DamageCheckTemplate[]> {
    return await db.select().from(damageCheckTemplates).orderBy(damageCheckTemplates.name);
  }

  async getDamageCheckTemplate(id: number): Promise<DamageCheckTemplate | undefined> {
    const [template] = await db.select().from(damageCheckTemplates).where(eq(damageCheckTemplates.id, id));
    return template || undefined;
  }

  async getDamageCheckTemplatesByVehicle(make?: string, model?: string, type?: string): Promise<DamageCheckTemplate[]> {
    const conditions = [];
    
    // Build filter conditions - match specific make/model/type or generic templates (null values)
    if (make) {
      conditions.push(or(eq(damageCheckTemplates.vehicleMake, make), isNull(damageCheckTemplates.vehicleMake)));
    }
    if (model) {
      conditions.push(or(eq(damageCheckTemplates.vehicleModel, model), isNull(damageCheckTemplates.vehicleModel)));
    }
    if (type) {
      conditions.push(or(eq(damageCheckTemplates.vehicleType, type), isNull(damageCheckTemplates.vehicleType)));
    }
    
    if (conditions.length === 0) {
      // No filters - return all templates
      return await db.select().from(damageCheckTemplates).orderBy(damageCheckTemplates.name);
    }
    
    return await db.select().from(damageCheckTemplates)
      .where(and(...conditions))
      .orderBy(damageCheckTemplates.name);
  }

  async getDefaultDamageCheckTemplate(): Promise<DamageCheckTemplate | undefined> {
    const [template] = await db.select().from(damageCheckTemplates)
      .where(eq(damageCheckTemplates.isDefault, true))
      .limit(1);

    // If no default template exists, auto-create one with the shared default
    // canvas layout, which includes an auto-matched vehicle diagram field.
    if (!template) {
      const defaultTemplate: InsertDamageCheckTemplate = {
        name: 'Auto-Generated Default',
        description: 'Automatically created default damage check template',
        vehicleMake: null,
        vehicleModel: null,
        vehicleType: null,
        buildYearFrom: null,
        buildYearTo: null,
        isDefault: true,
        language: 'nl',
        canvasFields: buildDefaultDamageCheckCanvasFields() as any,
        createdBy: 'system',
        updatedBy: 'system'
      };

      const [created] = await db.insert(damageCheckTemplates).values(defaultTemplate).returning();
      return created;
    }

    // Backfill: a default template created before canvas-mode diagrams
    // existed has an empty canvasFields array, which renders with the legacy
    // structured layout — a layout that no longer has any diagram section
    // now that the 4-slot mechanism is removed. Give it the shared default
    // canvas layout (which includes an auto-matched diagram field) once, in
    // place, so out-of-the-box PDFs always include a vehicle diagram.
    const existingCanvasFields = Array.isArray((template as any).canvasFields) ? (template as any).canvasFields : [];
    if (existingCanvasFields.length === 0) {
      const [updated] = await db.update(damageCheckTemplates)
        .set({ canvasFields: buildDefaultDamageCheckCanvasFields() as any, updatedAt: new Date() })
        .where(eq(damageCheckTemplates.id, template.id))
        .returning();
      return updated || template;
    }

    return template;
  }

  async createDamageCheckTemplate(template: InsertDamageCheckTemplate): Promise<DamageCheckTemplate> {
    return await db.transaction(async (tx) => {
      // Atomic: if this new template is marked default, unset all others first
      // so we never end up with multiple defaults at the same time.
      if (template.isDefault) {
        await tx
          .update(damageCheckTemplates)
          .set({ isDefault: false })
          .where(eq(damageCheckTemplates.isDefault, true));
      }
      const [newTemplate] = await tx
        .insert(damageCheckTemplates)
        .values(template)
        .returning();
      return newTemplate;
    });
  }

  async updateDamageCheckTemplate(id: number, templateData: Partial<InsertDamageCheckTemplate>): Promise<DamageCheckTemplate | undefined> {
    return await db.transaction(async (tx) => {
      // Atomic: if this update sets isDefault=true, unset it on every other row
      // so only this template ends up as the default.
      if (templateData.isDefault === true) {
        await tx
          .update(damageCheckTemplates)
          .set({ isDefault: false })
          .where(
            and(
              eq(damageCheckTemplates.isDefault, true),
              ne(damageCheckTemplates.id, id),
            ),
          );
      }
      const updateData = {
        ...templateData,
        updatedAt: new Date(),
      };
      const [updatedTemplate] = await tx
        .update(damageCheckTemplates)
        .set(updateData)
        .where(eq(damageCheckTemplates.id, id))
        .returning();
      return updatedTemplate || undefined;
    });
  }

  /**
   * Atomically marks a single template as the default and unsets every other
   * template's isDefault flag. Used by the dedicated "Set as Default" button
   * in the templates list.
   */
  async setDefaultDamageCheckTemplate(id: number): Promise<DamageCheckTemplate | undefined> {
    return await db.transaction(async (tx) => {
      await tx
        .update(damageCheckTemplates)
        .set({ isDefault: false })
        .where(
          and(
            eq(damageCheckTemplates.isDefault, true),
            ne(damageCheckTemplates.id, id),
          ),
        );
      const [updated] = await tx
        .update(damageCheckTemplates)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(damageCheckTemplates.id, id))
        .returning();
      return updated || undefined;
    });
  }

  /**
   * Creates a copy of an existing template. The clone is always created as
   * NOT default (so cloning never disturbs which template is currently the
   * default). Optionally accepts a new name; otherwise appends "(Copy)".
   */
  async cloneDamageCheckTemplate(
    sourceId: number,
    newName?: string,
    createdBy?: string,
  ): Promise<DamageCheckTemplate | undefined> {
    const [source] = await db
      .select()
      .from(damageCheckTemplates)
      .where(eq(damageCheckTemplates.id, sourceId));
    if (!source) return undefined;
    const insertData: InsertDamageCheckTemplate = {
      name: newName?.trim() || `${source.name} (Copy)`,
      description: source.description ?? null,
      vehicleMake: source.vehicleMake ?? null,
      vehicleModel: source.vehicleModel ?? null,
      vehicleType: source.vehicleType ?? null,
      buildYearFrom: source.buildYearFrom ?? null,
      buildYearTo: source.buildYearTo ?? null,
      canvasFields: (source as any).canvasFields ?? [],
      headerText: (source as any).headerText ?? null,
      footerText: (source as any).footerText ?? null,
      isDefault: false,
      language: source.language,
      createdBy: createdBy ?? null,
      updatedBy: createdBy ?? null,
    };
    const [created] = await db
      .insert(damageCheckTemplates)
      .values(insertData)
      .returning();
    return created || undefined;
  }

  async deleteDamageCheckTemplate(id: number): Promise<boolean> {
    const result = await db.delete(damageCheckTemplates).where(eq(damageCheckTemplates.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Vehicle Diagram Template methods
  async getAllVehicleDiagramTemplates(): Promise<VehicleDiagramTemplate[]> {
    return await db.select().from(vehicleDiagramTemplates).orderBy(vehicleDiagramTemplates.make, vehicleDiagramTemplates.model);
  }

  async getVehicleDiagramTemplate(id: number): Promise<VehicleDiagramTemplate | undefined> {
    const [template] = await db.select().from(vehicleDiagramTemplates).where(eq(vehicleDiagramTemplates.id, id));
    return template || undefined;
  }

  async getVehicleDiagramTemplateByVehicle(make: string, model: string, year?: number): Promise<VehicleDiagramTemplate | undefined> {
    // Normalize inputs for case-insensitive comparison
    const normalizedMake = make.trim().toLowerCase();
    const normalizedModel = model.trim().toLowerCase();
    
    console.log(`Searching for template - Input: make="${make}", model="${model}", year=${year}`);
    console.log(`Normalized: make="${normalizedMake}", model="${normalizedModel}"`);
    
    // Get all templates and filter in JavaScript for case-insensitive matching
    const allTemplates = await db.select().from(vehicleDiagramTemplates);
    console.log(`Found ${allTemplates.length} total templates in database`);
    
    // Strategy 1: Exact make + model + year match
    if (year) {
      const exactMatch = allTemplates.find(template => {
        const templateMake = template.make.trim().toLowerCase();
        const templateModel = template.model.trim().toLowerCase();
        const yearMatches = (
          (template.yearFrom === null || template.yearFrom <= year) &&
          (template.yearTo === null || template.yearTo >= year)
        );
        return templateMake === normalizedMake && templateModel === normalizedModel && yearMatches;
      });
      
      if (exactMatch) {
        console.log(`✅ Strategy 1: Found exact match with year: template ${exactMatch.id}`);
        return exactMatch;
      }
    }
    
    // Strategy 2: Exact make + model without year constraints
    const exactModelMatch = allTemplates.find(template => {
      const templateMake = template.make.trim().toLowerCase();
      const templateModel = template.model.trim().toLowerCase();
      return templateMake === normalizedMake && templateModel === normalizedModel;
    });
    
    if (exactModelMatch) {
      console.log(`✅ Strategy 2: Found exact model match (ignoring year): template ${exactModelMatch.id}`);
      return exactModelMatch;
    }
    
    // Strategy 3: Partial model match (e.g., "FIAT DUCATO" contains "DUCATO")
    const partialMatch = allTemplates.find(template => {
      const templateMake = template.make.trim().toLowerCase();
      const templateModel = template.model.trim().toLowerCase();
      
      // Check if makes match and models partially match
      const makeMatches = templateMake === normalizedMake;
      const modelPartialMatch = 
        normalizedModel.includes(templateModel) || 
        templateModel.includes(normalizedModel);
      
      return makeMatches && modelPartialMatch;
    });
    
    if (partialMatch) {
      console.log(`✅ Strategy 3: Found partial model match: template ${partialMatch.id}`);
      return partialMatch;
    }
    
    // Strategy 4: Just make match (as last resort)
    const makeOnlyMatch = allTemplates.find(template => {
      const templateMake = template.make.trim().toLowerCase();
      return templateMake === normalizedMake;
    });
    
    if (makeOnlyMatch) {
      console.log(`✅ Strategy 4: Found make-only match (fallback): template ${makeOnlyMatch.id}`);
      return makeOnlyMatch;
    }
    
    // Strategy 5: Return any template as absolute fallback
    const anyTemplate = allTemplates[0];
    if (anyTemplate) {
      console.log(`⚠️ Strategy 5: No match found, using first available template: ${anyTemplate.id}`);
      return anyTemplate;
    }
    
    console.log(`❌ No templates available in database`);
    return undefined;
  }

  async createVehicleDiagramTemplate(template: InsertVehicleDiagramTemplate): Promise<VehicleDiagramTemplate> {
    const [newTemplate] = await db.insert(vehicleDiagramTemplates).values(template).returning();
    return newTemplate;
  }

  async updateVehicleDiagramTemplate(id: number, templateData: Partial<InsertVehicleDiagramTemplate>): Promise<VehicleDiagramTemplate | undefined> {
    const updateData = {
      ...templateData,
      updatedAt: new Date()
    };
    
    const [updatedTemplate] = await db
      .update(vehicleDiagramTemplates)
      .set(updateData)
      .where(eq(vehicleDiagramTemplates.id, id))
      .returning();
      
    return updatedTemplate || undefined;
  }

  async deleteVehicleDiagramTemplate(id: number): Promise<boolean> {
    const result = await db.delete(vehicleDiagramTemplates).where(eq(vehicleDiagramTemplates.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async unlinkDiagramTemplateFromDamageChecks(templateId: number): Promise<void> {
    // Set diagram_template_id to NULL for all damage checks using this template
    await db
      .update(interactiveDamageChecks)
      .set({ diagramTemplateId: null })
      .where(eq(interactiveDamageChecks.diagramTemplateId, templateId));
  }

  // Interactive Damage Check methods
  async getAllInteractiveDamageChecks(): Promise<InteractiveDamageCheck[]> {
    return await db.select().from(interactiveDamageChecks).orderBy(desc(interactiveDamageChecks.checkDate));
  }

  /**
   * FIX-T (BUG-216, technical half) — the damage-check list without its images.
   *
   * `interactive_damage_checks` is 18 MB for 14 rows because
   * `diagram_with_annotations` holds a ~1.3 MB base64 PNG per row, and the
   * signatures another two. `GET /api/interactive-damage-checks` served all of
   * it — 17 MB, 266 ms, 2.5 s under ten parallel — to the calendar's admin
   * history dialog, which reads `reservationId`, `checkDate`/`createdAt` and
   * `completedBy` and renders none of the images (it links to the PDF route
   * instead). This projection is what that list gets.
   *
   * Every read that *does* need the images — by id, by vehicle, by
   * reservation, the PDF generator — is unchanged.
   *
   * Note: whether those blobs should live in text columns at all is BUG-216's
   * open question for the owner (OPT-033). This changes only which columns the
   * list endpoint selects.
   */
  async getInteractiveDamageCheckSummaries(): Promise<Array<Omit<InteractiveDamageCheck,
    'diagramWithAnnotations' | 'drawingPaths' | 'damageMarkers' | 'checklistData' | 'renterSignature' | 'customerSignature'>>> {
    return await db
      .select({
        id: interactiveDamageChecks.id,
        vehicleId: interactiveDamageChecks.vehicleId,
        reservationId: interactiveDamageChecks.reservationId,
        checkType: interactiveDamageChecks.checkType,
        checkDate: interactiveDamageChecks.checkDate,
        diagramTemplateId: interactiveDamageChecks.diagramTemplateId,
        notes: interactiveDamageChecks.notes,
        mileage: interactiveDamageChecks.mileage,
        fuelLevel: interactiveDamageChecks.fuelLevel,
        completedBy: interactiveDamageChecks.completedBy,
        createdAt: interactiveDamageChecks.createdAt,
        updatedAt: interactiveDamageChecks.updatedAt,
        createdBy: interactiveDamageChecks.createdBy,
        updatedBy: interactiveDamageChecks.updatedBy,
      })
      .from(interactiveDamageChecks)
      .orderBy(desc(interactiveDamageChecks.checkDate)) as any;
  }

  /**
   * FIX-T (BUG-216, technical half) — the three columns the mileage report
   * actually reads. The old km-per-month report called
   * `getAllInteractiveDamageChecks()`, so it pulled 17 MB of base64 through
   * Postgres and Node (104 ms of its 127 ms of SQL time) to look at an integer.
   */
  async getDamageCheckMileageReadings(): Promise<Array<{
    id: number;
    vehicleId: number | null;
    reservationId: number | null;
    checkType: string | null;
    checkDate: string | Date | null;
    mileage: number | null;
    createdAt: Date | null;
  }>> {
    return await db
      .select({
        id: interactiveDamageChecks.id,
        vehicleId: interactiveDamageChecks.vehicleId,
        reservationId: interactiveDamageChecks.reservationId,
        checkType: interactiveDamageChecks.checkType,
        checkDate: interactiveDamageChecks.checkDate,
        mileage: interactiveDamageChecks.mileage,
        createdAt: interactiveDamageChecks.createdAt,
      })
      .from(interactiveDamageChecks)
      .orderBy(desc(interactiveDamageChecks.checkDate)) as any;
  }

  async getInteractiveDamageCheck(id: number): Promise<InteractiveDamageCheck | undefined> {
    const [check] = await db.select().from(interactiveDamageChecks).where(eq(interactiveDamageChecks.id, id));
    return check || undefined;
  }

  async getInteractiveDamageChecksByVehicle(vehicleId: number): Promise<InteractiveDamageCheck[]> {
    return await db.select().from(interactiveDamageChecks)
      .where(eq(interactiveDamageChecks.vehicleId, vehicleId))
      .orderBy(desc(interactiveDamageChecks.checkDate));
  }

  async getInteractiveDamageChecksByReservation(reservationId: number): Promise<InteractiveDamageCheck[]> {
    return await db.select().from(interactiveDamageChecks)
      .where(eq(interactiveDamageChecks.reservationId, reservationId))
      .orderBy(desc(interactiveDamageChecks.checkDate));
  }

  async getRecentDamageChecksByVehicleAndCustomer(vehicleId: number, customerId: number, limit: number = 3): Promise<InteractiveDamageCheck[]> {
    // Get damage checks for this vehicle where the reservation belongs to the customer
    const checks = await db
      .select({
        id: interactiveDamageChecks.id,
        vehicleId: interactiveDamageChecks.vehicleId,
        reservationId: interactiveDamageChecks.reservationId,
        checkType: interactiveDamageChecks.checkType,
        checkDate: interactiveDamageChecks.checkDate,
        diagramTemplateId: interactiveDamageChecks.diagramTemplateId,
        damageMarkers: interactiveDamageChecks.damageMarkers,
        drawingPaths: interactiveDamageChecks.drawingPaths,
        diagramWithAnnotations: interactiveDamageChecks.diagramWithAnnotations,
        checklistData: interactiveDamageChecks.checklistData,
        notes: interactiveDamageChecks.notes,
        mileage: interactiveDamageChecks.mileage,
        fuelLevel: interactiveDamageChecks.fuelLevel,
        renterSignature: interactiveDamageChecks.renterSignature,
        customerSignature: interactiveDamageChecks.customerSignature,
        completedBy: interactiveDamageChecks.completedBy,
        createdAt: interactiveDamageChecks.createdAt,
        updatedAt: interactiveDamageChecks.updatedAt,
        createdBy: interactiveDamageChecks.createdBy,
        updatedBy: interactiveDamageChecks.updatedBy,
      })
      .from(interactiveDamageChecks)
      .leftJoin(reservations, eq(interactiveDamageChecks.reservationId, reservations.id))
      .where(
        and(
          eq(interactiveDamageChecks.vehicleId, vehicleId),
          eq(reservations.customerId, customerId)
        )
      )
      .orderBy(desc(interactiveDamageChecks.checkDate))
      .limit(limit);
    
    return checks;
  }

  async createInteractiveDamageCheck(check: InsertInteractiveDamageCheck, createdBy?: string): Promise<InteractiveDamageCheck> {
    const [newCheck] = await db.insert(interactiveDamageChecks).values({
      ...check,
      createdBy,
      updatedBy: createdBy,
    }).returning();
    return newCheck;
  }

  async updateInteractiveDamageCheck(id: number, checkData: Partial<InsertInteractiveDamageCheck>, updatedBy?: string): Promise<InteractiveDamageCheck | undefined> {
    const updateData = {
      ...checkData,
      updatedAt: new Date(),
      updatedBy,
    };
    
    const [updatedCheck] = await db
      .update(interactiveDamageChecks)
      .set(updateData)
      .where(eq(interactiveDamageChecks.id, id))
      .returning();
      
    return updatedCheck || undefined;
  }

  async deleteInteractiveDamageCheck(id: number): Promise<boolean> {
    // First, get the damage check to retrieve the PDF path and metadata
    const [damageCheck] = await db.select().from(interactiveDamageChecks).where(eq(interactiveDamageChecks.id, id));
    
    if (!damageCheck) {
      return false;
    }
    
    // Delete the damage check record
    const result = await db.delete(interactiveDamageChecks).where(eq(interactiveDamageChecks.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Vehicle-Customer Blacklist methods
  async getBlacklistedCustomersForVehicle(vehicleId: number): Promise<VehicleCustomerBlacklist[]> {
    return await db.select()
      .from(vehicleCustomerBlacklist)
      .where(eq(vehicleCustomerBlacklist.vehicleId, vehicleId))
      .orderBy(desc(vehicleCustomerBlacklist.createdAt));
  }

  async getBlacklistedVehiclesForCustomer(customerId: number): Promise<VehicleCustomerBlacklist[]> {
    return await db.select()
      .from(vehicleCustomerBlacklist)
      .where(eq(vehicleCustomerBlacklist.customerId, customerId))
      .orderBy(desc(vehicleCustomerBlacklist.createdAt));
  }

  async addToBlacklist(entry: InsertVehicleCustomerBlacklist): Promise<VehicleCustomerBlacklist> {
    const [blacklistEntry] = await db.insert(vehicleCustomerBlacklist)
      .values(entry)
      .returning();
    return blacklistEntry;
  }

  async removeFromBlacklist(id: number): Promise<boolean> {
    const result = await db.delete(vehicleCustomerBlacklist)
      .where(eq(vehicleCustomerBlacklist.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async isCustomerBlacklistedForVehicle(vehicleId: number, customerId: number): Promise<boolean> {
    const [entry] = await db.select()
      .from(vehicleCustomerBlacklist)
      .where(and(
        eq(vehicleCustomerBlacklist.vehicleId, vehicleId),
        eq(vehicleCustomerBlacklist.customerId, customerId)
      ))
      .limit(1);
    return !!entry;
  }
}