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
  deletedRecords, type DeletedRecord
} from "../shared/schema";
import {
  getVehicleStatusContext,
  getStatusOnPickup,
  getStatusOnReturn,
  VehicleAvailabilityStatus
} from "./vehicle-status-helper";
import { getDataSource, getField as getReportField } from "../shared/report-builder-config";
import { buildDefaultDamageCheckCanvasFields } from "../shared/damage-check-default-layout";

export class ReportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportValidationError";
  }
}
import { addMonths, addDays, parseISO, isBefore, isAfter, isEqual } from "date-fns";
import { db } from "./db";
import { eq, ne, and, gte, lte, desc, sql, inArray, not, or, ilike, isNull, isNotNull, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { IStorage } from "./storage";
import { formatVehicleBarcode, parseBarcode, normalizeScannedCode } from "../shared/barcode";
import * as fs from "fs";
import * as path from "path";

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
  
  async updateUser(id: number, userData: Partial<InsertUser>): Promise<User | undefined> {
    // Don't allow updating the password through this method
    // Password updates should use a dedicated method with proper hashing
    if (userData.password) {
      delete userData.password;
    }
    
    // Add updatedAt timestamp
    const updateData = {
      ...userData,
      updatedAt: new Date()
    };
    
    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
      
    return updatedUser;
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
  
  async setMileageOverridePassword(id: number, hashedPassword: string | null): Promise<boolean> {
    const result = await db
      .update(users)
      .set({
        mileageOverridePasswordHash: hashedPassword,
        updatedAt: new Date()
      })
      .where(eq(users.id, id));
      
    return (result.rowCount ?? 0) > 0;
  }
  
  async getMileageOverridePasswordHash(id: number): Promise<string | null> {
    const [user] = await db
      .select({ mileageOverridePasswordHash: users.mileageOverridePasswordHash })
      .from(users)
      .where(eq(users.id, id));
      
    return user?.mileageOverridePasswordHash || null;
  }
  
  async deleteUser(id: number): Promise<boolean> {
    try {
      const result = await db.delete(users).where(eq(users.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error('Error deleting user:', error);
      return false;
    }
  }

  // Vehicle methods
  async getAllVehicles(searchQuery?: string): Promise<Vehicle[]> {
    if (!searchQuery) {
      return await db.select().from(vehicles);
    }
    
    // Sanitize the search query to handle license plates with or without dashes
    const sanitizedQuery = searchQuery.replace(/-/g, "").toUpperCase();

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
          sql`UPPER(replace(${vehicles.barcode}, '-', '')) LIKE ${`%${sanitizedQuery}%`}`
        )
      )
      .limit(10);
  }

  // Sync vehicle availability status with active reservations
  // This function manages automatic status transitions: "available" ↔ "scheduled" ↔ "rented"
  // It preserves manual statuses like "needs_fixing" and "not_for_rental"
  async syncVehicleAvailabilityWithReservations(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const thirtyDaysDate = thirtyDaysFromNow.toISOString().split('T')[0];
    
    // Get all vehicles with active reservations (currently rented - covers today)
    // INCLUDES: reservations within date range OR overdue picked_up reservations (customer still has vehicle)
    const activeReservations = await db
      .select({ vehicleId: reservations.vehicleId })
      .from(reservations)
      .where(
        and(
          sql`${reservations.status} != 'cancelled'`,
          sql`${reservations.status} != 'returned'`,
          sql`${reservations.status} != 'completed'`,
          sql`${reservations.type} != 'maintenance_block'`, // Exclude maintenance
          isNull(reservations.deletedAt),
          sql`${reservations.vehicleId} IS NOT NULL`,
          or(
            // Normal active: started and not ended
            and(
              sql`${reservations.startDate} <= ${today}`,
              or(
                sql`${reservations.endDate} >= ${today}`,
                isNull(reservations.endDate) // Include open-ended rentals
              )
            ),
            // Overdue: past end date but still picked_up (customer still has the car!)
            and(
              sql`${reservations.status} = 'picked_up'`,
              sql`${reservations.endDate} < ${today}`
            )
          )
        )
      );
    
    // Filter out null vehicle IDs to prevent SQL query issues (e.g., from placeholder reservations)
    const rentedVehicleIds = new Set(
      activeReservations
        .map(r => r.vehicleId)
        .filter((id): id is number => id !== null && id !== undefined)
    );
    
    // Get all vehicles with upcoming reservations (within 30 days, not yet started)
    const upcomingReservations = await db
      .select({ vehicleId: reservations.vehicleId })
      .from(reservations)
      .where(
        and(
          sql`${reservations.status} != 'cancelled'`,
          sql`${reservations.status} != 'returned'`,
          sql`${reservations.status} != 'completed'`,
          sql`${reservations.type} != 'maintenance_block'`, // Exclude maintenance
          isNull(reservations.deletedAt),
          sql`${reservations.vehicleId} IS NOT NULL`,
          sql`${reservations.startDate} > ${today}`, // Starts in the future
          sql`${reservations.startDate} <= ${thirtyDaysDate}` // Within 30 days
        )
      );
    
    // Filter out null vehicle IDs to prevent SQL query issues
    const scheduledVehicleIds = new Set(
      upcomingReservations
        .map(r => r.vehicleId)
        .filter((id): id is number => id !== null && id !== undefined)
    );
    
    // Priority 1: Set vehicles to "rented" if they have active reservations
    // ONLY update "available" or "scheduled" vehicles
    if (rentedVehicleIds.size > 0) {
      await db
        .update(vehicles)
        .set({ availabilityStatus: 'rented' })
        .where(
          and(
            inArray(vehicles.id, Array.from(rentedVehicleIds)),
            or(
              eq(vehicles.availabilityStatus, 'available'),
              eq(vehicles.availabilityStatus, 'scheduled')
            )
          )
        );
    }
    
    // Priority 2: Set vehicles to "scheduled" if they have upcoming reservations (but not currently rented)
    // ONLY update "available" vehicles
    const scheduledNotRented = Array.from(scheduledVehicleIds).filter(id => !rentedVehicleIds.has(id));
    if (scheduledNotRented.length > 0) {
      await db
        .update(vehicles)
        .set({ availabilityStatus: 'scheduled' })
        .where(
          and(
            inArray(vehicles.id, scheduledNotRented),
            eq(vehicles.availabilityStatus, 'available')
          )
        );
    }
    
    // Priority 3: Reset vehicles back to "available" when they have no active or upcoming reservations
    // This preserves the business rule: manual statuses are never overwritten
    const allReservedVehicleIds = new Set([...rentedVehicleIds, ...scheduledVehicleIds]);
    
    if (allReservedVehicleIds.size > 0) {
      await db
        .update(vehicles)
        .set({ availabilityStatus: 'available' })
        .where(
          and(
            or(
              eq(vehicles.availabilityStatus, 'rented'),
              eq(vehicles.availabilityStatus, 'scheduled')
            ),
            notInArray(vehicles.id, Array.from(allReservedVehicleIds))
          )
        );
    } else {
      // If no vehicles have reservations, reset all vehicles with "rented" or "scheduled" status
      await db
        .update(vehicles)
        .set({ availabilityStatus: 'available' })
        .where(
          or(
            eq(vehicles.availabilityStatus, 'rented'),
            eq(vehicles.availabilityStatus, 'scheduled')
          )
        );
    }
  }

  async getVehicle(id: number): Promise<Vehicle | undefined> {
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id));
    return vehicle || undefined;
  }

  async createVehicle(vehicleData: InsertVehicle): Promise<Vehicle> {
    const [vehicle] = await db.insert(vehicles).values(vehicleData).returning();
    if (!vehicle.barcode) {
      const [updated] = await db
        .update(vehicles)
        .set({ barcode: formatVehicleBarcode(vehicle.id) })
        .where(eq(vehicles.id, vehicle.id))
        .returning();
      return updated;
    }
    return vehicle;
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
    const nextRevision = match ? parseInt(match[1], 10) + 1 : 2;
    const newBarcode = formatVehicleBarcode(id, nextRevision);
    const [updated] = await db
      .update(vehicles)
      .set({ barcode: newBarcode, updatedBy: updatedBy ?? vehicle.updatedBy, updatedAt: new Date() })
      .where(eq(vehicles.id, id))
      .returning();
    return updated;
  }

  async updateVehicle(id: number, vehicleData: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
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
  
  async getVehicleDeleteImpact(id: number): Promise<{
    vehicle: Vehicle;
    counts: Record<string, number>;
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
      },
    };
  }

  /**
   * Deleting a vehicle wipes its reservations, documents, expenses and damage
   * checks with it. Everything is snapshotted into `deleted_records` inside the
   * same transaction first, so the delete stays reversible via
   * restoreDeletedRecord() and always leaves a trace of who did it.
   */
  async deleteVehicle(
    id: number,
    actor?: { username?: string | null; userId?: number | null }
  ): Promise<boolean> {
    // Start a transaction to ensure all related records are deleted
    return await db.transaction(async (tx) => {
      try {
        const [vehicle] = await tx.select().from(vehicles).where(eq(vehicles.id, id));
        if (!vehicle) return false;

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
          },
          relatedCounts: {
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

        return !!deleted;
      } catch (error) {
        console.error("Error during vehicle deletion transaction:", error);
        throw error;
      }
    });
  }

  async getDeletedRecords(limit = 100): Promise<DeletedRecord[]> {
    return await db
      .select()
      .from(deletedRecords)
      .orderBy(desc(deletedRecords.deletedAt))
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
  ): Promise<{ restored: boolean; reason?: string; record?: DeletedRecord }> {
    const record = await this.getDeletedRecord(id);
    if (!record) return { restored: false, reason: 'not_found' };
    if (record.restoredAt) return { restored: false, reason: 'already_restored', record };
    if (record.entityType !== 'vehicle') return { restored: false, reason: 'unsupported_type', record };

    const payload = record.payload as any;
    const vehicle = payload?.vehicle;
    if (!vehicle) return { restored: false, reason: 'empty_snapshot', record };

    // The id may have been taken by a later insert, and the license plate may
    // have been re-created by hand after the delete (which is exactly what
    // people do when a vehicle disappears). Both block a clean restore.
    const [idTaken] = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, vehicle.id));
    if (idTaken) return { restored: false, reason: 'id_taken', record };

    const [plateTaken] = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.licensePlate, vehicle.licensePlate));
    if (plateTaken) return { restored: false, reason: 'license_plate_taken', record };

    await db.transaction(async (tx) => {
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

      await tx
        .update(deletedRecords)
        .set({ restoredAt: new Date(), restoredBy: actor?.username || null })
        .where(eq(deletedRecords.id, id));
    });

    return { restored: true, record };
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

  async deleteCustomer(id: number): Promise<boolean> {
    const deletedRows = await db
      .delete(customers)
      .where(eq(customers.id, id));
    
    return (deletedRows.rowCount ?? 0) > 0;
  }

  // Reservation methods
  async getAllReservations(searchQuery?: string): Promise<Reservation[]> {
    let reservationsData;
    
    // A scanned reservation barcode (RES-000123) resolves straight to that
    // reservation by id, so scanner input works in reservation search boxes.
    const parsedCode = searchQuery ? parseBarcode(searchQuery) : null;

    if (searchQuery && parsedCode?.kind === "reservation") {
      reservationsData = await db.select()
        .from(reservations)
        .where(and(eq(reservations.id, parsedCode.reservationId), isNull(reservations.deletedAt)))
        .limit(1);
    } else if (searchQuery) {
      // Sanitize the search query to handle license plates with or without dashes
      const sanitizedQuery = searchQuery.replace(/-/g, "").toUpperCase();

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
            sql`UPPER(replace(${vehicles.barcode}, '-', '')) LIKE ${`%${sanitizedQuery}%`}`
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
                sql`UPPER(${reservations.status}) LIKE ${`%${sanitizedQuery}%`}`
              ),
              isNull(reservations.deletedAt)
            )
          )
          .limit(10);
      }
    } else {
      reservationsData = await db.select().from(reservations).where(isNull(reservations.deletedAt));
    }
    
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
    
    const [c] = await db.select().from(customers).where(eq(customers.id, reservation.customerId));
    
    return {
      ...reservation,
      vehicle,
      customer: c ?? undefined
    };
  }

  async createReservation(reservationData: InsertReservation): Promise<Reservation> {
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

    // Handle null vehicleId for placeholder spare reservations
    let vehicle: Vehicle | undefined = undefined;
    if (reservation.vehicleId !== null) {
      const [v] = await db.select().from(vehicles).where(eq(vehicles.id, reservation.vehicleId));
      vehicle = v ?? undefined;
    }

    const [c] = await db.select().from(customers).where(eq(customers.id, reservation.customerId));

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
    const [existing] = await db.select().from(vehicleTransports).where(eq(vehicleTransports.reservationId, reservation.id));

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

    const [c] = await db.select().from(customers).where(eq(customers.id, updatedReservation.customerId));

    return {
      ...updatedReservation,
      vehicle,
      customer: c ?? undefined
    };
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
    const reservationsData = await db
      .select()
      .from(reservations)
      .where(
        sql`((${reservations.startDate} <= ${endDate} AND ${reservations.endDate} >= ${startDate})
            OR (${reservations.startDate} >= ${startDate} AND ${reservations.startDate} <= ${endDate})
            OR (${reservations.endDate} >= ${startDate} AND ${reservations.endDate} <= ${endDate}))
            AND ${reservations.deletedAt} IS NULL`
      );
    
    const result: Reservation[] = [];
    
    // Fetch vehicle, customer, and driver data for each reservation
    for (const reservation of reservationsData) {
      // Handle null vehicleId for placeholder spare reservations
      let vehicle: Vehicle | undefined = undefined;
      if (reservation.vehicleId !== null) {
        const [v] = await db.select().from(vehicles).where(eq(vehicles.id, reservation.vehicleId));
        vehicle = v ?? undefined;
      }
      
      let customer: Customer | undefined = undefined;
      let driver: Driver | undefined = undefined;
      
      // For maintenance blocks, try to find customer from active open-ended rental
      if (reservation.type === 'maintenance_block' && !reservation.customerId && reservation.vehicleId) {
        console.log(`🔍 Looking for active rental for maintenance block ${reservation.id} on vehicle ${reservation.vehicleId}`);
        const [activeRental] = await db.select()
          .from(reservations)
          .where(
            and(
              eq(reservations.vehicleId, reservation.vehicleId),
              eq(reservations.type, 'standard'),
              sql`(${reservations.endDate} IS NULL OR ${reservations.endDate} = 'undefined')`,
              sql`${reservations.status} IN ('confirmed', 'pending')`,
              isNull(reservations.deletedAt)
            )
          )
          .limit(1);
        
        console.log(`📋 Found active rental:`, activeRental);
        
        if (activeRental && activeRental.customerId) {
          const [rentalCustomer] = await db.select().from(customers).where(eq(customers.id, activeRental.customerId));
          customer = rentalCustomer ?? undefined;
          console.log(`✅ Found customer from active rental:`, customer?.name);
        } else {
          console.log(`❌ No active rental found for vehicle ${reservation.vehicleId}`);
        }
      } else if (reservation.customerId) {
        // Normal reservation with direct customer assignment
        const [directCustomer] = await db.select().from(customers).where(eq(customers.id, reservation.customerId));
        customer = directCustomer ?? undefined;
      }
      
      // Fetch driver data if driverId is present
      if (reservation.driverId) {
        const [driverData] = await db.select().from(drivers).where(eq(drivers.id, reservation.driverId));
        driver = driverData ?? undefined;
      }
      
      result.push({
        ...reservation,
        vehicle,
        customer,
        driver
      });
    }
    
    return result;
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

  // Get overdue reservations for a vehicle (end date is 3+ days in the past, status NOT completed)
  // Excludes open-ended rentals (null or empty endDate) since they have no defined return date
  async getOverdueReservationsByVehicle(vehicleId: number, daysOverdue: number = 3): Promise<Reservation[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOverdue);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
    
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
          sql`${reservations.endDate} IS NOT NULL`,
          sql`${reservations.endDate} != ''`,
          sql`${reservations.endDate} < ${cutoffDateStr}`,
          sql`${reservations.status} != 'completed'`,
          sql`${reservations.status} != 'cancelled'`
        )
      )
      .orderBy(desc(reservations.endDate));
    
    return result.map(row => ({
      ...row.reservation,
      vehicle: row.vehicle ?? undefined,
      customer: row.customer ?? undefined,
    }));
  }

  async checkReservationConflicts(
    vehicleId: number,
    startDate: string,
    endDate: string | null,
    excludeReservationId: number | null,
    isMaintenanceBlock: boolean = false,
    startTime: string | null = null,
    endTime: string | null = null
  ): Promise<Reservation[]> {
    // For open-ended rentals (null endDate), use a far-future date for conflict checking
    // This ensures that an open-ended rental conflicts with all future reservations
    const effectiveEndDate = endDate || '9999-12-31';
    const newStartTime = startTime || null;
    const newEndTime = endTime || null;

    // Build the base conditions
    const baseConditions = [
      eq(reservations.vehicleId, vehicleId),
      sql`${reservations.status} != 'cancelled'`,
      sql`${reservations.status} != 'completed'`,
      sql`${reservations.status} != 'returned'`,
      isNull(reservations.deletedAt),
      // Overlap check with same-day turnover allowed: a rental ending the same
      // calendar day another begins is a normal handover (return in the morning,
      // new pickup that afternoon), not a double-booking — UNLESS both sides
      // recorded a scheduled time and those times actually overlap (e.g. existing
      // returns at 18:00 but the new pickup wants 09:00 the same day, so the car
      // genuinely isn't back yet). Missing a time on either side falls back to the
      // permissive date-only behavior, since there's nothing more precise to check.
      // A genuine multi-day overlap (or an identical range) always still conflicts.
      sql`(
        (
          (${reservations.startDate} <= ${effectiveEndDate} AND ${reservations.endDate} >= ${startDate})
          OR (${reservations.startDate} <= ${effectiveEndDate} AND (${reservations.endDate} IS NULL OR ${reservations.endDate} = 'undefined'))
        )
        AND NOT (
          (
            ${reservations.endDate} IS NOT NULL AND ${reservations.endDate} = ${startDate}
            AND (
              ${reservations.endTime} IS NULL OR ${newStartTime}::text IS NULL
              OR ${reservations.endTime} <= ${newStartTime}
            )
          )
          OR (
            ${effectiveEndDate} = ${reservations.startDate}
            AND (
              ${newEndTime}::text IS NULL OR ${reservations.startTime} IS NULL
              OR ${newEndTime} <= ${reservations.startTime}
            )
          )
        )
      )`
    ];
    
    // If this is a maintenance block, only check for conflicts with OTHER maintenance blocks
    // Regular rentals can continue during maintenance (with spare vehicles)
    if (isMaintenanceBlock) {
      baseConditions.push(sql`${reservations.type} = 'maintenance_block'`);
    } else {
      // For regular rentals, maintenance blocks don't cause conflicts (rentals continue during maintenance)
      baseConditions.push(sql`${reservations.type} != 'maintenance_block'`);
    }
    
    // Add exclusion if provided
    if (excludeReservationId !== null) {
      baseConditions.push(sql`${reservations.id} != ${excludeReservationId}`);
    }
    
    const reservationsData = await db
      .select()
      .from(reservations)
      .where(and(...baseConditions));
    
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId));

    // Batch-load customers instead of one query per reservation.
    const customerIds = Array.from(new Set(
      reservationsData
        .map(r => r.customerId)
        .filter((id): id is number => id !== null && id !== undefined)
    ));

    const customerRows = customerIds.length
      ? await db.select().from(customers).where(inArray(customers.id, customerIds))
      : [];
    const customerById = new Map(customerRows.map(c => [c.id, c]));

    return reservationsData.map(reservation => ({
      ...reservation,
      vehicle,
      customer: reservation.customerId !== null && reservation.customerId !== undefined
        ? customerById.get(reservation.customerId)
        : undefined,
    }));
  }

  async pickupReservation(
    reservationId: number,
    pickupData: {
      contractNumber: string;
      pickupMileage: number;
      fuelLevelPickup: string;
      pickupDate?: string;
      pickupNotes?: string;
    }
  ): Promise<Reservation | undefined> {
    const reservation = await this.getReservation(reservationId);
    if (!reservation) {
      throw new Error('Reservation not found');
    }

    if (reservation.status !== 'booked') {
      throw new Error(`Cannot pickup reservation with status: ${reservation.status}. Only 'booked' reservations can be picked up.`);
    }

    if (!reservation.vehicleId) {
      throw new Error('Cannot pickup reservation without a vehicle');
    }

    const vehicle = await this.getVehicle(reservation.vehicleId);
    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    if (vehicle.currentMileage && pickupData.pickupMileage < vehicle.currentMileage) {
      throw new Error(`Pickup mileage (${pickupData.pickupMileage}) cannot be less than vehicle's current mileage (${vehicle.currentMileage})`);
    }

    const pickupDate = pickupData.pickupDate || new Date().toISOString().split('T')[0];

    const [updatedReservation] = await db
      .update(reservations)
      .set({
        contractNumber: pickupData.contractNumber,
        pickupMileage: pickupData.pickupMileage,
        fuelLevelPickup: pickupData.fuelLevelPickup,
        actualPickupDate: pickupDate,
        status: 'picked_up',
        // Kept in lockstep with `status` here — the widget's "Beheer vervangende
        // voertuigen" Actief tab reads spareVehicleStatus, not status, and this is
        // its only write path for a real pickup (it was previously never set,
        // which meant that tab could never actually populate from a real handover).
        ...(reservation.type === 'replacement' ? { spareVehicleStatus: 'picked_up' } : {}),
        notes: pickupData.pickupNotes
          ? `${reservation.notes || ''}\n[PICKUP ${pickupDate}] ${pickupData.pickupNotes}`.trim()
          : reservation.notes,
        updatedAt: new Date()
      })
      .where(eq(reservations.id, reservationId))
      .returning();

    const vehicleUpdate: any = {
      currentMileage: pickupData.pickupMileage,
      currentFuelLevel: pickupData.fuelLevelPickup,
      updatedAt: new Date()
    };

    const currentStatus = (vehicle.availabilityStatus || 'available') as VehicleAvailabilityStatus;
    const pickupStatusResult = getStatusOnPickup(currentStatus);
    
    if (!pickupStatusResult.allowed) {
      throw new Error(pickupStatusResult.error || 'Cannot pickup vehicle with current status');
    }
    
    if (pickupStatusResult.newStatus && pickupStatusResult.newStatus !== currentStatus) {
      vehicleUpdate.availabilityStatus = pickupStatusResult.newStatus;
    }

    await db
      .update(vehicles)
      .set(vehicleUpdate)
      .where(eq(vehicles.id, reservation.vehicleId));

    return this.getReservation(reservationId);
  }

  async returnReservation(
    reservationId: number,
    returnData: {
      returnMileage: number;
      fuelLevelReturn: string;
      returnDate?: string;
      returnNotes?: string;
    }
  ): Promise<Reservation | undefined> {
    const reservation = await this.getReservation(reservationId);
    if (!reservation) {
      throw new Error('Reservation not found');
    }

    if (reservation.status !== 'picked_up') {
      throw new Error(`Cannot return reservation with status: ${reservation.status}. Only 'picked_up' reservations can be returned.`);
    }

    if (!reservation.vehicleId) {
      throw new Error('Cannot return reservation without a vehicle');
    }

    const vehicle = await this.getVehicle(reservation.vehicleId);
    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    if (reservation.pickupMileage && returnData.returnMileage < reservation.pickupMileage) {
      throw new Error(`Return mileage (${returnData.returnMileage}) cannot be less than pickup mileage (${reservation.pickupMileage})`);
    }

    const returnDate = returnData.returnDate || new Date().toISOString().split('T')[0];

    const [updatedReservation] = await db
      .update(reservations)
      .set({
        returnMileage: returnData.returnMileage,
        fuelLevelReturn: returnData.fuelLevelReturn,
        actualReturnDate: returnDate,
        status: 'returned',
        ...(reservation.type === 'replacement' ? { spareVehicleStatus: 'returned' } : {}),
        endDate: returnDate,
        completionDate: returnDate,
        notes: returnData.returnNotes
          ? `${reservation.notes || ''}\n[RETURN ${returnDate}] ${returnData.returnNotes}`.trim()
          : reservation.notes,
        updatedAt: new Date()
      })
      .where(eq(reservations.id, reservationId))
      .returning();

    const vehicleUpdate: any = {
      currentMileage: returnData.returnMileage,
      currentFuelLevel: returnData.fuelLevelReturn,
      updatedAt: new Date()
    };

    const currentStatus = (vehicle.availabilityStatus || 'available') as VehicleAvailabilityStatus;
    
    if (currentStatus === 'needs_fixing' || currentStatus === 'not_for_rental') {
      console.log(`[Vehicle Status] Vehicle ${vehicle.id} returning with manual status "${currentStatus}" - preserving status`);
    } else {
      vehicleUpdate.availabilityStatus = 'available';
    }

    await db
      .update(vehicles)
      .set(vehicleUpdate)
      .where(eq(vehicles.id, reservation.vehicleId));
    
    await this.syncVehicleAvailabilityWithReservations();

    return this.getReservation(reservationId);
  }

  // Expense methods
  async getAllExpenses(): Promise<Expense[]> {
    const expensesData = await db.select().from(expenses);

    // Batch-load vehicles instead of one query per expense.
    const vehicleIds = Array.from(new Set(
      expensesData
        .map(e => e.vehicleId)
        .filter((id): id is number => id !== null && id !== undefined)
    ));

    const vehicleRows = vehicleIds.length
      ? await db.select().from(vehicles).where(inArray(vehicles.id, vehicleIds))
      : [];
    const vehicleById = new Map(vehicleRows.map(v => [v.id, v]));

    return expensesData.map(expense => ({
      ...expense,
      vehicle: expense.vehicleId !== null && expense.vehicleId !== undefined
        ? vehicleById.get(expense.vehicleId)
        : undefined,
    })) as Expense[];
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

  async createExpense(expenseData: InsertExpense): Promise<Expense> {
    // Ensure amount is a string if it's a number
    const finalData = {
      ...expenseData,
      amount: typeof expenseData.amount === 'number' ? String(expenseData.amount) : expenseData.amount
    };
    
    console.log("Database - creating expense with data:", finalData);
    const [expense] = await db.insert(expenses).values(finalData).returning();
    
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, expense.vehicleId));
    
    return {
      ...expense,
      vehicle
    };
  }

  async updateExpense(id: number, expenseData: Partial<InsertExpense>): Promise<Expense | undefined> {
    // Ensure amount is a string if it's a number
    const finalData = {
      ...expenseData
    };
    
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
      vehicle: row.vehicle,
    }));
  }
  
  async deleteExpense(id: number): Promise<boolean> {
    try {
      const result = await db
        .delete(expenses)
        .where(eq(expenses.id, id));

      // Check if any rows were affected by the deletion
      return result.rowCount !== null && result.rowCount > 0;
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
    const [row] = await db.insert(vehicleTransports).values(transportData).returning();
    const [withRelations] = await this.attachTransportRelations([row]);
    return withRelations;
  }

  async updateTransport(id: number, transportData: Partial<InsertVehicleTransport>): Promise<VehicleTransport | undefined> {
    const [row] = await db
      .update(vehicleTransports)
      .set({ ...transportData, updatedAt: new Date() })
      .where(eq(vehicleTransports.id, id))
      .returning();
    if (!row) return undefined;
    const [withRelations] = await this.attachTransportRelations([row]);
    return withRelations;
  }

  async deleteTransport(id: number): Promise<boolean> {
    const result = await db.delete(vehicleTransports).where(eq(vehicleTransports.id, id));
    return result.rowCount !== null && result.rowCount > 0;
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
  async applyTransportUpdate(id: number, changes: Partial<InsertVehicleTransport>): Promise<VehicleTransport> {
    let restoreMaintenanceAfterCommit = false;
    let markServiceAfterCommit = false;

    const updatedRow = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(vehicleTransports).where(eq(vehicleTransports.id, id));
      if (!current) {
        throw new Error('Transport not found');
      }

      const nextSpareRequired = changes.spareRequired ?? current.spareRequired;
      const nextRelatedVehicleId = changes.relatedVehicleId !== undefined ? changes.relatedVehicleId : current.relatedVehicleId;
      const nextIsBreakdown = changes.isBreakdownOrMaintenance ?? current.isBreakdownOrMaintenance;

      if (nextRelatedVehicleId != null && nextRelatedVehicleId === current.vehicleId) {
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
            .set({ status: 'cancelled', updatedAt: new Date() })
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
          const conflicts = await this.checkReservationConflicts(
            nextRelatedVehicleId, current.scheduledDate, current.scheduledDate, spareReservationId, false, '00:00', '23:59'
          );
          if (conflicts.length > 0) {
            throw new Error('Replacement vehicle has conflicting reservations for this date');
          }
          await tx.update(reservations)
            .set({ vehicleId: nextRelatedVehicleId, placeholderSpare: false, startTime: '00:00', endTime: '23:59', updatedAt: new Date() })
            .where(eq(reservations.id, spareReservationId));
        }
      }

      if (nextSpareRequired && !spareReservationId) {
        if (nextRelatedVehicleId != null) {
          // A transport's spare reservation spans a single calendar day (startDate
          // === endDate). checkReservationConflicts has a deliberate "same-day
          // turnover" exception for exactly that shape (return this morning, new
          // pickup this afternoon) — it does NOT count as a conflict when neither
          // side has a time. That's correct for real rental handovers, but two
          // DIFFERENT transports both wanting the same spare on the same day must
          // actually conflict, so give the reservation an explicit full-day window
          // rather than leaving times null.
          const conflicts = await this.checkReservationConflicts(
            nextRelatedVehicleId, current.scheduledDate, current.scheduledDate, null, false, '00:00', '23:59'
          );
          if (conflicts.length > 0) {
            throw new Error('Replacement vehicle has conflicting reservations for this date');
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
          totalPrice: null,
          notes: replacingLabel
            ? `Replacement vehicle for ${replacingLabel}`
            : `Replacement vehicle for transport #${id}`,
          damageCheckPath: null,
        };
        const [spareReservation] = await tx.insert(reservations).values(spareReservationData).returning();
        spareReservationId = spareReservation.id;
      }

      // isBreakdownOrMaintenance is what actually means "the original vehicle needs
      // service" — independent of whether a replacement has been assigned yet or is
      // still TBD, and independent of relatedVehicleId changing in this same call.
      // Toggling the flag on is what puts the original vehicle into service;
      // toggling it off, or closing the transport while it was on, restores it.
      const breakdownFlagTurnedOn = !current.isBreakdownOrMaintenance && nextIsBreakdown;
      const breakdownFlagTurnedOff = current.isBreakdownOrMaintenance && !nextIsBreakdown;
      const closingNow = changes.status !== undefined && changes.status !== current.status &&
        (changes.status === 'completed' || changes.status === 'cancelled');

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
      const [row] = await tx.update(vehicleTransports)
        .set({
          ...changes,
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
      // Use SQL query directly to handle potential column name mismatch
      console.log('Searching for default template...');
      const result = await db.execute(
        sql`SELECT * FROM pdf_templates WHERE is_default = true LIMIT 1`
      );
      
      if (result.length > 0) {
        const template = result[0];
        console.log('Found default template:', template.id, template.name);
        
        // Fix the isDefault property by adding it if missing
        if (template.isDefault === undefined && template.is_default !== undefined) {
          console.log('Fixing template isDefault property');
          template.isDefault = template.is_default;
        }
        
        // Process fields if it's a string
        if (template.fields && typeof template.fields === 'string') {
          try {
            // Try to parse JSON string
            const parsedFields = JSON.parse(template.fields);
            console.log(`Successfully parsed ${parsedFields.length} fields`);
            template.fields = parsedFields;
          } catch (error) {
            console.error('Error parsing template fields:', error);
          }
        }
        
        return template;
      } else {
        // If no default template found via 'is_default', try a fallback
        console.log('No templates with is_default=true found, checking all templates...');
        const allTemplates = await db.select().from(pdfTemplates);
        
        if (allTemplates.length > 0) {
          // Try first to find one with isDefault = true, then fallback to first template
          const defaultTemplate = allTemplates.find(t => t.isDefault === true) || allTemplates[0];
          
          console.log(`Using fallback template: ${defaultTemplate.name} with ID: ${defaultTemplate.id}`);
          
          // Process fields if it's a string
          if (defaultTemplate.fields && typeof defaultTemplate.fields === 'string') {
            try {
              const parsedFields = JSON.parse(defaultTemplate.fields);
              console.log(`Successfully parsed ${parsedFields.length} fields`);
              defaultTemplate.fields = parsedFields;
            } catch (error) {
              console.error('Error parsing template fields:', error);
            }
          }
          
          return defaultTemplate;
        }
      }
      
      console.log('No templates found at all');
      return undefined;
    } catch (error) {
      console.error('Error getting default template:', error);
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
  
  async updatePdfTemplate(id: number, templateData: Partial<InsertPdfTemplate>): Promise<PdfTemplate | undefined> {
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
        updatedBy: templateData.updatedBy
      });
      
      // Build dynamic SQL using Drizzle's sql template
      const setClauses = [];
      
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
      
      // Use proper Drizzle SQL template syntax
      const result = await db.execute(sql`
        UPDATE pdf_templates 
        SET ${sql.join(setClauses, sql`, `)}
        WHERE id = ${id}
        RETURNING *
      `);
      
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
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          fields: typeof row.fields === 'string' ? JSON.parse(row.fields) : row.fields
        };
        
        return template;
      }
      
      console.log('Template not found for update');
      return undefined;
    } catch (error) {
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

  async createBarcodeLabelTemplate(templateData: InsertBarcodeLabelTemplate): Promise<BarcodeLabelTemplate> {
    if (templateData.isDefault) {
      await db.update(barcodeLabelTemplates).set({ isDefault: false });
    }
    const [template] = await db.insert(barcodeLabelTemplates).values(templateData).returning();
    return template;
  }

  async updateBarcodeLabelTemplate(id: number, templateData: Partial<InsertBarcodeLabelTemplate>): Promise<BarcodeLabelTemplate | undefined> {
    if (templateData.isDefault) {
      await db.update(barcodeLabelTemplates).set({ isDefault: false });
    }
    const [template] = await db
      .update(barcodeLabelTemplates)
      .set({ ...templateData, updatedAt: new Date() })
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
          isNull(reservations.deletedAt)
        )
      );
    
    return results as any;
  }

  async createPlaceholderReservation(originalReservationId: number, customerId: number, startDate: string, endDate?: string): Promise<Reservation> {
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
      customerId,
      startDate,
      endDate: endDate || null,
      status: 'booked',
      type: 'replacement',
      replacementForReservationId: originalReservationId,
      placeholderSpare: true,
      notes: `TBD spare vehicle for reservation #${originalReservationId}`,
      totalPrice: null,
      damageCheckPath: null
    };

    const [placeholder] = await db
      .insert(reservations)
      .values(placeholderData)
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

    // Check for conflicts with the new vehicle assignment
    const conflicts = await this.checkReservationConflicts(
      vehicleId,
      reservation.startDate,
      assignmentEndDate || reservation.startDate,
      reservationId
    );

    if (conflicts.length > 0) {
      throw new Error('Vehicle has conflicting reservations during the assignment period');
    }

    // Assign the vehicle to the placeholder
    const [updatedReservation] = await db
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
      .where(eq(reservations.id, reservationId))
      .returning();

    // Keep the originating Transport's relatedVehicleId mirrored to whatever
    // just got assigned here, so the Transports page reflects it too.
    if (reservation.replacementForTransportId != null) {
      await db.update(vehicleTransports)
        .set({ relatedVehicleId: vehicleId, updatedAt: new Date() })
        .where(eq(vehicleTransports.id, reservation.replacementForTransportId));
    }

    // Delete the spare assignment notification when vehicle is assigned
    await this.deleteNotificationsByTypeAndPattern("spare_assignment", `[placeholder:${reservationId}]`);

    return updatedReservation || undefined;
  }

  // Other missing spare vehicle methods
  async getAvailableVehiclesInRange(startDate: string, endDate: string, excludeVehicleId?: number): Promise<Vehicle[]> {
    // Get all vehicles
    let vehicleQuery = db.select().from(vehicles);

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

  async createReplacementReservation(originalReservationId: number, spareVehicleId: number, startDate: string, endDate?: string): Promise<Reservation> {
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

    // Check for conflicts on the spare vehicle
    const conflicts = await this.checkReservationConflicts(spareVehicleId, startDate, finalEndDate || startDate, null);
    if (conflicts.length > 0) {
      throw new Error('Spare vehicle has conflicting reservations');
    }

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
      status: new Date(startDate) <= new Date() ? 'active' : 'pending',
      type: 'replacement',
      replacementForReservationId: originalReservationId,
      placeholderSpare: false,
      totalPrice: null,
      notes: `Spare vehicle ${spareVehicleInfo} for reservation #${originalReservationId}`,
      damageCheckPath: null
    };

    const [replacement] = await db
      .insert(reservations)
      .values(replacementData)
      .returning();

    return replacement;
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

    return updatedReservation || undefined;
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
      updatedAt: new Date()
    };

    // Update availability status based on maintenance status
    // Only update if vehicle is not currently rented (preserve rental status)
    const currentAvailability = currentVehicle.availabilityStatus || 'available';

    if (maintenanceStatus === 'in_service' || maintenanceStatus === 'scheduled') {
      // Set to needs_fixing only if not currently rented
      if (currentAvailability !== 'rented') {
        updateData.availabilityStatus = 'needs_fixing';
        console.log(`[Vehicle Status] Vehicle ${vehicleId} marked for service - setting to 'needs_fixing'`);
      } else {
        console.log(`[Vehicle Status] Vehicle ${vehicleId} marked for service but currently rented - preserving 'rented' status`);
      }
    } else if (maintenanceStatus === 'ok' || maintenanceStatus === 'completed') {
      // Restore to available only if currently needs_fixing
      if (currentAvailability === 'needs_fixing') {
        updateData.availabilityStatus = 'available';
        console.log(`[Vehicle Status] Vehicle ${vehicleId} service completed - setting to 'available'`);
      }
    }

    const [updatedVehicle] = await dbExecutor
      .update(vehicles)
      .set(updateData)
      .where(eq(vehicles.id, vehicleId))
      .returning();

    if (dbExecutor === db) {
      // Sync vehicle availability after maintenance status change
      await this.syncVehicleAvailabilityWithReservations();
    }

    return updatedVehicle || undefined;
  }

  async createMaintenanceBlock(vehicleId: number, startDate: string, endDate?: string, customerId?: number | null): Promise<Reservation> {
    const maintenanceData: InsertReservation = {
      vehicleId,
      customerId: customerId ?? null,
      startDate,
      endDate: endDate || null,
      status: 'active',
      type: 'maintenance_block',
      // Match the fields the maintenance scheduler sets so these blocks show
      // and behave the same on the maintenance calendar (its filters and
      // status flow key off maintenanceStatus/maintenanceCategory).
      maintenanceStatus: 'scheduled',
      maintenanceCategory: 'repair',
      replacementForReservationId: null,
      placeholderSpare: false,
      totalPrice: null,
      notes: 'Vehicle maintenance block',
      damageCheckPath: null
    };

    const [maintenanceBlock] = await db
      .insert(reservations)
      .values(maintenanceData)
      .returning();

    return maintenanceBlock;
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
    return result.rowCount > 0;
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

  async updateSettings(settingData: UpdateSettings): Promise<Settings | undefined> {
    const updateData = {
      ...settingData,
      updatedAt: new Date()
    };
    
    // First, try to get existing settings
    const existingSettings = await this.getSettings();
    
    if (existingSettings) {
      // Update existing record
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

  async deleteDriver(id: number): Promise<boolean> {
    const result = await db.delete(drivers).where(eq(drivers.id, id));
    return result.rowCount > 0;
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

  async deleteSavedReport(id: number): Promise<boolean> {
    const result = await db.delete(savedReports).where(eq(savedReports.id, id));
    return result.rowCount > 0;
  }

  async executeReport(configuration: any): Promise<any[]> {
    const { columns, filters, groupBy, dataSources } = configuration ?? {};

    if (!Array.isArray(columns) || columns.length === 0) {
      return [];
    }
    if (!Array.isArray(dataSources) || dataSources.length === 0) {
      throw new ReportValidationError("No data source specified");
    }

    // Whitelist of queryable tables mapped to their Drizzle table objects.
    const reportTables: Record<string, any> = {
      vehicles,
      customers,
      reservations,
      expenses,
      drivers,
    };

    const mainSource = getDataSource(String(dataSources[0]));
    if (!mainSource) {
      throw new ReportValidationError(`Unknown data source: ${dataSources[0]}`);
    }
    const mainTable = mainSource.table;
    const tableObj = reportTables[mainTable];
    if (!tableObj) {
      throw new ReportValidationError(`Data source not queryable: ${mainTable}`);
    }

    // Validates a table/field pair against the shared report-builder config
    // and returns the real (snake_case) database column name.
    const resolveColumn = (table: string, field: string): string => {
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

    // SELECT list — every column is aliased to its camelCase config name so the
    // frontend can read row[col.field] regardless of the DB column casing.
    const selectParts = columns.map((col: any) => {
      const ident = identFor(col.table, col.field);
      const alias = sql.identifier(String(col.field));
      if (col.aggregation) {
        const def = getReportField(col.table, col.field)!;
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
      return sql`${ident} AS ${alias}`;
    });

    // WHERE clause — operators validated per-field against the config,
    // all values passed as bound parameters (never string-concatenated).
    const whereParts: ReturnType<typeof sql>[] = [];
    for (const filter of Array.isArray(filters) ? filters : []) {
      const def = getReportField(filter.table, filter.field);
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

    // Reservations support soft-delete — never report on deleted rows.
    if (mainTable === "reservations") {
      whereParts.push(sql`${sql.identifier(mainTable)}.${sql.identifier("deleted_at")} IS NULL`);
    }

    const groupParts = (Array.isArray(groupBy) ? groupBy : []).map((g: any) =>
      identFor(g.table, g.field)
    );

    let query = sql`SELECT ${sql.join(selectParts, sql`, `)} FROM ${sql.identifier(mainTable)}`;
    if (whereParts.length > 0) {
      query = sql`${query} WHERE ${sql.join(whereParts, sql` AND `)}`;
    }
    if (groupParts.length > 0) {
      query = sql`${query} GROUP BY ${sql.join(groupParts, sql`, `)}`;
    }
    query = sql`${query} LIMIT 1000`;

    const results = await db.execute(query);
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
        createdAt: interactiveDamageChecks.createdAt,
        updatedAt: interactiveDamageChecks.updatedAt,
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
    
    // Delete the PDF file if it exists
    if (damageCheck.pdfPath) {
      try {
        const pdfFullPath = path.join(process.cwd(), damageCheck.pdfPath);
        if (fs.existsSync(pdfFullPath)) {
          await fs.promises.unlink(pdfFullPath);
          console.log(`🗑️ Deleted damage check PDF: ${damageCheck.pdfPath}`);
        }
      } catch (error) {
        console.error("Error deleting damage check PDF file:", error);
      }
      
      // Delete the associated document record from the documents table
      // Match by reservationId and checkType to avoid path normalization issues
      try {
        const documentType = `Damage Check (${damageCheck.checkType === 'pickup' ? 'Pickup' : 'Return'})`;
        const docs = await db.select().from(documents)
          .where(
            and(
              eq(documents.reservationId, damageCheck.reservationId),
              eq(documents.documentType, documentType)
            )
          );
        
        // Find the document that matches the filename pattern
        const filename = `damage_check_${damageCheck.vehicleId}_${damageCheck.checkType}_`;
        const matchingDoc = docs.find(doc => doc.fileName.startsWith(filename) && doc.fileName.includes(`_v${damageCheck.id}.pdf`));
        
        if (matchingDoc) {
          await db.delete(documents).where(eq(documents.id, matchingDoc.id));
          console.log(`🗑️ Deleted damage check document record: ID ${matchingDoc.id}`);
        } else {
          console.warn(`⚠️ No matching document found for damage check ${id}`);
        }
      } catch (error) {
        console.error("Error deleting damage check document record:", error);
      }
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