import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { VehicleSelector } from "@/components/ui/vehicle-selector";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ExpenseChart, type ExpenseChartData } from "@/components/reports/expense-chart";
import { UtilizationChart, type UtilizationChartData } from "@/components/reports/utilization-chart";
import { Vehicle, Expense, Reservation, Customer, VehicleTransport } from "@shared/schema";
import { formatDate, formatCurrency, formatLicensePlate, sumMoney } from "@/lib/format-utils";
import { Price } from "@/components/ui/price";
import { isTrueValue } from "@/lib/utils";
import { addDays, format, subMonths, subDays, startOfMonth, endOfMonth, isWithinInterval, differenceInDays, parseISO, startOfDay } from "date-fns";
import { 
  Calendar, Download, FileText, TrendingUp, Car, Settings, User, 
  DollarSign, AlertTriangle, Printer, Search, ExternalLink, Database, LineChart, X
} from "lucide-react";
import { Link } from "wouter";
import { DateRange } from "react-day-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReportBuilderPage from "@/pages/reports/report-builder";
import MaintenanceCostsPage from "@/pages/reports/maintenance-costs";

/**
 * Reports Page - Generate and display reports for the car rental business
 * This page focuses on operational aspects rather than revenue
 */
export default function ReportsPage() {
  const { t } = useTranslation("reports");

  // Tab state - default to operations tab
  const [activeTab, setActiveTab] = useState("operations");
  
  // Dialog states
  const [reportBuilderOpen, setReportBuilderOpen] = useState(false);
  const [maintenanceCostsOpen, setMaintenanceCostsOpen] = useState(false);
  
  // Date range state with default to last 30 days
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date()
  });
  
  // Vehicle filter
  const [selectedVehicle, setSelectedVehicle] = useState<string>("all");
  
  // Expense category filter
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  
  // Pagination
  const pageSize = 10;
  
  // APK table state
  const [apkSearchQuery, setApkSearchQuery] = useState<string>("");
  const [apkFilterStatus, setApkFilterStatus] = useState<string>("all");
  const [apkCurrentPage, setApkCurrentPage] = useState(1);
  
  // Warranty table state
  const [warrantySearchQuery, setWarrantySearchQuery] = useState<string>("");
  const [warrantyFilterStatus, setWarrantyFilterStatus] = useState<string>("all");
  const [warrantyCurrentPage, setWarrantyCurrentPage] = useState(1);
  
  // Function to reset all filters to default values
  const resetFilters = () => {
    setDateRange({
      from: subDays(new Date(), 30),
      to: new Date()
    });
    setSelectedVehicle("all");
    setSelectedCategory("all");
  };
  
  // Date range preset options
  const setDateRangePreset = (preset: 'all-time' | 'this-month' | 'next-month') => {
    const now = new Date();
    
    switch(preset) {
      case 'all-time':
        // Set a very early start date and far future end date to truly show all data
        setDateRange({
          from: new Date('2000-01-01'), // Go way back to cover all historical data
          to: new Date('2050-12-31')    // Go way forward to include all future data
        });
        break;
      case 'this-month':
        setDateRange({
          from: startOfMonth(now),
          to: endOfMonth(now)
        });
        break;
      case 'next-month':
        const nextMonth = addDays(endOfMonth(now), 1);
        setDateRange({
          from: nextMonth,
          to: endOfMonth(nextMonth)
        });
        break;
    }
  };

  // Fetch all vehicles for filtering
  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });
  
  // Fetch expenses with date filtering
  const { data: expenses = [] } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
  });
  
  // Fetch reservations with date filtering
  const { data: reservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
  });
  
  // Fetch customers
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  // Fetch vehicle transports (swaps, tows, repossessions, deliveries)
  const { data: transports = [] } = useQuery<VehicleTransport[]>({
    queryKey: ["/api/transports"],
  });

  const [transportTypeFilter, setTransportTypeFilter] = useState<string>("all");
  const [transportStatusFilter, setTransportStatusFilter] = useState<string>("all");
  const [selectedTransportIds, setSelectedTransportIds] = useState<number[]>([]);

  const TRANSPORT_TYPE_LABELS: Record<string, string> = {
    swap: t('reportsPage.transportsTab.transportTypes.swap'),
    tow: t('reportsPage.transportsTab.transportTypes.tow'),
    repossession: t('reportsPage.transportsTab.transportTypes.repossession'),
    delivery: t('reportsPage.transportsTab.transportTypes.delivery'),
    other: t('reportsPage.transportsTab.transportTypes.other'),
  };

  const filteredTransportsForReport = transports.filter(t => {
    if (transportTypeFilter !== "all" && t.transportType !== transportTypeFilter) return false;
    if (transportStatusFilter !== "all" && t.status !== transportStatusFilter) return false;
    return true;
  });

  // Filter expenses by date range and selected category
  const filteredExpenses = expenses.filter(expense => {
    // Skip date filter if dates are undefined
    if (!dateRange.from || !dateRange.to) return false;
    
    const expenseDate = new Date(expense.date);
    const withinDateRange = isWithinInterval(expenseDate, {
      start: dateRange.from,
      end: dateRange.to
    });
    
    const matchesCategory = selectedCategory === "all" || expense.category === selectedCategory;
    const matchesVehicle = selectedVehicle === "all" || expense.vehicleId.toString() === selectedVehicle;
    
    return withinDateRange && matchesCategory && matchesVehicle;
  });
  
  // Filter reservations by date range and vehicle
  const filteredReservations = reservations.filter(reservation => {
    // Skip date filter if dates are undefined
    if (!dateRange.from || !dateRange.to) return false;
    
    if (!reservation.startDate || !reservation.endDate) return false;

    const startDate = parseISO(reservation.startDate);
    const endDate = parseISO(reservation.endDate);

    // Consider reservation within range if any part of it falls within the selected date range
    const overlapsDateRange = (
      (startDate <= dateRange.to && startDate >= dateRange.from) || // Start date within range
      (endDate <= dateRange.to && endDate >= dateRange.from) || // End date within range
      (startDate <= dateRange.from && endDate >= dateRange.to) // Reservation spans entire range
    );
    
    const matchesVehicle = selectedVehicle === "all" || String(reservation.vehicleId) === selectedVehicle;
    
    return overlapsDateRange && matchesVehicle;
  });
  
  // Calculate expense totals by category
  const expensesByCategory: Record<string, number> = {};
  filteredExpenses.forEach(expense => {
    const category = expense.category;
    if (!expensesByCategory[category]) {
      expensesByCategory[category] = 0;
    }
    expensesByCategory[category] += Number(expense.amount);
  });
  
  // Calculate total expenses
  const totalExpenses = sumMoney(filteredExpenses, expense => expense.amount);
  
  // Calculate the number of vehicles with activity (have expenses or reservations) as an alternative to "active" property
  const vehiclesWithActivity = vehicles.filter(v => 
    filteredExpenses.some(e => e.vehicleId === v.id) || 
    filteredReservations.some(r => r.vehicleId === v.id)
  );
  const activeVehicleCount = vehiclesWithActivity.length || vehicles.length || 1;
  const avgExpensePerVehicle = totalExpenses / activeVehicleCount;
  
  // Calculate vehicle utilization data
  const vehicleUtilizationData = vehicles.map(vehicle => {
    const vehicleReservations = filteredReservations.filter(r => r.vehicleId === vehicle.id);
    
    // Check if we're using the "All Data" preset with the very wide date range
    const isAllDataView = dateRange.from && dateRange.to && 
      dateRange.from.getFullYear() <= 2000 && dateRange.to.getFullYear() >= 2050;
    
    // For "All Data" view, we'll calculate utilization differently
    if (isAllDataView) {
      // Calculate total reservation days for this vehicle
      let totalReservationDays = 0;
      vehicleReservations.forEach(reservation => {
        if (!reservation.startDate || !reservation.endDate) return;
        const startDate = parseISO(reservation.startDate);
        const endDate = parseISO(reservation.endDate);
        const days = differenceInDays(endDate, startDate) + 1;
        totalReservationDays += days;
      });
      
      // For "All Data" view, use the number of active days in a year as base (260 workdays)
      // This gives a more meaningful utilization percentage based on typical business days
      const averageYearlyWorkdays = 260;
      
      // For vehicles with no reservations, utilization is 0
      const utilizationPercentage = vehicleReservations.length > 0
        ? Math.min(100, (totalReservationDays / averageYearlyWorkdays) * 100)
        : 0;
      
      return {
        id: vehicle.id,
        licensePlate: vehicle.licensePlate,
        brand: vehicle.brand,
        model: vehicle.model,
        daysReserved: totalReservationDays,
        utilizationPercentage: Math.round(utilizationPercentage),
        reservationCount: vehicleReservations.length
      };
    } else {
      // Standard calculation for normal date ranges
      let daysReserved = 0;
      if (dateRange.from && dateRange.to) {
        const totalDaysInRange = differenceInDays(dateRange.to, dateRange.from) + 1;
        
        // For each day in the range, check if the vehicle was reserved
        for (let d = 0; d < totalDaysInRange; d++) {
          // Compare whole days: dateRange carries the current time-of-day, while
          // reservation dates are date-only (local midnight via parseISO). Without
          // startOfDay the `<=` end check fails and single-day rentals count as zero.
          const currentDate = startOfDay(addDays(dateRange.from, d));
          const isReserved = vehicleReservations.some(reservation => {
            if (!reservation.startDate || !reservation.endDate) return false;
            const startDate = startOfDay(parseISO(reservation.startDate));
            const endDate = startOfDay(parseISO(reservation.endDate));
            return currentDate >= startDate && currentDate <= endDate;
          });
          
          if (isReserved) {
            daysReserved++;
          }
        }
      }
      
      // Calculate utilization percentage
      const utilizationPercentage = dateRange.from && dateRange.to
        ? (daysReserved / (differenceInDays(dateRange.to, dateRange.from) + 1)) * 100
        : 0;
      
      return {
        id: vehicle.id,
        licensePlate: vehicle.licensePlate,
        brand: vehicle.brand,
        model: vehicle.model,
        daysReserved,
        utilizationPercentage: Math.round(utilizationPercentage),
        reservationCount: vehicleReservations.length
      };
    }
  }).sort((a, b) => b.utilizationPercentage - a.utilizationPercentage);
  
  // Calculate maintenance cost by vehicle
  const maintenanceCostByVehicle = vehicles.map(vehicle => {
    const vehicleExpenses = filteredExpenses.filter(e => e.vehicleId === vehicle.id);
    const maintenanceExpenses = vehicleExpenses.filter(e => 
      e.category === 'maintenance' || e.category === 'repair' || e.category === 'tires'
    );
    
    const totalMaintenanceCost = sumMoney(maintenanceExpenses, expense => expense.amount);
    
    return {
      id: vehicle.id,
      licensePlate: vehicle.licensePlate,
      brand: vehicle.brand,
      model: vehicle.model,
      maintenanceCost: totalMaintenanceCost,
      expenseCount: maintenanceExpenses.length
    };
  }).sort((a, b) => b.maintenanceCost - a.maintenanceCost);
  
  // Define APK status types
  type ApkStatus = 'expired' | 'expiring_soon' | 'expiring_2to3_months' | 'valid' | 'unknown';
  
  // Process APK date information for all vehicles
  const today = new Date();
  const apkStatusList = vehicles.map(vehicle => {
    // Handle vehicles without APK date set
    if (!vehicle.apkDate) {
      return {
        ...vehicle,
        apkStatus: 'unknown' as ApkStatus,
        daysUntilExpiry: null as number | null
      };
    }
    
    const apkDate = new Date(vehicle.apkDate);
    const daysUntilExpiry = differenceInDays(apkDate, today);
    
    let apkStatus: ApkStatus = 'valid';
    if (daysUntilExpiry < 0) {
      apkStatus = 'expired';
    } else if (daysUntilExpiry <= 30) {
      apkStatus = 'expiring_soon';
    } else if (daysUntilExpiry <= 90) {
      apkStatus = 'expiring_2to3_months';
    }
    
    return {
      ...vehicle,
      apkStatus,
      daysUntilExpiry
    };
  }).sort((a, b) => {
    // Sort by APK status priority (expired, expiring soon, valid, unknown)
    type StatusPriority = {
      expired: number;
      expiring_soon: number;
      expiring_2to3_months: number;
      valid: number;
      unknown: number;
    };
    
    const statusPriority: StatusPriority = {
      expired: 0,
      expiring_soon: 1,
      expiring_2to3_months: 2,
      valid: 3,
      unknown: 4
    };
    
    // First sort by status priority
    const aStatus = a.apkStatus as keyof StatusPriority;
    const bStatus = b.apkStatus as keyof StatusPriority;
    const statusDiff = statusPriority[aStatus] - statusPriority[bStatus];
    if (statusDiff !== 0) return statusDiff;
    
    // Then sort by days until expiry for same status
    // Handle null values for unknown APK dates
    if (a.daysUntilExpiry === null && b.daysUntilExpiry === null) return 0;
    if (a.daysUntilExpiry === null) return 1;
    if (b.daysUntilExpiry === null) return -1;
    
    return a.daysUntilExpiry - b.daysUntilExpiry;
  });
  
  // Calculate APK statistics
  const vehiclesWithValidApk = apkStatusList.filter(v => v.apkStatus === 'valid');
  const vehiclesWithApkExpiringSoon = apkStatusList.filter(v => v.apkStatus === 'expiring_soon');
  const vehiclesWithApkExpiring2to3Months = apkStatusList.filter(v => v.apkStatus === 'expiring_2to3_months');
  const vehiclesWithExpiredApk = apkStatusList.filter(v => v.apkStatus === 'expired');
  const vehiclesWithoutApkDate = apkStatusList.filter(v => v.apkStatus === 'unknown');
  
  // Vehicles with APK expiring within 30 days (for alerts)
  const apkExpiringVehicles = [...vehiclesWithApkExpiringSoon, ...vehiclesWithExpiredApk];
  
  // Filter APK list based on search query and filter status
  const filteredApkStatusList = apkStatusList.filter(vehicle => {
    const matchesSearch = !apkSearchQuery || 
      vehicle.licensePlate.toLowerCase().includes(apkSearchQuery.toLowerCase()) ||
      vehicle.brand.toLowerCase().includes(apkSearchQuery.toLowerCase()) ||
      vehicle.model.toLowerCase().includes(apkSearchQuery.toLowerCase());
      
    const matchesStatus = apkFilterStatus === 'all' || vehicle.apkStatus === apkFilterStatus;
    
    return matchesSearch && matchesStatus;
  });
  
  // Process warranty data for vehicles
  const vehiclesWithWarranty = vehicles.filter(v => v.warrantyEndDate);
  
  // Create warranty status list
  const warrantyStatusList = vehiclesWithWarranty.map(vehicle => {
    const warrantyDate = vehicle.warrantyEndDate ? new Date(vehicle.warrantyEndDate) : null;
    const daysRemaining = warrantyDate ? differenceInDays(warrantyDate, today) : null;
    
    let warrantyStatus = 'unknown';
    if (daysRemaining !== null) {
      if (daysRemaining < 0) {
        warrantyStatus = 'expired';
      } else if (daysRemaining <= 90) {
        warrantyStatus = 'expiring_soon';
      } else {
        warrantyStatus = 'valid';
      }
    }
    
    return {
      ...vehicle,
      warrantyStatus,
      daysRemaining
    };
  }).sort((a, b) => {
    if (a.daysRemaining === null) return 1;
    if (b.daysRemaining === null) return -1;
    return a.daysRemaining - b.daysRemaining;
  });
  
  // Filter warranty list based on search query and filter status
  const filteredWarrantyList = warrantyStatusList.filter(vehicle => {
    const matchesSearch = !warrantySearchQuery || 
      vehicle.licensePlate.toLowerCase().includes(warrantySearchQuery.toLowerCase()) ||
      vehicle.brand.toLowerCase().includes(warrantySearchQuery.toLowerCase()) ||
      vehicle.model.toLowerCase().includes(warrantySearchQuery.toLowerCase());
      
    const matchesStatus = warrantyFilterStatus === 'all' || vehicle.warrantyStatus === warrantyFilterStatus;
    
    return matchesSearch && matchesStatus;
  });
  
  // Calculate customer reservation stats with expense impact analysis
  const customerReservationStats = customers.map(customer => {
    const customerReservations = filteredReservations.filter(r => r.customerId === customer.id);
    
    // Calculate vehicle usage days for this customer
    let totalReservationDays = 0;
    customerReservations.forEach(reservation => {
      const startDate = new Date(reservation.startDate);
      const endDate = reservation.endDate ? new Date(reservation.endDate) : new Date();
      const days = differenceInDays(endDate, startDate) + 1;
      totalReservationDays += days;
    });
    
    // Get all the vehicles this customer has used
    const customerVehicleIds = Array.from(new Set(customerReservations.map(r => r.vehicleId)));
    
    // Find expenses that occurred during or shortly after this customer's reservations
    // (using a 7-day window after reservation ends)
    const relatedExpenses: Expense[] = [];
    customerReservations.forEach(reservation => {
      const reservationEndDate = reservation.endDate ? new Date(reservation.endDate) : new Date();
      const postReservationWindow = addDays(reservationEndDate, 7); // 7 days after reservation ended
      
      filteredExpenses.forEach(expense => {
        if (expense.vehicleId === reservation.vehicleId) {
          const expenseDate = new Date(expense.date);
          // Include expenses that occurred during reservation or up to 7 days after
          if (
            (expenseDate >= new Date(reservation.startDate) && expenseDate <= postReservationWindow)
          ) {
            relatedExpenses.push(expense);
          }
        }
      });
    });
    
    // Calculate expense totals by category for this customer
    const expensesByCategory: Record<string, number> = {};
    const expensesByCategoryGroups: Record<string, Expense[]> = {};
    relatedExpenses.forEach(expense => {
      const category = expense.category;
      if (!expensesByCategoryGroups[category]) {
        expensesByCategoryGroups[category] = [];
      }
      expensesByCategoryGroups[category].push(expense);
    });
    Object.entries(expensesByCategoryGroups).forEach(([category, categoryExpenses]) => {
      expensesByCategory[category] = sumMoney(categoryExpenses, expense => expense.amount);
    });

    // Calculate total expenses
    const totalExpenses = sumMoney(relatedExpenses, expense => expense.amount);
    
    // Calculate expense per day metrics
    const expensePerDay = totalReservationDays > 0 ? totalExpenses / totalReservationDays : 0;
    
    return {
      id: customer.id,
      name: customer.name,
      reservationCount: customerReservations.length,
      totalReservationDays,
      totalExpenses,
      expensePerDay,
      expensesByCategory,
      vehicleCount: customerVehicleIds.length,
      relatedExpenses
    };
  }).sort((a, b) => b.totalExpenses - a.totalExpenses);
  
  // Prepare expense chart data
  const expenseChartData: ExpenseChartData[] = Object.entries(expensesByCategory)
    .map(([category, amount]) => ({
      name: category.charAt(0).toUpperCase() + category.slice(1),
      expenses: amount
    }))
    .sort((a, b) => b.expenses - a.expenses);
  
  // Prepare utilization chart data
  const utilizationChartData: UtilizationChartData[] = vehicleUtilizationData
    .filter(v => v.utilizationPercentage > 0)
    .slice(0, 10)
    .map(vehicle => ({
      name: formatLicensePlate(vehicle.licensePlate),
      utilization: vehicle.utilizationPercentage
    }));
  
  // Calculate expense trend (last 3 months comparison)
  const expenseTrend = (() => {
    // Get expense totals for current month, previous month, and 2 months ago
    const now = new Date();
    const currentMonth = startOfMonth(now);
    const previousMonth = startOfMonth(subMonths(now, 1));
    const twoMonthsAgo = startOfMonth(subMonths(now, 2));
    
    const currentMonthExpenses = sumMoney(expenses.filter(expense => {
      const expenseDate = new Date(expense.date);
      return expenseDate >= currentMonth && expenseDate <= endOfMonth(currentMonth);
    }), expense => expense.amount);

    const previousMonthExpenses = sumMoney(expenses.filter(expense => {
      const expenseDate = new Date(expense.date);
      return expenseDate >= previousMonth && expenseDate < currentMonth;
    }), expense => expense.amount);

    const twoMonthsAgoExpenses = sumMoney(expenses.filter(expense => {
      const expenseDate = new Date(expense.date);
      return expenseDate >= twoMonthsAgo && expenseDate < previousMonth;
    }), expense => expense.amount);
    
    // Calculate month-over-month change percentages
    const currentVsPrevious = previousMonthExpenses === 0 
      ? 100 
      : ((currentMonthExpenses - previousMonthExpenses) / previousMonthExpenses) * 100;
      
    const previousVsTwoMonths = twoMonthsAgoExpenses === 0 
      ? 100 
      : ((previousMonthExpenses - twoMonthsAgoExpenses) / twoMonthsAgoExpenses) * 100;
    
    return {
      currentMonth: {
        name: format(currentMonth, 'MMM yyyy'),
        total: currentMonthExpenses,
        changePercentage: currentVsPrevious
      },
      previousMonth: {
        name: format(previousMonth, 'MMM yyyy'),
        total: previousMonthExpenses,
        changePercentage: previousVsTwoMonths
      },
      twoMonthsAgo: {
        name: format(twoMonthsAgo, 'MMM yyyy'),
        total: twoMonthsAgoExpenses
      }
    };
  })();

  // Function to generate APK table for reports
  const generateAPKTable = (vehicles: (Vehicle & { apkStatus: string, daysUntilExpiry: number | null })[]) => `
    <table>
      <thead>
        <tr>
          <th>${t('reportsPage.common.vehicle')}</th>
          <th>${t('reportsPage.common.licensePlate')}</th>
          <th>${t('reportsPage.printReport.tableHeaders.apkExpiryDate')}</th>
          <th>${t('common:fields.status')}</th>
        </tr>
      </thead>
      <tbody>
        ${vehicles.length > 0
          ? vehicles.map(v => {
              const daysUntilExpiry = v.daysUntilExpiry;

              let statusClass = 'status-valid';
              let statusText = t('reportsPage.common.valid');

              if (daysUntilExpiry === null) {
                statusClass = 'status-unknown';
                statusText = t('reportsPage.common.notSet');
              } else if (daysUntilExpiry < 0) {
                statusClass = 'status-expired';
                statusText = t('reportsPage.common.expiredAgo', { count: Math.abs(daysUntilExpiry) });
              } else if (daysUntilExpiry <= 30) {
                statusClass = 'status-expiring';
                statusText = t('reportsPage.common.expiresIn', { count: daysUntilExpiry });
              } else if (daysUntilExpiry <= 90) {
                statusClass = 'status-expiring';
                statusText = t('reportsPage.common.expiresIn', { count: daysUntilExpiry });
              }

              return `
                <tr>
                  <td>${v.brand} ${v.model}</td>
                  <td>${formatLicensePlate(v.licensePlate)}</td>
                  <td>${v.apkDate ? formatDate(v.apkDate) : t('reportsPage.common.notSet')}</td>
                  <td class="${statusClass}">${statusText}</td>
                </tr>
              `;
            }).join('')
          : `<tr><td colspan="4" class="text-center">${t('reportsPage.printReport.noVehiclesFound')}</td></tr>`
        }
      </tbody>
    </table>
  `;

  // Function to handle printing reports
  const printReport = (reportType: string) => {
    // Create a hidden iframe for printing specific content
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    
    document.body.appendChild(printFrame);
    
    // Wait for iframe to load before adding content
    printFrame.onload = () => {
      const doc = printFrame.contentDocument || printFrame.contentWindow?.document;
      
      if (!doc) {
        console.error('Could not create print document');
        return;
      }
      
      const reportTypeTitles: Record<string, string> = {
        apk: t('reportsPage.printReport.reportTitles.apk'),
        utilization: t('reportsPage.printReport.reportTitles.utilization'),
        expenses: t('reportsPage.printReport.reportTitles.expenses'),
        warranty: t('reportsPage.printReport.reportTitles.warranty'),
        'customer-impact': t('reportsPage.printReport.reportTitles.customerImpact'),
        transports: t('reportsPage.printReport.reportTitles.transports'),
      };

      // Add base styles
      doc.head.innerHTML = `
        <title>${t('reportsPage.printReport.printReportTitle', { type: reportTypeTitles[reportType] || reportType })}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.5;
            color: #333;
            padding: 20px;
            max-width: 1200px;
            margin: 0 auto;
          }
          h1 {
            font-size: 24px;
            margin-bottom: 10px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
          }
          h2 {
            font-size: 18px;
            margin-top: 20px;
            margin-bottom: 10px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
          }
          th, td {
            text-align: left;
            padding: 8px;
            border-bottom: 1px solid #ddd;
          }
          th {
            background-color: #f2f2f2;
            font-weight: bold;
          }
          .report-meta {
            margin-bottom: 20px;
            font-size: 14px;
            color: #666;
          }
          .stat-card {
            padding: 15px;
            background-color: #f9f9f9;
            border-radius: 5px;
            margin-bottom: 15px;
          }
          .stat-value {
            font-size: 20px;
            font-weight: bold;
          }
          .stat-label {
            font-size: 14px;
            color: #666;
          }
          .status-expired {
            color: #e11d48;
            font-weight: bold;
          }
          .status-expiring {
            color: #fb923c;
            font-weight: bold;
          }
          .status-valid {
            color: #22c55e;
          }
          .status-unknown {
            color: #94a3b8;
            font-style: italic;
          }
          .company-info {
            margin-bottom: 20px;
            text-align: right;
          }
          .flex-container {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
          }
          .flex-item {
            flex: 1;
            padding: 10px;
          }
          .text-center {
            text-align: center;
          }
        </style>
      `;
      
      // Get date range string
      const dateRangeString = dateRange.from && dateRange.to
        ? `${format(dateRange.from, 'dd/MM/yyyy')} ${t('reportsPage.printReport.dateRangeSeparator')} ${format(dateRange.to, 'dd/MM/yyyy')}`
        : t('reportsPage.common.allData');
        
      let content = '';
      
      // Create different content based on report type
      switch (reportType) {
        case 'apk':
          // Filter APK vehicles that are expiring within 2-3 months (60-90 days)
          const apkExpiringNext2To3Months = apkStatusList.filter(vehicle => {
            const daysUntilExpiry = vehicle.daysUntilExpiry;
            return daysUntilExpiry !== null && daysUntilExpiry > 30 && daysUntilExpiry <= 90;
          }).sort((a, b) => {
            if (a.daysUntilExpiry === null || b.daysUntilExpiry === null) return 0;
            return a.daysUntilExpiry - b.daysUntilExpiry;
          });
          
          // APK expiration report
          content = `
            <div class="company-info">
              <h2>${t('reportsPage.printReport.reportGenerated', { date: format(new Date(), 'dd/MM/yyyy HH:mm') })}</h2>
            </div>
            <h1>${t('reportsPage.printReport.reportTitles.apk')}</h1>
            <div class="report-meta">
              ${t('reportsPage.printReport.dateRangeLabel', { range: dateRangeString })}
            </div>

            <div class="flex-container">
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${vehiclesWithExpiredApk.length}</div>
                  <div class="stat-label">${t('reportsPage.printReport.stats.expiredApks')}</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${vehiclesWithApkExpiringSoon.length}</div>
                  <div class="stat-label">${t('reportsPage.printReport.stats.apkExpiringSoon30')}</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${apkExpiringNext2To3Months.length}</div>
                  <div class="stat-label">${t('reportsPage.printReport.stats.apkExpiring2to3')}</div>
                </div>
              </div>
            </div>

            <h2>${t('reportsPage.printReport.stats.expiredApks')}</h2>
            ${generateAPKTable(vehiclesWithExpiredApk)}

            <h2>${t('reportsPage.printReport.sections.apkExpiringSoonNext30')}</h2>
            ${generateAPKTable(vehiclesWithApkExpiringSoon)}

            <h2>${t('reportsPage.printReport.stats.apkExpiring2to3')}</h2>
            ${generateAPKTable(apkExpiringNext2To3Months)}
          `;
          break;
          
        case 'utilization':
          // Vehicle utilization report
          content = `
            <div class="company-info">
              <h2>${t('reportsPage.printReport.reportGenerated', { date: format(new Date(), 'dd/MM/yyyy HH:mm') })}</h2>
            </div>
            <h1>${t('reportsPage.printReport.reportTitles.utilization')}</h1>
            <div class="report-meta">
              ${t('reportsPage.printReport.dateRangeLabel', { range: dateRangeString })}
            </div>

            <div class="flex-container">
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">
                    ${vehicleUtilizationData.length > 0
                      ? `${Math.round(vehicleUtilizationData.reduce((sum, v) => sum + v.utilizationPercentage, 0) / vehicleUtilizationData.length)}%`
                      : '0%'
                    }
                  </div>
                  <div class="stat-label">
                    ${dateRange.from && dateRange.to && dateRange.from.getFullYear() <= 2000 && dateRange.to.getFullYear() >= 2050
                      ? t('reportsPage.operations.vehicleUtilizationSubtitleYearly', { count: vehicleUtilizationData.filter(v => v.utilizationPercentage > 0).length })
                      : t('reportsPage.operations.vehicleUtilizationSubtitle', { count: vehicleUtilizationData.filter(v => v.utilizationPercentage > 0).length })
                    }
                  </div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${filteredReservations.length}</div>
                  <div class="stat-label">${t('reportsPage.printReport.stats.totalReservations')}</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">
                    ${vehicleUtilizationData.reduce((sum, v) => sum + v.daysReserved, 0)}
                  </div>
                  <div class="stat-label">${t('reportsPage.printReport.stats.totalDaysReserved')}</div>
                </div>
              </div>
            </div>

            <h2>${t('reportsPage.printReport.sections.vehicleUtilizationDetails')}</h2>
            <table>
              <thead>
                <tr>
                  <th>${t('reportsPage.common.vehicle')}</th>
                  <th>${t('reportsPage.common.licensePlate')}</th>
                  <th>${t('reportsPage.vehiclesTab.daysReserved')}</th>
                  <th>${t('reportsPage.common.reservations')}</th>
                  <th>${t('utilizationChart.utilizationPercent')}</th>
                </tr>
              </thead>
              <tbody>
                ${vehicleUtilizationData.sort((a, b) => b.utilizationPercentage - a.utilizationPercentage)
                  .map(vehicle => `
                    <tr>
                      <td>${vehicle.brand} ${vehicle.model}</td>
                      <td>${formatLicensePlate(vehicle.licensePlate)}</td>
                      <td>${vehicle.daysReserved} ${t('common:units.days')}</td>
                      <td>${vehicle.reservationCount}</td>
                      <td>${vehicle.utilizationPercentage}%</td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          `;
          break;
          
        case 'expenses':
          // Expense report
          content = `
            <div class="company-info">
              <h2>${t('reportsPage.printReport.reportGenerated', { date: format(new Date(), 'dd/MM/yyyy HH:mm') })}</h2>
            </div>
            <h1>${t('reportsPage.printReport.reportTitles.expenses')}</h1>
            <div class="report-meta">
              ${t('reportsPage.printReport.dateRangeLabel', { range: dateRangeString })}${selectedCategory !== 'all' ? t('reportsPage.printReport.categorySuffix', { category: selectedCategory }) : ''}
              ${selectedVehicle !== 'all' ? t('reportsPage.printReport.vehicleSuffix', { plate: vehicles.find(v => v.id.toString() === selectedVehicle)?.licensePlate || '' }) : ''}
            </div>

            <div class="flex-container">
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${formatCurrency(Number(totalExpenses))}</div>
                  <div class="stat-label">${t('reportsPage.common.totalExpenses')}</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${filteredExpenses.length}</div>
                  <div class="stat-label">${t('reportsPage.printReport.stats.numberOfExpenses')}</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${formatCurrency(Number(avgExpensePerVehicle))}</div>
                  <div class="stat-label">${t('reportsPage.printReport.stats.averagePerVehicle')}</div>
                </div>
              </div>
            </div>

            <h2>${t('reportsPage.printReport.sections.expenseBreakdown')}</h2>
            <table>
              <thead>
                <tr>
                  <th>${t('reportsPage.common.category')}</th>
                  <th>${t('reportsPage.printReport.stats.numberOfExpenses')}</th>
                  <th>${t('reportsPage.printReport.tableHeaders.totalAmount')}</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(expensesByCategory).length > 0
                  ? Object.entries(expensesByCategory)
                      .sort(([_, a], [__, b]) => b - a)
                      .map(([category, amount]) => `
                        <tr>
                          <td style="text-transform: capitalize;">${category}</td>
                          <td>${filteredExpenses.filter(e => e.category === category).length}</td>
                          <td>${formatCurrency(Number(amount))}</td>
                        </tr>
                      `).join('')
                  : `<tr><td colspan="3" class="text-center">${t('reportsPage.expensesTab.noExpensesFiltered')}</td></tr>`
                }
              </tbody>
            </table>

            <h2>${t('reportsPage.printReport.sections.recentExpensesDetail')}</h2>
            <table>
              <thead>
                <tr>
                  <th>${t('common:fields.date')}</th>
                  <th>${t('reportsPage.common.vehicle')}</th>
                  <th>${t('reportsPage.common.category')}</th>
                  <th>${t('common:fields.description')}</th>
                  <th>${t('common:fields.amount')}</th>
                </tr>
              </thead>
              <tbody>
                ${filteredExpenses.length > 0
                  ? filteredExpenses
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .slice(0, 20)
                      .map(expense => {
                        const vehicle = vehicles.find(v => v.id === expense.vehicleId);
                        return `
                          <tr>
                            <td>${formatDate(expense.date)}</td>
                            <td>${vehicle
                              ? `${vehicle.brand} ${vehicle.model} (${formatLicensePlate(vehicle.licensePlate)})`
                              : t('reportsPage.common.unknownVehicle')}</td>
                            <td style="text-transform: capitalize;">${expense.category}</td>
                            <td>${expense.description}</td>
                            <td>${formatCurrency(Number(expense.amount))}</td>
                          </tr>
                        `;
                      }).join('')
                  : `<tr><td colspan="5" class="text-center">${t('reportsPage.expensesTab.noExpensesFiltered')}</td></tr>`
                }
              </tbody>
            </table>
          `;
          break;
          
        case 'warranty':
          // Warranty expiration report
          const today = new Date();
          const vehiclesWithWarranty = vehicles.filter(v => v.warrantyEndDate);
          
          // Sort vehicles by warranty end date
          const sortedVehiclesByWarranty = [...vehiclesWithWarranty].sort((a, b) => {
            if (!a.warrantyEndDate) return 1;
            if (!b.warrantyEndDate) return -1;
            return new Date(a.warrantyEndDate).getTime() - new Date(b.warrantyEndDate).getTime();
          });
          
          const expiredWarranties = sortedVehiclesByWarranty.filter(v => 
            v.warrantyEndDate && new Date(v.warrantyEndDate) < today
          );
          
          const expiringWarranties = sortedVehiclesByWarranty.filter(v => {
            if (!v.warrantyEndDate) return false;
            const warrantyDate = new Date(v.warrantyEndDate);
            const daysUntil = differenceInDays(warrantyDate, today);
            return daysUntil >= 0 && daysUntil <= 90; // Expiring in the next 90 days
          });
          
          const validWarranties = sortedVehiclesByWarranty.filter(v => {
            if (!v.warrantyEndDate) return false;
            const warrantyDate = new Date(v.warrantyEndDate);
            const daysUntil = differenceInDays(warrantyDate, today);
            return daysUntil > 90;
          });
          
          // Function to generate warranty table
          const generateWarrantyTable = (vehicles: Vehicle[]) => `
            <table>
              <thead>
                <tr>
                  <th>${t('reportsPage.common.vehicle')}</th>
                  <th>${t('reportsPage.common.licensePlate')}</th>
                  <th>${t('reportsPage.vehiclesTab.warrantyEndDate')}</th>
                  <th>${t('reportsPage.printReport.tableHeaders.daysRemaining')}</th>
                </tr>
              </thead>
              <tbody>
                ${vehicles.length > 0
                  ? vehicles.map(v => {
                      const warrantyDate = v.warrantyEndDate ? new Date(v.warrantyEndDate) : null;
                      const daysRemaining = warrantyDate ? differenceInDays(warrantyDate, today) : null;

                      let statusClass = 'status-valid';
                      if (daysRemaining !== null) {
                        if (daysRemaining < 0) {
                          statusClass = 'status-expired';
                        } else if (daysRemaining <= 90) {
                          statusClass = 'status-expiring';
                        }
                      }

                      return `
                        <tr>
                          <td>${v.brand} ${v.model}</td>
                          <td>${formatLicensePlate(v.licensePlate)}</td>
                          <td>${v.warrantyEndDate ? format(new Date(v.warrantyEndDate), 'dd/MM/yyyy') : t('reportsPage.common.notApplicable')}</td>
                          <td class="${statusClass}">${daysRemaining !== null
                            ? daysRemaining < 0
                              ? t('reportsPage.common.expiredAgo', { count: Math.abs(daysRemaining) })
                              : `${daysRemaining} ${t('common:units.days')}`
                            : t('reportsPage.common.notApplicable')}</td>
                        </tr>
                      `;
                    }).join('')
                  : `<tr><td colspan="4" class="text-center">${t('reportsPage.printReport.noVehiclesFound')}</td></tr>`
                }
              </tbody>
            </table>
          `;

          content = `
            <div class="company-info">
              <h2>${t('reportsPage.printReport.reportGenerated', { date: format(new Date(), 'dd/MM/yyyy HH:mm') })}</h2>
            </div>
            <h1>${t('reportsPage.printReport.reportTitles.warranty')}</h1>

            <div class="flex-container">
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${expiredWarranties.length}</div>
                  <div class="stat-label">${t('reportsPage.printReport.stats.expiredWarranties')}</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${expiringWarranties.length}</div>
                  <div class="stat-label">${t('reportsPage.printReport.stats.warrantiesExpiringSoon90')}</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${validWarranties.length}</div>
                  <div class="stat-label">${t('reportsPage.printReport.stats.validWarranties')}</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${vehicles.length - vehiclesWithWarranty.length}</div>
                  <div class="stat-label">${t('reportsPage.printReport.stats.vehiclesWithoutWarrantyDate')}</div>
                </div>
              </div>
            </div>

            <h2>${t('reportsPage.printReport.stats.expiredWarranties')}</h2>
            ${generateWarrantyTable(expiredWarranties)}

            <h2>${t('reportsPage.printReport.sections.warrantiesExpiringSoonNext90')}</h2>
            ${generateWarrantyTable(expiringWarranties)}

            <h2>${t('reportsPage.printReport.stats.validWarranties')}</h2>
            ${generateWarrantyTable(validWarranties)}
          `;
          break;
          
        case 'customer-impact':
          // Customer Impact Report
          content = `
            <div class="company-info">
              <h2>${t('reportsPage.printReport.reportGenerated', { date: format(new Date(), 'dd/MM/yyyy HH:mm') })}</h2>
            </div>
            <h1>${t('reportsPage.printReport.reportTitles.customerImpact')}</h1>
            <div class="report-meta">
              ${t('reportsPage.printReport.dateRangeLabel', { range: dateRangeString })}
            </div>

            <h2>${t('reportsPage.printReport.sections.customerUsageExpenseImpact')}</h2>
            <table>
              <thead>
                <tr>
                  <th>${t('reportsPage.common.customer')}</th>
                  <th>${t('reportsPage.common.reservations')}</th>
                  <th>${t('reportsPage.common.totalDays')}</th>
                  <th>${t('reportsPage.customersTab.vehiclesUsed')}</th>
                  <th>${t('reportsPage.customersTab.relatedExpenses')}</th>
                  <th>${t('reportsPage.customersTab.expensePerDay')}</th>
                </tr>
              </thead>
              <tbody>
                ${customerReservationStats.length > 0
                  ? customerReservationStats.map(customer => `
                      <tr>
                        <td>${customer.name}</td>
                        <td>${customer.reservationCount}</td>
                        <td>${customer.totalReservationDays} ${t('common:units.days')}</td>
                        <td>${customer.vehicleCount}</td>
                        <td>${formatCurrency(Number(customer.totalExpenses))}</td>
                        <td>${formatCurrency(Number(customer.expensePerDay))}</td>
                      </tr>
                    `).join('')
                  : `<tr><td colspan="6" class="text-center">${t('reportsPage.printReport.noCustomerDataFound')}</td></tr>`
                }
              </tbody>
            </table>

            <h2>${t('reportsPage.printReport.sections.customerExpenseBreakdownByCategory')}</h2>
            ${customerReservationStats.length > 0
              ? customerReservationStats.filter(c => c.totalExpenses > 0).map(customer => `
                  <h3>${customer.name}</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>${t('reportsPage.common.category')}</th>
                        <th>${t('common:fields.amount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${Object.entries(customer.expensesByCategory).length > 0
                        ? Object.entries(customer.expensesByCategory)
                            .sort(([_, a], [__, b]) => b - a)
                            .map(([category, amount]) => `
                              <tr>
                                <td style="text-transform: capitalize;">${category}</td>
                                <td>${formatCurrency(Number(amount))}</td>
                              </tr>
                            `).join('')
                        : `<tr><td colspan="2" class="text-center">${t('reportsPage.printReport.noExpensesRecorded')}</td></tr>`
                      }
                    </tbody>
                  </table>
                `).join('')
              : `<p class="text-center">${t('reportsPage.printReport.noCustomerExpenseData')}</p>`
            }
          `;
          break;

        case 'transports': {
          const transportsToPrint = selectedTransportIds.length > 0
            ? filteredTransportsForReport.filter(t => selectedTransportIds.includes(t.id))
            : filteredTransportsForReport;
          const totalToll = sumMoney(transportsToPrint.filter(t => t.tollCost), t => Number(t.tollCost));
          const totalBillable = sumMoney(transportsToPrint.filter(t => t.billable && !t.invoiced), t => Number(t.billableAmount || 0));

          content = `
            <div class="company-info">
              <h2>${t('reportsPage.printReport.reportGenerated', { date: format(new Date(), 'dd/MM/yyyy HH:mm') })}</h2>
            </div>
            <h1>${t('reportsPage.printReport.reportTitles.transports')}</h1>
            <div class="report-meta">
              ${selectedTransportIds.length > 0 ? t('reportsPage.printReport.selectedTransportsCount', { count: transportsToPrint.length }) : t('reportsPage.printReport.transportsCount', { count: transportsToPrint.length })}
            </div>

            <div class="flex-container">
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${formatCurrency(totalToll)}</div>
                  <div class="stat-label">${t('reportsPage.transportsTab.totalTollCost')}</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${formatCurrency(totalBillable)}</div>
                  <div class="stat-label">${t('reportsPage.transportsTab.pendingBilling')}</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${transportsToPrint.length}</div>
                  <div class="stat-label">${t('reportsPage.transportsTab.transportsListed')}</div>
                </div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>${t('reportsPage.common.vehicle')}</th>
                  <th>${t('common:fields.type')}</th>
                  <th>${t('reportsPage.transportsTab.route')}</th>
                  <th>${t('common:fields.date')}</th>
                  <th>${t('reportsPage.transportsTab.distance')}</th>
                  <th>${t('reportsPage.transportsTab.tollCost')}</th>
                  <th>${t('reportsPage.transportsTab.billing')}</th>
                  <th>${t('common:fields.status')}</th>
                </tr>
              </thead>
              <tbody>
                ${transportsToPrint.length > 0 ? transportsToPrint.map(transport => {
                  const vehicle = transport.vehicle || vehicles.find(v => v.id === transport.vehicleId);
                  const vehicleLabel = vehicle ? `${vehicle.brand} ${vehicle.model} (${formatLicensePlate(vehicle.licensePlate)})` : t('reportsPage.common.unknown');
                  const route = [transport.originCity, transport.destinationCity].filter(Boolean).join(' &rarr; ') || '-';
                  const billing = transport.billable
                    ? `${transport.billableAmount ? formatCurrency(Number(transport.billableAmount)) : '-'} (${transport.invoiced ? t('reportsPage.transportsTab.invoiced') : t('reportsPage.transportsTab.notInvoiced')})`
                    : t('reportsPage.transportsTab.notBillable');
                  return `
                    <tr>
                      <td>${vehicleLabel}</td>
                      <td>${TRANSPORT_TYPE_LABELS[transport.transportType] || transport.transportType}</td>
                      <td>${route}</td>
                      <td>${formatDate(transport.scheduledDate)}</td>
                      <td>${transport.distanceKm ? `${Number(transport.distanceKm)} km` : '-'}</td>
                      <td>${transport.tollCost ? formatCurrency(Number(transport.tollCost)) : '-'}</td>
                      <td>${billing}</td>
                      <td style="text-transform: capitalize;">${transport.status.replace(/_/g, ' ')}</td>
                    </tr>
                  `;
                }).join('') : `<tr><td colspan="8" class="text-center">${t('reportsPage.printReport.noTransports')}</td></tr>`}
              </tbody>
            </table>
          `;
          break;
        }

        default:
          content = `<h1>${t('reportsPage.printReport.reportTitles.notAvailable')}</h1>`;
      }
      
      // Add content to document body
      doc.body.innerHTML = content;
      
      // Print the document
      setTimeout(() => {
        printFrame.contentWindow?.print();
        
        // Remove the frame after printing
        setTimeout(() => {
          document.body.removeChild(printFrame);
        }, 1000);
      }, 500);
    };
    
    // Set source to trigger load
    printFrame.src = 'about:blank';
  };

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex flex-col space-y-4 md:space-y-0 md:flex-row md:justify-between md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('reportsPage.header.title')}</h1>
          <p className="text-muted-foreground">
            {t('reportsPage.header.subtitle')}
          </p>
        </div>
        
        {/* Print Buttons - Mobile Optimized */}
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => printReport('apk')} className="h-8">
            <Printer className="mr-1 h-3 w-3" />
            <span className="text-xs">{t('reportsPage.printButtons.apk')}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => printReport('warranty')} className="h-8">
            <Printer className="mr-1 h-3 w-3" />
            <span className="text-xs">{t('reportsPage.printButtons.warranty')}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => printReport('expenses')} className="h-8">
            <Printer className="mr-1 h-3 w-3" />
            <span className="text-xs">{t('reportsPage.printButtons.expenses')}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => printReport('utilization')} className="h-8">
            <Printer className="mr-1 h-3 w-3" />
            <span className="text-xs">{t('reportsPage.printButtons.utilization')}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => printReport('customer-impact')} className="h-8">
            <Printer className="mr-1 h-3 w-3" />
            <span className="text-xs">{t('reportsPage.printButtons.customers')}</span>
          </Button>
          {activeTab !== 'operations' && (
            <Button
              variant="default"
              size="sm"
              className="bg-primary h-8"
              onClick={() => printReport(activeTab)}
            >
              <Printer className="mr-1 h-3 w-3" />
              <span className="text-xs">{t('reportsPage.printButtons.currentTab')}</span>
            </Button>
          )}
        </div>
      </div>
      
      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setReportBuilderOpen(true)}
          data-testid="card-report-builder"
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Database className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>{t('reportBuilderPage.pageTitle')}</CardTitle>
                  <CardDescription>{t('reportsPage.quickNav.reportBuilderDescription')}</CardDescription>
                </div>
              </div>
              <ExternalLink className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
        </Card>
        
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setMaintenanceCostsOpen(true)}
          data-testid="card-maintenance-costs"
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <LineChart className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>{t('maintenanceCostsPage.pageTitle')}</CardTitle>
                  <CardDescription>{t('reportsPage.quickNav.maintenanceCostsDescription')}</CardDescription>
                </div>
              </div>
              <ExternalLink className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
        </Card>
      </div>
      
      {/* Filter Controls */}
      <Card>
        <CardHeader>
          <CardTitle>{t('reportsPage.filters.cardTitle')}</CardTitle>
          <CardDescription>
            {t('reportsPage.filters.cardDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              className="text-xs"
            >
              {t('reportsPage.filters.resetButton')}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('reportsPage.filters.dateRangeLabel')}</label>
              <DatePickerWithRange
                date={dateRange}
                setDate={setDateRange}
              />
              <div className="flex flex-wrap gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDateRangePreset('all-time')}
                  className="text-xs px-2 py-1 h-7"
                >
                  {t('reportsPage.filters.allDataButton')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDateRangePreset('this-month')}
                  className="text-xs px-2 py-1 h-7"
                >
                  {t('reportsPage.filters.thisMonthButton')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDateRangePreset('next-month')}
                  className="text-xs px-2 py-1 h-7"
                >
                  {t('reportsPage.filters.nextMonthButton')}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('reportsPage.common.vehicle')}</label>
              <VehicleSelector
                vehicles={vehicles || []}
                value={selectedVehicle}
                onChange={setSelectedVehicle}
                placeholder={t('reportsPage.filters.allVehiclesPlaceholder')}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('reportsPage.filters.expenseCategoryLabel')}</label>
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('reportsPage.filters.allCategoriesPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('reportsPage.filters.allCategoriesPlaceholder')}</SelectItem>
                  <SelectItem value="maintenance">{t('reportsPage.categories.maintenance')}</SelectItem>
                  <SelectItem value="tires">{t('reportsPage.categories.tires')}</SelectItem>
                  <SelectItem value="front window">{t('reportsPage.categories.frontWindow')}</SelectItem>
                  <SelectItem value="damage">{t('reportsPage.categories.damage')}</SelectItem>
                  <SelectItem value="repair">{t('reportsPage.categories.repair')}</SelectItem>
                  <SelectItem value="other">{t('reportsPage.categories.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="operations">
            <Settings className="h-4 w-4 mr-2" />
            {t('reportsPage.tabs.operations')}
          </TabsTrigger>
          <TabsTrigger value="expenses">
            <DollarSign className="h-4 w-4 mr-2" />
            {t('reportsPage.tabs.expenses')}
          </TabsTrigger>
          <TabsTrigger value="vehicles">
            <Car className="h-4 w-4 mr-2" />
            {t('reportsPage.tabs.vehicles')}
          </TabsTrigger>
          <TabsTrigger value="customers">
            <User className="h-4 w-4 mr-2" />
            {t('reportsPage.tabs.customers')}
          </TabsTrigger>
          <TabsTrigger value="transports" data-testid="tab-report-transports">
            <FileText className="h-4 w-4 mr-2" />
            {t('reportsPage.tabs.transports')}
          </TabsTrigger>
        </TabsList>
        
        {/* Operations Overview Tab */}
        <TabsContent value="operations" className="space-y-6">
          {/* Operations Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t('reportsPage.common.vehicleUtilization')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {vehicleUtilizationData.length > 0
                    ? `${Math.round(vehicleUtilizationData.reduce((sum, v) => sum + v.utilizationPercentage, 0) / vehicleUtilizationData.length)}%`
                    : '0%'
                  }
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {dateRange.from && dateRange.to && dateRange.from.getFullYear() <= 2000 && dateRange.to.getFullYear() >= 2050
                    ? t('reportsPage.operations.vehicleUtilizationSubtitleYearly', { count: vehicleUtilizationData.filter(v => v.utilizationPercentage > 0).length })
                    : t('reportsPage.operations.vehicleUtilizationSubtitle', { count: vehicleUtilizationData.filter(v => v.utilizationPercentage > 0).length })
                  }
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t('reportsPage.common.totalExpenses')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{<Price value={Number(totalExpenses)} />}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('reportsPage.operations.acrossExpenseEntries', { count: filteredExpenses.length })}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t('reportsPage.operations.avgCostPerVehicleCardTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {<Price value={Number(avgExpensePerVehicle)} />}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('reportsPage.operations.forActiveVehicles', { count: activeVehicleCount })}
                </p>
              </CardContent>
            </Card>
          </div>
          
          {/* Activity Overview */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Vehicle Utilization Chart */}
            <Card className="xl:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle>{t('reportsPage.common.vehicleUtilization')}</CardTitle>
                  <CardDescription>
                    {dateRange.from && dateRange.to && dateRange.from.getFullYear() <= 2000 && dateRange.to.getFullYear() >= 2050
                      ? t('reportsPage.operations.top10YearlyDesc')
                      : t('reportsPage.operations.top10PeriodDesc')
                    }
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => printReport('utilization')}
                  className="h-8 gap-1"
                >
                  <Printer className="h-4 w-4" />
                  {t('common:actions.print')}
                </Button>
              </CardHeader>
              <CardContent className="h-80">
                <UtilizationChart data={utilizationChartData} />
              </CardContent>
            </Card>

            {/* Expense by Category Chart */}
            <Card className="xl:col-span-1">
              <CardHeader>
                <CardTitle>{t('reportsPage.operations.expensesByCategoryTitle')}</CardTitle>
                <CardDescription>
                  {t('reportsPage.operations.expensesByCategoryDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ExpenseChart data={expenseChartData} />
              </CardContent>
            </Card>
          </div>
          
          {/* Monthly Expense Trend */}
          <Card>
            <CardHeader>
              <CardTitle>{t('reportsPage.operations.expenseTrendsTitle')}</CardTitle>
              <CardDescription>
                {t('reportsPage.operations.expenseTrendsDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium">{expenseTrend.currentMonth.name}</h4>
                      <p className="text-2xl font-bold">{<Price value={Number(expenseTrend.currentMonth.total)} />}</p>
                    </div>
                    <div className={`text-sm px-2 py-1 rounded-md ${expenseTrend.currentMonth.changePercentage > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                      {expenseTrend.currentMonth.changePercentage > 0 ? '+' : ''}{Math.round(expenseTrend.currentMonth.changePercentage)}%
                    </div>
                  </div>
                  <Progress value={100} className="h-2" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium">{expenseTrend.previousMonth.name}</h4>
                      <p className="text-2xl font-bold">{<Price value={Number(expenseTrend.previousMonth.total)} />}</p>
                    </div>
                    <div className={`text-sm px-2 py-1 rounded-md ${expenseTrend.previousMonth.changePercentage > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                      {expenseTrend.previousMonth.changePercentage > 0 ? '+' : ''}{Math.round(expenseTrend.previousMonth.changePercentage)}%
                    </div>
                  </div>
                  <Progress 
                    value={expenseTrend.currentMonth.total === 0 
                      ? 0 
                      : (expenseTrend.previousMonth.total / expenseTrend.currentMonth.total) * 100} 
                    className="h-2" 
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium">{expenseTrend.twoMonthsAgo.name}</h4>
                      <p className="text-2xl font-bold">{<Price value={Number(expenseTrend.twoMonthsAgo.total)} />}</p>
                    </div>
                  </div>
                  <Progress 
                    value={expenseTrend.currentMonth.total === 0 
                      ? 0 
                      : (expenseTrend.twoMonthsAgo.total / expenseTrend.currentMonth.total) * 100}
                    className="h-2" 
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Expenses Tab */}
        <TabsContent value="expenses" className="space-y-6">
          {/* Expense Summary */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>{t('reportsPage.expensesTab.breakdownTitle')}</CardTitle>
                <CardDescription>
                  {t('reportsPage.expensesTab.breakdownDesc')}
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => printReport('expenses')}
                className="h-8 gap-1"
              >
                <Printer className="h-4 w-4" />
                {t('common:actions.print')}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(expensesByCategory).length > 0 ? (
                  Object.entries(expensesByCategory)
                    .sort(([_, a], [__, b]) => b - a) // Sort by amount descending
                    .map(([category, amount]) => (
                      <div key={category} className="flex justify-between items-center">
                        <div className="flex items-center">
                          <div className="w-3 h-3 rounded-full bg-primary mr-2"></div>
                          <span className="font-medium capitalize">{category}</span>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className="text-muted-foreground text-sm">
                            {t('reportsPage.expensesTab.itemsCount', { count: filteredExpenses.filter(e => e.category === category).length })}
                          </span>
                          <span className="font-medium">{<Price value={Number(amount)} />}</span>
                        </div>
                      </div>
                    ))
                ) : (
                  <p className="text-muted-foreground text-center py-4">{t('reportsPage.expensesTab.noExpensesFiltered')}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Expense List */}
          <Card>
            <CardHeader>
              <CardTitle>{t('reportsPage.expensesTab.recentExpensesTitle')}</CardTitle>
              <CardDescription>
                {t('reportsPage.expensesTab.recentExpensesDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common:fields.date')}</TableHead>
                    <TableHead>{t('reportsPage.common.vehicle')}</TableHead>
                    <TableHead>{t('reportsPage.common.category')}</TableHead>
                    <TableHead>{t('common:fields.description')}</TableHead>
                    <TableHead className="text-right">{t('common:fields.amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.length > 0 ? (
                    filteredExpenses
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .slice(0, 10) // Show most recent 10 expenses
                      .map(expense => {
                        const vehicle = vehicles.find(v => v.id === expense.vehicleId);
                        return (
                          <TableRow key={expense.id}>
                            <TableCell>{formatDate(expense.date)}</TableCell>
                            <TableCell>
                              {vehicle
                                ? `${vehicle.brand} ${vehicle.model} (${formatLicensePlate(vehicle.licensePlate)})`
                                : t('reportsPage.common.unknownVehicle')}
                            </TableCell>
                            <TableCell className="capitalize">{expense.category}</TableCell>
                            <TableCell>{expense.description}</TableCell>
                            <TableCell className="text-right">{<Price value={Number(expense.amount)} />}</TableCell>
                          </TableRow>
                        );
                      })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4">{t('reportsPage.expensesTab.noExpensesFiltered')}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Expense Chart */}
          <Card>
            <CardHeader>
              <CardTitle>{t('reportsPage.expensesTab.visualizationTitle')}</CardTitle>
              <CardDescription>
                {t('reportsPage.expensesTab.visualizationDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-96">
              <ExpenseChart data={expenseChartData} />
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Vehicles Tab */}
        <TabsContent value="vehicles" className="space-y-6">
          {/* Vehicle Utilization Stats */}
          <Card>
            <CardHeader>
              <CardTitle>{t('reportsPage.common.vehicleUtilization')}</CardTitle>
              <CardDescription>
                {t('reportsPage.vehiclesTab.utilizationDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('reportsPage.common.vehicle')}</TableHead>
                    <TableHead>{t('reportsPage.common.licensePlate')}</TableHead>
                    <TableHead>{t('reportsPage.vehiclesTab.daysReserved')}</TableHead>
                    <TableHead>{t('reportsPage.common.reservations')}</TableHead>
                    <TableHead>{t('utilizationChart.utilization')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicleUtilizationData.length > 0 ? (
                    vehicleUtilizationData
                      .slice(0, 10) // Show top 10 vehicles
                      .map(vehicle => (
                        <TableRow key={vehicle.id}>
                          <TableCell>{vehicle.brand} {vehicle.model}</TableCell>
                          <TableCell>{formatLicensePlate(vehicle.licensePlate)}</TableCell>
                          <TableCell>{vehicle.daysReserved} {t('common:units.days')}</TableCell>
                          <TableCell>{vehicle.reservationCount}</TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Progress
                                value={vehicle.utilizationPercentage}
                                className="h-2 w-20"
                              />
                              <span>{vehicle.utilizationPercentage}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4">{t('reportsPage.vehiclesTab.noUtilizationData')}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Vehicle Maintenance Costs */}
          <Card>
            <CardHeader>
              <CardTitle>{t('reportsPage.vehiclesTab.maintenanceCostsTitle')}</CardTitle>
              <CardDescription>
                {t('reportsPage.vehiclesTab.maintenanceCostsDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('reportsPage.common.vehicle')}</TableHead>
                    <TableHead>{t('reportsPage.common.licensePlate')}</TableHead>
                    <TableHead>{t('reportsPage.vehiclesTab.expenseCount')}</TableHead>
                    <TableHead className="text-right">{t('reportsPage.vehiclesTab.totalCost')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {maintenanceCostByVehicle.filter(v => v.maintenanceCost > 0).length > 0 ? (
                    maintenanceCostByVehicle
                      .filter(v => v.maintenanceCost > 0)
                      .slice(0, 10) // Show top 10 vehicles by maintenance cost
                      .map(vehicle => (
                        <TableRow key={vehicle.id}>
                          <TableCell>{vehicle.brand} {vehicle.model}</TableCell>
                          <TableCell>{formatLicensePlate(vehicle.licensePlate)}</TableCell>
                          <TableCell>{t('reportsPage.vehiclesTab.entriesSuffix', { count: vehicle.expenseCount })}</TableCell>
                          <TableCell className="text-right">{<Price value={Number(vehicle.maintenanceCost)} />}</TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4">{t('reportsPage.vehiclesTab.noMaintenanceCostData')}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* APK Inspection Status */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>{t('reportsPage.vehiclesTab.apkOverviewTitle')}</CardTitle>
                <CardDescription>
                  {t('reportsPage.vehiclesTab.apkOverviewDesc')}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-5 w-5 ${apkExpiringVehicles.length > 0 ? 'text-amber-500' : 'text-green-500'}`} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => printReport('apk')}
                  className="h-8 gap-1"
                >
                  <Printer className="h-4 w-4" />
                  {t('common:actions.print')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* APK Status Overview */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex flex-col p-4 rounded-md bg-slate-50">
                    <span className="text-muted-foreground text-sm">{t('reportsPage.vehiclesTab.validApkStat')}</span>
                    <span className="text-2xl font-bold">{vehiclesWithValidApk.length}</span>
                  </div>
                  <div className="flex flex-col p-4 rounded-md bg-yellow-50">
                    <span className="text-muted-foreground text-sm">{t('reportsPage.vehiclesTab.apkExpiring2to3Stat')}</span>
                    <span className="text-2xl font-bold">{vehiclesWithApkExpiring2to3Months.length}</span>
                  </div>
                  <div className="flex flex-col p-4 rounded-md bg-amber-50">
                    <span className="text-muted-foreground text-sm">{t('reportsPage.vehiclesTab.apkExpiring30Stat')}</span>
                    <span className="text-2xl font-bold">{vehiclesWithApkExpiringSoon.length}</span>
                  </div>
                  <div className="flex flex-col p-4 rounded-md bg-red-50">
                    <span className="text-muted-foreground text-sm">{t('reportsPage.vehiclesTab.expiredApkStat')}</span>
                    <span className="text-2xl font-bold">{vehiclesWithExpiredApk.length}</span>
                  </div>
                </div>

                {/* APK Expiry Table */}
                <div className="flex justify-between mb-2">
                  <Input
                    placeholder={t('reportsPage.vehiclesTab.searchByPlateBrandModel')}
                    className="max-w-sm"
                    value={apkSearchQuery || ''}
                    onChange={(e) => setApkSearchQuery(e.target.value)}
                  />
                  <Select
                    value={apkFilterStatus}
                    onValueChange={setApkFilterStatus}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder={t('reportsPage.vehiclesTab.filterByStatusPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('reportsPage.vehiclesTab.allStatuses')}</SelectItem>
                      <SelectItem value="expired">{t('reportsPage.common.expired')}</SelectItem>
                      <SelectItem value="expiring_soon">{t('reportsPage.vehiclesTab.expiringSoon30')}</SelectItem>
                      <SelectItem value="expiring_2to3_months">{t('reportsPage.vehiclesTab.expiring2to3Months')}</SelectItem>
                      <SelectItem value="valid">{t('reportsPage.common.valid')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('reportsPage.common.vehicle')}</TableHead>
                      <TableHead>{t('reportsPage.common.licensePlate')}</TableHead>
                      <TableHead>{t('reportsPage.vehiclesTab.apkExpiry')}</TableHead>
                      <TableHead className="text-right">{t('common:fields.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apkStatusList.length > 0 ? (
                      filteredApkStatusList
                        .slice((apkCurrentPage - 1) * pageSize, apkCurrentPage * pageSize)
                        .map(vehicle => {
                          const daysUntilExpiry = vehicle.daysUntilExpiry;
                          let statusClass = '';
                          let statusText = '';
                          
                          if (daysUntilExpiry === null) {
                            statusClass = 'bg-slate-100 text-slate-800';
                            statusText = t('reportsPage.common.notSet');
                          } else if (daysUntilExpiry < 0) {
                            statusClass = 'bg-red-100 text-red-800';
                            statusText = t('reportsPage.common.expired');
                          } else if (daysUntilExpiry <= 30) {
                            statusClass = 'bg-amber-100 text-amber-800';
                            statusText = t('reportsPage.common.expiresIn', { count: daysUntilExpiry });
                          } else if (daysUntilExpiry <= 90) {
                            statusClass = 'bg-yellow-100 text-yellow-800';
                            statusText = t('reportsPage.common.expiresIn', { count: daysUntilExpiry });
                          } else {
                            statusClass = 'bg-green-100 text-green-800';
                            statusText = t('reportsPage.common.valid');
                          }
                          
                          return (
                            <TableRow key={vehicle.id} className={
                              daysUntilExpiry === null ? 'bg-slate-50' : 
                              daysUntilExpiry < 0 ? 'bg-red-50' : 
                              daysUntilExpiry <= 30 ? 'bg-amber-50' : 
                              daysUntilExpiry <= 90 ? 'bg-yellow-50' : ''
                            }>
                              <TableCell>{vehicle.brand} {vehicle.model}</TableCell>
                              <TableCell>{formatLicensePlate(vehicle.licensePlate)}</TableCell>
                              <TableCell>{vehicle.apkDate ? formatDate(vehicle.apkDate) : t('reportsPage.common.notSet')}</TableCell>
                              <TableCell className="text-right">
                                <span className={`px-2 py-1 rounded-full text-xs ${statusClass}`}>
                                  {statusText}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4">{t('reportsPage.vehiclesTab.noApkData')}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                
                {filteredApkStatusList.length > 0 && (
                  <Pagination
                    currentPage={apkCurrentPage}
                    totalPages={Math.ceil(filteredApkStatusList.length / pageSize)}
                    onPageChange={setApkCurrentPage}
                  />
                )}
              </div>
            </CardContent>
          </Card>
          
          {/* Warranty Status */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>{t('reportsPage.vehiclesTab.warrantyOverviewTitle')}</CardTitle>
                <CardDescription>
                  {t('reportsPage.vehiclesTab.warrantyOverviewDesc')}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-5 w-5 ${vehicles.filter(v => v.warrantyEndDate && differenceInDays(new Date(v.warrantyEndDate), today) >= 0 && differenceInDays(new Date(v.warrantyEndDate), today) <= 90).length > 0 ? 'text-amber-500' : 'text-green-500'}`} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => printReport('warranty')}
                  className="h-8 gap-1"
                >
                  <Printer className="h-4 w-4" />
                  {t('common:actions.print')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Warranty Status Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(() => {
                    // Process warranty data
                    const vehiclesWithWarranty = vehicles.filter(v => v.warrantyEndDate);
                    
                    // Sort vehicles by warranty end date
                    const sortedVehiclesByWarranty = [...vehiclesWithWarranty].sort((a, b) => {
                      if (!a.warrantyEndDate) return 1;
                      if (!b.warrantyEndDate) return -1;
                      return new Date(a.warrantyEndDate).getTime() - new Date(b.warrantyEndDate).getTime();
                    });
                    
                    const expiredWarranties = sortedVehiclesByWarranty.filter(v => 
                      v.warrantyEndDate && new Date(v.warrantyEndDate) < today
                    );
                    
                    const expiringWarranties = sortedVehiclesByWarranty.filter(v => {
                      if (!v.warrantyEndDate) return false;
                      const warrantyDate = new Date(v.warrantyEndDate);
                      const daysUntil = differenceInDays(warrantyDate, today);
                      return daysUntil >= 0 && daysUntil <= 90; // Expiring in the next 90 days
                    });
                    
                    const validWarranties = sortedVehiclesByWarranty.filter(v => {
                      if (!v.warrantyEndDate) return false;
                      const warrantyDate = new Date(v.warrantyEndDate);
                      const daysUntil = differenceInDays(warrantyDate, today);
                      return daysUntil > 90;
                    });

                    return (
                      <>
                        <div className="flex flex-col p-4 rounded-md bg-slate-50">
                          <span className="text-muted-foreground text-sm">{t('reportsPage.vehiclesTab.validWarrantyStat')}</span>
                          <span className="text-2xl font-bold">{validWarranties.length}</span>
                        </div>
                        <div className="flex flex-col p-4 rounded-md bg-amber-50">
                          <span className="text-muted-foreground text-sm">{t('reportsPage.vehiclesTab.warrantyExpiring90Stat')}</span>
                          <span className="text-2xl font-bold">{expiringWarranties.length}</span>
                        </div>
                        <div className="flex flex-col p-4 rounded-md bg-red-50">
                          <span className="text-muted-foreground text-sm">{t('reportsPage.vehiclesTab.expiredWarrantyStat')}</span>
                          <span className="text-2xl font-bold">{expiredWarranties.length}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
                
                {/* Warranty Expiry Table */}
                <div className="flex justify-between mb-2">
                  <Input
                    placeholder={t('reportsPage.vehiclesTab.searchByPlateBrandModel')}
                    className="max-w-sm"
                    value={warrantySearchQuery || ''}
                    onChange={(e) => setWarrantySearchQuery(e.target.value)}
                  />
                  <Select
                    value={warrantyFilterStatus}
                    onValueChange={setWarrantyFilterStatus}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder={t('reportsPage.vehiclesTab.filterByStatusPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('reportsPage.vehiclesTab.allStatuses')}</SelectItem>
                      <SelectItem value="expired">{t('reportsPage.common.expired')}</SelectItem>
                      <SelectItem value="expiring_soon">{t('reportsPage.vehiclesTab.expiringSoon')}</SelectItem>
                      <SelectItem value="valid">{t('reportsPage.common.valid')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('reportsPage.common.vehicle')}</TableHead>
                      <TableHead>{t('reportsPage.common.licensePlate')}</TableHead>
                      <TableHead>{t('reportsPage.vehiclesTab.warrantyEndDate')}</TableHead>
                      <TableHead className="text-right">{t('common:fields.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicles.filter(v => v.warrantyEndDate).length > 0 ? (
                      filteredWarrantyList
                        .slice((warrantyCurrentPage - 1) * pageSize, warrantyCurrentPage * pageSize)
                        .map(vehicle => {
                          const warrantyDate = vehicle.warrantyEndDate ? new Date(vehicle.warrantyEndDate) : null;
                          const daysRemaining = warrantyDate ? differenceInDays(warrantyDate, today) : null;
                          
                          let statusClass = '';
                          let statusText = '';
                          
                          if (daysRemaining === null) {
                            statusClass = 'bg-slate-100 text-slate-800';
                            statusText = t('reportsPage.common.notSet');
                          } else if (daysRemaining < 0) {
                            statusClass = 'bg-red-100 text-red-800';
                            statusText = t('reportsPage.common.expiredAgo', { count: Math.abs(daysRemaining) });
                          } else if (daysRemaining <= 90) {
                            statusClass = 'bg-amber-100 text-amber-800';
                            statusText = t('reportsPage.common.expiresIn', { count: daysRemaining });
                          } else {
                            statusClass = 'bg-green-100 text-green-800';
                            statusText = t('reportsPage.common.valid');
                          }
                          
                          return (
                            <TableRow key={vehicle.id} className={
                              daysRemaining === null ? 'bg-slate-50' : 
                              daysRemaining < 0 ? 'bg-red-50' : 
                              daysRemaining < 90 ? 'bg-amber-50' : ''
                            }>
                              <TableCell>{vehicle.brand} {vehicle.model}</TableCell>
                              <TableCell>{formatLicensePlate(vehicle.licensePlate)}</TableCell>
                              <TableCell>{vehicle.warrantyEndDate ? formatDate(vehicle.warrantyEndDate) : t('reportsPage.common.notSet')}</TableCell>
                              <TableCell className="text-right">
                                <span className={`px-2 py-1 rounded-full text-xs ${statusClass}`}>
                                  {statusText}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4">{t('reportsPage.vehiclesTab.noWarrantyData')}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                {filteredWarrantyList.length > 0 && (
                  <Pagination
                    currentPage={warrantyCurrentPage}
                    totalPages={Math.ceil(filteredWarrantyList.length / pageSize)}
                    onPageChange={setWarrantyCurrentPage}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Vehicle Utilization Chart */}
          <Card>
            <CardHeader>
              <CardTitle>{t('reportsPage.vehiclesTab.utilizationVisualizationTitle')}</CardTitle>
              <CardDescription>
                {t('reportsPage.vehiclesTab.utilizationVisualizationDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-96">
              <UtilizationChart data={utilizationChartData} />
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Customers Tab */}
        <TabsContent value="customers" className="space-y-6">
          {/* Customer Impact Analysis */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>{t('reportsPage.customersTab.impactTitle')}</CardTitle>
                <CardDescription>
                  {t('reportsPage.customersTab.impactDesc')}
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => printReport('customer-impact')}
                className="h-8 gap-1"
              >
                <Printer className="h-4 w-4" />
                {t('common:actions.print')}
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('reportsPage.common.customer')}</TableHead>
                    <TableHead>{t('reportsPage.common.reservations')}</TableHead>
                    <TableHead>{t('reportsPage.common.totalDays')}</TableHead>
                    <TableHead>{t('reportsPage.customersTab.totalVehicles')}</TableHead>
                    <TableHead>{t('reportsPage.customersTab.relatedExpenses')}</TableHead>
                    <TableHead className="text-right">{t('reportsPage.customersTab.costPerDay')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerReservationStats.filter(c => c.reservationCount > 0).length > 0 ? (
                    customerReservationStats
                      .filter(c => c.reservationCount > 0)
                      .slice(0, 10)
                      .map(customer => (
                        <TableRow key={customer.id} className={customer.expensePerDay > 10 ? "bg-red-50" : ""}>
                          <TableCell>{customer.name}</TableCell>
                          <TableCell>{customer.reservationCount}</TableCell>
                          <TableCell>{customer.totalReservationDays} {t('common:units.days')}</TableCell>
                          <TableCell>{customer.vehicleCount}</TableCell>
                          <TableCell>{<Price value={Number(customer.totalExpenses)} />}</TableCell>
                          <TableCell className="text-right font-medium">
                            {<Price value={Number(customer.expensePerDay)} />}
                            {customer.expensePerDay > 0 && (
                              <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                                customer.expensePerDay > (avgExpensePerVehicle / 30) * 2
                                  ? "bg-red-100 text-red-800"
                                  : customer.expensePerDay > (avgExpensePerVehicle / 30)
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-green-100 text-green-800"
                              }`}>
                                {customer.expensePerDay > (avgExpensePerVehicle / 30) * 2
                                  ? t('reportsPage.customersTab.impactHigh')
                                  : customer.expensePerDay > (avgExpensePerVehicle / 30)
                                  ? t('reportsPage.customersTab.impactMedium')
                                  : t('reportsPage.customersTab.impactLow')}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-4">{t('reportsPage.customersTab.noCustomerAnalysisData')}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Customer Expense Impact Detail */}
          <Card>
            <CardHeader>
              <CardTitle>{t('reportsPage.customersTab.expenseCategoriesTitle')}</CardTitle>
              <CardDescription>
                {t('reportsPage.customersTab.expenseCategoriesDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('reportsPage.common.customer')}</TableHead>
                    <TableHead>{t('reportsPage.categories.tires')}</TableHead>
                    <TableHead>{t('reportsPage.categories.maintenance')}</TableHead>
                    <TableHead>{t('reportsPage.categories.damage')}</TableHead>
                    <TableHead>{t('reportsPage.categories.repair')}</TableHead>
                    <TableHead>{t('reportsPage.categories.other')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerReservationStats.filter(c => c.totalExpenses > 0).length > 0 ? (
                    customerReservationStats
                      .filter(c => c.totalExpenses > 0)
                      .slice(0, 10)
                      .map(customer => {
                        // Get amounts for each category or default to 0
                        const tires = customer.expensesByCategory['tires'] || 0;
                        const maintenance = customer.expensesByCategory['maintenance'] || 0;
                        const damage = customer.expensesByCategory['damage'] || 0;
                        const repair = customer.expensesByCategory['repair'] || 0;
                        const other = customer.expensesByCategory['other'] || 0;
                        
                        // Determine which category has the highest expense
                        const categories = [
                          { name: 'tires', amount: tires },
                          { name: 'maintenance', amount: maintenance },
                          { name: 'damage', amount: damage },
                          { name: 'repair', amount: repair },
                          { name: 'other', amount: other }
                        ];
                        
                        const highestCategory = categories.reduce((prev, current) => 
                          (current.amount > prev.amount) ? current : prev, { name: '', amount: 0 });
                        
                        return (
                          <TableRow key={customer.id}>
                            <TableCell>{customer.name}</TableCell>
                            <TableCell className={highestCategory.name === 'tires' ? "font-bold" : ""}>
                              {tires > 0 ? formatCurrency(Number(tires)) : "—"}
                            </TableCell>
                            <TableCell className={highestCategory.name === 'maintenance' ? "font-bold" : ""}>
                              {maintenance > 0 ? formatCurrency(Number(maintenance)) : "—"}
                            </TableCell>
                            <TableCell className={highestCategory.name === 'damage' ? "font-bold" : ""}>
                              {damage > 0 ? formatCurrency(Number(damage)) : "—"}
                            </TableCell>
                            <TableCell className={highestCategory.name === 'repair' ? "font-bold" : ""}>
                              {repair > 0 ? formatCurrency(Number(repair)) : "—"}
                            </TableCell>
                            <TableCell className={highestCategory.name === 'other' ? "font-bold" : ""}>
                              {other > 0 ? formatCurrency(Number(other)) : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-4">{t('reportsPage.customersTab.noExpenseData')}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Customer Reservation List */}
          <Card>
            <CardHeader>
              <CardTitle>{t('reportsPage.customersTab.recentReservationsTitle')}</CardTitle>
              <CardDescription>
                {t('reportsPage.customersTab.recentReservationsDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('reportsPage.common.customer')}</TableHead>
                    <TableHead>{t('reportsPage.common.vehicle')}</TableHead>
                    <TableHead>{t('common:fields.startDate')}</TableHead>
                    <TableHead>{t('common:fields.endDate')}</TableHead>
                    <TableHead>{t('common:fields.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReservations.length > 0 ? (
                    filteredReservations
                      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
                      .slice(0, 10)
                      .map(reservation => {
                        const vehicle = vehicles.find(v => v.id === reservation.vehicleId);
                        const customer = customers.find(c => c.id === reservation.customerId);
                        
                        return (
                          <TableRow key={reservation.id}>
                            <TableCell>{customer?.name || t('reportsPage.common.unknown')}</TableCell>
                            <TableCell>
                              {vehicle
                                ? `${vehicle.brand} ${vehicle.model} (${formatLicensePlate(vehicle.licensePlate)})`
                                : t('reportsPage.common.unknownVehicle')}
                            </TableCell>
                            <TableCell>{formatDate(reservation.startDate)}</TableCell>
                            <TableCell>{reservation.endDate ? formatDate(reservation.endDate) : t('reportsPage.customersTab.openEnded')}</TableCell>
                            <TableCell className="capitalize">
                              {reservation.status?.replace(/_/g, ' ')}
                            </TableCell>
                          </TableRow>
                        );
                      })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4">{t('reportsPage.customersTab.noReservationData')}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vehicle Transports Tab */}
        <TabsContent value="transports" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{t('reportsPage.transportsTab.totalTollCost')}</p>
                    <p className="text-2xl font-bold">{<Price value={sumMoney(filteredTransportsForReport.filter(t => t.tollCost), t => Number(t.tollCost))} />}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{t('reportsPage.transportsTab.pendingBilling')}</p>
                    <p className="text-2xl font-bold">{<Price value={sumMoney(filteredTransportsForReport.filter(t => t.billable && !t.invoiced), t => Number(t.billableAmount || 0))} />}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{t('reportsPage.transportsTab.transportsListed')}</p>
                    <p className="text-2xl font-bold">{filteredTransportsForReport.length}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                    <Car className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle>{t('reportsPage.transportsTab.cardTitle')}</CardTitle>
                  <CardDescription>{t('reportsPage.transportsTab.cardDesc')}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={transportTypeFilter} onValueChange={setTransportTypeFilter}>
                    <SelectTrigger className="w-[150px]" data-testid="select-report-transport-type">
                      <SelectValue placeholder={t('reportsPage.transportsTab.allTypesPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('reportsPage.transportsTab.allTypesOption')}</SelectItem>
                      {Object.entries(TRANSPORT_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={transportStatusFilter} onValueChange={setTransportStatusFilter}>
                    <SelectTrigger className="w-[150px]" data-testid="select-report-transport-status">
                      <SelectValue placeholder={t('reportsPage.transportsTab.allStatusesPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('reportsPage.vehiclesTab.allStatuses')}</SelectItem>
                      <SelectItem value="scheduled">{t('reportsPage.transportsTab.scheduled')}</SelectItem>
                      <SelectItem value="in_progress">{t('reportsPage.transportsTab.inProgress')}</SelectItem>
                      <SelectItem value="completed">{t('common:status.completed')}</SelectItem>
                      <SelectItem value="cancelled">{t('common:status.cancelled')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={() => printReport('transports')}
                    disabled={filteredTransportsForReport.length === 0}
                    data-testid="button-print-transports-report"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    {t('common:actions.print')} {selectedTransportIds.length > 0 ? t('reportsPage.transportsTab.printSelected', { count: selectedTransportIds.length }) : t('reportsPage.transportsTab.printAll')}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={filteredTransportsForReport.length > 0 && selectedTransportIds.length === filteredTransportsForReport.length}
                        onCheckedChange={(checked) => {
                          setSelectedTransportIds(checked ? filteredTransportsForReport.map(t => t.id) : []);
                        }}
                        data-testid="checkbox-select-all-transports-report"
                      />
                    </TableHead>
                    <TableHead>{t('reportsPage.common.vehicle')}</TableHead>
                    <TableHead>{t('common:fields.type')}</TableHead>
                    <TableHead>{t('reportsPage.transportsTab.route')}</TableHead>
                    <TableHead>{t('common:fields.date')}</TableHead>
                    <TableHead>{t('reportsPage.transportsTab.tollCost')}</TableHead>
                    <TableHead>{t('reportsPage.transportsTab.billing')}</TableHead>
                    <TableHead>{t('common:fields.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransportsForReport.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4">{t('reportsPage.transportsTab.noTransportsFound')}</TableCell>
                    </TableRow>
                  ) : (
                    filteredTransportsForReport.map((transport) => {
                      const vehicle = transport.vehicle || vehicles.find(v => v.id === transport.vehicleId);
                      const route = [transport.originCity, transport.destinationCity].filter(Boolean).join(' → ') || '-';
                      return (
                        <TableRow key={transport.id} data-testid={`report-transport-row-${transport.id}`}>
                          <TableCell>
                            <Checkbox
                              checked={selectedTransportIds.includes(transport.id)}
                              onCheckedChange={(checked) => {
                                setSelectedTransportIds(prev =>
                                  checked ? [...prev, transport.id] : prev.filter(id => id !== transport.id)
                                );
                              }}
                              data-testid={`checkbox-select-transport-report-${transport.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {vehicle ? `${vehicle.brand} ${vehicle.model} (${formatLicensePlate(vehicle.licensePlate)})` : t('reportsPage.common.unknown')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{TRANSPORT_TYPE_LABELS[transport.transportType] || transport.transportType}</Badge>
                          </TableCell>
                          <TableCell>{route}</TableCell>
                          <TableCell>{formatDate(transport.scheduledDate)}</TableCell>
                          <TableCell>{transport.tollCost ? formatCurrency(Number(transport.tollCost)) : '-'}</TableCell>
                          <TableCell>
                            {transport.billable
                              ? `${transport.billableAmount ? formatCurrency(Number(transport.billableAmount)) : '-'} (${transport.invoiced ? t('reportsPage.transportsTab.invoiced') : t('reportsPage.transportsTab.notInvoiced')})`
                              : t('reportsPage.transportsTab.notBillable')}
                          </TableCell>
                          <TableCell className="capitalize">{transport.status.replace(/_/g, ' ')}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Report Builder Dialog */}
      <Dialog open={reportBuilderOpen} onOpenChange={setReportBuilderOpen}>
        <DialogContent className="max-w-[95vw] w-full h-[95vh] max-h-[95vh] p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl">{t('reportBuilderPage.pageTitle')}</DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setReportBuilderOpen(false)}
                data-testid="button-close-report-builder"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="overflow-auto h-full">
            <ReportBuilderPage />
          </div>
        </DialogContent>
      </Dialog>

      {/* Maintenance Costs Dialog */}
      <Dialog open={maintenanceCostsOpen} onOpenChange={setMaintenanceCostsOpen}>
        <DialogContent className="max-w-[95vw] w-full h-[95vh] max-h-[95vh] p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl">{t('maintenanceCostsPage.pageTitle')}</DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMaintenanceCostsOpen(false)}
                data-testid="button-close-maintenance-costs"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="overflow-auto h-full">
            <MaintenanceCostsPage />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
