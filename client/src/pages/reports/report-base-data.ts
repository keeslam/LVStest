/**
 * Rapporten herontwerp deel 1, Task 5: the page-level data of the old reports page
 * (vehicles, expenses, reservations, customers, transports) and the numbers derived from
 * it. The calculations are the old ones of the reports page, moved here unchanged; every
 * report in ./legacy reads what it needs from this hook.
 *
 * Every query keeps its own right, as before: the page right (view_reports) is not
 * accepted by these endpoints, so a query only runs when the user holds its source right.
 * The registry shows a report only to users who hold the rights its numbers need.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, subMonths, startOfMonth, endOfMonth, endOfDay, isWithinInterval, differenceInDays, parseISO, startOfDay } from "date-fns";
import { UserPermission, type Vehicle, type Expense, type Reservation, type Customer, type VehicleTransport } from "@shared/schema";
import { isMaintenanceExpenseCategory } from "@shared/expense-categories";
import { useHasPermission } from "@/hooks/use-has-permission";
import { formatExpenseCategory, formatLicensePlate, sumMoney } from "@/lib/format-utils";
import { officeToday } from "@/lib/office-date";
// BUG-223: Dutch dates on a Dutch screen.
import { formatNl as format } from "@/lib/format-date-nl";
import type { ExpenseChartData } from "@/components/reports/expense-chart";
import type { UtilizationChartData } from "@/components/reports/utilization-chart";
import { monthChange, categoryKey, presentCategories, expenseFetchWindow, type MonthChange } from "./report-helpers";
import { useReportFilters } from "./report-filters";

export type ApkStatus = "expired" | "expiring_soon" | "expiring_2to3_months" | "valid" | "unknown";

export interface UtilizationRow {
  id: number;
  licensePlate: string;
  brand: string;
  model: string;
  daysReserved: number;
  utilizationPercentage: number;
  reservationCount: number;
}

export interface MaintenanceCostRow {
  id: number;
  licensePlate: string;
  brand: string;
  model: string;
  maintenanceCost: number;
  expenseCount: number;
}

export type ApkRow = Vehicle & { apkStatus: ApkStatus; daysUntilExpiry: number | null };
export type WarrantyRow = Vehicle & { warrantyStatus: string; daysRemaining: number | null };

export interface CustomerStatsRow {
  id: number;
  name: string;
  reservationCount: number;
  totalReservationDays: number;
  totalExpenses: number;
  expensePerDay: number;
  expensesByCategory: Record<string, number>;
  vehicleCount: number;
  relatedExpenses: Expense[];
}

export interface ExpenseTrend {
  currentMonth: { name: string; total: number; changePercentage: MonthChange; expenses: Expense[] };
  previousMonth: { name: string; total: number; changePercentage: MonthChange; expenses: Expense[] };
  twoMonthsAgo: { name: string; total: number; expenses: Expense[] };
}

// Stable empty lists while a query loads or may not run: a fresh `[]` on every render would
// rebuild every derived row, and a report table that reports its view would render again and again.
const NO_VEHICLES: Vehicle[] = [];
const NO_EXPENSES: Expense[] = [];
const NO_RESERVATIONS: Reservation[] = [];
const NO_CUSTOMERS: Customer[] = [];
const NO_TRANSPORTS: VehicleTransport[] = [];

/**
 * `period`: undefined = the filter bar's period. A period = the same numbers for that period (the
 * comparison period of a report); null = off, nothing is fetched (a second copy while not comparing).
 * The vehicles, customers and transports are shared queries, so a second copy asks nothing extra.
 */
export function useReportBaseData(period?: { from: string; to: string } | null) {
  const bar = useReportFilters();
  const filters = period ? { ...bar, from: period.from, to: period.to } : bar;
  const on = period !== null;
  const canViewExpenses = useHasPermission(UserPermission.MANAGE_EXPENSES) && on;
  const canViewVehicles = useHasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES) && on;
  const canViewReservations = useHasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS) && on;
  const canViewCustomers = useHasPermission(UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS) && on;
  // GET /api/transports accepts either family.
  const canViewTransports = useHasPermission(
    UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES,
    UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS,
  ) && on;

  // The period of the filter bar as whole office days.
  const dateRange = useMemo(
    () => ({ from: parseISO(filters.from), to: endOfDay(parseISO(filters.to)) }),
    [filters.from, filters.to],
  );
  const selectedVehicle = filters.vehicleId;
  const selectedCategory = filters.category;

  const { data: vehicles = NO_VEHICLES, isFetching: vehiclesFetching } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
    enabled: canViewVehicles,
  });

  // BUG-205 phase B: only the reservations that touch the chosen period, from the server.
  const reportFrom = filters.from;
  const reportTo = filters.to;

  // B-65: only the expenses of the period (plus the trend's three months), not every expense ever booked.
  const expenseWindow = expenseFetchWindow(reportFrom, reportTo);
  const { data: expenses = NO_EXPENSES, isFetching: expensesFetching, isSuccess: expensesLoaded } = useQuery<Expense[]>({
    queryKey: ["/api/expenses", expenseWindow],
    enabled: canViewExpenses,
  });

  const { data: reservations = NO_RESERVATIONS, isFetching: reservationsFetching, isSuccess: reservationsLoaded } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations", { from: reportFrom, to: reportTo }],
    enabled: canViewReservations && !!reportFrom && !!reportTo,
  });

  const { data: customers = NO_CUSTOMERS, isFetching: customersFetching } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: canViewCustomers,
  });
  const dataBusy = vehiclesFetching || expensesFetching || reservationsFetching || customersFetching;

  // Vehicle transports (swaps, tows, repossessions, deliveries)
  const { data: transports = NO_TRANSPORTS } = useQuery<VehicleTransport[]>({
    queryKey: ["/api/transports"],
    enabled: canViewTransports,
  });

  const derived = useMemo(() => {
    // Filter expenses by date range and selected category
    const filteredExpenses = expenses.filter(expense => {
      if (!dateRange.from || !dateRange.to) return false;
      const expenseDate = new Date(expense.date);
      const withinDateRange = isWithinInterval(expenseDate, { start: dateRange.from, end: dateRange.to });
      const matchesCategory = selectedCategory === "all" || categoryKey(expense.category) === selectedCategory;
      const matchesVehicle = selectedVehicle === "all" || expense.vehicleId.toString() === selectedVehicle;
      return withinDateRange && matchesCategory && matchesVehicle;
    });

    // Filter reservations by date range and vehicle
    const filteredReservations = reservations.filter(reservation => {
      if (!dateRange.from || !dateRange.to) return false;
      if (!reservation.startDate || !reservation.endDate) return false;
      const startDate = parseISO(reservation.startDate);
      const endDate = parseISO(reservation.endDate);
      // Within range if any part of it falls within the selected date range
      const overlapsDateRange = (
        (startDate <= dateRange.to && startDate >= dateRange.from) ||
        (endDate <= dateRange.to && endDate >= dateRange.from) ||
        (startDate <= dateRange.from && endDate >= dateRange.to)
      );
      const matchesVehicle = selectedVehicle === "all" || String(reservation.vehicleId) === selectedVehicle;
      return overlapsDateRange && matchesVehicle;
    });

    // Expense totals by category
    const expensesByCategory: Record<string, number> = {};
    filteredExpenses.forEach(expense => {
      const category = categoryKey(expense.category);
      if (!expensesByCategory[category]) expensesByCategory[category] = 0;
      expensesByCategory[category] += Number(expense.amount);
    });

    const totalExpenses = sumMoney(filteredExpenses, expense => expense.amount);

    // A-14-8: one base for every average, the whole fleet.
    const fleetVehicleCount = vehicles.length;
    const avgExpensePerVehicle = totalExpenses / (fleetVehicleCount || 1);

    const isAllDataRange = !!(dateRange.from && dateRange.to && dateRange.from.getFullYear() <= 2000 && dateRange.to.getFullYear() >= 2050);

    // Vehicle utilization
    const vehicleUtilizationData: UtilizationRow[] = vehicles.map(vehicle => {
      const vehicleReservations = filteredReservations.filter(r => r.vehicleId === vehicle.id);
      // The very wide "All Data" range is measured against a year of workdays.
      if (isAllDataRange) {
        let totalReservationDays = 0;
        vehicleReservations.forEach(reservation => {
          if (!reservation.startDate || !reservation.endDate) return;
          const startDate = parseISO(reservation.startDate);
          const endDate = parseISO(reservation.endDate);
          totalReservationDays += differenceInDays(endDate, startDate) + 1;
        });
        const averageYearlyWorkdays = 260;
        const utilizationPercentage = vehicleReservations.length > 0
          ? Math.min(100, (totalReservationDays / averageYearlyWorkdays) * 100)
          : 0;
        return {
          id: vehicle.id, licensePlate: vehicle.licensePlate, brand: vehicle.brand, model: vehicle.model,
          daysReserved: totalReservationDays,
          utilizationPercentage: Math.round(utilizationPercentage),
          reservationCount: vehicleReservations.length,
        };
      }
      let daysReserved = 0;
      if (dateRange.from && dateRange.to) {
        const totalDaysInRange = differenceInDays(dateRange.to, dateRange.from) + 1;
        for (let d = 0; d < totalDaysInRange; d++) {
          // Compare whole days: reservation dates are date-only (local midnight via parseISO).
          const currentDate = startOfDay(addDays(dateRange.from, d));
          const isReserved = vehicleReservations.some(reservation => {
            if (!reservation.startDate || !reservation.endDate) return false;
            const startDate = startOfDay(parseISO(reservation.startDate));
            const endDate = startOfDay(parseISO(reservation.endDate));
            return currentDate >= startDate && currentDate <= endDate;
          });
          if (isReserved) daysReserved++;
        }
      }
      const utilizationPercentage = dateRange.from && dateRange.to
        ? (daysReserved / (differenceInDays(dateRange.to, dateRange.from) + 1)) * 100
        : 0;
      return {
        id: vehicle.id, licensePlate: vehicle.licensePlate, brand: vehicle.brand, model: vehicle.model,
        daysReserved,
        utilizationPercentage: Math.round(utilizationPercentage),
        reservationCount: vehicleReservations.length,
      };
    }).sort((a, b) => b.utilizationPercentage - a.utilizationPercentage);

    // Vehicles that were rented in the period (the average still runs over the whole fleet).
    const rentedVehicleCount = vehicleUtilizationData.filter(v => v.utilizationPercentage > 0).length;

    // Maintenance cost by vehicle: the one maintenance set of the audit (A-14-2).
    const maintenanceCostByVehicle: MaintenanceCostRow[] = vehicles.map(vehicle => {
      const vehicleExpenses = filteredExpenses.filter(e => e.vehicleId === vehicle.id);
      const maintenanceExpenses = vehicleExpenses.filter(e => isMaintenanceExpenseCategory(e.category));
      return {
        id: vehicle.id, licensePlate: vehicle.licensePlate, brand: vehicle.brand, model: vehicle.model,
        maintenanceCost: sumMoney(maintenanceExpenses, expense => expense.amount),
        expenseCount: maintenanceExpenses.length,
      };
    }).sort((a, b) => b.maintenanceCost - a.maintenanceCost);

    // APK status of every vehicle
    const today = new Date();
    const statusPriority: Record<ApkStatus, number> = { expired: 0, expiring_soon: 1, expiring_2to3_months: 2, valid: 3, unknown: 4 };
    const apkStatusList: ApkRow[] = vehicles.map(vehicle => {
      if (!vehicle.apkDate) return { ...vehicle, apkStatus: "unknown" as ApkStatus, daysUntilExpiry: null as number | null };
      const daysUntilExpiry = differenceInDays(new Date(vehicle.apkDate), today);
      let apkStatus: ApkStatus = "valid";
      if (daysUntilExpiry < 0) apkStatus = "expired";
      else if (daysUntilExpiry <= 30) apkStatus = "expiring_soon";
      else if (daysUntilExpiry <= 90) apkStatus = "expiring_2to3_months";
      return { ...vehicle, apkStatus, daysUntilExpiry };
    }).sort((a, b) => {
      const statusDiff = statusPriority[a.apkStatus] - statusPriority[b.apkStatus];
      if (statusDiff !== 0) return statusDiff;
      if (a.daysUntilExpiry === null && b.daysUntilExpiry === null) return 0;
      if (a.daysUntilExpiry === null) return 1;
      if (b.daysUntilExpiry === null) return -1;
      return a.daysUntilExpiry - b.daysUntilExpiry;
    });

    // Warranty status of the vehicles that have a warranty end date
    const warrantyStatusList: WarrantyRow[] = vehicles.filter(v => v.warrantyEndDate).map(vehicle => {
      const warrantyDate = vehicle.warrantyEndDate ? new Date(vehicle.warrantyEndDate) : null;
      const daysRemaining = warrantyDate ? differenceInDays(warrantyDate, today) : null;
      let warrantyStatus = "unknown";
      if (daysRemaining !== null) {
        if (daysRemaining < 0) warrantyStatus = "expired";
        else if (daysRemaining <= 90) warrantyStatus = "expiring_soon";
        else warrantyStatus = "valid";
      }
      return { ...vehicle, warrantyStatus, daysRemaining };
    }).sort((a, b) => {
      if (a.daysRemaining === null) return 1;
      if (b.daysRemaining === null) return -1;
      return a.daysRemaining - b.daysRemaining;
    });

    // Customer reservation stats with expense impact analysis
    const customerReservationStats: CustomerStatsRow[] = customers.map(customer => {
      const customerReservations = filteredReservations.filter(r => r.customerId === customer.id);
      let totalReservationDays = 0;
      customerReservations.forEach(reservation => {
        const startDate = new Date(reservation.startDate);
        const endDate = reservation.endDate ? new Date(reservation.endDate) : new Date();
        totalReservationDays += differenceInDays(endDate, startDate) + 1;
      });
      const customerVehicleIds = Array.from(new Set(customerReservations.map(r => r.vehicleId)));
      // Expenses during a reservation or up to 7 days after it ended
      const relatedExpenses: Expense[] = [];
      customerReservations.forEach(reservation => {
        const reservationEndDate = reservation.endDate ? new Date(reservation.endDate) : new Date();
        const postReservationWindow = addDays(reservationEndDate, 7);
        filteredExpenses.forEach(expense => {
          if (expense.vehicleId === reservation.vehicleId) {
            const expenseDate = new Date(expense.date);
            if (expenseDate >= new Date(reservation.startDate) && expenseDate <= postReservationWindow) {
              relatedExpenses.push(expense);
            }
          }
        });
      });
      const customerExpensesByCategory: Record<string, number> = {};
      const expensesByCategoryGroups: Record<string, Expense[]> = {};
      relatedExpenses.forEach(expense => {
        const category = categoryKey(expense.category);
        if (!expensesByCategoryGroups[category]) expensesByCategoryGroups[category] = [];
        expensesByCategoryGroups[category].push(expense);
      });
      Object.entries(expensesByCategoryGroups).forEach(([category, categoryExpenses]) => {
        customerExpensesByCategory[category] = sumMoney(categoryExpenses, expense => expense.amount);
      });
      const customerTotal = sumMoney(relatedExpenses, expense => expense.amount);
      const expensePerDay = totalReservationDays > 0 ? customerTotal / totalReservationDays : 0;
      return {
        id: customer.id,
        name: customer.name,
        reservationCount: customerReservations.length,
        totalReservationDays,
        totalExpenses: customerTotal,
        expensePerDay,
        expensesByCategory: customerExpensesByCategory,
        vehicleCount: customerVehicleIds.length,
        relatedExpenses,
      };
    }).sort((a, b) => b.totalExpenses - a.totalExpenses);

    // The customers shown in "Kostencategorieen per klant" and the categories that get a column.
    const customerCostRows = customerReservationStats.filter(c => c.totalExpenses > 0).slice(0, 10);
    const customerCostCategories = presentCategories(
      customerCostRows.flatMap(c => Object.keys(c.expensesByCategory).map(category => ({ category }))),
    );

    // Reservations that started already (a booking in November is not recent in October), newest first.
    // Task 5: all of them in the period, no longer the first 10.
    const todayYmd = officeToday();
    const recentCustomerReservations = filteredReservations
      .filter(r => r.startDate && r.startDate.slice(0, 10) <= todayYmd)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

    const expenseChartData: ExpenseChartData[] = Object.entries(expensesByCategory)
      .map(([category, amount]) => ({ name: formatExpenseCategory(category), expenses: amount, category }))
      .sort((a, b) => b.expenses - a.expenses);

    const utilizationChartData: UtilizationChartData[] = vehicleUtilizationData
      .filter(v => v.utilizationPercentage > 0)
      .slice(0, 10)
      .map(vehicle => ({ name: formatLicensePlate(vehicle.licensePlate), utilization: vehicle.utilizationPercentage, vehicleId: vehicle.id }));

    // Expense trend: the last three calendar months. A-14-4: it honours the category and vehicle
    // filters, not the period (known gap, kept as it is).
    const expenseTrend: ExpenseTrend = (() => {
      const now = new Date();
      const currentMonth = startOfMonth(now);
      const previousMonth = startOfMonth(subMonths(now, 1));
      const twoMonthsAgo = startOfMonth(subMonths(now, 2));
      const trendExpenses = expenses.filter(expense =>
        (selectedCategory === "all" || categoryKey(expense.category) === selectedCategory) &&
        (selectedVehicle === "all" || String(expense.vehicleId) === selectedVehicle));
      // The rows of each month stay with the total: a click on a month shows them.
      const currentMonthRows = trendExpenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate >= currentMonth && expenseDate <= endOfMonth(currentMonth);
      });
      const previousMonthRows = trendExpenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate >= previousMonth && expenseDate < currentMonth;
      });
      const twoMonthsAgoRows = trendExpenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate >= twoMonthsAgo && expenseDate < previousMonth;
      });
      const currentMonthExpenses = sumMoney(currentMonthRows, expense => expense.amount);
      const previousMonthExpenses = sumMoney(previousMonthRows, expense => expense.amount);
      const twoMonthsAgoExpenses = sumMoney(twoMonthsAgoRows, expense => expense.amount);
      return {
        currentMonth: { name: format(currentMonth, "MMM yyyy"), total: currentMonthExpenses, changePercentage: monthChange(previousMonthExpenses, currentMonthExpenses), expenses: currentMonthRows },
        previousMonth: { name: format(previousMonth, "MMM yyyy"), total: previousMonthExpenses, changePercentage: monthChange(twoMonthsAgoExpenses, previousMonthExpenses), expenses: previousMonthRows },
        twoMonthsAgo: { name: format(twoMonthsAgo, "MMM yyyy"), total: twoMonthsAgoExpenses, expenses: twoMonthsAgoRows },
      };
    })();

    return {
      filteredExpenses, filteredReservations, expensesByCategory, totalExpenses, fleetVehicleCount, avgExpensePerVehicle,
      isAllDataRange, vehicleUtilizationData, rentedVehicleCount, maintenanceCostByVehicle, apkStatusList, warrantyStatusList,
      customerReservationStats, customerCostRows, customerCostCategories, recentCustomerReservations,
      expenseChartData, utilizationChartData, expenseTrend,
    };
  }, [vehicles, expenses, reservations, customers, dateRange, selectedVehicle, selectedCategory]);

  return {
    ...derived,
    dateRange,
    selectedVehicle,
    selectedCategory,
    vehicles,
    expenses,
    customers,
    transports,
    dataBusy,
    /** The expenses and reservations of the period are in (a second copy: its numbers are known). */
    expensesLoaded,
    reservationsLoaded,
  };
}

export type ReportBaseData = ReturnType<typeof useReportBaseData>;
