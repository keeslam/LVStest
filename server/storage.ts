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
import { addMonths, addDays, parseISO, isBefore, isAfter, isEqual } from "date-fns";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: number, userData: Partial<InsertUser>): Promise<User | undefined>;
  updateUserPassword(id: number, hashedPassword: string): Promise<boolean>;
  deleteUser(id: number): Promise<boolean>;
  
  // Vehicle methods
  getAllVehicles(): Promise<Vehicle[]>;
  getVehicle(id: number): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  updateVehicle(id: number, vehicleData: Partial<InsertVehicle>): Promise<Vehicle | undefined>;
  deleteVehicle(id: number): Promise<boolean>;
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
  createMaintenanceBlock(vehicleId: number, startDate: string, endDate?: string): Promise<Reservation>;
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
  createAuditLog(log: any): Promise<any>;
  getAuditLogs(filters?: {
    userId?: number;
    action?: string;
    resourceType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<any[]>;
  
  // Security: Password History methods
  addPasswordHistory(userId: number, passwordHash: string): Promise<void>;
  getPasswordHistory(userId: number, limit?: number): Promise<any[]>;
  checkPasswordInHistory(userId: number, passwordHash: string): Promise<boolean>;
  
  // Security: Login Attempt methods
  recordLoginAttempt(attempt: any): Promise<any>;
  getRecentLoginAttempts(username: string, minutes?: number): Promise<any[]>;
  getFailedLoginAttempts(username: string, ipAddress: string, minutes?: number): Promise<number>;
  clearLoginAttempts(username: string): Promise<void>;
  
  // Security: Active Session methods
  createActiveSession(session: any): Promise<any>;
  getActiveSessionBySessionId(sessionId: string): Promise<any | undefined>;
  getUserActiveSessions(userId: number): Promise<any[]>;
  updateSessionActivity(sessionId: string): Promise<void>;
  revokeSession(sessionId: string): Promise<boolean>;
  revokeUserSessions(userId: number, exceptSessionId?: string): Promise<number>;
  cleanExpiredSessions(): Promise<number>;
  
  // Vehicle-Customer Blacklist methods
  getBlacklistedCustomersForVehicle(vehicleId: number): Promise<VehicleCustomerBlacklist[]>;
  getBlacklistedVehiclesForCustomer(customerId: number): Promise<VehicleCustomerBlacklist[]>;
  addToBlacklist(entry: InsertVehicleCustomerBlacklist): Promise<VehicleCustomerBlacklist>;
  removeFromBlacklist(id: number): Promise<boolean>;
  isCustomerBlacklistedForVehicle(vehicleId: number, customerId: number): Promise<boolean>;
  
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private vehicles: Map<number, Vehicle>;
  private customers: Map<number, Customer>;
  private reservations: Map<number, Reservation>;
  private expenses: Map<number, Expense>;
  private transports: Map<number, VehicleTransport>;
  private documents: Map<number, Document>;
  private pdfTemplates: Map<number, PdfTemplate>;
  private customNotifications: Map<number, CustomNotification>;
  private drivers: Map<number, Driver>;
  
  private userId: number;
  private vehicleId: number;
  private customerId: number;
  private reservationId: number;
  private expenseId: number;
  private transportId: number;
  private documentId: number;
  private pdfTemplateId: number;
  private customNotificationId: number;
  private driverId: number;

  constructor() {
    this.users = new Map();
    this.vehicles = new Map();
    this.customers = new Map();
    this.reservations = new Map();
    this.expenses = new Map();
    this.transports = new Map();
    this.documents = new Map();
    this.pdfTemplates = new Map();
    this.customNotifications = new Map();
    this.drivers = new Map();
    
    this.userId = 1;
    this.vehicleId = 1;
    this.customerId = 1;
    this.reservationId = 1;
    this.expenseId = 1;
    this.transportId = 1;
    this.documentId = 1;
    this.pdfTemplateId = 1;
    this.customNotificationId = 1;
    this.driverId = 1;
    
    // Initialize with sample data for demo
    this.initializeSampleData();
    
    // Debug log users (without sensitive data)
    console.log("Sample users initialized:");
    for (const user of this.users.values()) {
      console.log(`User ${user.id}: username=${user.username}, role=${user.role}`);
    }
  }

  private initializeSampleData() {
    // Create sample admin user
    this.createUser({
      username: "admin",
      password: "password", // Plain text password for development purposes only
      fullName: "Admin User",
      email: "admin@example.com",
      role: "admin",
      permissions: ["manage_users", "manage_vehicles", "manage_customers", "manage_reservations", "manage_expenses", "manage_documents", "view_dashboard"],
      active: true
    });

    // Create a regular user
    this.createUser({
      username: "user",
      password: "password", // Plain text password for development purposes only
      fullName: "Regular User",
      email: "user@example.com",
      role: "user",
      permissions: ["view_dashboard"],
      active: true
    });
    
    // Sample vehicles
    this.createVehicle({
      licensePlate: "AB-123-C",
      brand: "Volkswagen",
      model: "Golf",
      vehicleType: "Hatchback",
      chassisNumber: "WVW123456789",
      fuel: "Gasoline",
      euroZone: "Euro 6",
      apkDate: "2024-05-15",
      warrantyEndDate: "2024-07-10"
    });
    
    this.createVehicle({
      licensePlate: "XY-789-Z",
      brand: "Toyota",
      model: "Corolla",
      vehicleType: "Sedan",
      chassisNumber: "JTD987654321",
      fuel: "Hybrid",
      euroZone: "Euro 6",
      apkDate: "2024-03-01",
      warrantyEndDate: "2024-04-15"
    });
    
    this.createVehicle({
      licensePlate: "TR-567-P",
      brand: "Ford",
      model: "Focus",
      vehicleType: "Sedan",
      chassisNumber: "WF0123456789",
      fuel: "Diesel",
      euroZone: "Euro 5",
      apkDate: "2024-04-20",
      warrantyEndDate: "2024-06-30"
    });
    
    // Sample customers
    this.createCustomer({
      name: "John Doe",
      email: "john.doe@example.com",
      phone: "0612345678",
      address: "Kerkweg 1",
      city: "Amsterdam",
      postalCode: "1234 AB",
      country: "Nederland",
      driverLicenseNumber: "12345678"
    });
    
    this.createCustomer({
      name: "Jane Smith",
      email: "jane.smith@example.com",
      phone: "0687654321",
      address: "Hoofdstraat 10",
      city: "Rotterdam",
      postalCode: "3000 XY",
      country: "Nederland",
      driverLicenseNumber: "87654321"
    });
    
    // Sample reservations
    const today = new Date();
    const weekLater = new Date();
    weekLater.setDate(today.getDate() + 7);
    
    const nextDay = new Date();
    nextDay.setDate(today.getDate() + 1);
    
    const nextMonth = new Date();
    nextMonth.setDate(today.getDate() + 30);
    
    this.createReservation({
      vehicleId: 1,
      customerId: 1,
      startDate: today.toISOString().split('T')[0],
      endDate: nextDay.toISOString().split('T')[0],
      status: "confirmed",
      totalPrice: "120",
      notes: "Sample reservation",
      placeholderSpare: false
    });
    
    this.createReservation({
      vehicleId: 2,
      customerId: 2,
      startDate: weekLater.toISOString().split('T')[0],
      endDate: nextMonth.toISOString().split('T')[0],
      status: "pending",
      totalPrice: "1200",
      notes: "Long-term rental",
      placeholderSpare: false
    });
    
    // Sample expenses
    this.createExpense({
      vehicleId: 1,
      category: "Maintenance",
      amount: 150,
      date: "2024-01-15",
      description: "Oil change and filter replacement"
    });
    
    this.createExpense({
      vehicleId: 2,
      category: "Tires",
      amount: 320,
      date: "2024-01-05",
      description: "New winter tires"
    });
    
    this.createExpense({
      vehicleId: 3,
      category: "Repair",
      amount: 450,
      date: "2024-01-10",
      description: "Brake system repair"
    });
    
    // Sample documents
    this.createDocument({
      vehicleId: 1,
      documentType: "APK Inspection",
      fileName: "apk_report_2023.pdf",
      filePath: "/uploads/1/APK Inspection/apk_report_2023.pdf",
      fileSize: 250000,
      contentType: "application/pdf",
      notes: "Annual APK inspection report"
    });
    
    this.createDocument({
      vehicleId: 2,
      documentType: "Insurance",
      fileName: "insurance_policy.pdf",
      filePath: "/uploads/2/Insurance/insurance_policy.pdf",
      fileSize: 180000,
      contentType: "application/pdf",
      notes: "Vehicle insurance policy"
    });
    
    // Sample PDF template
    this.createPdfTemplate({
      name: "Default Contract Template",
      isDefault: true,
      fields: JSON.stringify([
        {
          id: "1",
          name: "Customer Name",
          x: 100,
          y: 150,
          fontSize: 12,
          isBold: true,
          source: "customer.name"
        },
        {
          id: "2",
          name: "Vehicle",
          x: 100,
          y: 180,
          fontSize: 12,
          isBold: true,
          source: "vehicle.brand"
        },
        {
          id: "3",
          name: "License Plate",
          x: 100,
          y: 210,
          fontSize: 12,
          isBold: false,
          source: "vehicle.licensePlate"
        },
        {
          id: "4",
          name: "Start Date",
          x: 350,
          y: 150,
          fontSize: 12,
          isBold: false,
          source: "startDate"
        },
        {
          id: "5",
          name: "End Date",
          x: 350,
          y: 180,
          fontSize: 12,
          isBold: false,
          source: "endDate"
        }
      ])
    });
    
    // Sample custom notifications
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    this.createCustomNotification({
      title: "Team Meeting",
      description: "Team meeting to discuss new vehicle arrivals",
      date: tomorrow.toISOString().split('T')[0],
      type: "custom",
      isRead: false,
      icon: "CalendarDays",
      link: "/dashboard",
      priority: "high",
      userId: 1
    });
    
    const inventoryDate = new Date();
    inventoryDate.setDate(inventoryDate.getDate() + 7);
    
    this.createCustomNotification({
      title: "Inventory Check",
      description: "Perform monthly inventory check of all vehicles",
      date: inventoryDate.toISOString().split('T')[0],
      type: "custom",
      isRead: false,
      icon: "ClipboardCheck",
      link: "/vehicles",
      priority: "normal",
      userId: 1
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userId++;
    const now = new Date();
    const user: User = {
      id,
      username: insertUser.username,
      password: insertUser.password,
      fullName: insertUser.fullName ?? null,
      email: insertUser.email ?? null,
      role: insertUser.role ?? 'user',
      permissions: insertUser.permissions ?? [],
      active: insertUser.active ?? true,
      hidePrices: insertUser.hidePrices ?? false,
      mileageOverridePasswordHash: insertUser.mileageOverridePasswordHash ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: insertUser.createdBy ?? null,
      updatedBy: insertUser.updatedBy ?? null
    };
    this.users.set(id, user);
    return user;
  }
  
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values()).sort((a, b) => a.username.localeCompare(b.username));
  }
  
  async updateUser(id: number, userData: Partial<InsertUser>): Promise<User | undefined> {
    const existingUser = this.users.get(id);
    if (!existingUser) {
      return undefined;
    }
    
    // Don't allow updating password through this method
    if (userData.password) {
      delete userData.password;
    }
    
    const updatedUser: User = {
      ...existingUser,
      ...userData,
      updatedAt: new Date()
    };
    
    this.users.set(id, updatedUser);
    return updatedUser;
  }
  
  async updateUserPassword(id: number, hashedPassword: string): Promise<boolean> {
    const existingUser = this.users.get(id);
    if (!existingUser) {
      return false;
    }
    
    const updatedUser: User = {
      ...existingUser,
      password: hashedPassword,
      updatedAt: new Date()
    };
    
    this.users.set(id, updatedUser);
    return true;
  }
  
  async deleteUser(id: number): Promise<boolean> {
    return this.users.delete(id);
  }

  // Vehicle methods
  async getAllVehicles(): Promise<Vehicle[]> {
    return Array.from(this.vehicles.values());
  }

  async getVehicle(id: number): Promise<Vehicle | undefined> {
    return this.vehicles.get(id);
  }

  async createVehicle(vehicleData: InsertVehicle): Promise<Vehicle> {
    const id = this.vehicleId++;
    const now = new Date();
    const vehicle: Vehicle = {
      ...vehicleData,
      id,
      createdAt: now,
      updatedAt: now,
      createdBy: vehicleData.createdBy ?? null,
      updatedBy: vehicleData.updatedBy ?? null,
      vehicleType: vehicleData.vehicleType ?? null,
      chassisNumber: vehicleData.chassisNumber ?? null,
      fuel: vehicleData.fuel ?? null,
      adBlue: vehicleData.adBlue ?? null,
      euroZone: vehicleData.euroZone ?? null,
      euroZoneEndDate: vehicleData.euroZoneEndDate ?? null,
      internalAppointments: vehicleData.internalAppointments ?? null,
      apkDate: vehicleData.apkDate ?? null,
      company: vehicleData.company ?? null,
      companyDate: vehicleData.companyDate ?? null,
      companyBy: vehicleData.companyBy ?? null,
      registeredTo: vehicleData.registeredTo ?? null,
      registeredToDate: vehicleData.registeredToDate ?? null,
      registeredToBy: vehicleData.registeredToBy ?? null,
      gps: vehicleData.gps ?? null,
      monthlyPrice: vehicleData.monthlyPrice ?? null,
      dailyPrice: vehicleData.dailyPrice ?? null,
      dateIn: vehicleData.dateIn ?? null,
      dateOut: vehicleData.dateOut ?? null,
      contractNumber: vehicleData.contractNumber ?? null,
      damageCheck: vehicleData.damageCheck ?? null,
      damageCheckDate: vehicleData.damageCheckDate ?? null,
      damageCheckAttachment: vehicleData.damageCheckAttachment ?? null,
      damageCheckAttachmentDate: vehicleData.damageCheckAttachmentDate ?? null,
      creationDate: vehicleData.creationDate ?? null,
      departureMileage: vehicleData.departureMileage ?? null,
      returnMileage: vehicleData.returnMileage ?? null,
      roadsideAssistance: vehicleData.roadsideAssistance ?? null,
      spareKey: vehicleData.spareKey ?? null,
      remarks: vehicleData.remarks ?? null,
      winterTires: vehicleData.winterTires ?? null,
      tireSize: vehicleData.tireSize ?? null,
      wokNotification: vehicleData.wokNotification ?? null,
      radioCode: vehicleData.radioCode ?? null,
      warrantyEndDate: vehicleData.warrantyEndDate ?? null,
      seatcovers: vehicleData.seatcovers ?? null,
      backupbeepers: vehicleData.backupbeepers ?? null
    };
    this.vehicles.set(id, vehicle);
    return vehicle;
  }

  async updateVehicle(id: number, vehicleData: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    const existingVehicle = this.vehicles.get(id);
    if (!existingVehicle) {
      return undefined;
    }
    
    const updatedVehicle: Vehicle = {
      ...existingVehicle,
      ...vehicleData,
      updatedAt: new Date()
    };
    
    this.vehicles.set(id, updatedVehicle);
    return updatedVehicle;
  }
  
  async deleteVehicle(id: number): Promise<boolean> {
    return this.vehicles.delete(id);
  }

  async getAvailableVehicles(): Promise<Vehicle[]> {
    const today = new Date().toISOString().split('T')[0];
    
    // Get all vehicles
    const allVehicles = Array.from(this.vehicles.values());
    
    // Get active reservations (including open-ended ones)
    const activeReservations = Array.from(this.reservations.values()).filter(r => {
      // Skip cancelled and completed reservations
      if (r.status === "cancelled" || r.status === "completed") {
        return false;
      }
      
      // Skip maintenance blocks
      if (r.type === "maintenance_block") {
        return false;
      }
      
      // Check if reservation has started
      if (r.startDate > today) {
        return false;
      }
      
      // Include if:
      // 1. No end date (open-ended/ongoing rental)
      // 2. End date is today or in the future
      return !r.endDate || r.endDate >= today;
    });
    
    // Get IDs of vehicles with active reservations
    const reservedVehicleIds = new Set(activeReservations.map(r => r.vehicleId).filter((id): id is number => id !== null));
    
    // Filter out reserved vehicles
    return allVehicles.filter(v => !reservedVehicleIds.has(v.id));
  }

  async getVehiclesWithApkExpiringSoon(): Promise<Vehicle[]> {
    const today = new Date();
    const twoMonthsFromNow = addMonths(today, 2);
    
    return Array.from(this.vehicles.values()).filter(vehicle => {
      if (!vehicle.apkDate) return false;
      
      const apkDate = parseISO(vehicle.apkDate);
      return isAfter(apkDate, today) && isBefore(apkDate, twoMonthsFromNow);
    });
  }

  async getVehiclesWithWarrantyExpiringSoon(): Promise<Vehicle[]> {
    const today = new Date();
    const twoMonthsFromNow = addMonths(today, 2);
    
    return Array.from(this.vehicles.values()).filter(vehicle => {
      if (!vehicle.warrantyEndDate) return false;
      
      const warrantyEndDate = parseISO(vehicle.warrantyEndDate);
      return isAfter(warrantyEndDate, today) && isBefore(warrantyEndDate, twoMonthsFromNow);
    });
  }

  // Customer methods
  async getAllCustomers(): Promise<Customer[]> {
    return Array.from(this.customers.values());
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    return this.customers.get(id);
  }

  async createCustomer(customerData: InsertCustomer): Promise<Customer> {
    const id = this.customerId++;
    const now = new Date();
    const customer: Customer = { 
      ...customerData, 
      id, 
      createdAt: now, 
      updatedAt: now,
      createdBy: customerData.createdBy ?? null,
      updatedBy: customerData.updatedBy ?? null,
      createdByUser: null,
      updatedByUser: null,
      email: customerData.email ?? null,
      status: customerData.status ?? null,
      debtorNumber: customerData.debtorNumber ?? null,
      phone: customerData.phone ?? null,
      address: customerData.address ?? null,
      postalCode: customerData.postalCode ?? null,
      city: customerData.city ?? null,
      country: customerData.country ?? null,
      dateOfBirth: customerData.dateOfBirth ?? null,
      nationalId: customerData.nationalId ?? null,
      notes: customerData.notes ?? null,
      driverLicenseNumber: customerData.driverLicenseNumber ?? null,
      driverLicenseExpiry: customerData.driverLicenseExpiry ?? null,
      driverLicenseIssueDate: customerData.driverLicenseIssueDate ?? null,
      driverLicenseCountry: customerData.driverLicenseCountry ?? null,
      driverLicenseFrontPath: customerData.driverLicenseFrontPath ?? null,
      driverLicenseBackPath: customerData.driverLicenseBackPath ?? null,
      customerType: customerData.customerType ?? null,
      companyName: customerData.companyName ?? null,
      companyRegistration: customerData.companyRegistration ?? null,
      vatNumber: customerData.vatNumber ?? null,
      billingContactName: customerData.billingContactName ?? null,
      billingContactEmail: customerData.billingContactEmail ?? null,
      billingContactPhone: customerData.billingContactPhone ?? null,
      preferredContactMethod: customerData.preferredContactMethod ?? null,
      preferredLanguage: customerData.preferredLanguage ?? null,
      referralSource: customerData.referralSource ?? null,
      internalNotes: customerData.internalNotes ?? null,
      blacklisted: customerData.blacklisted ?? null,
      blacklistReason: customerData.blacklistReason ?? null,
      corporateDiscount: customerData.corporateDiscount ?? null,
      paymentTermDays: customerData.paymentTermDays ?? null,
      creditLimit: customerData.creditLimit ?? null,
      emergencyContactName: customerData.emergencyContactName ?? null,
      emergencyContactPhone: customerData.emergencyContactPhone ?? null
    };
    this.customers.set(id, customer);
    return customer;
  }

  async updateCustomer(id: number, customerData: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const existingCustomer = this.customers.get(id);
    if (!existingCustomer) {
      return undefined;
    }
    
    const updatedCustomer: Customer = {
      ...existingCustomer,
      ...customerData,
      updatedAt: new Date()
    };
    
    this.customers.set(id, updatedCustomer);
    return updatedCustomer;
  }

  // Reservation methods
  async getAllReservations(): Promise<Reservation[]> {
    const reservations = Array.from(this.reservations.values());
    
    // Populate vehicle, customer, and driver data
    return reservations.map(reservation => ({
      ...reservation,
      vehicle: this.vehicles.get(reservation.vehicleId),
      customer: this.customers.get(reservation.customerId),
      driver: reservation.driverId ? this.drivers.get(reservation.driverId) : undefined
    }));
  }

  async getReservation(id: number): Promise<Reservation | undefined> {
    const reservation = this.reservations.get(id);
    if (!reservation) {
      return undefined;
    }
    
    // Populate vehicle, customer, and driver data
    return {
      ...reservation,
      vehicle: this.vehicles.get(reservation.vehicleId),
      customer: this.customers.get(reservation.customerId),
      driver: reservation.driverId ? this.drivers.get(reservation.driverId) : undefined
    };
  }

  async createReservation(reservationData: InsertReservation): Promise<Reservation> {
    const id = this.reservationId++;
    const now = new Date();
    const reservation: Reservation = { 
      ...reservationData, 
      id, 
      createdAt: now, 
      updatedAt: now,
      createdBy: reservationData.createdBy ?? null,
      updatedBy: reservationData.updatedBy ?? null,
      createdByUser: null,
      updatedByUser: null,
      deletedAt: null,
      deletedBy: null,
      deletedByUser: null,
      type: reservationData.type ?? 'standard',
      status: reservationData.status ?? 'pending',
      contractNumber: reservationData.contractNumber ?? null,
      returnMileage: reservationData.returnMileage ?? null,
      endDate: reservationData.endDate ?? null,
      vehicleId: reservationData.vehicleId ?? null,
      customerId: reservationData.customerId ?? null,
      driverId: reservationData.driverId ?? null,
      notes: reservationData.notes ?? null,
      totalPrice: reservationData.totalPrice ?? null,
      paidAmount: reservationData.paidAmount ?? null,
      pickupMileage: reservationData.pickupMileage ?? null,
      pickupDate: reservationData.pickupDate ?? null,
      pickupTime: reservationData.pickupTime ?? null,
      returnDate: reservationData.returnDate ?? null,
      returnTime: reservationData.returnTime ?? null,
      fuelLevelPickup: reservationData.fuelLevelPickup ?? null,
      fuelLevelReturn: reservationData.fuelLevelReturn ?? null,
      fuelCost: reservationData.fuelCost ?? null,
      maintenanceStatus: reservationData.maintenanceStatus ?? null,
      workshopName: reservationData.workshopName ?? null,
      repairDescription: reservationData.repairDescription ?? null,
      maintenanceAmount: reservationData.maintenanceAmount ?? null,
      maintenancePaidBy: reservationData.maintenancePaidBy ?? null,
      replacementForReservationId: reservationData.replacementForReservationId ?? null,
      pickupNotes: reservationData.pickupNotes ?? null,
      returnNotes: reservationData.returnNotes ?? null,
      requiresDelivery: reservationData.requiresDelivery ?? null,
      deliveryAddress: reservationData.deliveryAddress ?? null,
      deliveryFee: reservationData.deliveryFee ?? null,
      deliveryNotes: reservationData.deliveryNotes ?? null
    };
    this.reservations.set(id, reservation);
    
    // Return with populated data
    return {
      ...reservation,
      vehicle: this.vehicles.get(reservation.vehicleId),
      customer: this.customers.get(reservation.customerId),
      driver: reservation.driverId ? this.drivers.get(reservation.driverId) : undefined
    };
  }

  async updateReservation(id: number, reservationData: Partial<InsertReservation>): Promise<Reservation | undefined> {
    const existingReservation = this.reservations.get(id);
    if (!existingReservation) {
      return undefined;
    }
    
    const updatedReservation: Reservation = {
      ...existingReservation,
      ...reservationData,
      updatedAt: new Date()
    };
    
    this.reservations.set(id, updatedReservation);
    
    // Return with populated data
    return {
      ...updatedReservation,
      vehicle: this.vehicles.get(updatedReservation.vehicleId),
      customer: this.customers.get(updatedReservation.customerId),
      driver: updatedReservation.driverId ? this.drivers.get(updatedReservation.driverId) : undefined
    };
  }
  
  async deleteReservation(id: number): Promise<boolean> {
    return this.reservations.delete(id);
  }

  async getReservationsInDateRange(startDate: string, endDate: string): Promise<Reservation[]> {
    const reservations = Array.from(this.reservations.values()).filter(r => {
      // Check if reservation overlaps with date range
      return (
        (r.startDate <= endDate && r.endDate >= startDate) ||
        (r.startDate >= startDate && r.startDate <= endDate) ||
        (r.endDate >= startDate && r.endDate <= endDate)
      );
    });
    
    // Populate vehicle and customer data
    return reservations.map(reservation => ({
      ...reservation,
      vehicle: this.vehicles.get(reservation.vehicleId),
      customer: this.customers.get(reservation.customerId)
    }));
  }

  async getUpcomingReservations(): Promise<Reservation[]> {
    const today = new Date().toISOString().split('T')[0];
    
    const allReservations = Array.from(this.reservations.values());
    console.log(`📋 Total reservations: ${allReservations.length}`);
    console.log(`📋 Today's date: ${today}`);
    
    const reservations = allReservations
      .filter(r => {
        const include = r.startDate >= today && 
          r.status !== "cancelled" && 
          r.status !== "completed" &&
          r.type !== "maintenance_block";
        
        if (r.startDate >= today) {
          console.log(`📋 Reservation ${r.id}: startDate=${r.startDate}, status="${r.status}", type="${r.type}", include=${include}`);
        }
        
        return include;
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 5); // Limit to 5 reservations
    
    console.log(`📋 Filtered ${reservations.length} upcoming reservations`);
    
    // Populate vehicle and customer data
    return reservations.map(reservation => ({
      ...reservation,
      vehicle: this.vehicles.get(reservation.vehicleId),
      customer: this.customers.get(reservation.customerId)
    }));
  }

  async getUpcomingMaintenanceReservations(): Promise<Reservation[]> {
    const today = new Date().toISOString().split('T')[0];
    
    const reservations = Array.from(this.reservations.values())
      .filter(r => 
        r.startDate >= today && 
        r.type === 'maintenance_block' && 
        (r.maintenanceStatus === 'scheduled' || r.maintenanceStatus === 'in') &&
        r.status !== "cancelled"
      )
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    
    // Populate vehicle data
    return reservations.map(reservation => ({
      ...reservation,
      vehicle: this.vehicles.get(reservation.vehicleId),
      customer: this.customers.get(reservation.customerId)
    }));
  }

  async getReservationsByVehicle(vehicleId: number): Promise<Reservation[]> {
    const reservations = Array.from(this.reservations.values())
      .filter(r => r.vehicleId === vehicleId)
      .sort((a, b) => b.startDate.localeCompare(a.startDate)); // Sort by start date, newest first
    
    // Populate vehicle and customer data
    return reservations.map(reservation => ({
      ...reservation,
      vehicle: this.vehicles.get(reservation.vehicleId),
      customer: this.customers.get(reservation.customerId)
    }));
  }

  async getReservationsByCustomer(customerId: number): Promise<Reservation[]> {
    const reservations = Array.from(this.reservations.values())
      .filter(r => r.customerId === customerId)
      .sort((a, b) => b.startDate.localeCompare(a.startDate)); // Sort by start date, newest first
    
    // Populate vehicle and customer data
    return reservations.map(reservation => ({
      ...reservation,
      vehicle: this.vehicles.get(reservation.vehicleId),
      customer: this.customers.get(reservation.customerId)
    }));
  }

  async getAllOverdueReservations(): Promise<Reservation[]> {
    const today = new Date().toISOString().split('T')[0];
    
    const overdueReservations = Array.from(this.reservations.values())
      .filter(r => 
        !r.deletedAt &&
        r.status === 'picked_up' &&
        r.endDate &&
        r.endDate < today
      )
      .sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''));
    
    return overdueReservations.map(reservation => ({
      ...reservation,
      vehicle: this.vehicles.get(reservation.vehicleId),
      customer: this.customers.get(reservation.customerId)
    }));
  }

  async checkReservationConflicts(
    vehicleId: number,
    startDate: string,
    endDate: string,
    excludeReservationId: number | null,
    isMaintenanceBlock: boolean = false,
    startTime: string | null = null,
    endTime: string | null = null
  ): Promise<Reservation[]> {
    const conflicts = Array.from(this.reservations.values()).filter(r => {
      // Skip the reservation we're checking against (for updates)
      if (excludeReservationId !== null && r.id === excludeReservationId) {
        return false;
      }
      
      // Skip cancelled reservations
      if (r.status === "cancelled") {
        return false;
      }
      
      // If this is a maintenance block, only check for conflicts with OTHER maintenance blocks
      // Regular rentals can continue during maintenance (with spare vehicles)
      if (isMaintenanceBlock) {
        if (r.type !== 'maintenance_block') {
          return false;
        }
      } else {
        // For regular rentals, maintenance blocks don't cause conflicts (rentals continue during maintenance)
        if (r.type === 'maintenance_block') {
          return false;
        }
      }
      
      // Check if this is for the same vehicle and if dates overlap. Same-day
      // turnover (existing.endDate === new.startDate, or vice versa) is allowed —
      // unless both sides recorded a scheduled time and those times actually
      // overlap (existing returns later in the day than the new pickup). Missing
      // a time on either side falls back to the permissive date-only behavior.
      // A genuine multi-day overlap or identical range always still conflicts.
      const existingEndsWhenNewStarts = r.endDate === startDate;
      const newEndsWhenExistingStarts = endDate === r.startDate;
      const endingTouchIsSafe =
        existingEndsWhenNewStarts &&
        (!r.endTime || !startTime || r.endTime <= startTime);
      const startingTouchIsSafe =
        newEndsWhenExistingStarts &&
        (!endTime || !r.startTime || endTime <= r.startTime);
      const touchesBoundaryOnly =
        (existingEndsWhenNewStarts && endingTouchIsSafe) ||
        (newEndsWhenExistingStarts && startingTouchIsSafe);

      return (
        r.vehicleId === vehicleId &&
        !touchesBoundaryOnly &&
        (
          (r.startDate <= endDate && r.endDate >= startDate) ||
          (r.startDate >= startDate && r.startDate <= endDate) ||
          (r.endDate >= startDate && r.endDate <= endDate)
        )
      );
    });
    
    // Populate vehicle and customer data
    return conflicts.map(reservation => ({
      ...reservation,
      vehicle: this.vehicles.get(reservation.vehicleId),
      customer: this.customers.get(reservation.customerId)
    }));
  }

  // Expense methods
  async getAllExpenses(): Promise<Expense[]> {
    const expenses = Array.from(this.expenses.values());
    
    // Populate vehicle data
    return expenses.map(expense => ({
      ...expense,
      vehicle: this.vehicles.get(expense.vehicleId)
    }));
  }

  async getExpense(id: number): Promise<Expense | undefined> {
    const expense = this.expenses.get(id);
    if (!expense) {
      return undefined;
    }
    
    // Populate vehicle data
    return {
      ...expense,
      vehicle: this.vehicles.get(expense.vehicleId)
    };
  }

  async createExpense(expenseData: InsertExpense): Promise<Expense> {
    const id = this.expenseId++;
    const now = new Date();
    const expense: Expense = { 
      ...expenseData, 
      id, 
      createdAt: now, 
      updatedAt: now,
      createdBy: expenseData.createdBy ?? null,
      updatedBy: expenseData.updatedBy ?? null,
      createdByUser: null,
      updatedByUser: null,
      description: expenseData.description ?? null,
      receiptUrl: expenseData.receiptUrl ?? null,
      receiptPath: expenseData.receiptPath ?? null,
      receiptFilename: expenseData.receiptFilename ?? null,
      receiptContentType: expenseData.receiptContentType ?? null,
      paymentMethod: expenseData.paymentMethod ?? null,
      paidBy: expenseData.paidBy ?? null,
      invoiceNumber: expenseData.invoiceNumber ?? null
    };
    this.expenses.set(id, expense);
    
    // Return with populated data
    return {
      ...expense,
      vehicle: this.vehicles.get(expense.vehicleId)
    };
  }

  async updateExpense(id: number, expenseData: Partial<InsertExpense>): Promise<Expense | undefined> {
    const existingExpense = this.expenses.get(id);
    if (!existingExpense) {
      return undefined;
    }
    
    const updatedExpense: Expense = {
      ...existingExpense,
      ...expenseData,
      updatedAt: new Date()
    };
    
    this.expenses.set(id, updatedExpense);
    
    // Return with populated data
    return {
      ...updatedExpense,
      vehicle: this.vehicles.get(updatedExpense.vehicleId)
    };
  }

  async getExpensesByVehicle(vehicleId: number): Promise<Expense[]> {
    const expenses = Array.from(this.expenses.values())
      .filter(e => e.vehicleId === vehicleId)
      .sort((a, b) => b.date.localeCompare(a.date)); // Sort by date, newest first
    
    // Populate vehicle data
    return expenses.map(expense => ({
      ...expense,
      vehicle: this.vehicles.get(expense.vehicleId)
    }));
  }

  async getRecentExpenses(limit: number): Promise<Expense[]> {
    const expenses = Array.from(this.expenses.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) // Sort by creation date, newest first
      .slice(0, limit);
    
    // Populate vehicle data
    return expenses.map(expense => ({
      ...expense,
      vehicle: this.vehicles.get(expense.vehicleId)
    }));
  }
  
  async deleteExpense(id: number): Promise<boolean> {
    return this.expenses.delete(id);
  }

  async getAllTransports(): Promise<VehicleTransport[]> {
    return Array.from(this.transports.values())
      .map(t => ({
        ...t,
        vehicle: this.vehicles.get(t.vehicleId),
        relatedVehicle: t.relatedVehicleId ? this.vehicles.get(t.relatedVehicleId) : undefined,
        customer: t.customerId ? this.customers.get(t.customerId) : undefined,
      }))
      .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
  }

  async getTransport(id: number): Promise<VehicleTransport | undefined> {
    const transport = this.transports.get(id);
    if (!transport) return undefined;
    return {
      ...transport,
      vehicle: this.vehicles.get(transport.vehicleId),
      relatedVehicle: transport.relatedVehicleId ? this.vehicles.get(transport.relatedVehicleId) : undefined,
      customer: transport.customerId ? this.customers.get(transport.customerId) : undefined,
    };
  }

  async createTransport(transportData: InsertVehicleTransport): Promise<VehicleTransport> {
    const id = this.transportId++;
    const now = new Date();
    const transport: VehicleTransport = {
      id,
      vehicleId: transportData.vehicleId,
      relatedVehicleId: transportData.relatedVehicleId ?? null,
      reservationId: transportData.reservationId ?? null,
      customerId: transportData.customerId ?? null,
      transportType: transportData.transportType,
      status: transportData.status ?? "scheduled",
      originAddress: transportData.originAddress ?? null,
      originCity: transportData.originCity ?? null,
      destinationAddress: transportData.destinationAddress ?? null,
      destinationCity: transportData.destinationCity ?? null,
      distanceKm: transportData.distanceKm != null ? String(transportData.distanceKm) : null,
      tollCost: transportData.tollCost != null ? String(transportData.tollCost) : null,
      isBreakdownOrMaintenance: transportData.isBreakdownOrMaintenance ?? false,
      billable: transportData.billable ?? false,
      billableAmount: transportData.billableAmount != null ? String(transportData.billableAmount) : null,
      invoiced: transportData.invoiced ?? false,
      invoicedDate: transportData.invoicedDate ?? null,
      scheduledDate: transportData.scheduledDate,
      completedDate: transportData.completedDate ?? null,
      driverName: transportData.driverName ?? null,
      reason: transportData.reason ?? null,
      notes: transportData.notes ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: transportData.createdBy ?? null,
      updatedBy: transportData.updatedBy ?? null,
      createdByUser: null,
      updatedByUser: null,
    };
    this.transports.set(id, transport);
    return transport;
  }

  async updateTransport(id: number, transportData: Partial<InsertVehicleTransport>): Promise<VehicleTransport | undefined> {
    const existing = this.transports.get(id);
    if (!existing) return undefined;
    const updated: VehicleTransport = {
      ...existing,
      ...transportData,
      distanceKm: transportData.distanceKm !== undefined ? (transportData.distanceKm != null ? String(transportData.distanceKm) : null) : existing.distanceKm,
      tollCost: transportData.tollCost !== undefined ? (transportData.tollCost != null ? String(transportData.tollCost) : null) : existing.tollCost,
      billableAmount: transportData.billableAmount !== undefined ? (transportData.billableAmount != null ? String(transportData.billableAmount) : null) : existing.billableAmount,
      updatedAt: new Date(),
    };
    this.transports.set(id, updated);
    return updated;
  }

  async deleteTransport(id: number): Promise<boolean> {
    return this.transports.delete(id);
  }

  // Document methods
  async getAllDocuments(): Promise<Document[]> {
    return Array.from(this.documents.values());
  }

  async getDocument(id: number): Promise<Document | undefined> {
    return this.documents.get(id);
  }

  async createDocument(documentData: InsertDocument): Promise<Document> {
    const id = this.documentId++;
    const now = new Date();
    const document: Document = { 
      ...documentData, 
      id, 
      uploadDate: now,
      createdBy: documentData.createdBy ?? null,
      updatedBy: documentData.updatedBy ?? null,
      createdByUser: null,
      updatedByUser: null,
      notes: documentData.notes ?? null,
      reservationId: documentData.reservationId ?? null
    };
    this.documents.set(id, document);
    return document;
  }
  
  async updateDocument(id: number, documentData: Partial<InsertDocument>): Promise<Document | undefined> {
    const existingDocument = this.documents.get(id);
    if (!existingDocument) {
      return undefined;
    }
    
    const updatedDocument: Document = {
      ...existingDocument,
      ...documentData
    };
    
    this.documents.set(id, updatedDocument);
    return updatedDocument;
  }

  async getDocumentsByVehicle(vehicleId: number): Promise<Document[]> {
    return Array.from(this.documents.values())
      .filter(d => d.vehicleId === vehicleId)
      .sort((a, b) => {
        // Sort by upload date, newest first
        const dateA = a.uploadDate ? new Date(a.uploadDate).getTime() : 0;
        const dateB = b.uploadDate ? new Date(b.uploadDate).getTime() : 0;
        return dateB - dateA;
      });
  }

  async getDocumentsByReservation(reservationId: number): Promise<Document[]> {
    return Array.from(this.documents.values())
      .filter(d => d.reservationId === reservationId)
      .sort((a, b) => {
        // Sort by upload date, newest first
        const dateA = a.uploadDate ? new Date(a.uploadDate).getTime() : 0;
        const dateB = b.uploadDate ? new Date(b.uploadDate).getTime() : 0;
        return dateB - dateA;
      });
  }

  async deleteDocument(id: number): Promise<boolean> {
    return this.documents.delete(id);
  }
  
  // PDF Template methods
  async getAllPdfTemplates(): Promise<PdfTemplate[]> {
    return Array.from(this.pdfTemplates.values());
  }
  
  async getPdfTemplate(id: number): Promise<PdfTemplate | undefined> {
    return this.pdfTemplates.get(id);
  }
  
  async getDefaultPdfTemplate(): Promise<PdfTemplate | undefined> {
    return Array.from(this.pdfTemplates.values()).find(
      template => template.isDefault
    );
  }
  
  async createPdfTemplate(templateData: InsertPdfTemplate): Promise<PdfTemplate> {
    const id = this.pdfTemplateId++;
    const now = new Date();
    
    // If this template is set as default, update all others to not be default
    if (templateData.isDefault) {
      for (const template of this.pdfTemplates.values()) {
        this.pdfTemplates.set(template.id, {
          ...template,
          isDefault: false,
          updatedAt: now
        });
      }
    }
    
    const template: PdfTemplate = {
      ...templateData,
      id,
      createdAt: now,
      updatedAt: now
    };
    
    this.pdfTemplates.set(id, template);
    return template;
  }
  
  async updatePdfTemplate(id: number, templateData: Partial<InsertPdfTemplate>): Promise<PdfTemplate | undefined> {
    const existingTemplate = this.pdfTemplates.get(id);
    if (!existingTemplate) {
      return undefined;
    }
    
    const now = new Date();
    
    // If this template is being set as default, update all others to not be default
    if (templateData.isDefault) {
      for (const template of this.pdfTemplates.values()) {
        if (template.id !== id) {
          this.pdfTemplates.set(template.id, {
            ...template,
            isDefault: false,
            updatedAt: now
          });
        }
      }
    }
    
    const updatedTemplate: PdfTemplate = {
      ...existingTemplate,
      ...templateData,
      updatedAt: now
    };
    
    this.pdfTemplates.set(id, updatedTemplate);
    return updatedTemplate;
  }
  
  async deletePdfTemplate(id: number): Promise<boolean> {
    const wasDefault = this.pdfTemplates.get(id)?.isDefault;
    const deleted = this.pdfTemplates.delete(id);
    
    // If the deleted template was the default, set a new default if there are any left
    if (wasDefault && deleted && this.pdfTemplates.size > 0) {
      const firstTemplate = Array.from(this.pdfTemplates.values())[0];
      this.pdfTemplates.set(firstTemplate.id, {
        ...firstTemplate,
        isDefault: true,
        updatedAt: new Date()
      });
    }
    
    return deleted;
  }
  
  // Custom Notification methods
  async getAllCustomNotifications(): Promise<CustomNotification[]> {
    return Array.from(this.customNotifications.values())
      .sort((a, b) => (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }
  
  async getCustomNotification(id: number): Promise<CustomNotification | undefined> {
    return this.customNotifications.get(id);
  }
  
  async getUnreadCustomNotifications(): Promise<CustomNotification[]> {
    return Array.from(this.customNotifications.values())
      .filter(notification => !notification.isRead)
      .sort((a, b) => (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }
  
  async getCustomNotificationsByType(type: string): Promise<CustomNotification[]> {
    return Array.from(this.customNotifications.values())
      .filter(notification => notification.type === type)
      .sort((a, b) => (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }
  
  async getCustomNotificationsByUser(userId: number): Promise<CustomNotification[]> {
    return Array.from(this.customNotifications.values())
      .filter(notification => notification.userId === userId)
      .sort((a, b) => (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }
  
  async createCustomNotification(notificationData: InsertCustomNotification): Promise<CustomNotification> {
    const id = this.customNotificationId++;
    const now = new Date();
    const notification: CustomNotification = {
      ...notificationData,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.customNotifications.set(id, notification);
    return notification;
  }
  
  async updateCustomNotification(id: number, notificationData: Partial<InsertCustomNotification>): Promise<CustomNotification | undefined> {
    const existingNotification = this.customNotifications.get(id);
    if (!existingNotification) {
      return undefined;
    }
    
    const updatedNotification: CustomNotification = {
      ...existingNotification,
      ...notificationData,
      updatedAt: new Date()
    };
    
    this.customNotifications.set(id, updatedNotification);
    return updatedNotification;
  }
  
  async markCustomNotificationAsRead(id: number): Promise<boolean> {
    const existingNotification = this.customNotifications.get(id);
    if (!existingNotification) {
      return false;
    }
    
    const updatedNotification: CustomNotification = {
      ...existingNotification,
      isRead: true,
      updatedAt: new Date()
    };
    
    this.customNotifications.set(id, updatedNotification);
    return true;
  }
  
  async deleteCustomNotification(id: number): Promise<boolean> {
    return this.customNotifications.delete(id);
  }

  // Spare vehicle management methods
  async getAvailableVehiclesInRange(startDate: string, endDate: string, excludeVehicleId?: number): Promise<Vehicle[]> {
    console.log(`🔍 Checking available vehicles from ${startDate} to ${endDate}, excluding vehicle ${excludeVehicleId || 'none'}`);
    const allVehicles = Array.from(this.vehicles.values());
    const availableVehicles: Vehicle[] = [];

    for (const vehicle of allVehicles) {
      // Skip excluded vehicle (usually the original vehicle needing service)
      if (excludeVehicleId && vehicle.id === excludeVehicleId) {
        continue;
      }

      // Only include vehicles that are in good maintenance status
      if (vehicle.maintenanceStatus !== 'ok') {
        continue;
      }

      // Exclude vehicles not meant for rental and those needing fixing
      if (vehicle.availabilityStatus === 'not_for_rental' || vehicle.availabilityStatus === 'needs_fixing') {
        continue;
      }

      // Check for any overlapping reservations (standard, replacement, maintenance_block)
      // Exclude completed and returned reservations as they don't block availability
      const hasConflicts = Array.from(this.reservations.values()).some(r => {
        if (r.vehicleId !== vehicle.id || r.status === 'cancelled' || r.status === 'completed' || r.status === 'returned') {
          return false;
        }
        
        const rStart = new Date(r.startDate);
        const rEnd = r.endDate ? new Date(r.endDate) : null; // null means ongoing
        const checkStart = new Date(startDate);
        const checkEnd = new Date(endDate);
        
        // Check for overlap: ongoing reservations (null end) or date range overlap
        if (!rEnd) {
          // Ongoing reservation - conflicts if check period overlaps with ongoing rental
          const conflicts = checkStart >= rStart;
          if (conflicts) {
            console.log(`  ❌ Vehicle ${vehicle.licensePlate} (ID ${vehicle.id}) has open-ended reservation starting ${r.startDate}`);
          }
          return conflicts;
        }
        
        // Standard date range overlap check
        const conflicts = checkStart <= rEnd && checkEnd >= rStart;
        if (conflicts) {
          console.log(`  ❌ Vehicle ${vehicle.licensePlate} (ID ${vehicle.id}) conflicts: reservation ${r.startDate} to ${r.endDate}`);
        }
        return conflicts;
      });
      
      if (!hasConflicts) {
        console.log(`  ✅ Vehicle ${vehicle.licensePlate} (ID ${vehicle.id}) is available`);
        availableVehicles.push(vehicle);
      }
    }

    console.log(`✅ Found ${availableVehicles.length} available vehicles`);
    return availableVehicles;
  }

  async getActiveReplacementByOriginal(originalReservationId: number): Promise<Reservation | undefined> {
    const today = new Date();
    return Array.from(this.reservations.values()).find(r => {
      if (r.type !== 'replacement' || 
          r.replacementForReservationId !== originalReservationId ||
          r.status === 'cancelled') {
        return false;
      }
      
      const rStart = new Date(r.startDate);
      const rEnd = r.endDate ? new Date(r.endDate) : null;
      
      // Active if today is within range (or ongoing if no end date)
      return today >= rStart && (!rEnd || today <= rEnd);
    });
  }

  async createReplacementReservation(originalReservationId: number, spareVehicleId: number, startDate: string, endDate?: string): Promise<Reservation> {
    const original = this.reservations.get(originalReservationId);
    if (!original) {
      throw new Error('Original reservation not found');
    }
    
    // Ensure spare vehicle is not the same as original
    if (spareVehicleId === original.vehicleId) {
      throw new Error('Spare vehicle cannot be the same as original vehicle');
    }
    
    // Get vehicle details for meaningful notes
    const originalVehicle = this.vehicles.get(original.vehicleId);
    const spareVehicle = this.vehicles.get(spareVehicleId);
    
    // Use original's end date if replacement end date not specified
    const finalEndDate = endDate || original.endDate;
    
    // Check for conflicts on the spare vehicle
    const conflicts = await this.checkReservationConflicts(spareVehicleId, startDate, finalEndDate || '', null);
    if (conflicts.length > 0) {
      throw new Error('Spare vehicle has conflicting reservations');
    }

    const id = this.reservationId++;
    const now = new Date();
    
    // Create meaningful notes with vehicle details instead of IDs
    const originalVehicleInfo = originalVehicle 
      ? `${originalVehicle.licensePlate} (${originalVehicle.brand} ${originalVehicle.model})`
      : `Vehicle ID ${original.vehicleId}`;
    const spareVehicleInfo = spareVehicle 
      ? `${spareVehicle.licensePlate} (${spareVehicle.brand} ${spareVehicle.model})`
      : `Vehicle ID ${spareVehicleId}`;
    
    const replacementReservation: Reservation = {
      id,
      vehicleId: spareVehicleId,
      customerId: original.customerId,
      startDate,
      endDate: finalEndDate,
      status: new Date(startDate) <= new Date() ? 'active' : 'pending',
      type: 'replacement',
      replacementForReservationId: originalReservationId,
      totalPrice: null,
      notes: `Spare vehicle ${spareVehicleInfo} for reservation #${originalReservationId}`,
      damageCheckPath: null,
      createdAt: now,
      updatedAt: now,
      createdBy: null,
      updatedBy: null,
      createdByUser: null,
      updatedByUser: null,
    };

    // Mark original vehicle as in service and create maintenance block
    await this.markVehicleForService(original.vehicleId, 'in_service', `Service period for replacement reservation #${id}`);
    await this.createMaintenanceBlock(original.vehicleId, startDate, finalEndDate);

    // Update the original reservation's notes to reflect the replacement
    const updatedOriginal: Reservation = {
      ...original,
      notes: original.notes 
        ? `${original.notes}\n\nOriginal vehicle ${originalVehicleInfo} under maintenance. Replaced with spare vehicle ${spareVehicleInfo}.`
        : `Original vehicle ${originalVehicleInfo} under maintenance. Replaced with spare vehicle ${spareVehicleInfo}.`,
      updatedAt: now
    };
    this.reservations.set(originalReservationId, updatedOriginal);

    this.reservations.set(id, replacementReservation);
    return replacementReservation;
  }

  async updateLegacyNotesWithVehicleDetails(): Promise<number> {
    let updatedCount = 0;
    
    // Regex patterns to find vehicle IDs in notes like "(39)" or "vehicle (36)"
    const vehicleIdPattern = /\((\d+)\)/g;
    const originalVehiclePattern = /Original vehicle \((\d+)\)/g;
    const replacedWithPattern = /Replaced with spare vehicle \((\d+)\)/g;
    
    for (const [reservationId, reservation] of this.reservations.entries()) {
      if (!reservation.notes) continue;
      
      let updatedNotes = reservation.notes;
      let hasChanges = false;
      
      // Replace original vehicle references
      updatedNotes = updatedNotes.replace(originalVehiclePattern, (match, vehicleId) => {
        const vehicle = this.vehicles.get(parseInt(vehicleId));
        if (vehicle) {
          hasChanges = true;
          return `Original vehicle ${vehicle.licensePlate} (${vehicle.brand} ${vehicle.model})`;
        }
        return match;
      });
      
      // Replace spare vehicle references  
      updatedNotes = updatedNotes.replace(replacedWithPattern, (match, vehicleId) => {
        const vehicle = this.vehicles.get(parseInt(vehicleId));
        if (vehicle) {
          hasChanges = true;
          return `Replaced with spare vehicle ${vehicle.licensePlate} (${vehicle.brand} ${vehicle.model})`;
        }
        return match;
      });
      
      // General replacement for any remaining vehicle IDs in parentheses
      updatedNotes = updatedNotes.replace(vehicleIdPattern, (match, vehicleId) => {
        // Skip if this doesn't look like a vehicle ID (e.g., reservation numbers)
        if (updatedNotes.includes(`reservation #${vehicleId}`) || updatedNotes.includes(`#${vehicleId}`)) {
          return match;
        }
        
        const vehicle = this.vehicles.get(parseInt(vehicleId));
        if (vehicle) {
          hasChanges = true;
          return `${vehicle.licensePlate} (${vehicle.brand} ${vehicle.model})`;
        }
        return match;
      });
      
      if (hasChanges) {
        const updatedReservation: Reservation = {
          ...reservation,
          notes: updatedNotes,
          updatedAt: new Date()
        };
        this.reservations.set(reservationId, updatedReservation);
        updatedCount++;
      }
    }
    
    return updatedCount;
  }

  async closeReplacementReservation(replacementReservationId: number, endDate: string): Promise<Reservation | undefined> {
    const reservation = this.reservations.get(replacementReservationId);
    if (!reservation || reservation.type !== 'replacement' || !reservation.replacementForReservationId) {
      return undefined;
    }
    
    const original = this.reservations.get(reservation.replacementForReservationId);
    if (!original) {
      return undefined;
    }

    const updatedReservation: Reservation = {
      ...reservation,
      endDate,
      status: 'returned',
      updatedAt: new Date()
    };

    // Restore original vehicle to good status
    await this.markVehicleForService(original.vehicleId, 'ok');
    
    // Close any maintenance blocks for the original vehicle
    const maintenanceBlocks = Array.from(this.reservations.values()).filter(r =>
      r.type === 'maintenance_block' && 
      r.vehicleId === original.vehicleId &&
      r.status !== 'cancelled' &&
      (!r.endDate || new Date(r.endDate) >= new Date())
    );
    
    for (const block of maintenanceBlocks) {
      await this.closeMaintenanceBlock(block.id, endDate);
    }

    this.reservations.set(replacementReservationId, updatedReservation);
    return updatedReservation;
  }

  async markVehicleForService(vehicleId: number, maintenanceStatus: string, maintenanceNote?: string): Promise<Vehicle | undefined> {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) {
      return undefined;
    }

    const updatedVehicle: Vehicle = {
      ...vehicle,
      maintenanceStatus,
      maintenanceNote: maintenanceNote || null,
      updatedAt: new Date()
    };

    this.vehicles.set(vehicleId, updatedVehicle);
    return updatedVehicle;
  }
  
  async createMaintenanceBlock(vehicleId: number, startDate: string, endDate?: string): Promise<Reservation> {
    const id = this.reservationId++;
    const now = new Date();
    
    const maintenanceBlock: Reservation = {
      id,
      vehicleId,
      customerId: 0, // System reservation, no customer
      startDate,
      endDate: endDate || null,
      status: 'active',
      type: 'maintenance_block',
      replacementForReservationId: null,
      totalPrice: null,
      notes: 'Vehicle maintenance block',
      damageCheckPath: null,
      createdAt: now,
      updatedAt: now,
      createdBy: null,
      updatedBy: null,
      createdByUser: null,
      updatedByUser: null,
    };

    this.reservations.set(id, maintenanceBlock);
    return maintenanceBlock;
  }
  
  async closeMaintenanceBlock(blockReservationId: number, endDate: string): Promise<Reservation | undefined> {
    const block = this.reservations.get(blockReservationId);
    if (!block || block.type !== 'maintenance_block') {
      return undefined;
    }

    const updatedBlock: Reservation = {
      ...block,
      endDate,
      status: 'completed',
      updatedAt: new Date()
    };

    this.reservations.set(blockReservationId, updatedBlock);
    return updatedBlock;
  }

  async getSpareVehicleForVehicle(vehicleId: number): Promise<{ spareVehicle: Vehicle; replacementReservation: Reservation; customer: Customer | null; originalReservation: Reservation } | null> {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Find active reservations for this vehicle (all active statuses)
    const activeStatuses = ['picked_up', 'booked', 'rented', 'confirmed', 'pending'];
    const activeReservations = Array.from(this.reservations.values()).filter(r => 
      r.vehicleId === vehicleId && 
      r.type === 'standard' &&
      activeStatuses.includes(r.status) &&
      !r.deletedAt
    );
    
    for (const originalRes of activeReservations) {
      // Find replacement reservation for this original reservation
      const replacement = Array.from(this.reservations.values()).find(r =>
        r.type === 'replacement' &&
        r.replacementForReservationId === originalRes.id &&
        r.status !== 'cancelled' &&
        r.status !== 'completed' &&
        !r.deletedAt &&
        r.startDate <= todayStr &&
        (!r.endDate || r.endDate >= todayStr)
      );
      
      if (replacement && replacement.vehicleId) {
        const spareVehicle = this.vehicles.get(replacement.vehicleId);
        const customer = originalRes.customerId ? this.customers.get(originalRes.customerId) : null;
        
        if (spareVehicle) {
          return {
            spareVehicle,
            replacementReservation: replacement,
            customer: customer || null,
            originalReservation: originalRes
          };
        }
      }
    }
    
    return null;
  }

  async getActingAsSpareInfo(vehicleId: number): Promise<{ originalVehicle: Vehicle; originalReservation: Reservation; replacementReservation: Reservation; customer: Customer | null } | null> {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Find active replacement reservation where this vehicle is the spare
    const replacement = Array.from(this.reservations.values()).find(r =>
      r.vehicleId === vehicleId &&
      r.type === 'replacement' &&
      r.status !== 'cancelled' &&
      r.status !== 'completed' &&
      !r.deletedAt &&
      r.startDate <= todayStr &&
      (!r.endDate || r.endDate >= todayStr)
    );
    
    if (!replacement || !replacement.replacementForReservationId) {
      return null;
    }
    
    // Get the original reservation
    const originalRes = this.reservations.get(replacement.replacementForReservationId);
    if (!originalRes || !originalRes.vehicleId) {
      return null;
    }
    
    const originalVehicle = this.vehicles.get(originalRes.vehicleId);
    const customer = originalRes.customerId ? this.customers.get(originalRes.customerId) : null;
    
    if (!originalVehicle) {
      return null;
    }
    
    return {
      originalVehicle,
      originalReservation: originalRes,
      replacementReservation: replacement,
      customer: customer || null
    };
  }

  // Placeholder spare vehicle methods
  async getPlaceholderReservations(startDate?: string, endDate?: string): Promise<Reservation[]> {
    const placeholders = Array.from(this.reservations.values()).filter(r => 
      r.placeholderSpare === true && r.type === 'replacement' && r.vehicleId == null
    );

    if (!startDate && !endDate) {
      return placeholders;
    }

    return placeholders.filter(r => {
      const reservationStart = parseISO(r.startDate);
      // Treat null endDate as far future for open-ended reservations
      const reservationEnd = r.endDate ? parseISO(r.endDate) : new Date('2099-12-31');
      
      if (startDate && isAfter(parseISO(startDate), reservationEnd)) {
        return false;
      }
      if (endDate && isBefore(parseISO(endDate), reservationStart)) {
        return false;
      }
      
      return true;
    });
  }

  async getPlaceholderReservationsNeedingAssignment(daysAhead: number = 7): Promise<Reservation[]> {
    const cutoffDate = addDays(new Date(), daysAhead);
    const placeholders = await this.getPlaceholderReservations();
    
    // Double-check that these are truly unassigned placeholders
    return placeholders.filter(r => {
      const startDate = parseISO(r.startDate);
      return isBefore(startDate, cutoffDate) && r.vehicleId == null;
    });
  }

  async assignVehicleToPlaceholder(reservationId: number, vehicleId: number, endDate?: string): Promise<Reservation | undefined> {
    const reservation = this.reservations.get(reservationId);
    if (!reservation || !reservation.placeholderSpare || reservation.vehicleId != null || reservation.type !== 'replacement') {
      return undefined;
    }

    // Verify the target vehicle exists
    const vehicle = this.vehicles.get(vehicleId);
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

    // Check for conflicts with the new vehicle assignment across the full period
    const conflicts = await this.checkReservationConflicts(
      vehicleId, 
      reservation.startDate, 
      assignmentEndDate || reservation.startDate,
      reservationId
    );
    
    if (conflicts.length > 0) {
      throw new Error('Vehicle is not available for the requested dates');
    }

    const updatedReservation: Reservation = {
      ...reservation,
      vehicleId,
      placeholderSpare: false,
      status: 'confirmed',
      endDate: assignmentEndDate || reservation.endDate, // Update endDate if provided
      updatedAt: new Date()
    };

    this.reservations.set(reservationId, updatedReservation);
    
    // Return enriched reservation with vehicle and customer data for consistency
    const customer = reservation.customerId ? await this.getCustomer(reservation.customerId) : undefined;
    return {
      ...updatedReservation,
      vehicle,
      customer
    };
  }

  async createPlaceholderReservation(originalReservationId: number, customerId: number, startDate: string, endDate?: string): Promise<Reservation> {
    // Verify the original reservation exists
    const originalReservation = this.reservations.get(originalReservationId);
    if (!originalReservation) {
      throw new Error('Original reservation not found');
    }

    // Check if a replacement (placeholder or active) already exists for this original reservation
    const existingReplacement = await this.getActiveReplacementByOriginal(originalReservationId);
    if (existingReplacement) {
      throw new Error('A replacement reservation already exists for this original reservation');
    }

    // Check for existing placeholder reservations with overlapping dates for the same original reservation
    const placeholders = await this.getPlaceholderReservations(startDate, endDate || startDate);
    const duplicatePlaceholder = placeholders.find(p => 
      p.replacementForReservationId === originalReservationId
    );
    if (duplicatePlaceholder) {
      throw new Error('A placeholder spare reservation already exists for this original reservation');
    }

    const newReservation: Reservation = {
      id: this.reservationId++,
      vehicleId: null, // Placeholder - no vehicle assigned yet
      customerId,
      startDate,
      endDate: endDate || null,
      status: 'pending',
      totalPrice: null,
      notes: `Placeholder spare vehicle for reservation ${originalReservationId}`,
      damageCheckPath: null,
      type: 'replacement',
      replacementForReservationId: originalReservationId,
      placeholderSpare: true, // This is a placeholder reservation
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: null,
      updatedBy: null,
      createdByUser: null,
      updatedByUser: null
    };

    this.reservations.set(newReservation.id, newReservation);
    return newReservation;
  }

  async getAllSavedReports(): Promise<any[]> {
    throw new Error('Not implemented in MemStorage');
  }

  async getSavedReport(id: number): Promise<any | undefined> {
    throw new Error('Not implemented in MemStorage');
  }

  async createSavedReport(report: any): Promise<any> {
    throw new Error('Not implemented in MemStorage');
  }

  async deleteSavedReport(id: number): Promise<boolean> {
    throw new Error('Not implemented in MemStorage');
  }

  async executeReport(configuration: any): Promise<any[]> {
    throw new Error('Not implemented in MemStorage');
  }






  async getAllDamageCheckTemplates(): Promise<any[]> {
    throw new Error('Not implemented in MemStorage');
  }

  async getDamageCheckTemplate(id: number): Promise<any | undefined> {
    throw new Error('Not implemented in MemStorage');
  }

  async getDamageCheckTemplatesByVehicle(make?: string, model?: string, type?: string): Promise<any[]> {
    throw new Error('Not implemented in MemStorage');
  }

  async getDefaultDamageCheckTemplate(): Promise<any | undefined> {
    throw new Error('Not implemented in MemStorage');
  }

  async createDamageCheckTemplate(template: any): Promise<any> {
    throw new Error('Not implemented in MemStorage');
  }

  async updateDamageCheckTemplate(id: number, templateData: any): Promise<any | undefined> {
    throw new Error('Not implemented in MemStorage');
  }

  async setDefaultDamageCheckTemplate(id: number): Promise<any | undefined> {
    throw new Error('Not implemented in MemStorage');
  }

  async cloneDamageCheckTemplate(sourceId: number, newName?: string, createdBy?: string): Promise<any | undefined> {
    throw new Error('Not implemented in MemStorage');
  }

  async deleteDamageCheckTemplate(id: number): Promise<boolean> {
    throw new Error('Not implemented in MemStorage');
  }

  async getAllVehicleDiagramTemplates(): Promise<VehicleDiagramTemplate[]> {
    throw new Error('Not implemented in MemStorage');
  }

  async getVehicleDiagramTemplate(id: number): Promise<VehicleDiagramTemplate | undefined> {
    throw new Error('Not implemented in MemStorage');
  }

  async getVehicleDiagramTemplateByVehicle(make: string, model: string, year?: number): Promise<VehicleDiagramTemplate | undefined> {
    throw new Error('Not implemented in MemStorage');
  }

  async createVehicleDiagramTemplate(template: InsertVehicleDiagramTemplate): Promise<VehicleDiagramTemplate> {
    throw new Error('Not implemented in MemStorage');
  }

  async updateVehicleDiagramTemplate(id: number, templateData: Partial<InsertVehicleDiagramTemplate>): Promise<VehicleDiagramTemplate | undefined> {
    throw new Error('Not implemented in MemStorage');
  }

  async deleteVehicleDiagramTemplate(id: number): Promise<boolean> {
    throw new Error('Not implemented in MemStorage');
  }

  async unlinkDiagramTemplateFromDamageChecks(templateId: number): Promise<void> {
    throw new Error('Not implemented in MemStorage');
  }

  async getAllInteractiveDamageChecks(): Promise<InteractiveDamageCheck[]> {
    throw new Error('Not implemented in MemStorage');
  }

  async getInteractiveDamageCheck(id: number): Promise<InteractiveDamageCheck | undefined> {
    throw new Error('Not implemented in MemStorage');
  }

  async getInteractiveDamageChecksByVehicle(vehicleId: number): Promise<InteractiveDamageCheck[]> {
    throw new Error('Not implemented in MemStorage');
  }

  async getInteractiveDamageChecksByReservation(reservationId: number): Promise<InteractiveDamageCheck[]> {
    throw new Error('Not implemented in MemStorage');
  }

  async getRecentDamageChecksByVehicleAndCustomer(vehicleId: number, customerId: number, limit?: number): Promise<InteractiveDamageCheck[]> {
    throw new Error('Not implemented in MemStorage');
  }

  async createInteractiveDamageCheck(check: InsertInteractiveDamageCheck, createdBy?: string): Promise<InteractiveDamageCheck> {
    throw new Error('Not implemented in MemStorage');
  }

  async updateInteractiveDamageCheck(id: number, checkData: Partial<InsertInteractiveDamageCheck>, updatedBy?: string): Promise<InteractiveDamageCheck | undefined> {
    throw new Error('Not implemented in MemStorage');
  }

  async deleteInteractiveDamageCheck(id: number): Promise<boolean> {
    throw new Error('Not implemented in MemStorage');
  }

  // Vehicle-Customer Blacklist methods
  async getBlacklistedCustomersForVehicle(vehicleId: number): Promise<VehicleCustomerBlacklist[]> {
    throw new Error('Not implemented in MemStorage');
  }

  async getBlacklistedVehiclesForCustomer(customerId: number): Promise<VehicleCustomerBlacklist[]> {
    throw new Error('Not implemented in MemStorage');
  }

  async addToBlacklist(entry: InsertVehicleCustomerBlacklist): Promise<VehicleCustomerBlacklist> {
    throw new Error('Not implemented in MemStorage');
  }

  async removeFromBlacklist(id: number): Promise<boolean> {
    throw new Error('Not implemented in MemStorage');
  }

  async isCustomerBlacklistedForVehicle(vehicleId: number, customerId: number): Promise<boolean> {
    throw new Error('Not implemented in MemStorage');
  }
}

import { DatabaseStorage } from "./database-storage";

// Use DatabaseStorage for production
export const storage = new DatabaseStorage();
