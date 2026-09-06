// DTOs the portal API returns and the portal client consumes. Kept apart from
// schema.ts so the client never has to import Drizzle table objects.

export const PORTAL_ERROR = {
  NOT_AUTHENTICATED: 'PORTAL_NOT_AUTHENTICATED',
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
  REQUEST_INVALID_PERIOD: 'PORTAL_REQUEST_INVALID_PERIOD',
  ATTACHMENT_LIMIT: 'PORTAL_ATTACHMENT_LIMIT',
  CSRF: 'PORTAL_CSRF',
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
}

/** Features that can be switched per customer and, on top of that, restricted per account. */
export const PORTAL_FEATURE_KEYS = ['canBook', 'canManageDrivers', 'canSubmitRequests', 'canViewFines', 'canViewContracts', 'showPrices', 'canReturn'] as const;
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
  language: 'nl' | 'en';
  settings: PortalSettingsFlags;
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
  vehicle: { id: number; licensePlate: string; brand: string; model: string } | null;
  driver: { id: number; displayName: string } | null;
  replacementForReservationId: number | null;
}

export interface PortalDocumentDto {
  id: number;
  reservationId: number | null;
  documentType: string;
  kind: 'contract' | 'damage_check';
  fileName: string;
  uploadDate: string;
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
}

export const DEFAULT_PORTAL_CONFIG: PortalConfig = {
  allowedFrameOrigins: ['https://lamgroep.nl', 'https://www.lamgroep.nl'],
  notificationEmail: '',
  portalBaseUrl: '',
  fineAdminFee: 0,
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
    unreadNotifications: number;
  };
  attention: {
    requests: Array<{ id: number; type: string; status: string; customerId: number; customerName: string; reservationLabel: string | null; createdAt: string }>;
    fines: Array<{ id: number; licensePlate: string; description: string; totalAmount: string; offenceAt: string }>;
  };
  notifications: Array<{ id: number; type: string; title: string; description: string; link: string; isRead: boolean; createdAt: string }>;
  upcoming: Array<{
    reservationId: number; kind: "pickup" | "return"; date: string; status: string;
    customerId: number; customerName: string; driverName: string | null;
    vehicle: { id: number; brand: string; model: string; licensePlate: string } | null;
    viaPortal: boolean;
  }>;
}
