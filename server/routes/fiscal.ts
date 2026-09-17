/**
 * The fiscal mobility check API for staff (docs/fiscaal/03-schema-en-dataflow.md §5).
 *
 * Every route is behind a permission. The guard here does what
 * `hasPermission()` does — and keeps its name, so the permission-matrix test
 * recognises it — plus one thing more: a refused attempt is written to the
 * fiscal audit trail. Errors go out in the shared `{ message, errors? }`
 * shape; nothing on `/api/fiscal/audit` can write.
 */
import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import { UserPermission, UserRole } from "../../shared/schema";
import { FISCAL_PARAMETER_DEFINITIONS, FISCAL_RULES } from "../services/fiscal/definitions";
import {
  archiveVersion,
  approveVersion,
  createDraft,
  getVersion,
  listVersions,
  publishVersion,
  rejectVersion,
  setParameters,
  submitVersion,
  updateDraft,
  validateVersion,
} from "../services/fiscal/rule-versions";
import { listFiscalAuditEvents, recordFiscalEvent, type Actor } from "../services/fiscal/audit";
import { assessMany, assessUsagePeriod, fiscalOverview, getAssessment, latestAssessmentForPeriod, listAssessments } from "../services/fiscal/assess";
import { getReviewCase, listReviewCases, updateReviewCase, countOpenReviewCases } from "../services/fiscal/review-cases";
import { applyManualOverride, ensureProfile, getProfile, refreshFromRdw, MANUAL_PROFILE_FIELDS } from "../services/fiscal/profiles";
import { confirmUsage, getUsagePeriodByReservation, syncUsagePeriodForReservation } from "../services/fiscal/usage-periods";
import { resolveForDate } from "../services/fiscal/resolve";
import { getImpactState, startImpactPreview } from "../services/fiscal/impact";
import { FiscalConfigurationError } from "../services/fiscal/parameters";
import { firstUntrustedAddress } from "../middleware/security/rateLimiter";
import { sendRouteError } from "../utils/route-errors";
import { isoToday } from "../services/lifecycle";
import { compareIso } from "../services/fiscal/calendar";
import type { RouteDeps } from "./deps";
import type { FiscalRuleKey } from "../../shared/fiscal-types";

// ---- actor and guard --------------------------------------------------------------------------------

export function actorFromRequest(req: Request): Actor {
  return {
    userId: req.user?.id ?? null,
    username: req.user?.username ?? "onbekend",
    role: req.user?.role ?? null,
    permissionUsed: (req as Request & { fiscalPermissionUsed?: string }).fiscalPermissionUsed ?? null,
    ipAddress: firstUntrustedAddress(req),
  };
}

/** Same semantics as hasPermission(); refused attempts land on the fiscal audit trail. */
function fiscalGuard(...permissions: string[]) {
  return async function hasPermissionMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    if (req.user.role === UserRole.ADMIN) {
      (req as Request & { fiscalPermissionUsed?: string }).fiscalPermissionUsed = "admin";
      return next();
    }
    const granted = permissions.find((p) => (req.user!.permissions || []).includes(p));
    if (granted) {
      (req as Request & { fiscalPermissionUsed?: string }).fiscalPermissionUsed = granted;
      return next();
    }
    try {
      await recordFiscalEvent(actorFromRequest(req), {
        action: "unauthorized_attempt",
        entityType: "route",
        details: { method: req.method, path: req.path, required: permissions },
      });
    } catch (error) {
      console.error("[fiscal] audit of refused attempt failed:", error);
    }
    return res.status(403).json({ message: `Not authorized. One of these permissions required: ${permissions.join(", ")}` });
  };
}

function fail(res: Response, error: unknown, fallback: string): void {
  if (error instanceof FiscalConfigurationError) {
    res.status(400).json({ message: error.message, errors: error.issues.map((i) => ({ field: i.key, message: i.message })) });
    return;
  }
  if (error && typeof error === "object" && "status" in error && typeof (error as { toBody?: unknown }).toBody === "function") {
    const e = error as { status: number; toBody: () => unknown };
    res.status(e.status).json(e.toBody());
    return;
  }
  sendRouteError(res, error, fallback);
}

function intParam(req: Request, res: Response, name: string): number | null {
  const v = parseInt(req.params[name], 10);
  if (Number.isNaN(v)) {
    res.status(400).json({ message: `Ongeldige ${name}` });
    return null;
  }
  return v;
}

const optionalInt = z.coerce.number().int().positive().optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "datum als jjjj-mm-dd");

// ---- schemas --------------------------------------------------------------------------------------------

const createDraftSchema = z.object({
  ruleKey: z.string().min(1),
  title: z.string().trim().min(1, "titel is verplicht").max(200),
  reasonCategory: z.string().min(1),
  reasonText: z.string().trim().min(1, "reden is verplicht").max(4000),
  copyFromId: z.number().int().positive().nullable().optional(),
});

const updateDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    effectiveFrom: isoDate.nullable(),
    effectiveUntil: isoDate.nullable(),
    reasonCategory: z.string().min(1),
    reasonText: z.string().trim().max(4000),
    sourceOrganisation: z.string().trim().max(200).nullable(),
    sourceUrl: z.string().trim().max(1000).nullable(),
    legalReference: z.string().trim().max(500).nullable(),
    sourceVerifiedAt: z.string().nullable(),
    assumptions: z.string().trim().max(10000).nullable(),
  })
  .partial()
  .strict();

const parametersSchema = z.array(
  z.object({
    key: z.string().min(1),
    value: z.unknown(),
    sourceUrl: z.string().trim().max(1000).nullable().optional(),
    sourceReference: z.string().trim().max(500).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  }),
).max(100);

const rejectSchema = z.object({ reason: z.string().trim().min(1, "reden is verplicht").max(2000) });
const publishSchema = z.object({ confirm: z.literal(true, { errorMap: () => ({ message: "publicatie moet uitdrukkelijk worden bevestigd" }) }) });

const runSchema = z
  .object({ customerId: optionalInt, vehicleId: optionalInt, usagePeriodId: optionalInt, calculationDate: isoDate.optional() })
  .refine((v) => v.customerId !== undefined || v.vehicleId !== undefined || v.usagePeriodId !== undefined, { message: "customerId, vehicleId of usagePeriodId is verplicht" });
const recalculateSchema = z.object({ usagePeriodId: z.coerce.number().int().positive(), reason: z.string().trim().min(1, "reden is verplicht").max(2000), calculationDate: isoDate.optional() });

const profilePatchSchema = z.object({ field: z.enum(MANUAL_PROFILE_FIELDS), value: z.unknown(), reason: z.string().trim().min(1, "reden is verplicht").max(2000) });

const usagePatchSchema = z
  .object({
    privateUse: z.string(),
    commuting: z.string(),
    providedBeforeCutoff: z.string(),
    usageType: z.string().optional(),
    isPool: z.boolean().optional(),
    replacementReason: z.string().optional(),
    replacedVehicleText: z.string().trim().max(200).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const reviewPatchSchema = z
  .object({
    status: z.string(),
    assignedToId: z.number().int().positive().nullable(),
    resolution: z.string().nullable(),
    resolutionNote: z.string().trim().max(4000).nullable(),
  })
  .partial()
  .strict();

// ---- routes --------------------------------------------------------------------------------------------

const VIEW = fiscalGuard(UserPermission.VIEW_FISCAL);
const REVIEW = fiscalGuard(UserPermission.MANAGE_FISCAL_REVIEW);
const CONFIGURE = fiscalGuard(UserPermission.MANAGE_FISCAL_CONFIGURATION);
const APPROVE = fiscalGuard(UserPermission.APPROVE_FISCAL_CONFIGURATION);
const PUBLISH = fiscalGuard(UserPermission.PUBLISH_FISCAL_CONFIGURATION);
const AUDIT = fiscalGuard(UserPermission.VIEW_FISCAL_AUDIT_LOG);

export function registerFiscalRoutes(app: Express, _deps: RouteDeps): void {
  // ---- definitions and configuration overview ------------------------------------------
  app.get("/api/fiscal/definitions", VIEW, (_req, res) => {
    res.json({ rules: FISCAL_RULES, parameters: FISCAL_PARAMETER_DEFINITIONS });
  });

  app.get("/api/fiscal/configuration", VIEW, async (_req, res) => {
    try {
      const today = isoToday();
      const rules = [];
      for (const rule of FISCAL_RULES) {
        const versions = await listVersions({ ruleKey: rule.key });
        const details = await Promise.all(versions.map(async (v) => ({ ...(await getVersion(v.id))!, validation: await validateVersion(v.id) })));
        const live = (v: (typeof details)[number]) => v.status === "published" || v.status === "superseded";
        const current = details.find((v) => live(v) && v.effectiveFrom && compareIso(v.effectiveFrom, today) <= 0 && (!v.effectiveUntil || compareIso(v.effectiveUntil, today) >= 0)) ?? null;
        rules.push({
          rule,
          current,
          upcoming: details.filter((v) => live(v) && v.effectiveFrom && compareIso(v.effectiveFrom, today) > 0),
          drafts: details.filter((v) => ["draft", "in_review", "approved", "rejected"].includes(v.status)),
          expired: details.filter((v) => live(v) && v.effectiveUntil && compareIso(v.effectiveUntil, today) < 0),
          archived: details.filter((v) => v.status === "archived"),
        });
      }
      res.json({ today, rules });
    } catch (error) {
      fail(res, error, "Configuratie kon niet worden gelezen");
    }
  });

  app.get("/api/fiscal/overview", VIEW, async (_req, res) => {
    try {
      const overview = await fiscalOverview();
      const resolution = await resolveForDate("pseudo_eindheffing_fossiel", isoToday());
      res.json({
        ...overview,
        openReviewCases: await countOpenReviewCases(),
        currentVersion: resolution.status === "ok" ? { id: resolution.version.id, title: resolution.version.title, versionNumber: resolution.version.versionNumber } : null,
        currentVersionStatus: resolution.status,
      });
    } catch (error) {
      fail(res, error, "Overzicht kon niet worden gelezen");
    }
  });

  // ---- rule versions ------------------------------------------------------------------------
  app.get("/api/fiscal/rule-versions", VIEW, async (req, res) => {
    try {
      const ruleKey = typeof req.query.ruleKey === "string" ? (req.query.ruleKey as FiscalRuleKey) : undefined;
      const status = typeof req.query.status === "string" ? (req.query.status as never) : undefined;
      res.json(await listVersions({ ruleKey, status }));
    } catch (error) {
      fail(res, error, "Regelversies konden niet worden gelezen");
    }
  });

  app.get("/api/fiscal/rule-versions/:id", VIEW, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      const version = await getVersion(id);
      if (!version) return res.status(404).json({ message: "Regelversie niet gevonden" });
      res.json({ ...version, validation: await validateVersion(id), audit: await listFiscalAuditEvents({ ruleVersionId: id, limit: 200 }) });
    } catch (error) {
      fail(res, error, "Regelversie kon niet worden gelezen");
    }
  });

  app.post("/api/fiscal/rule-versions", CONFIGURE, async (req, res) => {
    try {
      const body = createDraftSchema.parse(req.body);
      res.status(201).json(await createDraft(body, actorFromRequest(req)));
    } catch (error) {
      fail(res, error, "Concept kon niet worden aangemaakt");
    }
  });

  app.patch("/api/fiscal/rule-versions/:id", CONFIGURE, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      res.json(await updateDraft(id, updateDraftSchema.parse(req.body), actorFromRequest(req)));
    } catch (error) {
      fail(res, error, "Concept kon niet worden bijgewerkt");
    }
  });

  app.put("/api/fiscal/rule-versions/:id/parameters", CONFIGURE, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      const inputs = parametersSchema.parse(req.body).map((p) => ({ ...p, value: p.value ?? null }));
      res.json(await setParameters(id, inputs, actorFromRequest(req)));
    } catch (error) {
      fail(res, error, "Parameters konden niet worden opgeslagen");
    }
  });

  app.post("/api/fiscal/rule-versions/:id/submit", CONFIGURE, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      res.json(await submitVersion(id, actorFromRequest(req)));
    } catch (error) {
      fail(res, error, "Indienen mislukt");
    }
  });

  app.post("/api/fiscal/rule-versions/:id/approve", APPROVE, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      res.json(await approveVersion(id, actorFromRequest(req)));
    } catch (error) {
      fail(res, error, "Goedkeuren mislukt");
    }
  });

  app.post("/api/fiscal/rule-versions/:id/reject", APPROVE, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      res.json(await rejectVersion(id, rejectSchema.parse(req.body).reason, actorFromRequest(req)));
    } catch (error) {
      fail(res, error, "Afwijzen mislukt");
    }
  });

  app.post("/api/fiscal/rule-versions/:id/publish", PUBLISH, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      publishSchema.parse(req.body ?? {});
      res.json(await publishVersion(id, actorFromRequest(req)));
    } catch (error) {
      fail(res, error, "Publiceren mislukt");
    }
  });

  app.post("/api/fiscal/rule-versions/:id/archive", CONFIGURE, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      res.json(await archiveVersion(id, actorFromRequest(req)));
    } catch (error) {
      fail(res, error, "Archiveren mislukt");
    }
  });

  // ---- impact preview (fire-and-forget + status, like the APK scan) ---------------------------
  app.post("/api/fiscal/rule-versions/:id/impact", CONFIGURE, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      if (!(await getVersion(id))) return res.status(404).json({ message: "Regelversie niet gevonden" });
      const { started } = startImpactPreview(id, actorFromRequest(req));
      if (!started) return res.status(409).json({ message: "Er loopt al een impactvoorbeeld voor deze versie" });
      res.status(202).json(getImpactState(id));
    } catch (error) {
      fail(res, error, "Impactvoorbeeld kon niet worden gestart");
    }
  });

  app.get("/api/fiscal/rule-versions/:id/impact", VIEW, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      if (!(await getVersion(id))) return res.status(404).json({ message: "Regelversie niet gevonden" });
      res.json(getImpactState(id) ?? { running: false, startedAt: null, finishedAt: null, error: null, result: null });
    } catch (error) {
      fail(res, error, "Impactvoorbeeld kon niet worden gelezen");
    }
  });

  // ---- audit (read only; a test proves nothing else is mounted here) -------------------------
  app.get("/api/fiscal/audit", AUDIT, async (req, res) => {
    try {
      const q = req.query;
      const num = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);
      res.json(
        await listFiscalAuditEvents({
          ruleVersionId: num(q.ruleVersionId),
          entityType: typeof q.entityType === "string" ? q.entityType : undefined,
          entityId: num(q.entityId),
          customerId: num(q.customerId),
          vehicleId: num(q.vehicleId),
          username: typeof q.username === "string" ? q.username : undefined,
          from: typeof q.from === "string" ? q.from : undefined,
          to: typeof q.to === "string" ? q.to : undefined,
          limit: num(q.limit),
        }),
      );
    } catch (error) {
      fail(res, error, "Auditlog kon niet worden gelezen");
    }
  });

  // ---- review cases -------------------------------------------------------------------------------
  app.get("/api/fiscal/review-cases", REVIEW, async (req, res) => {
    try {
      const q = req.query;
      const num = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);
      res.json(await listReviewCases({ status: typeof q.status === "string" ? (q.status as never) : undefined, customerId: num(q.customerId), vehicleId: num(q.vehicleId), limit: num(q.limit) }));
    } catch (error) {
      fail(res, error, "Beoordelingszaken konden niet worden gelezen");
    }
  });

  app.get("/api/fiscal/review-cases/:id", REVIEW, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      const row = await getReviewCase(id);
      if (!row) return res.status(404).json({ message: "Beoordelingszaak niet gevonden" });
      res.json(row);
    } catch (error) {
      fail(res, error, "Beoordelingszaak kon niet worden gelezen");
    }
  });

  app.patch("/api/fiscal/review-cases/:id", REVIEW, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      const body = reviewPatchSchema.parse(req.body);
      const actor = actorFromRequest(req);
      const updated = await updateReviewCase(id, body as never, actor);
      if (updated.status === "resolved" || updated.status === "dismissed") {
        // A closed case is a new fact for the period: look at it again.
        await assessUsagePeriod(updated.usagePeriodId, { trigger: "event", actor }).catch((e) => console.error("[fiscal] herbeoordeling na sluiten zaak mislukt:", e));
      }
      res.json(updated);
    } catch (error) {
      fail(res, error, "Beoordelingszaak kon niet worden bijgewerkt");
    }
  });

  // ---- assessments ----------------------------------------------------------------------------------
  app.get("/api/fiscal/assessments", VIEW, async (req, res) => {
    try {
      const q = req.query;
      const num = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);
      res.json(
        await listAssessments({
          customerId: num(q.customerId),
          vehicleId: num(q.vehicleId),
          usagePeriodId: num(q.usagePeriodId),
          status: typeof q.status === "string" ? q.status : undefined,
          latestOnly: q.latestOnly === "1" || q.latestOnly === "true",
          limit: num(q.limit),
        }),
      );
    } catch (error) {
      fail(res, error, "Beoordelingen konden niet worden gelezen");
    }
  });

  app.get("/api/fiscal/assessments/:id", VIEW, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      const row = await getAssessment(id);
      if (!row) return res.status(404).json({ message: "Beoordeling niet gevonden" });
      res.json(row);
    } catch (error) {
      fail(res, error, "Beoordeling kon niet worden gelezen");
    }
  });

  app.post("/api/fiscal/assessments/run", REVIEW, async (req, res) => {
    try {
      const body = runSchema.parse(req.body ?? {});
      const result = await assessMany(
        { customerId: body.customerId, vehicleId: body.vehicleId, usagePeriodId: body.usagePeriodId },
        { trigger: "manual", calculationDate: body.calculationDate, actor: actorFromRequest(req) },
      );
      res.json(result);
    } catch (error) {
      fail(res, error, "Beoordeling kon niet worden uitgevoerd");
    }
  });

  app.post("/api/fiscal/assessments/recalculate", REVIEW, async (req, res) => {
    try {
      const body = recalculateSchema.parse(req.body ?? {});
      const { assessment } = await assessUsagePeriod(body.usagePeriodId, { trigger: "recalculation", calculationDate: body.calculationDate, actor: actorFromRequest(req), reason: body.reason });
      res.json(assessment);
    } catch (error) {
      fail(res, error, "Herberekening mislukt");
    }
  });

  // ---- vehicle profile ------------------------------------------------------------------------------
  app.get("/api/vehicles/:id/fiscal-profile", VIEW, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      const profile = (await getProfile(id)) ?? (await ensureProfile(id));
      res.json({ ...profile, latestAssessments: await listAssessments({ vehicleId: id, latestOnly: true, limit: 20 }) });
    } catch (error) {
      fail(res, error, "Fiscaal profiel kon niet worden gelezen");
    }
  });

  app.patch("/api/vehicles/:id/fiscal-profile", REVIEW, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      const body = profilePatchSchema.parse(req.body);
      const actor = actorFromRequest(req);
      const profile = await applyManualOverride(id, { ...body, value: body.value ?? null }, actor);
      // A corrected fact is a new fact for every open period of this vehicle.
      await assessMany({ vehicleId: id }, { trigger: "event", actor }).catch((e) => console.error("[fiscal] herbeoordeling na profielwijziging mislukt:", e));
      res.json(profile);
    } catch (error) {
      fail(res, error, "Fiscaal profiel kon niet worden bijgewerkt");
    }
  });

  app.post("/api/vehicles/:id/fiscal-profile/refresh", REVIEW, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      const actor = actorFromRequest(req);
      const result = await refreshFromRdw(id, actor);
      if (result.ok) {
        await assessMany({ vehicleId: id }, { trigger: "event", actor }).catch((e) => console.error("[fiscal] herbeoordeling na RDW-verversing mislukt:", e));
      }
      res.json({ ...result.profile, refresh: { ok: result.ok, error: result.error, changed: result.changed } });
    } catch (error) {
      fail(res, error, "RDW-gegevens konden niet worden opgehaald");
    }
  });

  // ---- usage period of a reservation -------------------------------------------------------------
  app.get("/api/reservations/:id/usage-period", VIEW, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      const period = (await getUsagePeriodByReservation(id)) ?? (await syncUsagePeriodForReservation(id));
      if (!period) return res.status(404).json({ message: "Geen gebruiksperiode voor deze reservering" });
      res.json({ ...period, latestAssessment: await latestAssessmentForPeriod(period.id) });
    } catch (error) {
      fail(res, error, "Gebruiksperiode kon niet worden gelezen");
    }
  });

  app.patch("/api/reservations/:id/usage-period", REVIEW, async (req, res) => {
    const id = intParam(req, res, "id");
    if (id === null) return;
    try {
      const body = usagePatchSchema.parse(req.body);
      const actor = actorFromRequest(req);
      if (!(await getUsagePeriodByReservation(id))) await syncUsagePeriodForReservation(id);
      const period = await confirmUsage(id, body as never, { kind: "staff", actor });
      await assessUsagePeriod(period.id, { trigger: "event", actor }).catch((e) => console.error("[fiscal] herbeoordeling na bevestiging mislukt:", e));
      res.json(period);
    } catch (error) {
      fail(res, error, "Gebruik kon niet worden vastgelegd");
    }
  });
}
