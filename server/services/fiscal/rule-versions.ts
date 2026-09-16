/**
 * Rule versions: the controlled life of a fiscal configuration.
 *
 *   draft ──submit──▶ in_review ──approve──▶ approved ──publish──▶ published ──▶ superseded
 *     │                   └──reject──▶ rejected                        └──archive──▶ archived
 *     └──archive──▶ archived
 *
 * A published row is immutable. The single exception is made by the system
 * when a successor is published: an open predecessor gets `effective_until`
 * the day before and the status `superseded`, audited with old and new
 * value. Every gate validates; every step writes to the fiscal audit trail in
 * the same transaction as the change.
 */
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  fiscalParameterValues,
  fiscalRuleVersions,
  type FiscalParameterValue,
  type FiscalRuleVersion,
} from "../../../shared/schema";
import {
  FISCAL_RULE_KEYS,
  REASON_CATEGORIES,
  type FiscalRuleKey,
  type ReasonCategory,
  type RuleVersionStatus,
} from "../../../shared/fiscal-types";
import { definitionFor, definitionsForRule, type FiscalParameterDefinition } from "./definitions";
import { ParameterSet, type ParameterSource, type ParameterValidationIssue } from "./parameters";
import { addDays, compareIso, isValidIsoDate } from "./calendar";
import { auditValueText, recordFiscalEvent, type Actor, type Executor } from "./audit";
import { clearFiscalResolveCache } from "./resolve";
import { isoToday } from "../lifecycle";

export { FiscalStateError, FiscalValidationError, FiscalNotFoundError } from "./errors";
import { FiscalStateError, FiscalValidationError, FiscalNotFoundError } from "./errors";

// ---- value rows ------------------------------------------------------------------------------

type DbValue = number | boolean | string | string[] | null;

/** The typed value of a stored row, according to its definition. */
export function valueFromRow(def: FiscalParameterDefinition, row: FiscalParameterValue): DbValue {
  switch (def.dataType) {
    case "decimal":
      return row.valueDecimal === null ? null : Number(row.valueDecimal);
    case "integer":
      return row.valueInteger;
    case "boolean":
      return row.valueBoolean;
    case "date":
      return row.valueDate;
    case "choice":
      return row.valueText;
    case "list":
      return row.valueList;
  }
}

function rowColumnsFor(def: FiscalParameterDefinition, value: DbValue) {
  const empty = { valueDecimal: null, valueInteger: null, valueBoolean: null, valueDate: null, valueText: null, valueList: null };
  if (value === null) return empty;
  switch (def.dataType) {
    case "decimal":
      return { ...empty, valueDecimal: String(value) };
    case "integer":
      return { ...empty, valueInteger: value as number };
    case "boolean":
      return { ...empty, valueBoolean: value as boolean };
    case "date":
      return { ...empty, valueDate: value as string };
    case "choice":
      return { ...empty, valueText: value as string };
    case "list":
      return { ...empty, valueList: value as string[] };
  }
}

export interface VersionDetail extends FiscalRuleVersion {
  values: Record<string, DbValue>;
  sources: Record<string, ParameterSource>;
  parameterRows: FiscalParameterValue[];
}

async function loadRows(versionId: number, executor: Pick<typeof db, "select"> = db): Promise<FiscalParameterValue[]> {
  return executor.select().from(fiscalParameterValues).where(eq(fiscalParameterValues.ruleVersionId, versionId));
}

export function valuesFromRows(ruleKey: FiscalRuleKey, rows: FiscalParameterValue[]): { values: Record<string, DbValue>; sources: Record<string, ParameterSource> } {
  const values: Record<string, DbValue> = {};
  const sources: Record<string, ParameterSource> = {};
  const defs = new Map(definitionsForRule(ruleKey).map((d) => [d.key, d]));
  for (const row of rows) {
    const def = defs.get(row.parameterKey);
    if (!def) continue;
    values[row.parameterKey] = valueFromRow(def, row);
    sources[row.parameterKey] = { sourceUrl: row.sourceUrl, sourceReference: row.sourceReference };
  }
  return { values, sources };
}

// ---- reads ------------------------------------------------------------------------------------

export async function getVersion(id: number): Promise<VersionDetail | null> {
  const [version] = await db.select().from(fiscalRuleVersions).where(eq(fiscalRuleVersions.id, id));
  if (!version) return null;
  const rows = await loadRows(id);
  return { ...version, ...valuesFromRows(version.ruleKey as FiscalRuleKey, rows), parameterRows: rows };
}

async function requireVersion(id: number): Promise<FiscalRuleVersion> {
  const [version] = await db.select().from(fiscalRuleVersions).where(eq(fiscalRuleVersions.id, id));
  if (!version) throw new FiscalNotFoundError();
  return version;
}

export async function listVersions(filter: { ruleKey?: FiscalRuleKey; status?: RuleVersionStatus } = {}): Promise<FiscalRuleVersion[]> {
  const conditions = [];
  if (filter.ruleKey) conditions.push(eq(fiscalRuleVersions.ruleKey, filter.ruleKey));
  if (filter.status) conditions.push(eq(fiscalRuleVersions.status, filter.status));
  return db
    .select()
    .from(fiscalRuleVersions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(fiscalRuleVersions.ruleKey, desc(fiscalRuleVersions.versionNumber));
}

// ---- validation --------------------------------------------------------------------------------

export interface VersionValidation {
  ok: boolean;
  issues: ParameterValidationIssue[];
}

function validateMetadata(version: FiscalRuleVersion, defs: FiscalParameterDefinition[]): ParameterValidationIssue[] {
  const issues: ParameterValidationIssue[] = [];
  if (!version.effectiveFrom) issues.push({ key: "effective_from", message: "ingangsdatum is verplicht" });
  else if (!isValidIsoDate(version.effectiveFrom)) issues.push({ key: "effective_from", message: "geen geldige datum" });
  if (version.effectiveUntil) {
    if (!isValidIsoDate(version.effectiveUntil)) issues.push({ key: "effective_until", message: "geen geldige datum" });
    else if (version.effectiveFrom && compareIso(version.effectiveUntil, version.effectiveFrom) < 0) {
      issues.push({ key: "effective_until", message: "einddatum ligt vóór de ingangsdatum" });
    }
  }
  if (!version.reasonText || version.reasonText.trim().length < 10) issues.push({ key: "reason_text", message: "reden is verplicht (minimaal 10 tekens)" });
  if (!REASON_CATEGORIES.includes(version.reasonCategory as ReasonCategory)) issues.push({ key: "reason_category", message: "onbekende redencategorie" });
  if (defs.some((d) => d.legalStatus === "legal")) {
    if (!version.sourceUrl || !/^https?:\/\//.test(version.sourceUrl)) issues.push({ key: "source_url", message: "bron (URL) is verplicht voor wettelijke parameters" });
    if (!version.legalReference || !version.legalReference.trim()) issues.push({ key: "legal_reference", message: "wettelijke referentie is verplicht" });
  }
  return issues;
}

export async function validateVersion(id: number): Promise<VersionValidation> {
  const version = await requireVersion(id);
  const defs = definitionsForRule(version.ruleKey as FiscalRuleKey);
  const rows = await loadRows(id);
  const { values } = valuesFromRows(version.ruleKey as FiscalRuleKey, rows);
  const issues = [...validateMetadata(version, defs), ...ParameterSet.validate(defs, values).issues];
  return { ok: issues.length === 0, issues };
}

// ---- writes -------------------------------------------------------------------------------------

function assertRuleKey(ruleKey: string): asserts ruleKey is FiscalRuleKey {
  if (!(FISCAL_RULE_KEYS as readonly string[]).includes(ruleKey)) {
    throw new FiscalValidationError("Onbekende fiscale regel", [{ key: "rule_key", message: `onbekend: ${ruleKey}` }]);
  }
}

export interface CreateDraftInput {
  ruleKey: string;
  title: string;
  reasonCategory: string;
  reasonText: string;
  copyFromId?: number | null;
}

export async function createDraft(input: CreateDraftInput, actor: Actor): Promise<FiscalRuleVersion> {
  assertRuleKey(input.ruleKey);
  if (!input.title?.trim()) throw new FiscalValidationError("Titel is verplicht", [{ key: "title", message: "verplicht" }]);
  if (!REASON_CATEGORIES.includes(input.reasonCategory as ReasonCategory)) {
    throw new FiscalValidationError("Onbekende redencategorie", [{ key: "reason_category", message: "onbekend" }]);
  }
  const source = input.copyFromId ? await getVersion(input.copyFromId) : null;
  if (input.copyFromId && !source) throw new FiscalNotFoundError("Te kopiëren versie niet gevonden");

  return db.transaction(async (tx) => {
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${fiscalRuleVersions.versionNumber}), 0)` })
      .from(fiscalRuleVersions)
      .where(eq(fiscalRuleVersions.ruleKey, input.ruleKey));
    const [version] = await tx
      .insert(fiscalRuleVersions)
      .values({
        ruleKey: input.ruleKey,
        versionNumber: Number(max) + 1,
        status: "draft",
        title: input.title.trim(),
        reasonCategory: input.reasonCategory,
        reasonText: input.reasonText ?? "",
        sourceOrganisation: source?.sourceOrganisation ?? null,
        sourceUrl: source?.sourceUrl ?? null,
        legalReference: source?.legalReference ?? null,
        assumptions: source?.assumptions ?? null,
        createdBy: actor.userId,
        createdByName: actor.username,
      })
      .returning();
    if (source) {
      for (const row of source.parameterRows) {
        const { id: _id, ruleVersionId: _v, createdAt: _c, updatedAt: _u, ...rest } = row;
        await tx.insert(fiscalParameterValues).values({ ...rest, ruleVersionId: version.id });
      }
    }
    await recordFiscalEvent(
      actor,
      {
        action: "draft_created",
        entityType: "rule_version",
        entityId: version.id,
        ruleKey: version.ruleKey,
        ruleVersionId: version.id,
        reasonCategory: version.reasonCategory,
        reasonText: version.reasonText,
        details: source ? { copiedFrom: source.id } : null,
      },
      tx,
    );
    return version;
  });
}

export interface UpdateDraftInput {
  title?: string;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  reasonCategory?: string;
  reasonText?: string;
  sourceOrganisation?: string | null;
  sourceUrl?: string | null;
  legalReference?: string | null;
  sourceVerifiedAt?: string | null;
  assumptions?: string | null;
}

const EDITABLE_FIELDS = [
  "title", "effectiveFrom", "effectiveUntil", "reasonCategory", "reasonText",
  "sourceOrganisation", "sourceUrl", "legalReference", "assumptions",
] as const;

export async function updateDraft(id: number, input: UpdateDraftInput, actor: Actor): Promise<FiscalRuleVersion> {
  const version = await requireVersion(id);
  if (version.status !== "draft") throw new FiscalStateError(`Alleen een concept kan worden bewerkt (status is ${version.status})`);
  const issues: ParameterValidationIssue[] = [];
  for (const key of ["effectiveFrom", "effectiveUntil"] as const) {
    const v = input[key];
    if (v !== undefined && v !== null && !isValidIsoDate(v)) issues.push({ key, message: "geen geldige datum (jjjj-mm-dd)" });
  }
  if (input.reasonCategory !== undefined && !REASON_CATEGORIES.includes(input.reasonCategory as ReasonCategory)) {
    issues.push({ key: "reasonCategory", message: "onbekende redencategorie" });
  }
  if (issues.length) throw new FiscalValidationError("Ongeldige invoer", issues);

  const patch: Partial<typeof fiscalRuleVersions.$inferInsert> = { updatedAt: new Date() };
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of EDITABLE_FIELDS) {
    if (input[key] === undefined) continue;
    const next = typeof input[key] === "string" ? (input[key] as string).trim() || null : input[key];
    if ((version[key] ?? null) !== (next ?? null)) {
      changes[key] = { old: version[key] ?? null, new: next };
      (patch as Record<string, unknown>)[key] = next;
    }
  }
  if (input.sourceVerifiedAt !== undefined) {
    patch.sourceVerifiedAt = input.sourceVerifiedAt ? new Date(input.sourceVerifiedAt) : null;
    patch.sourceVerifiedByName = input.sourceVerifiedAt ? actor.username : null;
    changes.sourceVerifiedAt = { old: version.sourceVerifiedAt, new: input.sourceVerifiedAt };
  }
  if (patch.title === null) throw new FiscalValidationError("Titel is verplicht", [{ key: "title", message: "verplicht" }]);

  return db.transaction(async (tx) => {
    const [updated] = await tx.update(fiscalRuleVersions).set(patch).where(eq(fiscalRuleVersions.id, id)).returning();
    if (Object.keys(changes).length) {
      await recordFiscalEvent(
        actor,
        {
          action: "draft_edited",
          entityType: "rule_version",
          entityId: id,
          ruleKey: version.ruleKey,
          ruleVersionId: id,
          effectiveFrom: updated.effectiveFrom,
          effectiveUntil: updated.effectiveUntil,
          details: { changes },
        },
        tx,
      );
    }
    return updated;
  });
}

export interface ParameterInput extends ParameterSource {
  key: string;
  value: unknown;
  notes?: string | null;
}

export interface SetParametersResult {
  values: Record<string, DbValue>;
  validation: VersionValidation;
}

/**
 * Upserts parameter values on a draft. Values that do not fit their definition
 * are still stored (so the screen can show them) but reported in
 * `validation`; submission is what refuses them. An unknown key is a 400.
 */
export async function setParameters(id: number, inputs: ParameterInput[], actor: Actor): Promise<SetParametersResult> {
  const version = await requireVersion(id);
  if (version.status !== "draft") throw new FiscalStateError(`Alleen op een concept kunnen parameters worden gezet (status is ${version.status})`);
  const ruleKey = version.ruleKey as FiscalRuleKey;
  const defs = definitionsForRule(ruleKey);
  const defMap = new Map(defs.map((d) => [d.key, d]));
  const unknown = inputs.filter((i) => !defMap.has(i.key));
  if (unknown.length) {
    throw new FiscalValidationError("Onbekende parameter(s)", unknown.map((u) => ({ key: u.key, message: "onbekende parameter voor deze regel" })));
  }

  // Problems with what was just typed, reported as typed (the stored form may
  // have lost the detail, e.g. a non-integer day count is stored as nothing).
  const inputIssues: ParameterValidationIssue[] = [];
  await db.transaction(async (tx) => {
    const existing = await loadRows(id, tx);
    const byKey = new Map(existing.map((r) => [r.parameterKey, r]));
    for (const input of inputs) {
      const def = defMap.get(input.key)!;
      // Coerce only what can be stored in the typed column; keep the raw shape otherwise.
      const single = ParameterSet.validate([def], { [def.key]: input.value });
      inputIssues.push(...single.issues);
      const storable: DbValue = single.ok ? (ParameterSet.fromValues([def], { [def.key]: input.value }).snapshot()[0].value as DbValue) : coerceLoosely(def, input.value);
      const previous = byKey.get(input.key);
      const oldValue = previous ? valueFromRow(def, previous) : null;
      const columns = rowColumnsFor(def, storable);
      if (previous) {
        await tx
          .update(fiscalParameterValues)
          .set({
            ...columns,
            sourceUrl: input.sourceUrl === undefined ? previous.sourceUrl : input.sourceUrl,
            sourceReference: input.sourceReference === undefined ? previous.sourceReference : input.sourceReference,
            notes: input.notes === undefined ? previous.notes : input.notes,
            updatedAt: new Date(),
          })
          .where(eq(fiscalParameterValues.id, previous.id));
      } else {
        await tx.insert(fiscalParameterValues).values({
          ruleVersionId: id,
          parameterKey: def.key,
          ...columns,
          unit: def.unit,
          legalStatus: def.legalStatus,
          sourceUrl: input.sourceUrl ?? null,
          sourceReference: input.sourceReference ?? null,
          notes: input.notes ?? null,
        });
      }
      if (auditValueText(oldValue) !== auditValueText(storable)) {
        await recordFiscalEvent(
          actor,
          {
            action: "draft_edited",
            entityType: "parameter",
            entityId: id,
            ruleKey,
            ruleVersionId: id,
            parameterKey: def.key,
            oldValue: auditValueText(oldValue),
            newValue: auditValueText(storable),
            unit: def.unit,
            sourceUrl: input.sourceUrl ?? null,
          },
          tx,
        );
      }
    }
    await tx.update(fiscalRuleVersions).set({ updatedAt: new Date() }).where(eq(fiscalRuleVersions.id, id));
  });

  const detail = (await getVersion(id))!;
  const stored = await validateVersion(id);
  const seen = new Set(inputIssues.map((i) => i.key));
  const issues = [...inputIssues, ...stored.issues.filter((i) => !seen.has(i.key))];
  return { values: detail.values, validation: { ok: issues.length === 0, issues } };
}

/** Best-effort storage of a value that failed validation, so the screen can show what was typed. */
function coerceLoosely(def: FiscalParameterDefinition, raw: unknown): DbValue {
  if (raw === null || raw === undefined || raw === "") return null;
  switch (def.dataType) {
    case "decimal":
    case "integer": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      // A non-integer day count is not silently truncated into a valid one.
      return def.dataType === "integer" && !Number.isInteger(n) ? null : n;
    }
    case "boolean":
      return raw === true || raw === "true";
    case "date":
      return isValidIsoDate(raw) ? raw : null;
    case "choice":
      return typeof raw === "string" ? raw : null;
    case "list":
      return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : null;
  }
}

// ---- transitions ---------------------------------------------------------------------------------

async function transition(
  id: number,
  from: RuleVersionStatus[],
  to: RuleVersionStatus,
  actor: Actor,
  action: "submitted" | "approved" | "rejected" | "archived",
  patch: Partial<typeof fiscalRuleVersions.$inferInsert>,
  details: Record<string, unknown> | null = null,
): Promise<FiscalRuleVersion> {
  const version = await requireVersion(id);
  if (!from.includes(version.status as RuleVersionStatus)) {
    throw new FiscalStateError(`Overgang naar ${to} is niet toegestaan vanuit ${version.status}`);
  }
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(fiscalRuleVersions)
      .set({ ...patch, status: to, updatedAt: new Date() })
      .where(eq(fiscalRuleVersions.id, id))
      .returning();
    await recordFiscalEvent(
      actor,
      {
        action,
        entityType: "rule_version",
        entityId: id,
        ruleKey: version.ruleKey,
        ruleVersionId: id,
        oldValue: version.status,
        newValue: to,
        effectiveFrom: updated.effectiveFrom,
        effectiveUntil: updated.effectiveUntil,
        reasonCategory: updated.reasonCategory,
        reasonText: updated.reasonText,
        sourceUrl: updated.sourceUrl,
        details,
      },
      tx,
    );
    return updated;
  });
}

async function validateOrRecord(id: number, actor: Actor, gate: string): Promise<void> {
  const validation = await validateVersion(id);
  if (validation.ok) return;
  const version = await requireVersion(id);
  await recordFiscalEvent(actor, {
    action: "validation_failed",
    entityType: "rule_version",
    entityId: id,
    ruleKey: version.ruleKey,
    ruleVersionId: id,
    validationResult: { gate, ok: false, issues: validation.issues },
  });
  throw new FiscalValidationError(`Regelversie is niet compleet (${gate})`, validation.issues);
}

export async function submitVersion(id: number, actor: Actor): Promise<FiscalRuleVersion> {
  const version = await requireVersion(id);
  if (version.status !== "draft") throw new FiscalStateError(`Alleen een concept kan worden ingediend (status is ${version.status})`);
  await validateOrRecord(id, actor, "submit");
  return transition(id, ["draft"], "in_review", actor, "submitted", { submittedBy: actor.userId, submittedByName: actor.username, submittedAt: new Date() });
}

export async function approveVersion(id: number, actor: Actor): Promise<FiscalRuleVersion> {
  return transition(id, ["in_review"], "approved", actor, "approved", { approvedBy: actor.userId, approvedByName: actor.username, approvedAt: new Date() });
}

export async function rejectVersion(id: number, reason: string, actor: Actor): Promise<FiscalRuleVersion> {
  if (!reason || !reason.trim()) throw new FiscalValidationError("Reden van afwijzing is verplicht", [{ key: "reason", message: "verplicht" }]);
  return transition(id, ["in_review"], "rejected", actor, "rejected", { rejectedBy: actor.userId, rejectedByName: actor.username, rejectedAt: new Date(), rejectionReason: reason.trim() }, { reason: reason.trim() });
}

/**
 * Publishes an approved version. Checks that its window does not overlap a
 * published or superseded window of the same rule; closes an open predecessor
 * (the one system-made change to a published row) and audits both.
 */
export async function publishVersion(id: number, actor: Actor): Promise<FiscalRuleVersion> {
  const version = await requireVersion(id);
  if (version.status !== "approved") throw new FiscalStateError(`Alleen een goedgekeurde versie kan worden gepubliceerd (status is ${version.status})`);
  await validateOrRecord(id, actor, "publish");
  const from = version.effectiveFrom!;
  const until = version.effectiveUntil;

  const others = await db
    .select()
    .from(fiscalRuleVersions)
    .where(and(eq(fiscalRuleVersions.ruleKey, version.ruleKey), inArray(fiscalRuleVersions.status, ["published", "superseded"]), ne(fiscalRuleVersions.id, id)));

  let toClose: FiscalRuleVersion | null = null;
  for (const other of others) {
    const oFrom = other.effectiveFrom!;
    const oUntil = other.effectiveUntil;
    if (compareIso(oFrom, from) >= 0) {
      // The other one starts on or after us: we may not reach into it.
      if (until === null || compareIso(until, oFrom) >= 0) {
        throw new FiscalStateError(`Versie ${version.versionNumber} overlapt met versie ${other.versionNumber} (ingang ${oFrom})`);
      }
      continue;
    }
    // The other one starts before us.
    if (oUntil === null) {
      if (other.status !== "published") throw new FiscalStateError(`Versie ${other.versionNumber} is ${other.status} zonder einddatum; controleer de configuratie`);
      if (toClose) throw new FiscalStateError("Meer dan één open gepubliceerde versie gevonden; controleer de configuratie");
      toClose = other;
    } else if (compareIso(oUntil, from) >= 0) {
      throw new FiscalStateError(`Versie ${version.versionNumber} overlapt met versie ${other.versionNumber} (${oFrom} tot en met ${oUntil})`);
    }
  }

  const published = await db.transaction(async (tx) => {
    if (toClose) {
      const closingDate = addDays(from, -1);
      await tx
        .update(fiscalRuleVersions)
        .set({ effectiveUntil: closingDate, status: "superseded", supersededById: id, updatedAt: new Date() })
        .where(eq(fiscalRuleVersions.id, toClose.id));
      await recordFiscalEvent(
        actor,
        {
          action: "superseded",
          entityType: "rule_version",
          entityId: toClose.id,
          ruleKey: toClose.ruleKey,
          ruleVersionId: toClose.id,
          parameterKey: "effective_until",
          oldValue: null,
          newValue: closingDate,
          effectiveFrom: toClose.effectiveFrom,
          effectiveUntil: closingDate,
          details: { supersededBy: id },
        },
        tx,
      );
    }
    const [updated] = await tx
      .update(fiscalRuleVersions)
      .set({ status: "published", publishedBy: actor.userId, publishedByName: actor.username, publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(fiscalRuleVersions.id, id))
      .returning();
    await recordFiscalEvent(
      actor,
      {
        action: "published",
        entityType: "rule_version",
        entityId: id,
        ruleKey: version.ruleKey,
        ruleVersionId: id,
        oldValue: "approved",
        newValue: "published",
        effectiveFrom: updated.effectiveFrom,
        effectiveUntil: updated.effectiveUntil,
        reasonCategory: updated.reasonCategory,
        reasonText: updated.reasonText,
        sourceUrl: updated.sourceUrl,
        details: toClose ? { closedPredecessor: toClose.id } : null,
      },
      tx,
    );
    return updated;
  });
  clearFiscalResolveCache();
  return published;
}

/** A draft can always be discarded; a published or superseded version only once its window lies entirely in the past. */
export async function archiveVersion(id: number, actor: Actor): Promise<FiscalRuleVersion> {
  const version = await requireVersion(id);
  if (version.status === "published" || version.status === "superseded") {
    if (!version.effectiveUntil || compareIso(version.effectiveUntil, isoToday()) >= 0) {
      throw new FiscalStateError("Een gepubliceerde versie kan pas worden gearchiveerd als haar geldigheid geheel in het verleden ligt");
    }
  }
  const result = await transition(id, ["draft", "in_review", "approved", "rejected", "published", "superseded"], "archived", actor, "archived", {
    archivedAt: new Date(),
    archivedByName: actor.username,
  });
  clearFiscalResolveCache();
  return result;
}

export { definitionFor };
export type { Executor };
