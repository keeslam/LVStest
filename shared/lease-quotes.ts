// Lease quotes: statuses, numbering, PDF template sources and the API payload.
// Shared by server and client. All amounts are excl. btw.
import { z } from "zod";

export const LEASE_QUOTE_STATUSES = ["concept", "sent", "accepted", "rejected"] as const;
export type LeaseQuoteStatus = (typeof LEASE_QUOTE_STATUSES)[number];
export type LeaseQuoteDisplayStatus = LeaseQuoteStatus | "expired";

/**
 * `expired` is derived, never stored: an open quote (concept or sent) whose
 * validUntil lies before today. All three arguments' dates are ISO (YYYY-MM-DD),
 * so string comparison is date comparison.
 */
export function displayStatus(status: string, validUntil: string, today: string): LeaseQuoteDisplayStatus {
  if ((status === "concept" || status === "sent") && validUntil < today) return "expired";
  return status as LeaseQuoteStatus;
}

/** "LO-2026-0001" */
export function formatQuoteNumber(year: number, seq: number): string {
  return `LO-${year}-${String(seq).padStart(4, "0")}`;
}

/** Editing a quote in these statuses asks the user to confirm first. */
export function isEditWarningStatus(status: string): boolean {
  return status === "sent" || status === "accepted";
}

/**
 * Sources a field on the customer PDF may be filled from. Deliberately no
 * depreciation, interest, margin, ROB, insurance, road tax, other costs,
 * purchase price, residual value or other variants.
 * companyName and signatureLandlord are the company/landlord keys of the
 * contract template (CONTRACT_FIELD_SOURCES / SIGNATURE_LANDLORD_SOURCE).
 */
export const LEASE_QUOTE_TEMPLATE_SOURCES: readonly string[] = [
  "quoteNumber", "quoteDate", "validUntil",
  "customerName", "customerContact", "customerAddress", "customerPostalCode", "customerCity", "customerEmail",
  "vehicleMake", "vehicleModel", "vehicleTrim", "licensePlate", "deliveryTime",
  "termMonths", "kmPerYear", "monthlyPriceExclVat", "excessKmPrice", "shortfallKmPrice",
  "companyName", "signatureLandlord",
];

const num = z.number().finite();
const optNum = num.nullable().optional();
const optText = z.string().nullable().optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const priceBreakdownSchema = z.object({
  catalogPrice: optNum,
  options: optNum,
  discount: optNum,
  bpm: optNum,
  deliveryCosts: optNum,
  totalExclVat: optNum,
  totalInclVat: optNum,
});

export const leaseQuoteVariantPayloadSchema = z.object({
  termMonths: z.number().int().positive(),
  kmPerYear: z.number().int().positive(),
  residualValue: num.min(0),
  isChosen: z.boolean(),
});

/** Body of POST/PATCH /api/lease-quotes. Unknown keys are stripped. */
export const leaseQuotePayloadSchema = z.object({
  status: z.enum(LEASE_QUOTE_STATUSES).optional(),
  quoteDate: isoDate.optional(),
  validUntil: isoDate.optional(),
  customerId: z.number().int().nullable().optional(),
  prospectName: optText,
  prospectCompany: optText,
  prospectEmail: optText,
  prospectPhone: optText,
  vehicleMake: optText,
  vehicleModel: optText,
  vehicleTrim: optText,
  licensePlate: optText,
  dealerName: optText,
  deliveryTime: optText,
  vehicleNotes: optText,
  purchasePrice: optNum,
  priceBreakdown: priceBreakdownSchema.nullable().optional(),
  interestRatePercent: optNum,
  robPerYear: optNum,
  otherCostsPerYear: optNum,
  insurancePerMonth: optNum,
  roadTaxPerMonth: optNum,
  marginPerMonth: optNum,
  excessKmPrice: optNum,
  shortfallKmPrice: optNum,
  internalNotes: optText,
  variants: z.array(leaseQuoteVariantPayloadSchema).min(1).refine(
    (list) => list.filter((v) => v.isChosen).length === 1,
    { message: "Exactly one variant must be chosen" },
  ),
});

export type LeaseQuotePayload = z.infer<typeof leaseQuotePayloadSchema>;
