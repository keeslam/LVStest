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
  type TransportReportTemplate, type InsertTransportReportTemplate,
  type TransportReportTemplateBackground, type InsertTransportReportTemplateBackground,
  type BarcodeLabelTemplate, type InsertBarcodeLabelTemplate,
  type ScanEvent, type InsertScanEvent,
  customNotifications, type CustomNotification, type InsertCustomNotification,
  appSettings, type AppSettings, type InsertAppSettings,
  settings, type Settings, type InsertSettings, type UpdateSettings,
  drivers, type Driver, type InsertDriver,
  savedReports, type SavedReport, type InsertSavedReport,
  damageCheckTemplates, type DamageCheckTemplate, type InsertDamageCheckTemplate,
  vehicleDiagramTemplates, type VehicleDiagramTemplate, type InsertVehicleDiagramTemplate,
  interactiveDamageChecks, type InteractiveDamageCheck, type InsertInteractiveDamageCheck,
  auditLogs, type AuditLog, type InsertAuditLog,
  passwordHistory, type PasswordHistory, type InsertPasswordHistory,
  loginAttempts, type LoginAttempt, type InsertLoginAttempt,
  activeSessions, type ActiveSession, type InsertActiveSession,
  vehicleCustomerBlacklist, type VehicleCustomerBlacklist, type InsertVehicleCustomerBlacklist,
  vehicleTransports, type VehicleTransport, type InsertVehicleTransport
} from "../shared/schema";
import { formatVehicleBarcode } from "../shared/barcode";
import { addMonths, addDays, parseISO, isBefore, isAfter, isEqual } from "date-fns";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  getAuditLogs(options: {
    limit: number;
    offset: number;
    username?: string;
    action?: string;
    resourceType?: string;
    search?: string;
    from?: string;
    to?: string;
  }): Promise<{ logs: AuditLog[]; total: number }>;
  getAuditLogFilterOptions(): Promise<{ users: string[]; actions: string[]; resourceTypes: string[] }>;
  updateUser(id: number, userData: Partial<InsertUser>): Promise<User | undefined>;
  updateUserPassword(id: number, hashedPassword: string): Promise<boolean>;
  deleteUser(id: number): Promise<boolean>;
  
  // Vehicle methods
  getAllVehicles(): Promise<Vehicle[]>;
  getVehicle(id: number): Promise<Vehicle | undefined>;
  getVehicleByBarcode(barcode: string): Promise<Vehicle | undefined>;
  // Bumps the -R<n> revision suffix so old printed labels stop resolving.
  regenerateVehicleBarcode(id: number, updatedBy?: string): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  updateVehicle(id: number, vehicleData: Partial<InsertVehicle>): Promise<Vehicle | undefined>;
  deleteVehicle(id: number, actor?: { username?: string | null; userId?: number | null }): Promise<boolean>;
  getVehicleDeleteImpact?(id: number): Promise<{ vehicle: Vehicle; counts: Record<string, number> } | undefined>;
  getDeletedRecords?(limit?: number): Promise<any[]>;
  getDeletedRecord?(id: number): Promise<any | undefined>;
  restoreDeletedRecord?(id: number, actor?: { username?: string | null }): Promise<{ restored: boolean; reason?: string; record?: any }>;
  getAvailableVehicles(): Promise<Vehicle[]>;
  getVehiclesWithApkExpiringSoon(): Promise<Vehicle[]>;
  getVehiclesWithWarrantyExpiringSoon(): Promise<Vehicle[]>;
  
  // Customer methods
  getAllCustomers(): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, customerData: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: number): Promise<boolean>;
  
  // Reservation methods
  getAllReservations(): Promise<Reservation[]>;
  getReservation(id: number): Promise<Reservation | undefined>;
  createReservation(reservation: InsertReservation): Promise<Reservation>;
  updateReservation(id: number, reservationData: Partial<InsertReservation>): Promise<Reservation | undefined>;
  deleteReservation(id: number): Promise<boolean>;
  getReservationsInDateRange(startDate: string, endDate: string): Promise<Reservation[]>;
  getUpcomingReservations(): Promise<Reservation[]>;
  getUpcomingMaintenanceReservations(): Promise<Reservation[]>;
  getReservationsByVehicle(vehicleId: number): Promise<Reservation[]>;
  getReservationsByCustomer(customerId: number): Promise<Reservation[]>;
  getAllOverdueReservations(): Promise<Reservation[]>;
  checkReservationConflicts(vehicleId: number, startDate: string, endDate: string, excludeReservationId: number | null, isMaintenanceBlock?: boolean, startTime?: string | null, endTime?: string | null): Promise<Reservation[]>;
  pickupReservation(reservationId: number, pickupData: {
    pickupMileage: number;
    fuelLevelPickup: string;
    pickupDate?: string;
    pickupNotes?: string;
    allowMileageDecrease?: boolean;
    mileageDecreaseAuthorizedBy?: string;
  }): Promise<Reservation | undefined>;
  returnReservation(reservationId: number, returnData: {
    returnMileage: number;
    fuelLevelReturn: string;
    returnDate?: string;
    returnNotes?: string;
  }): Promise<Reservation | undefined>;
  
  // Spare vehicle management methods
  getAvailableVehiclesInRange(startDate: string, endDate: string, excludeVehicleId?: number): Promise<Vehicle[]>;
  getActiveReplacementByOriginal(originalReservationId: number): Promise<Reservation | undefined>;
  createReplacementReservation(originalReservationId: number, spareVehicleId: number, startDate: string, endDate?: string): Promise<Reservation>;
  updateLegacyNotesWithVehicleDetails(): Promise<number>;
  closeReplacementReservation(replacementReservationId: number, endDate: string): Promise<Reservation | undefined>;
  markVehicleForService(vehicleId: number, maintenanceStatus: string, maintenanceNote?: string): Promise<Vehicle | undefined>;
  createMaintenanceBlock(vehicleId: number, startDate: string, endDate?: string, customerId?: number | null): Promise<Reservation>;
  closeMaintenanceBlock(blockReservationId: number, endDate: string): Promise<Reservation | undefined>;
  getSpareVehicleForVehicle(vehicleId: number): Promise<{ spareVehicle: Vehicle; replacementReservation: Reservation; customer: Customer | null; originalReservation: Reservation } | null>;
  getActingAsSpareInfo(vehicleId: number): Promise<{ originalVehicle: Vehicle; originalReservation: Reservation; replacementReservation: Reservation; customer: Customer | null } | null>;
  
  // Placeholder spare vehicle methods
  getPlaceholderReservations(startDate?: string, endDate?: string): Promise<Reservation[]>;
  getPlaceholderReservationsNeedingAssignment(daysAhead?: number): Promise<Reservation[]>;
  assignVehicleToPlaceholder(reservationId: number, vehicleId: number, endDate?: string): Promise<Reservation | undefined>;
  createPlaceholderReservation(originalReservationId: number, customerId: number, startDate: string, endDate?: string): Promise<Reservation>;
  
  // Expense methods
  getAllExpenses(): Promise<Expense[]>;
  getExpense(id: number): Promise<Expense | undefined>;
  createExpense(expense: InsertExpense): Promise<Expense>;
  updateExpense(id: number, expenseData: Partial<InsertExpense>): Promise<Expense | undefined>;
  getExpensesByVehicle(vehicleId: number): Promise<Expense[]>;
  getRecentExpenses(limit: number): Promise<Expense[]>;
  deleteExpense(id: number): Promise<boolean>;

  // Vehicle transport methods (swap/tow/repossession/delivery jobs)
  getAllTransports(): Promise<VehicleTransport[]>;
  getTransport(id: number): Promise<VehicleTransport | undefined>;
  createTransport(transport: InsertVehicleTransport): Promise<VehicleTransport>;
  updateTransport(id: number, transportData: Partial<InsertVehicleTransport>): Promise<VehicleTransport | undefined>;
  deleteTransport(id: number): Promise<boolean>;
  // Spare/replacement-vehicle workflow — see shared/transport-spare-status.ts for the
  // derived status this drives. applyTransportUpdate atomically handles reservation
  // creation/cancellation and original-vehicle maintenance status alongside plain field
  // changes. Pickup/return of the spare itself go through the real reservation
  // pickup/return endpoints (PickupDialog/ReturnDialog) — status is read live off
  // spareReservation.status, not recorded separately here.
  applyTransportUpdate(id: number, changes: Partial<InsertVehicleTransport>): Promise<VehicleTransport>;
  // Active (scheduled/in_progress) transport for a vehicle, for the barcode scan
  // lookup — earliest-scheduled first, or undefined if none is open.
  getActiveTransportByVehicle(vehicleId: number): Promise<VehicleTransport | undefined>;

  // Document methods
  getAllDocuments(): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: number, documentData: Partial<InsertDocument>): Promise<Document | undefined>;
  getDocumentsByVehicle(vehicleId: number): Promise<Document[]>;
  getDocumentsByReservation(reservationId: number): Promise<Document[]>;
  deleteDocument(id: number): Promise<boolean>;
  
  // PDF Template methods
  getAllPdfTemplates(): Promise<PdfTemplate[]>;
  getPdfTemplate(id: number): Promise<PdfTemplate | undefined>;
  getDefaultPdfTemplate(): Promise<PdfTemplate | undefined>;
  createPdfTemplate(template: InsertPdfTemplate): Promise<PdfTemplate>;
  updatePdfTemplate(id: number, templateData: Partial<InsertPdfTemplate>): Promise<PdfTemplate | undefined>;
  deletePdfTemplate(id: number): Promise<boolean>;
  
  // Template Background Library methods
  getTemplateBackgrounds(templateId: number): Promise<TemplateBackground[]>;
  getTemplateBackground(id: number): Promise<TemplateBackground | undefined>;
  createTemplateBackground(background: InsertTemplateBackground): Promise<TemplateBackground>;
  deleteTemplateBackground(id: number): Promise<boolean>;
  selectTemplateBackground(templateId: number, backgroundId: number): Promise<PdfTemplate | undefined>;

  // Transport Report Template methods
  getAllTransportReportTemplates(): Promise<TransportReportTemplate[]>;
  getTransportReportTemplate(id: number): Promise<TransportReportTemplate | undefined>;
  getDefaultTransportReportTemplate(): Promise<TransportReportTemplate | undefined>;
  createTransportReportTemplate(template: InsertTransportReportTemplate): Promise<TransportReportTemplate>;
  updateTransportReportTemplate(id: number, templateData: Partial<InsertTransportReportTemplate>): Promise<TransportReportTemplate | undefined>;
  deleteTransportReportTemplate(id: number): Promise<boolean>;
  getAllTransportReportTemplateBackgrounds(): Promise<TransportReportTemplateBackground[]>;
  getTransportReportTemplateBackgrounds(templateId: number): Promise<TransportReportTemplateBackground[]>;
  getTransportReportTemplateBackground(id: number): Promise<TransportReportTemplateBackground | undefined>;
  createTransportReportTemplateBackground(background: InsertTransportReportTemplateBackground): Promise<TransportReportTemplateBackground>;
  deleteTransportReportTemplateBackground(id: number): Promise<boolean>;
  selectTransportReportTemplateBackground(templateId: number, backgroundId: number): Promise<TransportReportTemplate | undefined>;

  // Barcode Label Template methods (key-label stickers, mm canvas, no backgrounds)
  getBarcodeLabelTemplates(): Promise<BarcodeLabelTemplate[]>;
  getBarcodeLabelTemplate(id: number): Promise<BarcodeLabelTemplate | undefined>;
  getDefaultBarcodeLabelTemplate(): Promise<BarcodeLabelTemplate | undefined>;
  createBarcodeLabelTemplate(template: InsertBarcodeLabelTemplate): Promise<BarcodeLabelTemplate>;
  updateBarcodeLabelTemplate(id: number, templateData: Partial<InsertBarcodeLabelTemplate>): Promise<BarcodeLabelTemplate | undefined>;
  deleteBarcodeLabelTemplate(id: number): Promise<boolean>;

  // Scan event history (barcode "recent scans" list)
  logScanEvent(event: InsertScanEvent): Promise<void>;
  getRecentScanEvents(limit?: number): Promise<ScanEvent[]>;

  getAllDamageCheckTemplateBackgrounds(): Promise<DamageCheckTemplateBackground[]>;
  getDamageCheckTemplateBackgrounds(templateId: number): Promise<DamageCheckTemplateBackground[]>;
  getDamageCheckTemplateBackground(id: number): Promise<DamageCheckTemplateBackground | undefined>;
  createDamageCheckTemplateBackground(background: InsertDamageCheckTemplateBackground): Promise<DamageCheckTemplateBackground>;
  deleteDamageCheckTemplateBackground(id: number): Promise<boolean>;
  selectDamageCheckTemplateBackground(templateId: number, backgroundId: number): Promise<DamageCheckTemplate | undefined>;

  // Custom Notification methods
  getAllCustomNotifications(): Promise<CustomNotification[]>;
  getCustomNotification(id: number): Promise<CustomNotification | undefined>;
  getUnreadCustomNotifications(): Promise<CustomNotification[]>;
  getCustomNotificationsByType(type: string): Promise<CustomNotification[]>;
  getCustomNotificationsByUser(userId: number): Promise<CustomNotification[]>;
  createCustomNotification(notification: InsertCustomNotification): Promise<CustomNotification>;
  updateCustomNotification(id: number, notificationData: Partial<InsertCustomNotification>): Promise<CustomNotification | undefined>;
  markCustomNotificationAsRead(id: number): Promise<boolean>;
  deleteCustomNotification(id: number): Promise<boolean>;
  
  // App Settings methods
  getAllAppSettings(): Promise<AppSettings[]>;
  getAppSetting(id: number): Promise<AppSettings | undefined>;
  getAppSettingByKey(key: string): Promise<AppSettings | undefined>;
  getAppSettingsByCategory(category: string): Promise<AppSettings[]>;
  createAppSetting(setting: InsertAppSettings): Promise<AppSettings>;
  updateAppSetting(id: number, settingData: Partial<InsertAppSettings>): Promise<AppSettings | undefined>;
  deleteAppSetting(id: number): Promise<boolean>;
  
  // Settings methods (contract numbers, etc.)
  getSettings(): Promise<Settings | undefined>;
  updateSettings(settingData: UpdateSettings): Promise<Settings | undefined>;
  getNextContractNumber(): Promise<string>;
  checkContractNumberExists(contractNumber: string): Promise<boolean>;
  getConflictingContractNumbers(proposedNumber: number): Promise<string[]>;
  setContractNumberOverride(overrideNumber: number | null, updatedBy?: string): Promise<Settings | undefined>;
  clearContractNumberOverride(updatedBy?: string): Promise<Settings | undefined>;
  
  // Driver methods
  getAllDrivers(): Promise<Driver[]>;
  getDriver(id: number): Promise<Driver | undefined>;
  getDriversByCustomer(customerId: number): Promise<Driver[]>;
  getActiveDriversByCustomer(customerId: number): Promise<Driver[]>;
  getPrimaryDriverByCustomer(customerId: number): Promise<Driver | undefined>;
  createDriver(driver: InsertDriver): Promise<Driver>;
  updateDriver(id: number, driverData: Partial<InsertDriver>): Promise<Driver | undefined>;
  deleteDriver(id: number): Promise<boolean>;
  getDriverCountryUsageStats(): Promise<{ country: string; count: number }[]>;
  
  // Saved Reports methods
  getAllSavedReports(): Promise<any[]>;
  getSavedReport(id: number): Promise<any | undefined>;
  createSavedReport(report: any): Promise<any>;
  deleteSavedReport(id: number): Promise<boolean>;
  executeReport(configuration: any): Promise<any[]>;
  
  // Damage Check Template methods
  getAllDamageCheckTemplates(): Promise<any[]>;
  getDamageCheckTemplate(id: number): Promise<any | undefined>;
  getDamageCheckTemplatesByVehicle(make?: string, model?: string, type?: string): Promise<any[]>;
  getDefaultDamageCheckTemplate(): Promise<any | undefined>;
  createDamageCheckTemplate(template: any): Promise<any>;
  updateDamageCheckTemplate(id: number, templateData: any): Promise<any | undefined>;
  setDefaultDamageCheckTemplate(id: number): Promise<any | undefined>;
  cloneDamageCheckTemplate(sourceId: number, newName?: string, createdBy?: string): Promise<any | undefined>;
  deleteDamageCheckTemplate(id: number): Promise<boolean>;
  
  // Vehicle Diagram Template methods
  getAllVehicleDiagramTemplates(): Promise<VehicleDiagramTemplate[]>;
  getVehicleDiagramTemplate(id: number): Promise<VehicleDiagramTemplate | undefined>;
  getVehicleDiagramTemplateByVehicle(make: string, model: string, year?: number): Promise<VehicleDiagramTemplate | undefined>;
  createVehicleDiagramTemplate(template: InsertVehicleDiagramTemplate): Promise<VehicleDiagramTemplate>;
  updateVehicleDiagramTemplate(id: number, templateData: Partial<InsertVehicleDiagramTemplate>): Promise<VehicleDiagramTemplate | undefined>;
  deleteVehicleDiagramTemplate(id: number): Promise<boolean>;
  unlinkDiagramTemplateFromDamageChecks(templateId: number): Promise<void>;
  
  // Interactive Damage Check methods
  getAllInteractiveDamageChecks(): Promise<InteractiveDamageCheck[]>;
  getInteractiveDamageCheck(id: number): Promise<InteractiveDamageCheck | undefined>;
  getInteractiveDamageChecksByVehicle(vehicleId: number): Promise<InteractiveDamageCheck[]>;
  getInteractiveDamageChecksByReservation(reservationId: number): Promise<InteractiveDamageCheck[]>;
  getRecentDamageChecksByVehicleAndCustomer(vehicleId: number, customerId: number, limit?: number): Promise<InteractiveDamageCheck[]>;
  createInteractiveDamageCheck(check: InsertInteractiveDamageCheck, createdBy?: string): Promise<InteractiveDamageCheck>;
  updateInteractiveDamageCheck(id: number, checkData: Partial<InsertInteractiveDamageCheck>, updatedBy?: string): Promise<InteractiveDamageCheck | undefined>;
  deleteInteractiveDamageCheck(id: number): Promise<boolean>;
  
  // Security: Audit Log methods
  
  // Security: Password History methods
  
  // Security: Login Attempt methods
  
  // Security: Active Session methods
  
  // Vehicle-Customer Blacklist methods
  getBlacklistedCustomersForVehicle(vehicleId: number): Promise<VehicleCustomerBlacklist[]>;
  getBlacklistedVehiclesForCustomer(customerId: number): Promise<VehicleCustomerBlacklist[]>;
  addToBlacklist(entry: InsertVehicleCustomerBlacklist): Promise<VehicleCustomerBlacklist>;
  removeFromBlacklist(id: number): Promise<boolean>;
  isCustomerBlacklistedForVehicle(vehicleId: number, customerId: number): Promise<boolean>;
  
}

import { DatabaseStorage } from "./database-storage";

// Use DatabaseStorage for production
export const storage = new DatabaseStorage();
