import type { Request, Response } from "express";
import { format } from "date-fns";
import { storage } from "../storage";
import { ReportValidationError } from "../database-storage";
import { UserPermission } from "../../shared/schema";
import { hasPermission } from "../middleware/permissions.js";
import type { Express } from "express";

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
        
        filteredExpenses = expenses.filter(e => new Date(e.date) >= cutoffDate);
      }
      
      // Filter by brand if specified
      let filteredVehicles = vehicles;
      if (brand && brand !== 'all') {
        filteredVehicles = vehicles.filter(v => v.brand === brand);
        const vehicleIds = new Set(filteredVehicles.map(v => v.id));
        filteredExpenses = filteredExpenses.filter(e => vehicleIds.has(e.vehicleId));
      }
      
      // Calculate total costs
      const totalCosts = filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
      
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
        const current = categoryMap.get(e.category) || 0;
        categoryMap.set(e.category, current + parseFloat(e.amount.toString()));
      });
      
      const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, amount]) => ({
        category,
        amount,
        percentage: (amount / totalCosts) * 100
      }));
      
      // Brand comparison
      const brandMap = new Map<string, {totalCost: number, vehicles: Set<number>}>();
      filteredExpenses.forEach(e => {
        const vehicle = vehicles.find(v => v.id === e.vehicleId);
        if (vehicle) {
          const brandData = brandMap.get(vehicle.brand) || {totalCost: 0, vehicles: new Set()};
          brandData.totalCost += parseFloat(e.amount.toString());
          brandData.vehicles.add(vehicle.id);
          brandMap.set(vehicle.brand, brandData);
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
        data.totalCost += parseFloat(e.amount.toString());
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
        const monthKey = format(new Date(e.date), 'MMM yyyy');
        if (monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + parseFloat(e.amount.toString()));
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

      const report = await storage.createSavedReport({
        name: config.name,
        description: config.description || null,
        configuration: config,
        dataSources: config.dataSources || [],
        enabled: true,
        createdBy: user ? user.username : null,
        createdByUserId: user ? user.id : null,
        updatedBy: user ? user.username : null,
      } as any); // FIXME: payload does not match the saved_reports columns (no `configuration`/`dataSources`/`enabled`, `dataSource` missing)

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
}
