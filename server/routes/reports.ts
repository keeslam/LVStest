import type { Request, Response } from "express";
import { storage } from "../storage";
import { ReportValidationError } from "../database-storage";
import { UserPermission } from "../../shared/schema";
import { hasPermission } from "../middleware/permissions.js";
import type { Express } from "express";
import { buildMaintenanceCostReport } from "../utils/maintenance-costs";
import { buildVehicleFinancials, buildMileagePerMonth, type DateRangeYmd } from "../utils/financial-reports";

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

      const results = await storage.executeReport(config);
      res.json(results);
    } catch (error) {
      if (error instanceof ReportValidationError) {
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

  // Kilometres driven per month, derived from every dated odometer reading we have
  app.get("/api/reports/mileage-per-month", hasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
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
