import { z } from "zod";

export const PortalRequestType = {
  BOOKING: 'booking', EXTENSION: 'extension', EARLY_RETURN: 'early_return', DAMAGE: 'damage', MAINTENANCE: 'maintenance', MILEAGE: 'mileage', FINE_QUESTION: 'fine_question', OTHER: 'other',
} as const;
export type PortalRequestTypeValue = typeof PortalRequestType[keyof typeof PortalRequestType];

export const PortalRequestStatus = { NEW: 'new', IN_PROGRESS: 'in_progress', DONE: 'done', REJECTED: 'rejected' } as const;
export type PortalRequestStatusValue = typeof PortalRequestStatus[keyof typeof PortalRequestStatus];

export const REQUEST_TRANSITIONS: Record<PortalRequestStatusValue, PortalRequestStatusValue[]> = {
  new: ['in_progress', 'done', 'rejected'],
  in_progress: ['done', 'rejected'],
  done: [],
  rejected: [],
};
export function isValidRequestTransition(from: string, to: string): boolean {
  return (REQUEST_TRANSITIONS[from as PortalRequestStatusValue] ?? []).includes(to as PortalRequestStatusValue);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
/** Form fields arrive as "" when left empty; treat that as absent. */
const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

export const requestPayloadSchemas = {
  /** Rental request for a vehicle offered online; the server adds vehicleLabel. */
  booking: z.object({
    vehicleId: z.coerce.number().int().positive(),
    startDate: isoDate,
    endDate: z.union([isoDate, z.literal("")]).default(""),
    startTime: z.preprocess(blankToUndefined, hhmm.optional()),
    endTime: z.preprocess(blankToUndefined, hhmm.optional()),
    driverId: z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional()),
    vehicleLabel: z.string().max(200).optional(),
    driverLabel: z.string().max(200).optional(),
  }),
  extension: z.object({ newEndDate: isoDate }),
  early_return: z.object({ returnDate: isoDate }),
  damage: z.object({ location: z.string().trim().max(200).default(""), occurredAt: z.string().trim().max(40).default("") }),
  /** Something wrong with the car (noise, warning light, tyres) or a service that is due. */
  maintenance: z.object({ issue: z.string().trim().min(1).max(500), mileage: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).optional()), urgent: z.preprocess((v) => v === true || v === "true", z.boolean().default(false)) }),
  /** Current odometer reading. */
  mileage: z.object({ mileage: z.coerce.number().int().min(0) }),
  fine_question: z.object({}),
  other: z.object({ subject: z.string().trim().min(1).max(200) }),
} as const;

/** Which link a type requires. */
export const REQUEST_NEEDS: Record<PortalRequestTypeValue, 'reservation' | 'fine' | null> = {
  booking: null, extension: 'reservation', early_return: 'reservation', damage: 'reservation', maintenance: 'reservation', mileage: 'reservation', fine_question: 'fine', other: null,
};

export interface PortalRequestAttachmentDto { id: number; fileName: string; contentType: string; fileSize: number }
export interface PortalRequestMessageDto { id: number; author: 'customer' | 'staff'; authorName: string; body: string; createdAt: string }

export interface PortalRequestDto {
  id: number;
  type: PortalRequestTypeValue;
  status: PortalRequestStatusValue;
  reservationId: number | null;
  fineId: number | null;
  payload: Record<string, unknown>;
  message: string;
  staffReply: string | null;
  repliedAt: string | null;
  createdAt: string;
  submittedBy: string | null;
  attachments: PortalRequestAttachmentDto[];
  /** Conversation on the request, oldest first. */
  messages: PortalRequestMessageDto[];
  /** Filled for staff views only */
  customerId?: number;
  customerName?: string;
  reservationLabel?: string | null;
}
