import type { Request, Response } from "express";
import { storage } from "../storage";
import { ReportValidationError } from "../database-storage";
import { UserPermission, UserRole } from "../../shared/schema";
import { hasPermission, requireAdmin } from "../middleware/permissions.js";
import { getDataSource, canUseReportSource, isReportPeriodField, linkedSourcesOf, adminOnlyFieldOf, invalidReportLink, isReportFieldRef, calcTypeProblem, SAVED_REPORT_TABS, type DataSource } from "../../shared/report-builder-config";
import { validateCalculatedFields } from "../../shared/report-formula";

/**
 * Every data source has its own right (see canUseReportSource in shared/report-builder-config.ts).
 * Security review 2026-10-18 (Laag 7): customers and drivers keep their own error code.
 * The route checks EVERY source named in the report, not only the first.
 */
function deniedReportSource(user: Express.User | undefined, dataSources: unknown): DataSource | null {
  if (!Array.isArray(dataSources)) return null;
  for (const id of dataSources) {
    const source = getDataSource(String(id));
    if (source && !canUseReportSource(user, source)) return source;
  }
  return null;
}
/**
 * The tab and the period field of a saved report. Returns the error body to send, or null
 * when both are fine (both are optional; no tab means the report only shows under Saved reports).
 */
function invalidTabSettings(config: any): { message: string; code: string; field?: string } | null {
  const tab = config?.tab;
  if (tab !== undefined && tab !== null && !(SAVED_REPORT_TABS as readonly string[]).includes(tab)) {
    return { message: "Dit tabblad kan geen eigen rapport tonen.", code: "REPORT_TAB_INVALID", field: String(tab) };
  }
  const periodField = config?.periodField;
  if (periodField !== undefined && periodField !== null && periodField !== "") {
    const source = Array.isArray(config.dataSources) ? String(config.dataSources[0]) : "";
    if (!isReportPeriodField(source, periodField)) {
      return { message: "Het periodeveld moet een datumveld van de bron zijn.", code: "REPORT_PERIOD_FIELD_INVALID", field: String(periodField) };
    }
  }
  return null;
}
/** A saved report needs a known first data source; nothing defaults to vehicles. */
function missingSource(config: any): { message: string; code: string } | null {
  const first = Array.isArray(config?.dataSources) ? config.dataSources[0] : undefined;
  if (typeof first !== "string" || !getDataSource(first)) {
    return { message: "Kies een bron voor het rapport.", code: "REPORT_SOURCE_REQUIRED" };
  }
  return null;
}
function sourceDeniedBody(source: DataSource) {
  if (source.table === "customers" || source.table === "drivers") {
    return { message: "A report on customers or drivers needs the customer right", code: "CUSTOMER_RIGHT_REQUIRED" as const, source: source.id };
  }
  return { message: "A report on this source needs the right of that part of the app", code: "REPORT_SOURCE_RIGHT_REQUIRED" as const, source: source.id };
}
/**
 * Reports redesign part 3: a field read through a link needs the right of the linked source,
 * and every km field (adminOnly in the config) is for admins only, in any use and also through
 * a link (Kees, 2026-10-25). Returns the 403 body, or null.
 */
function deniedReportLink(user: Express.User | undefined, config: any): { message: string; code: "REPORT_SOURCE_RIGHT_REQUIRED"; source: string; field?: string } | null {
  for (const id of linkedSourcesOf(config)) {
    const source = getDataSource(id);
    if (source && !canUseReportSource(user, source)) {
      return { message: "A field of a linked source needs the right of that part of the app", code: "REPORT_SOURCE_RIGHT_REQUIRED", source: source.id };
    }
  }
  const kmField = adminOnlyFieldOf(config);
  if (kmField && user?.role !== UserRole.ADMIN) {
    return { message: "Km fields are for admins only", code: "REPORT_SOURCE_RIGHT_REQUIRED", source: "mileage_readings", field: kmField };
  }
  return null;
}
/** A saved report may only name links of its main source, to fields of the link's target. */
function invalidLinkBody(config: any): { message: string; code: "REPORT_LINK_INVALID"; field: string } | null {
  const bad = invalidReportLink(config);
  if (!bad) return null;
  return { message: `De koppeling ${bad.via} kan geen velden van ${bad.table} ophalen.`, code: "REPORT_LINK_INVALID", field: `${bad.via}.${bad.table}` };
}
/**
 * Reports redesign part 4: the calculated fields of a report (optional). Unknown fields or calcs,
 * cycles, too deep, too many or a malformed rule give 400 REPORT_CALC_INVALID with { error, id }.
 */
function invalidCalcBody(config: any): { message: string; code: "REPORT_CALC_INVALID"; error: string; id: string } | null {
  const fields = config?.calculatedFields;
  if (fields !== undefined && fields !== null) {
    const main = Array.isArray(config?.dataSources) ? config.dataSources[0] : undefined;
    const result = validateCalculatedFields(fields, (ref) => isReportFieldRef(main, ref));
    if (!result.ok) return { message: "Een berekend veld klopt niet.", code: "REPORT_CALC_INVALID", error: result.error, id: result.id };
  }
  // Also on save: a report whose calculated fields cannot run is refused (text in a sum, ...).
  const typed = calcTypeProblem(config);
  if (typed) return { message: typed.message, code: "REPORT_CALC_INVALID", error: "BAD_RULE", id: typed.id };
  return null;
}
/** The 403 body for a report configuration: its own sources first, then its links. */
function deniedReportBody(user: Express.User | undefined, config: any, dataSources: unknown = config?.dataSources) {
  const denied = deniedReportSource(user, dataSources);
  if (denied) return sourceDeniedBody(denied);
  return deniedReportLink(user, config);
}
import type { Express } from "express";
import { buildMaintenanceCostReport } from "../utils/maintenance-costs";
import {
  parseMaintenanceQuery, loadMaintenanceData, overviewPart, brandsPart, vehiclesPart, suppliersPart, trendsPart, signalsPart, rowsPart,
  type MaintenanceData, type MaintenanceQuery,
} from "../services/maintenance-analysis";
import { officeTimeZone } from "../services/office-time";
import { dateInZone } from "../../shared/office-timezone";
import { buildVehicleFinancials, type DateRangeYmd } from "../utils/financial-reports";
import { mountReport } from "../services/reports/report-kit";
import { finesReport } from "../services/reports/fines-report";
import { extraCostsReport } from "../services/reports/extra-costs-report";
import { transportBillingReport } from "../services/reports/transport-billing-report";
import { portalRequestsReport } from "../services/reports/portal-requests-report";
import { waitlistReport } from "../services/reports/waitlist-report";
import { invoiceInboxRunsReport } from "../services/reports/invoice-inbox-runs-report";
import { invoiceInboxItemsReport } from "../services/reports/invoice-inbox-items-report";
import { deliveryReport } from "../services/reports/delivery-report";
import { damageChecksReport } from "../services/reports/damage-checks-report";
import { occupancyReport } from "../services/reports/occupancy-report";
import { maintenanceOutlookReport } from "../services/reports/maintenance-outlook-report";
import { fleetMileageReport } from "../services/reports/fleet-mileage-report";
import { customerValueReport } from "../services/reports/customer-value-report";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** from/to query params (yyyy-MM-dd); defaults to the last 30 days */
function parseReportRange(query: Record<string, unknown>): DateRangeYmd {
  const today = new Date();
  const fallbackFrom = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const from = typeof query.from === "string" && YMD.test(query.from) ? query.from : fallbackFrom;
  const to = typeof query.to === "string" && YMD.test(query.to) ? query.to : today.toISOString().slice(0, 10);
  return from <= to ? { from, to } : { from: to, to: from };
}

function parseVehicleIdFilter(query: Record<string, unknown>): number | null {
  if (typeof query.vehicleId !== "string" || query.vehicleId === "all") return null;
  const id = parseInt(query.vehicleId, 10);
  return Number.isNaN(id) ? null : id;
}

// Moved verbatim out of server/routes.ts (registerRoutes) - see git history for context.
export function registerReportRoutes(app: Express): void {

  // Rapporten fase 2: the money reports on Rapporten > Financieel (fines, extra km and fuel, transport billing).
  // Like the Financieel tab itself they need only the report permission (Kees, 2026-10-25), no extra source right.
  const moneyReportGuards = [hasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS)];
  mountReport(app, "/api/reports/fines", moneyReportGuards, finesReport);
  mountReport(app, "/api/reports/extra-costs", moneyReportGuards, extraCostsReport);
  mountReport(app, "/api/reports/transport-billing", moneyReportGuards, transportBillingReport);
  // Rapporten fase 4: customer value is a money report too - only the report right, no customer right.
  mountReport(app, "/api/reports/customer-value", moneyReportGuards, customerValueReport);

  // Rapporten fase 3: the fleet reports on Rapporten > Voertuigen need the report right and the source right.
  const reportRight = hasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS);
  mountReport(app, "/api/reports/occupancy",
    [reportRight, hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS)], occupancyReport);
  // Km readings are admin only: the report's redact blanks them for everyone else on /rows and /export.
  mountReport(app, "/api/reports/maintenance-outlook",
    [reportRight, hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES)], maintenanceOutlookReport);
  // Km data is admin only, enforced on the server: all three routes need requireAdmin.
  mountReport(app, "/api/reports/fleet-mileage", [requireAdmin], fleetMileageReport);
  // Rapporten fase 4: portal requests need the report right and the portal right.
  const portalReportGuards = [reportRight, hasPermission(UserPermission.VIEW_PORTAL, UserPermission.MANAGE_PORTAL)];
  mountReport(app, "/api/reports/portal-requests", portalReportGuards, portalRequestsReport);
  mountReport(app, "/api/reports/waitlist", portalReportGuards, waitlistReport);
  // Rapporten fase 5: invoice inbox pickup rounds need the report right and the source right of GET /api/expenses/inbox/runs.
  const inboxRunGuards = [reportRight, hasPermission(UserPermission.MANAGE_EXPENSES, UserPermission.MANAGE_SETTINGS)];
  mountReport(app, "/api/reports/invoice-inbox-runs", inboxRunGuards, invoiceInboxRunsReport);
  // The invoices themselves need the report right and the right of GET /api/expenses/inbox/items (not settings).
  mountReport(app, "/api/reports/invoice-inbox-items", [reportRight, hasPermission(UserPermission.MANAGE_EXPENSES)], invoiceInboxItemsReport);
  // Deliveries and collections need the report right and the source right of GET /api/transports.
  const deliveryGuards = [reportRight, hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES, UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS)];
  mountReport(app, "/api/reports/deliveries", deliveryGuards, deliveryReport);
  // Damage checks need the report right and the source right of GET /api/interactive-damage-checks.
  mountReport(app, "/api/reports/damage-checks", [reportRight, hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS)], damageChecksReport);


  // ============================================
  // REPORTS & ANALYTICS ROUTES
  // ============================================

  // Maintenance Cost Analysis Report
  app.get("/api/reports/maintenance-costs", hasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
    try {
      const { timeRange, brand } = req.query;
      const [expenses, vehicles] = await Promise.all([storage.getAllExpenses(), storage.getAllVehicles()]);
      res.json(buildMaintenanceCostReport(expenses, vehicles, {
        timeRange: typeof timeRange === "string" ? timeRange : undefined,
        brand: typeof brand === "string" ? brand : undefined,
      }));
    } catch (error) {
      console.error("Error fetching maintenance cost analysis:", error);
      res.status(500).json({ message: "Error fetching maintenance cost analysis" });
    }
  });

  // Onderhoudsanalyse (Kees, 2026-10-26): one endpoint per tab of the window, all with the same filter.
  // The report right, as for the old analysis; every km field and the km-band filter/drill are admin only.
  const analysisParts = {
    overview: (data: MaintenanceData, q: MaintenanceQuery) => overviewPart(data, q),
    brands: (data: MaintenanceData, q: MaintenanceQuery) => brandsPart(data, q),
    vehicles: (data: MaintenanceData, q: MaintenanceQuery) => vehiclesPart(data, q),
    suppliers: (data: MaintenanceData, q: MaintenanceQuery) => suppliersPart(data, q),
    trends: (data: MaintenanceData, q: MaintenanceQuery) => trendsPart(data, q),
    signals: (data: MaintenanceData, q: MaintenanceQuery) => signalsPart(data, q),
  } as const;
  const analysisRoute = (path: string, run: (data: MaintenanceData, q: MaintenanceQuery, query: Record<string, unknown>) => Promise<{ status: number; body: unknown }>) => {
    app.get(`/api/reports/maintenance-analysis/${path}`, hasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
      try {
        const isAdmin = req.user?.role === UserRole.ADMIN;
        const query = req.query as Record<string, unknown>;
        const parsed = parseMaintenanceQuery(query, dateInZone(new Date(), officeTimeZone()), isAdmin);
        if (!parsed.ok) return res.status(parsed.status).json(parsed.body);
        const { status, body } = await run(await loadMaintenanceData(isAdmin), parsed.q, query);
        res.status(status).json(body);
      } catch (error) {
        console.error(`Error loading the maintenance analysis (${path}):`, error);
        res.status(500).json({ message: "Failed to load the maintenance analysis", code: "MAINTENANCE_ANALYSIS_FAILED" });
      }
    });
  };
  for (const [path, part] of Object.entries(analysisParts)) {
    analysisRoute(path, async (data, q) => ({ status: 200, body: await part(data, q) }));
  }
  analysisRoute("rows", async (data, q, query) => {
    const result = rowsPart(data, q, query);
    return result.ok ? { status: 200, body: result.body } : { status: result.status, body: result.body };
  });

  // ============================================
  // REPORT BUILDER ROUTES
  // ============================================

  // Get all saved reports
  app.get("/api/reports/saved", hasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
    try {
      const reports = await storage.getAllSavedReports();
      res.json(reports.filter((r: any) => deniedReportBody(req.user, r.configuration, r.configuration?.dataSources ?? [r.dataSource]) === null));
    } catch (error) {
      console.error("Error fetching saved reports:", error);
      res.status(500).json({ message: "Error fetching saved reports" });
    }
  });

  // Save a new report
  app.post("/api/reports/saved", hasPermission(UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const config: any = req.body;

      if (!config.name) {
        return res.status(400).json({ message: "Report name is required" });
      }

      const denied = deniedReportBody(user, config);
      if (denied) return res.status(403).json(denied);
      const noSource = missingSource(config);
      if (noSource) return res.status(400).json(noSource);
      const invalid = invalidTabSettings(config);
      if (invalid) return res.status(400).json(invalid);
      const badLink = invalidLinkBody(config);
      if (badLink) return res.status(400).json(badLink);
      const badCalc = invalidCalcBody(config);
      if (badCalc) return res.status(400).json(badCalc);

      const dataSources: string[] = Array.isArray(config.dataSources) ? config.dataSources : [];
      const columns: Array<{ source?: string; field?: string }> = Array.isArray(config.columns) ? config.columns : [];

      // The builder works with a multi-source configuration; the table keeps the
      // whole thing in `configuration` and fills the simple columns from it.
      const report = await storage.createSavedReport({
        name: config.name,
        description: config.description || null,
        dataSource: dataSources[0],
        fields: columns.map((c) => (c.source ? `${c.source}.${c.field}` : String(c.field ?? ""))).filter(Boolean),
        filters: {},
        configuration: config,
        createdBy: user ? user.username : null,
        createdByUserId: user ? user.id : null,
        updatedBy: user ? user.username : null,
      });

      res.json(report);
    } catch (error) {
      console.error("Error saving report:", error);
      res.status(500).json({ message: "Error saving report" });
    }
  });

  // Update a saved report. The user needs the right for the source of the existing report
  // and of the new one; an unknown report is 404 before anything else.
  app.put("/api/reports/saved/:id", hasPermission(UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(404).json({ message: "Report not found" });
      const config: any = req.body;

      const existing = await storage.getSavedReport(id);
      if (!existing) return res.status(404).json({ message: "Report not found" });

      const deniedExisting = deniedReportBody(user, existing.configuration, existing.configuration?.dataSources ?? [existing.dataSource]);
      if (deniedExisting) return res.status(403).json(deniedExisting);
      const denied = deniedReportBody(user, config);
      if (denied) return res.status(403).json(denied);

      if (!config?.name) {
        return res.status(400).json({ message: "Report name is required" });
      }
      const noSource = missingSource(config);
      if (noSource) return res.status(400).json(noSource);
      const invalid = invalidTabSettings(config);
      if (invalid) return res.status(400).json(invalid);
      const badLink = invalidLinkBody(config);
      if (badLink) return res.status(400).json(badLink);
      const badCalc = invalidCalcBody(config);
      if (badCalc) return res.status(400).json(badCalc);

      const dataSources: string[] = Array.isArray(config.dataSources) ? config.dataSources : [];
      const columns: Array<{ source?: string; field?: string }> = Array.isArray(config.columns) ? config.columns : [];
      const report = await storage.updateSavedReport(id, {
        name: config.name,
        description: config.description || null,
        dataSource: dataSources[0],
        fields: columns.map((c) => (c.source ? `${c.source}.${c.field}` : String(c.field ?? ""))).filter(Boolean),
        configuration: config,
        updatedBy: user ? user.username : null,
      });
      if (!report) return res.status(404).json({ message: "Report not found" });

      res.json(report);
    } catch (error) {
      console.error("Error updating report:", error);
      res.status(500).json({ message: "Error updating report" });
    }
  });

  // Delete a saved report
  app.delete("/api/reports/saved/:id", hasPermission(UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(404).json({ message: "Report not found" });
      const existing = await storage.getSavedReport(id);
      if (!existing) return res.status(404).json({ message: "Report not found" });
      const denied = deniedReportBody(req.user, existing.configuration, existing.configuration?.dataSources ?? [existing.dataSource]);
      if (denied) return res.status(403).json(denied);
      await storage.deleteSavedReport(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting report:", error);
      res.status(500).json({ message: "Error deleting report" });
    }
  });

  // Execute a report
  app.post("/api/reports/execute", hasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
    try {
      const { scope, ...config }: any = req.body ?? {};

      if (!config.columns || config.columns.length === 0) {
        return res.status(400).json({ message: "No columns specified" });
      }
      const denied = deniedReportBody(req.user, config);
      if (denied) return res.status(403).json(denied);
      const badCalc = invalidCalcBody(config);
      if (badCalc) return res.status(400).json(badCalc);

      const results = await storage.executeReport(config, scope);
      res.json(results);
    } catch (error) {
      if (error instanceof ReportValidationError) {
        if (error.code === "REPORT_CALC_INVALID") {
          return res.status(400).json({ message: error.message, code: error.code, error: error.reason ?? "BAD_RULE", id: error.field ?? "" });
        }
        if (error.code) {
          return res.status(400).json({ message: error.message, code: error.code, field: error.field });
        }
        return res.status(400).json({ message: error.message });
      }
      console.error("Error executing report:", error);
      res.status(500).json({ message: "Error executing report" });
    }
  });

  // Revenue vs expenses per vehicle for a date range (yyyy-MM-dd, inclusive)
  app.get("/api/reports/vehicle-financials", hasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
    try {
      const range = parseReportRange(req.query);
      const vehicleId = parseVehicleIdFilter(req.query);
      const [vehicles, reservations, expenses] = await Promise.all([
        storage.getAllVehicles(),
        storage.getAllReservations(),
        storage.getAllExpenses(),
      ]);
      const selected = vehicleId ? vehicles.filter(v => v.id === vehicleId) : vehicles;
      res.json(buildVehicleFinancials(selected, reservations, expenses, range));
    } catch (error) {
      console.error("Error building vehicle financials report:", error);
      res.status(500).json({ message: "Error building vehicle financials report" });
    }
  });

  // Round 2 punt 11 (Kees, 2026-10-21): workshop downtime per vehicle and per brand/model —
  // visits, days in the workshop, breakdowns and the costs linked to those visits.
  app.get("/api/reports/workshop-downtime", hasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
    try {
      const range = parseReportRange(req.query);
      const { db } = await import("../db");
      const { reservations, expenses } = await import("../../shared/schema");
      const { and, eq, isNull, isNotNull } = await import("drizzle-orm");
      const { officeDate } = await import("../services/lifecycle");
      const { downtimeRows, downtimeByModel } = await import("../../shared/workshop-visit");
      const [vehicles, visits, linked] = await Promise.all([
        storage.getAllVehicles(),
        db.select().from(reservations).where(and(eq(reservations.type, "maintenance_block"), isNull(reservations.deletedAt))),
        db.select({ maintenanceBlockId: expenses.maintenanceBlockId, amount: expenses.amount }).from(expenses).where(isNotNull(expenses.maintenanceBlockId)),
      ]);
      const rows = downtimeRows(
        vehicles,
        visits.filter((v) => v.vehicleId != null).map((v) => ({ ...v, vehicleId: v.vehicleId as number })),
        linked,
        range.from,
        range.to,
        officeDate(new Date()),
      );
      res.json({ from: range.from, to: range.to, rows, byModel: downtimeByModel(rows) });
    } catch (error) {
      console.error("Error building workshop downtime report:", error);
      res.status(500).json({ message: "Error building workshop downtime report" });
    }
  });

}
