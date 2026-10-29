// DTOs the portal API returns and the portal client consumes. Kept apart from
// schema.ts so the client never has to import Drizzle table objects.

import type { PortalCompanyDetails } from './portal-company';
import type { SignedDocumentRow } from './contract-signing';
import type { PortalHandover } from './portal-handover';
import type { AccountMailKey, CompanyMailPreferences } from './portal-mail-preferences';
import type { SupportedLanguage } from './languages';

export const PORTAL_ERROR = {
  NOT_AUTHENTICATED: 'PORTAL_NOT_AUTHENTICATED',
  RATE_LIMITED: 'PORTAL_RATE_LIMITED',
  TOO_MANY_OPEN: 'PORTAL_TOO_MANY_OPEN',
  INVALID_CREDENTIALS: 'PORTAL_INVALID_CREDENTIALS',
  ACCOUNT_BLOCKED: 'PORTAL_ACCOUNT_BLOCKED',
  PORTAL_DISABLED: 'PORTAL_DISABLED',
  LOCKED: 'PORTAL_LOCKED',
  FEATURE_DISABLED: 'PORTAL_FEATURE_DISABLED',
  ROLE_FORBIDDEN: 'PORTAL_ROLE_FORBIDDEN',
  TOKEN_INVALID: 'PORTAL_TOKEN_INVALID',
  TOKEN_EXPIRED: 'PORTAL_TOKEN_EXPIRED',
  VALIDATION: 'PORTAL_VALIDATION',
  NOT_FOUND: 'PORTAL_NOT_FOUND',
  DRIVER_BUSY: 'PORTAL_DRIVER_BUSY',
  VEHICLE_BLOCKED: 'PORTAL_VEHICLE_BLOCKED',
  VEHICLE_UNAVAILABLE: 'PORTAL_VEHICLE_UNAVAILABLE',
  DUPLICATE_REQUEST: 'PORTAL_DUPLICATE_REQUEST',
  MAINTENANCE_TOO_LATE: 'PORTAL_MAINTENANCE_TOO_LATE',
  MAINTENANCE_WEEKEND: 'PORTAL_MAINTENANCE_WEEKEND',
  CANCEL_TOO_LATE: 'PORTAL_CANCEL_TOO_LATE',
  CANCEL_NOT_ALLOWED: 'PORTAL_CANCEL_NOT_ALLOWED',
  FILE_TOO_LARGE: 'PORTAL_FILE_TOO_LARGE',
  DRIVER_HAS_ACCOUNT: 'PORTAL_DRIVER_HAS_ACCOUNT',
  EMAIL_IN_USE: 'PORTAL_EMAIL_IN_USE',
  REQUEST_INVALID_PERIOD: 'PORTAL_REQUEST_INVALID_PERIOD',
  APK_NOT_POSSIBLE: 'PORTAL_APK_NOT_POSSIBLE',
  ATTACHMENT_LIMIT: 'PORTAL_ATTACHMENT_LIMIT',
  CSRF: 'PORTAL_CSRF',
  ALREADY_SIGNED: 'PORTAL_ALREADY_SIGNED',
  NOT_SIGNABLE: 'PORTAL_NOT_SIGNABLE',
  DOCUMENT_CHANGED: 'PORTAL_DOCUMENT_CHANGED',
  INVALID_SIGNATURE: 'PORTAL_INVALID_SIGNATURE',
  SERVER: 'PORTAL_SERVER_ERROR',
} as const;
export type PortalErrorCode = typeof PORTAL_ERROR[keyof typeof PORTAL_ERROR];

export interface PortalSettingsFlags {
  portalEnabled: boolean;
  canBook: boolean;
  canManageDrivers: boolean;
  canSubmitRequests: boolean;
  canViewFines: boolean;
  canViewContracts: boolean;
  showPrices: boolean;
  /** May ask to return a vehicle early ("terugbrengen"). */
  canReturn: boolean;
  /** Fiscal mobility check (docs/fiscaal). `canViewFiscal` is the per-account key; its ceiling is `fiscalMobilityEnabled`. */
  canViewFiscal: boolean;
  fiscalDashboardEnabled: boolean;
  fiscalWarningsEnabled: boolean;
  fiscalReportsEnabled: boolean;
  driverFiscalVisibilityEnabled: boolean;
  /** An admin account may invite and block colleagues (Kees, 2026-10-18); the office can switch it off per customer. */
  canInviteColleagues: boolean;
}

/** Features that can be switched per customer and, on top of that, restricted per account. */
export const PORTAL_FEATURE_KEYS = ['canBook', 'canManageDrivers', 'canSubmitRequests', 'canViewFines', 'canViewContracts', 'showPrices', 'canReturn', 'canViewFiscal'] as const;
export type PortalFeatureKey = typeof PORTAL_FEATURE_KEYS[number];
/** Per-account overrides: a key set to false takes the feature away; absent or true = follow the customer. */
export type PortalAccountPermissions = Partial<Record<PortalFeatureKey, boolean>>;

export interface PortalMe {
  id: number;
  email: string;
  fullName: string;
  role: 'admin' | 'driver';
  driverId: number | null;
  customerId: number;
  customerName: string;
  /** Language the portal shows: the account's own choice, else the customer's preferred language. */
  language: SupportedLanguage;
  /** The account's own choice; null = follow the customer. */
  languageOverride: SupportedLanguage | null;
  /** New e-mail address waiting for confirmation, if any. */
  pendingEmail: string | null;
  /** The company's contact addresses; only sent to admin accounts, who may edit them. */
  company?: PortalCompanyEmails;
  /** Company contact/address data; only sent to admin accounts, who may edit it (the name via a request). */
  companyDetails?: PortalCompanyDetails;
  /** Which mails this account gets; every key is present, true = on. */
  mailPreferences: Record<AccountMailKey, boolean>;
  /** Which mails the company address gets; only sent to admin accounts, who may change it. */
  companyMail?: CompanyMailPreferences;
  settings: PortalSettingsFlags;
  /** Pickup details and privacy link from the portal configuration. */
  info: { pickupAddress: string; openingHours: string; pickupInstructions: string; returnInstructions: string; deliveryNote: string; apkPlannerUrl: string; privacyUrl: string; phone: string };
  /** D11: the office time zone (app setting); the portal reads "today" on that calendar. Absent on an older server. */
  officeTimeZone?: string;
}

export interface PortalCompanyEmails {
  email: string | null;
  emailForMOT: string | null;
  emailForInvoices: string | null;
  emailGeneral: string | null;
}

export interface PortalReservationDto {
  id: number;
  status: string;
  type: string;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  actualPickupDate: string | null;
  actualReturnDate: string | null;
  pickupMileage: number | null;
  returnMileage: number | null;
  contractNumber: string | null;
  /** Only present when the customer's showPrices switch is on. */
  totalPrice?: string | null;
  /** Brought/collected at a place agreed with the office, or collected and returned at the shop. */
  handover: PortalHandover;
  vehicle: { id: number; licensePlate: string; brand: string; model: string; apkDate: string | null; dailyPrice?: string | null } | null;
  driver: { id: number; displayName: string } | null;
  /** Other drivers sharing this car right now (Kees, 2026-10-18); the contract names `driver` only. */
  extraDrivers: Array<{ id: number; displayName: string }>;
  replacementForReservationId: number | null;
  /** Detail view only: service is due (or due soon) on this vehicle. */
  serviceDue?: 'due' | 'soon' | null;
  /** Detail view only: whether the customer can still ask to cancel. */
  cancellation?: PortalCancellationDto;
}

/** One browser this account is logged in with right now (Kees, 2026-10-18). */
export interface PortalSessionDto {
  /** A hash of the session id: enough to sign it out, useless as a cookie. */
  id: string;
  current: boolean;
  browser: string | null;
  os: string | null;
  ip: string | null;
  /** Null for a session from before devices were recorded. */
  signedInAt: string | null;
  lastActiveAt: string;
}

/** One line of a reservation's driver history as the office sees it (Kees, 2026-10-19). */
export interface DriverHistoryRow {
  id: number;
  driverId: number | null;
  driverName: string | null;
  from: string;
  until: string | null;
  /** An extra driver next to the main driver. */
  isExtra: boolean;
  /** Who set it: an office user, a portal account of the customer, or the system (no one recorded). */
  setBy: { kind: 'staff' | 'portal' | 'system'; name: string | null };
  note: string | null;
}

/** A document a customer uploaded, as the office lists it (Kees, 2026-10-19). */
export interface CustomerUploadRow {
  id: number;
  reservationId: number;
  customerId: number | null;
  customerName: string;
  licensePlate: string | null;
  description: string;
  fileName: string;
  contentType: string;
  uploadedAt: string;
  /** The portal account's e-mail address. */
  uploadedBy: string;
  seenAt: string | null;
  seenBy: string | null;
}

/** A fine on a shared car that waits for the customer to say who drove (Kees, 2026-10-19). */
export interface FineAwaitingDriverRow {
  id: number;
  reservationId: number;
  customerId: number;
  customerName: string;
  licensePlate: string;
  description: string;
  offenceAt: string;
  totalAmount: string;
  /** Who was on the car at that moment. */
  drivers: string[];
}

/** A colleague's portal account as an admin of the same company sees it (Kees, 2026-10-18). */
export interface PortalColleagueDto {
  id: number;
  fullName: string;
  email: string;
  role: 'admin' | 'driver';
  driver: { id: number; displayName: string } | null;
  active: boolean;
  /** Has set a password. */
  activated: boolean;
  invitePending: boolean;
  lastSeenAt: string | null;
  isSelf: boolean;
}

/**
 * A document the customer uploaded to one of their reservations (Kees, 2026-10-18). Stored in the
 * office's documents table under this type, so staff find it with the reservation's other documents;
 * the description is kept in documents.notes.
 */
export const CUSTOMER_UPLOAD_DOCUMENT_TYPE = 'Customer Upload';
/** PDF, JPG or PNG up to 10 MB. */
export const CUSTOMER_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export interface PortalUploadDto {
  id: number;
  reservationId: number;
  fileName: string;
  contentType: string;
  fileSize: number;
  description: string;
  uploadedAt: string;
}

/**
 * Asking to cancel a reservation (Kees, 2026-10-18): only a booked rental, not a replacement car, and
 * only until 48 hours before the start. The deadline is that moment (ISO instant).
 */
export interface PortalCancellationDto {
  allowed: boolean;
  reason: 'not_booked' | 'replacement' | 'too_late' | null;
  deadline: string | null;
  /** An open cancellation request for this reservation. */
  openRequestId: number | null;
}

/** A vehicle Lam Groep offers online, as a customer sees it (blacklisted ones are never sent). */
export interface PortalVehicleDto {
  id: number;
  licensePlate: string;
  brand: string;
  model: string;
  vehicleType: string | null;
  fuel: string | null;
  /** Always 'available': the server only sends vehicles that can be rented right now. */
  availabilityStatus: string;
  description: string | null;
  /** Only present when the customer's showPrices switch is on. */
  dailyPrice?: string | null;
  monthlyPrice?: string | null;
}

/** Planned or running maintenance on a vehicle the customer has in use. Placeholder spares are never sent. */
export interface PortalVehicleMaintenanceDto {
  blockId: number;
  startDate: string;
  endDate: string | null;
  status: 'scheduled' | 'in' | 'out';
  category: 'scheduled_maintenance' | 'repair' | null;
  /** False within 48 hours of the start or once the car is in. */
  canRequestChange: boolean;
  openChangeRequestId: number | null;
  replacement: { licensePlate: string; brand: string; model: string; status: string | null } | null;
}

/** One vehicle the customer has on the road, as shown on the Voertuigen page. */
export interface PortalMyVehicleDto {
  reservationId: number;
  vehicle: { id: number; licensePlate: string; brand: string; model: string; apkDate: string | null; currentMileage: number | null };
  driver: { id: number; displayName: string } | null;
  startDate: string;
  endDate: string | null;
  lastReportedMileage: { value: number; at: string } | null;
  serviceDue: 'due' | 'soon' | null;
  maintenance: PortalVehicleMaintenanceDto | null;
  openMaintenanceRequestId: number | null;
}

/** A vehicle staff can put on an approved rental request, with whether it is free in the period. */
export interface PortalBookingAlternativeDto {
  id: number;
  licensePlate: string;
  brand: string;
  model: string;
  vehicleType: string | null;
  availabilityStatus: string;
  offeredOnline: boolean;
  /** The vehicle the customer asked for. */
  requested: boolean;
  sameType: boolean;
  /** No overlapping reservation in the period. */
  free: boolean;
}

/** Staff view of one vehicle/customer block. */
export interface PortalBlacklistEntryDto {
  id: number;
  vehicleId: number;
  licensePlate: string;
  brand: string;
  model: string;
  offeredOnline: boolean;
  customerId: number;
  customerName: string;
  reason: string | null;
  createdAt: string;
}

export interface PortalDocumentDto {
  id: number;
  reservationId: number | null;
  documentType: string;
  kind: 'contract' | 'damage_check';
  fileName: string;
  uploadDate: string;
  /** "Gezien en akkoord" by a portal user, if given. */
  ack: { by: string; at: string } | null;
  /** Contracts only: where signing stands (see shared/contract-signing.ts); null for other documents. */
  signing: {
    status: 'to_sign' | 'signed' | 'superseded' | 'signed_copy';
    signedBy?: string;
    signedAt?: string;
    signedDocumentId?: number | null;
  } | null;
}

/** What the sign dialog needs: the fingerprint of the file shown, and whether this account may sign. */
export interface PortalSigningInfoDto {
  documentId: number;
  status: 'to_sign' | 'signed' | 'superseded' | 'signed_copy';
  sha256: string;
  canSign: boolean;
  signerName: string;
}

/** The values a portal notification is about (plate, dates, car...), so the portal can word it in the reader's language. */
export type PortalNotificationParams = Record<string, string | number | boolean | null>;

export interface PortalNotificationDto {
  id: number;
  type: string;
  title: string;
  description: string;
  /** Null on rows written before the portal words notices itself; those show title and description as stored (Dutch). */
  params: PortalNotificationParams | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface PortalDriverDto {
  id: number;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  driverLicenseNumber: string | null;
  licenseExpiry: string | null;
  licenseOrigin: string | null;
  preferredLanguage: string | null;
  notes: string | null;
  status: string;
  hasLicenseFile: boolean;
}

export interface PortalConfig {
  allowedFrameOrigins: string[];
  notificationEmail: string;
  portalBaseUrl: string;
  /** Default administration fee (EUR) pre-filled on a new fine. */
  fineAdminFee: number;
  /** Shown to customers with a booked reservation. */
  pickupAddress: string;
  openingHours: string;
  pickupInstructions: string;
  /** Shown with every return: what state the car must come back in, and what it costs if it does not. */
  returnInstructions: string;
  /** Shown to customers who collect and return at the shop: bringing and collecting can also be arranged, and what it costs. */
  deliveryNote: string;
  /** The garage's online planner (Garagesoftware), shown in an iframe when a customer plans the APK or maintenance themselves. Empty: no planner. */
  apkPlannerUrl: string;
  /** Link to the privacy statement, shown in the portal footer and on the login page. */
  privacyUrl: string;
  /** Phone number customers should call for changes that the portal no longer allows (e.g. maintenance within 48 hours). */
  phone: string;
  /**
   * Kees, 2026-10-18: renting the vehicles offered online, for the whole portal. Off = no customer sees
   * the online vehicles or can send a rental request for one, whatever their own switch says. Every
   * other request (extension, damage, question...) keeps working.
   */
  onlineBookingEnabled: boolean;
}

/** The only host the garage planner may live on: the portal shows it in an iframe, and the CSP frame-src allows just this host. */
export const APK_PLANNER_HOST = 'planner.garage.software';

export const DEFAULT_PORTAL_CONFIG: PortalConfig = {
  allowedFrameOrigins: ['https://lamgroep.nl', 'https://www.lamgroep.nl'],
  notificationEmail: '',
  portalBaseUrl: '',
  fineAdminFee: 0,
  pickupAddress: 'Kerkweg 47a, 3214 VC Zuidland',
  openingHours: 'Maandag t/m vrijdag 08:00 - 17:00',
  pickupInstructions: 'Neem een geldig rijbewijs mee van de bestuurder die de auto ophaalt.',
  returnInstructions: 'Lever de auto schoon en compleet in. Is de auto niet schoon of niet compleet, dan brengen wij de kosten daarvan in rekening.',
  deliveryNote: 'Liever dat wij de auto brengen of ophalen? Dat kan in overleg, vanaf € 125. Neem contact met ons op.',
  apkPlannerUrl: 'https://planner.garage.software/#/afspraken/4353313633393035',
  privacyUrl: 'https://lamgroep.nl/privacy',
  phone: '0181 - 45 10 40',
  onlineBookingEnabled: true,
};

export const PORTAL_CONFIG_KEY = 'portal_config';

// ---- staff dashboard (GET /api/portal-admin/dashboard) ----------------------
export interface PortalDashboard {
  counts: {
    newRequests: number;
    inProgressRequests: number;
    unlinkedFines: number;
    onlineNow: number;
    pendingInvites: number;
    expiredInvites: number;
    vehiclesOnline: number;
    /** Vehicle/customer combinations that are blocked. */
    blacklistEntries: number;
    unreadNotifications: number;
    /** Open maintenance and maintenance-change requests plus placeholder spares from portal blocks that still need a car. */
    maintenance: number;
    /** Contracts and damage forms signed in the portal that the office has not marked as seen. */
    signedNew: number;
    /** Current unsigned contracts and damage forms of portal customers that nobody signed yet. */
    awaitingSignature: number;
    /** Documents customers uploaded that the office has not marked as seen (Kees, 2026-10-19). */
    uploadsNew: number;
    /** Open requests to cancel a reservation. */
    cancellations: number;
    /** Fines on a shared car still waiting for the customer to say who drove. */
    finesAwaitingDriver: number;
  };
  attention: {
    requests: Array<{
      id: number; type: string; status: string; customerId: number; customerName: string; reservationLabel: string | null; createdAt: string;
      /** Booking requests: the requested start date. */
      startDate: string | null;
      /** 'stale' = open too long, 'soon' = start date is near or passed. */
      urgency: 'stale' | 'soon' | null;
    }>;
    fines: Array<{ id: number; licensePlate: string; description: string; totalAmount: string; offenceAt: string }>;
    /** Signed in the portal and not yet seen by the office. */
    signatures: SignedDocumentRow[];
  };
  notifications: Array<{ id: number; type: string; title: string; description: string; link: string; isRead: boolean; createdAt: string }>;
  upcoming: Array<{
    reservationId: number; kind: "pickup" | "return"; date: string; status: string;
    customerId: number; customerName: string; driverName: string | null;
    vehicle: { id: number; brand: string; model: string; licensePlate: string } | null;
    viaPortal: boolean;
  }>;
}
