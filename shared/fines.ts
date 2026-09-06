export const FineStatus = {
  NEW: 'new', LINKED: 'linked', CHARGED: 'charged', PAID: 'paid', DISPUTED: 'disputed', CANCELLED: 'cancelled',
} as const;
export type FineStatusValue = typeof FineStatus[keyof typeof FineStatus];

// The app only records and shows fines; recharging and payment are handled in the
// accounting package. So: new -> linked, with disputed/cancelled on the side.
// 'charged' and 'paid' remain as values for rows created before that decision,
// but nothing moves into them any more.
export const FINE_TRANSITIONS: Record<FineStatusValue, FineStatusValue[]> = {
  new: ['linked', 'cancelled'],
  linked: ['disputed', 'cancelled', 'new'],
  charged: ['linked', 'disputed', 'cancelled'],
  disputed: ['linked', 'cancelled'],
  paid: ['linked'],
  cancelled: ['new', 'linked'],
};

export function isValidFineTransition(from: string, to: string): boolean {
  return (FINE_TRANSITIONS[from as FineStatusValue] ?? []).includes(to as FineStatusValue);
}

export const CUSTOMER_VISIBLE_FINE_STATUSES: FineStatusValue[] = ['linked', 'charged', 'paid', 'disputed'];

/** "94-xt-184" -> "94XT184" so lookups on vehicles.license_plate match. */
export function normalizeLicensePlate(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '');
}

export interface PortalFineDto {
  id: number;
  licensePlate: string;
  offenceAt: string;
  description: string;
  reference: string | null;
  amount: string;
  adminFee: string;
  totalAmount: string;
  status: FineStatusValue;
  customerNote: string | null;
  driver: { id: number; displayName: string } | null;
  reservationId: number | null;
  hasLetter: boolean;
  createdAt: string;
}

// ---- letter scanning (POST /api/fines/scan) -----------------------------------
export type ScanConfidence = 'high' | 'medium' | 'low';

/** What the AI read from one fine letter; every field may be missing. */
export interface ParsedFineLetter {
  licensePlate: string | null;
  /** Local wall-clock ISO without zone, e.g. 2026-07-26T21:17:00 */
  offenceAt: string | null;
  letterDate: string | null;
  reference: string | null;
  description: string;
  amount: number | null;
  dueDate: string | null;
  issuer: string | null;
  confidence: { licensePlate: ScanConfidence; offenceAt: ScanConfidence; amount: ScanConfidence; reference: ScanConfidence };
}

export interface FineScanCandidate {
  id: number; customerId: number | null; customerName: string | null;
  startDate: string; endDate: string | null; driverId: number | null; driverName: string | null;
}

/** Scan result: the parsed letter plus what attribution would do with it. */
export interface FineScanResult {
  parsed: ParsedFineLetter;
  /** Known vehicle for the plate, if any. */
  vehicle: { id: number; brand: string; model: string } | null;
  candidates: { covering: FineScanCandidate[]; near: FineScanCandidate[] };
  /** Existing fine with the same reference (a letter scanned twice). */
  duplicateOf: { id: number; status: string } | null;
}

// ---- CJIB import (FTPS, receive only) ----------------------------------------
export type FineSource = 'manual' | 'scan' | 'cjib';

export const CJIB_CONFIG_KEY = 'cjib_config';

export interface CjibConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: 'implicit' | 'explicit';
  username: string;
  password: string;
  inboxDir: string;
  processedDir: string;
  pollMinutes: number;
  filePattern: string;
}

export const DEFAULT_CJIB_CONFIG: CjibConfig = {
  enabled: false, host: '', port: 990, secure: 'implicit', username: '', password: '',
  inboxDir: '/', processedDir: '', pollMinutes: 60, filePattern: '\\.(xml|csv)$',
};

/** Shown instead of the stored password. */
export const CJIB_PASSWORD_MASK = '********';

/** One record read from a CJIB file, before it becomes a fine. */
export interface CjibRecord {
  reference: string;
  licensePlate: string;
  offenceAt: Date;
  description: string;
  amount: number;
  letterDate: string | null;
  dueDate: string | null;
  offenceCode: string | null;
  location: string | null;
  raw: Record<string, string>;
}

export interface CjibRunSummary {
  startedAt: string;
  finishedAt: string;
  trigger: 'scheduler' | 'manual';
  files: number;
  skipped: number;
  created: number;
  linked: number;
  duplicate: number;
  failed: number;
  errors: string[];
}
