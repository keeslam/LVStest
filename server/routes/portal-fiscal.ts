/**
 * The customer portal's fiscal routes (docs/fiscaal §4.6–4.7, besluiten
 * F-02 and F-05). Mounted inside registerPortalRoutes(), so they live in the
 * portal realm: the customer comes from the session, the feature gate is the
 * customer's own switch, a driver-role account is narrowed to what it drove
 * and needs the customer's driver switch on top.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { settingsFlags, requireFeature, requirePortalRole, portalError } from "../portal-auth";
import { PORTAL_ERROR } from "../../shared/portal-types";
import { TRI_STATES, USAGE_TYPES, REPLACEMENT_REASONS } from "../../shared/fiscal-types";
import { fiscalSummaryForCustomer, getFiscalReservationForCustomer, listFiscalVehiclesForCustomer } from "../services/fiscal/portal-storage";
import { confirmUsage, getUsagePeriodByReservation } from "../services/fiscal/usage-periods";
import { assessUsagePeriod } from "../services/fiscal/assess";
import { FiscalValidationError } from "../services/fiscal/errors";

export interface PortalFiscalRouteDeps {
  requirePortalUser: RequestHandler;
}

const usageSchema = z
  .object({
    privateUse: z.enum(TRI_STATES),
    commuting: z.enum(TRI_STATES),
    providedBeforeCutoff: z.enum(TRI_STATES),
    usageType: z.enum(USAGE_TYPES).optional(),
    isPool: z.boolean().optional(),
    replacementReason: z.enum(REPLACEMENT_REASONS).optional(),
    replacedVehicleText: z.string().trim().max(200).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export function registerPortalFiscalRoutes(app: Express, deps: PortalFiscalRouteDeps): void {
  const { requirePortalUser } = deps;
  const ctxOf = (req: Request) => req.portalUser!;

  /** A driver-role account needs the customer's `driverFiscalVisibilityEnabled` on top of the feature. */
  const driverGate: RequestHandler = (req, res, next) => {
    const ctx = ctxOf(req);
    if (ctx.user.role === "driver" && !ctx.settings.driverFiscalVisibilityEnabled) {
      return portalError(res, 403, PORTAL_ERROR.FEATURE_DISABLED, "Fiscal check is not available for drivers at this customer");
    }
    next();
  };
  const guards: RequestHandler[] = [requirePortalUser, requireFeature("canViewFiscal"), driverGate];
  const withAmounts = (req: Request) => settingsFlags(ctxOf(req).settings, ctxOf(req).user).fiscalDashboardEnabled;

  function idParam(req: Request, res: Response): number | null {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      portalError(res, 400, PORTAL_ERROR.VALIDATION, "Invalid id");
      return null;
    }
    return id;
  }

  app.get("/api/portal/fiscal/summary", ...guards, async (req, res) => {
    const ctx = ctxOf(req);
    const summary = await fiscalSummaryForCustomer(ctx.customerId, ctx.scope);
    res.json({ ...summary, dashboardEnabled: withAmounts(req), warningsEnabled: ctx.settings.fiscalWarningsEnabled, reportsEnabled: ctx.settings.fiscalReportsEnabled });
  });

  app.get("/api/portal/fiscal/vehicles", ...guards, async (req, res) => {
    const ctx = ctxOf(req);
    res.json(await listFiscalVehiclesForCustomer(ctx.customerId, ctx.scope, { withAmounts: withAmounts(req) }));
  });

  app.get("/api/portal/fiscal/reservations/:id", ...guards, async (req, res) => {
    const id = idParam(req, res);
    if (id === null) return;
    const ctx = ctxOf(req);
    const dto = await getFiscalReservationForCustomer(id, ctx.customerId, ctx.scope, { withAmounts: withAmounts(req) });
    if (!dto) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Reservation not found");
    res.json(dto);
  });

  // besluit F-02: the customer administrator answers the usage questions; audited as portal_admin.
  app.patch("/api/portal/fiscal/reservations/:id/usage", ...guards, requirePortalRole("admin"), async (req, res) => {
    const id = idParam(req, res);
    if (id === null) return;
    const ctx = ctxOf(req);
    const parsed = usageSchema.safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, parsed.error.errors[0]?.message ?? "Invalid input");
    const period = await getUsagePeriodByReservation(id);
    if (!period || period.customerId !== ctx.customerId || period.closedAt) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Reservation not found");
    const actor = { userId: ctx.user.id, username: ctx.user.email, role: "portal_admin" };
    try {
      await confirmUsage(id, parsed.data, { kind: "portal", actor });
    } catch (error) {
      if (error instanceof FiscalValidationError) return portalError(res, 400, PORTAL_ERROR.VALIDATION, error.message);
      throw error;
    }
    await assessUsagePeriod(period.id, { trigger: "event", actor }).catch((e) => console.error("[fiscal] herbeoordeling na portaalbevestiging mislukt:", e));
    const dto = await getFiscalReservationForCustomer(id, ctx.customerId, ctx.scope, { withAmounts: withAmounts(req) });
    res.json(dto);
  });
}
