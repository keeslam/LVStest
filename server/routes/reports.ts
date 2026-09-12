import type { Request, Response } from "express";
import { format } from "date-fns";
import { storage } from "../storage";
import { ReportValidationError } from "../database-storage";
import { UserPermission } from "../../shared/schema";
import { hasPermission } from "../middleware/permissions.js";
import type { Express } from "express";
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

/**
 * BUG-089 — `GET /api/reports/maintenance-costs` answered an unconditional 500
 * in the audit's environment, which this dataset does not reproduce. Every
 * crash-prone spot in the aggregation rests on the same two assumptions: that
 * `expenses.amount` is never null (`null.toString()` is a TypeError) and that
 * `expenses.date` always parses (date-fns `format` throws `RangeError: Invalid
 * time value` on an invalid Date). Both are nullable / free text in the schema,
 * so the report tolerates them instead of dying on them.
 */
function toAmount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

/** A parsed date, or null when the stored text is not one. */
function toDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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
      
      // Get all expenses with vehicle information
      const expenses = await storage.getAllExpenses();
      const vehicles = await storage.getAllVehicles();
      
      // Filter expenses by time range
      let filteredExpenses = expenses;
      if (timeRange && timeRange !== 'all') {
        const now = new Date();
        let cutoffDate = new Date();
        
        switch (timeRange) {
          case 'month':
            cutoffDate.setMonth(now.getMonth() - 1);
            break;
          case '3months':
            cutoffDate.setMonth(now.getMonth() - 3);
            break;
          case '6months':
            cutoffDate.setMonth(now.getMonth() - 6);
            break;
          case 'year':
            cutoffDate.setFullYear(now.getFullYear() - 1);
            break;
        }
        
        filteredExpenses = expenses.filter(e => {
          const d = toDate(e.date);
          return d !== null && d >= cutoffDate;
        });
      }
      
      // Filter by brand if specified
      let filteredVehicles = vehicles;
      if (brand && brand !== 'all') {
        filteredVehicles = vehicles.filter(v => v.brand === brand);
        const vehicleIds = new Set(filteredVehicles.map(v => v.id));
        filteredExpenses = filteredExpenses.filter(e => vehicleIds.has(e.vehicleId));
      }
      
      // Calculate total costs
      const totalCosts = filteredExpenses.reduce((sum, e) => sum + toAmount(e.amount), 0);
      
      // Calculate average cost per vehicle
      const vehiclesWithExpenses = new Set(filteredExpenses.map(e => e.vehicleId));
      const averageCostPerVehicle = vehiclesWithExpenses.size > 0 
        ? totalCosts / vehiclesWithExpenses.size 
        : 0;
      
      // Calculate cost per km
      const totalMileage = filteredVehicles.reduce((sum, v) => 
        sum + (v.currentMileage || v.departureMileage || 0), 0);
      const averageCostPerKm = totalMileage > 0 ? totalCosts / totalMileage : 0;
      
      // Category breakdown
      const categoryMap = new Map<string, number>();
      filteredExpenses.forEach(e => {
        const category = e.category ?? 'unknown';
        const current = categoryMap.get(category) || 0;
        categoryMap.set(category, current + toAmount(e.amount));
      });
      
      const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, amount]) => ({
        category,
        amount,
        percentage: totalCosts > 0 ? (amount / totalCosts) * 100 : 0
      }));
      
      // Brand comparison
      const brandMap = new Map<string, {totalCost: number, vehicles: Set<number>}>();
      filteredExpenses.forEach(e => {
        const vehicle = vehicles.find(v => v.id === e.vehicleId);
        if (vehicle) {
          const brand = vehicle.brand ?? 'unknown';
          const brandData = brandMap.get(brand) || {totalCost: 0, vehicles: new Set<number>()};
          brandData.totalCost += toAmount(e.amount);
          brandData.vehicles.add(vehicle.id);
          brandMap.set(brand, brandData);
        }
      });
      
      const brandComparison = Array.from(brandMap.entries()).map(([brand, data]) => ({
        brand,
        totalCost: data.totalCost,
        avgCost: data.vehicles.size > 0 ? data.totalCost / data.vehicles.size : 0,
        vehicleCount: data.vehicles.size
      }));
      
      // Vehicle details
      const vehicleExpenseMap = new Map<number, {expenses: any[], totalCost: number}>();
      filteredExpenses.forEach(e => {
        const data = vehicleExpenseMap.get(e.vehicleId) || {expenses: [], totalCost: 0};
        data.expenses.push(e);
        data.totalCost += toAmount(e.amount);
        vehicleExpenseMap.set(e.vehicleId, data);
      });
      
      const vehicleDetails = Array.from(vehicleExpenseMap.entries()).map(([vehicleId, data]) => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (!vehicle) return null;
        
        const mileage = vehicle.currentMileage || vehicle.departureMileage || 0;
        return {
          vehicleId: vehicle.id,
          licensePlate: vehicle.licensePlate,
          brand: vehicle.brand,
          model: vehicle.model,
          totalCost: data.totalCost,
          costPerKm: mileage > 0 ? data.totalCost / mileage : 0,
          currentMileage: mileage,
          expenseCount: data.expenses.length
        };
      }).filter(Boolean);
      
      // Monthly trend (last 12 months)
      const monthlyMap = new Map<string, number>();
      const last12Months: string[] = [];
      for (let i = 11; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthKey = format(date, 'MMM yyyy');
        last12Months.push(monthKey);
        monthlyMap.set(monthKey, 0);
      }
      
      filteredExpenses.forEach(e => {
        const parsed = toDate(e.date);
        if (!parsed) return;
        const monthKey = format(parsed, 'MMM yyyy');
        if (monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + toAmount(e.amount));
        }
      });
      
      const monthlyTrend = last12Months.map(month => ({
        month,
        amount: monthlyMap.get(month) || 0
      }));
      
      res.json({
        totalCosts,
        averageCostPerVehicle,
        averageCostPerKm,
        totalVehicles: vehiclesWithExpenses.size,
        categoryBreakdown,
        brandComparison,
        vehicleDetails,
        monthlyTrend
      });
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
