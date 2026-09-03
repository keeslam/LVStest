export const FineStatus = {
  NEW: 'new', LINKED: 'linked', CHARGED: 'charged', PAID: 'paid', DISPUTED: 'disputed', CANCELLED: 'cancelled',
} as const;
export type FineStatusValue = typeof FineStatus[keyof typeof FineStatus];

// Lam Groep pays the authority and recharges the customer (+ admin fee):
// new -> linked -> charged -> paid, with disputed/cancelled on the side.
export const FINE_TRANSITIONS: Record<FineStatusValue, FineStatusValue[]> = {
  new: ['linked', 'cancelled'],
  linked: ['charged', 'disputed', 'cancelled', 'new'],
  charged: ['paid', 'disputed'],
  disputed: ['linked', 'charged', 'cancelled'],
  paid: [],
  cancelled: [],
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
