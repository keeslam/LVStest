import type { Request, Response } from "express";
import { storage } from "../storage";
import { ReportValidationError } from "../database-storage";
import { UserPermission } from "../../shared/schema";
import { hasPermission, requireAdmin } from "../middleware/permissions.js";
import { getDataSource } from "../../shared/report-builder-config";
import { UserRole } from "../../shared/schema";

/**
 * Security review 2026-10-18 (Laag 7): names, e-mail addresses and phone numbers of customers and
 * drivers are not report material for someone who may not open the customer screens. The report
 * builder reads one data source per report, so the source decides.
 */
const PERSONAL_DATA_TABLES = new Set(["customers", "drivers"]);
function mayReportOn(user: Express.User | undefined, dataSources: unknown): boolean {
  const first = Array.isArray(dataSources) ? getDataSource(String(dataSources[0])) : undefined;
  if (!first || !PERSONAL_DATA_TABLES.has(first.table)) return true;
  if (user?.role === UserRole.ADMIN) return true;
  const rights = user?.permissions ?? [];
  return rights.includes(UserPermission.VIEW_CUSTOMERS) || rights.includes(UserPermission.MANAGE_CUSTOMERS);
}
import type { Express } from "express";
import { buildMaintenanceCostReport } from "../utils/maintenance-costs";
import { buildVehicleFinancials, buildMileagePerMonth, type DateRangeYmd } from "../utils/financial-reports";
import { mountReport } from "../services/reports/report-kit";
import { finesReport } from "../services/reports/fines-report";
import { extraCostsReport } from "../services/reports/extra-costs-report";

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

  // Rapporten fase 2: fines report on Rapporten > Financieel (needs the report and the fines permission)
  mountReport(app, "/api/reports/fines", [
    hasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS),
    hasPermission(UserPermission.VIEW_FINES, UserPermission.MANAGE_FINES),
  ], finesReport);

  // Rapporten fase 2: extra km and fuel report on Rapporten > Financieel (needs the report and a reservations permission)
  mountReport(app, "/api/reports/extra-costs", [
    hasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS),
    hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS),
  ], extraCostsReport);


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

  // ============================================
  // REPORT BUILDER ROUTES
  // ============================================

  // Get all saved reports
  app.get("/api/reports/saved", hasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
    try {
      const reports = await storage.getAllSavedReports();
      res.json(reports);
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

      const dataSources: string[] = Array.isArray(config.dataSources) ? config.dataSources : [];
      const columns: Array<{ source?: string; field?: string }> = Array.isArray(config.columns) ? config.columns : [];

      // The builder works with a multi-source configuration; the table keeps the
      // whole thing in `configuration` and fills the simple columns from it.
      const report = await storage.createSavedReport({
        name: config.name,
        description: config.description || null,
        dataSource: dataSources[0] || "vehicles",
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

  // Delete a saved report
  app.delete("/api/reports/saved/:id", hasPermission(UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
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
      const config: any = req.body;

      if (!config.columns || config.columns.length === 0) {
        return res.status(400).json({ message: "No columns specified" });
      }
      if (!mayReportOn(req.user, config.dataSources)) {
        return res.status(403).json({ message: "A report on customers or drivers needs the customer right", code: "CUSTOMER_RIGHT_REQUIRED" });
      }

      const results = await storage.executeReport(config);
      res.json(results);
    } catch (error) {
      if (error instanceof ReportValidationError) {
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

  // Kilometres driven per month, derived from every dated odometer reading we have
  app.get("/api/reports/mileage-per-month", requireAdmin, async (req: Request, res: Response) => {
    try {
      const range = parseReportRange(req.query);
      const vehicleId = parseVehicleIdFilter(req.query);
      const [vehicles, reservations, damageChecks] = await Promise.all([
        storage.getAllVehicles(),
        storage.getAllReservations(),
        // BUG-216 (technical half): the report reads a mileage integer; it
        // used to pull 17 MB of base64 diagrams along with it (104 ms of its
        // 127 ms of SQL time).
        storage.getDamageCheckMileageReadings(),
      ]);
      const selected = vehicleId ? vehicles.filter(v => v.id === vehicleId) : vehicles;
      res.json(buildMileagePerMonth(selected, reservations, damageChecks as any, range));
    } catch (error) {
      console.error("Error building mileage-per-month report:", error);
      res.status(500).json({ message: "Error building mileage-per-month report" });
    }
  });
}
