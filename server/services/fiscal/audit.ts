/**
 * The fiscal audit trail: append-only. This module only ever inserts; no
 * route updates or deletes a row (a test walks the router to prove it).
 *
 * Events that belong to a state change are written inside the same
 * transaction as the change, so there is never a published version without
 * its "published" event or the other way round.
 */
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db";
import { fiscalAuditEvents, type FiscalAuditEvent } from "../../../shared/schema";
import type { FiscalAuditAction, FiscalAuditEntityType } from "../../../shared/fiscal-types";
import { FISCAL_SCOPE_GLOBAL } from "../../../shared/fiscal-types";

export interface Actor {
  userId: number | null;
  username: string;
  role?: string | null;
  permissionUsed?: string | null;
  ipAddress?: string | null;
}

export interface FiscalEventInput {
  action: FiscalAuditAction;
  entityType: FiscalAuditEntityType;
  entityId?: number | null;
  ruleKey?: string | null;
  ruleVersionId?: number | null;
  parameterKey?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  unit?: string | null;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  reasonCategory?: string | null;
  reasonText?: string | null;
  sourceUrl?: string | null;
  customerId?: number | null;
  vehicleId?: number | null;
  validationResult?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
}

/** Anything with an `insert` — the shared `db` or a transaction handle. */
export type Executor = Pick<typeof db, "insert">;

export async function recordFiscalEvent(actor: Actor, event: FiscalEventInput, executor: Executor = db): Promise<void> {
  await executor.insert(fiscalAuditEvents).values({
    userId: actor.userId,
    username: actor.username,
    role: actor.role ?? null,
    permissionUsed: actor.permissionUsed ?? null,
    ipAddress: actor.ipAddress ?? null,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    ruleKey: event.ruleKey ?? null,
    ruleVersionId: event.ruleVersionId ?? null,
    parameterKey: event.parameterKey ?? null,
    oldValue: event.oldValue ?? null,
    newValue: event.newValue ?? null,
    unit: event.unit ?? null,
    scope: FISCAL_SCOPE_GLOBAL,
    effectiveFrom: event.effectiveFrom ?? null,
    effectiveUntil: event.effectiveUntil ?? null,
    reasonCategory: event.reasonCategory ?? null,
    reasonText: event.reasonText ?? null,
    sourceUrl: event.sourceUrl ?? null,
    customerId: event.customerId ?? null,
    vehicleId: event.vehicleId ?? null,
    validationResult: event.validationResult ?? null,
    details: event.details ?? null,
  });
}

export interface AuditFilter {
  ruleVersionId?: number;
  entityType?: string;
  entityId?: number;
  customerId?: number;
  vehicleId?: number;
  username?: string;
  from?: string;
  to?: string;
  limit?: number;
}

/** Reads the trail. The only other thing this module does is insert. */
export async function listFiscalAuditEvents(filter: AuditFilter = {}): Promise<FiscalAuditEvent[]> {
  const conditions = [];
  if (filter.ruleVersionId !== undefined) conditions.push(eq(fiscalAuditEvents.ruleVersionId, filter.ruleVersionId));
  if (filter.entityType) conditions.push(eq(fiscalAuditEvents.entityType, filter.entityType));
  if (filter.entityId !== undefined) conditions.push(eq(fiscalAuditEvents.entityId, filter.entityId));
  if (filter.customerId !== undefined) conditions.push(eq(fiscalAuditEvents.customerId, filter.customerId));
  if (filter.vehicleId !== undefined) conditions.push(eq(fiscalAuditEvents.vehicleId, filter.vehicleId));
  if (filter.username) conditions.push(eq(fiscalAuditEvents.username, filter.username));
  if (filter.from) conditions.push(gte(fiscalAuditEvents.occurredAt, new Date(filter.from)));
  if (filter.to) conditions.push(lte(fiscalAuditEvents.occurredAt, new Date(filter.to)));
  return db
    .select()
    .from(fiscalAuditEvents)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(fiscalAuditEvents.occurredAt), desc(fiscalAuditEvents.id))
    .limit(Math.min(filter.limit ?? 100, 500));
}

/** Text form of a parameter value for the old/new columns. */
export function auditValueText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}
