import { z } from "zod";

export const PortalRequestType = {
  EXTENSION: 'extension', EARLY_RETURN: 'early_return', DAMAGE: 'damage', FINE_QUESTION: 'fine_question', OTHER: 'other',
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

export const requestPayloadSchemas = {
  extension: z.object({ newEndDate: isoDate }),
  early_return: z.object({ returnDate: isoDate }),
  damage: z.object({ location: z.string().trim().max(200).default(""), occurredAt: z.string().trim().max(40).default("") }),
  fine_question: z.object({}),
  other: z.object({ subject: z.string().trim().min(1).max(200) }),
} as const;

/** Which link a type requires. */
export const REQUEST_NEEDS: Record<PortalRequestTypeValue, 'reservation' | 'fine' | null> = {
  extension: 'reservation', early_return: 'reservation', damage: 'reservation', fine_question: 'fine', other: null,
};

export interface PortalRequestAttachmentDto { id: number; fileName: string; contentType: string; fileSize: number }

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
  /** Filled for staff views only */
  customerId?: number;
  customerName?: string;
  reservationLabel?: string | null;
}
