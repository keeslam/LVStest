import { useState } from "react";
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
import { ExpenseChart, type ExpenseChartData } from "@/components/reports/expense-chart";
import { UtilizationChart, type UtilizationChartData } from "@/components/reports/utilization-chart";
import { Vehicle, Expense, Reservation, Customer } from "@shared/schema";
import { formatDate, formatCurrency, formatLicensePlate, sumMoney } from "@/lib/format-utils";
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
    
    const matchesVehicle = selectedVehicle === "all" || reservation.vehicleId.toString() === selectedVehicle;
    
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
      const endDate = new Date(reservation.endDate);
      const days = differenceInDays(endDate, startDate) + 1;
      totalReservationDays += days;
    });
    
    // Get all the vehicles this customer has used
    const customerVehicleIds = Array.from(new Set(customerReservations.map(r => r.vehicleId)));
    
    // Find expenses that occurred during or shortly after this customer's reservations
    // (using a 7-day window after reservation ends)
    const relatedExpenses: Expense[] = [];
    customerReservations.forEach(reservation => {
      const reservationEndDate = new Date(reservation.endDate);
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
          <th>Vehicle</th>
          <th>License Plate</th>
          <th>APK Expiry Date</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${vehicles.length > 0 
          ? vehicles.map(v => {
              const daysUntilExpiry = v.daysUntilExpiry;
              
              let statusClass = 'status-valid';
              let statusText = 'Valid';
              
              if (daysUntilExpiry === null) {
                statusClass = 'status-unknown';
                statusText = 'Not set';
              } else if (daysUntilExpiry < 0) {
                statusClass = 'status-expired';
                statusText = `Expired (${Math.abs(daysUntilExpiry)} days ago)`;
              } else if (daysUntilExpiry <= 30) {
                statusClass = 'status-expiring';
                statusText = `Expires in ${daysUntilExpiry} days`;
              } else if (daysUntilExpiry <= 90) {
                statusClass = 'status-expiring';
                statusText = `Expires in ${daysUntilExpiry} days`;
              }
              
              return `
                <tr>
                  <td>${v.brand} ${v.model}</td>
                  <td>${formatLicensePlate(v.licensePlate)}</td>
                  <td>${v.apkDate ? formatDate(v.apkDate) : 'Not set'}</td>
                  <td class="${statusClass}">${statusText}</td>
                </tr>
              `;
            }).join('')
          : '<tr><td colspan="4" class="text-center">No vehicles found</td></tr>'
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
      
      // Add base styles
      doc.head.innerHTML = `
        <title>Print Report: ${reportType}</title>
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
        ? `${format(dateRange.from, 'dd/MM/yyyy')} to ${format(dateRange.to, 'dd/MM/yyyy')}`
        : 'All Data';
        
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
              <h2>Report Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}</h2>
            </div>
            <h1>APK Expiration Report</h1>
            <div class="report-meta">
              Date range: ${dateRangeString}
            </div>
            
            <div class="flex-container">
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${vehiclesWithExpiredApk.length}</div>
                  <div class="stat-label">Expired APKs</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${vehiclesWithApkExpiringSoon.length}</div>
                  <div class="stat-label">APKs Expiring Soon (30 days)</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${apkExpiringNext2To3Months.length}</div>
                  <div class="stat-label">APKs Expiring in 2-3 Months</div>
                </div>
              </div>
            </div>
            
            <h2>Expired APKs</h2>
            ${generateAPKTable(vehiclesWithExpiredApk)}
            
            <h2>APKs Expiring Soon (Next 30 Days)</h2>
            ${generateAPKTable(vehiclesWithApkExpiringSoon)}
            
            <h2>APKs Expiring in 2-3 Months</h2>
            ${generateAPKTable(apkExpiringNext2To3Months)}
          `;
          break;
          
        case 'utilization':
          // Vehicle utilization report
          content = `
            <div class="company-info">
              <h2>Report Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}</h2>
            </div>
            <h1>Vehicle Utilization Report</h1>
            <div class="report-meta">
              Date range: ${dateRangeString}
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
                      ? `Based on yearly utilization of ${vehicleUtilizationData.filter(v => v.utilizationPercentage > 0).length} vehicles`
                      : `Average across ${vehicleUtilizationData.filter(v => v.utilizationPercentage > 0).length} ${vehicleUtilizationData.filter(v => v.utilizationPercentage > 0).length === 1 ? 'vehicle' : 'vehicles'} with rentals`
                    }
                  </div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${filteredReservations.length}</div>
                  <div class="stat-label">Total Reservations</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">
                    ${vehicleUtilizationData.reduce((sum, v) => sum + v.daysReserved, 0)}
                  </div>
                  <div class="stat-label">Total Days Reserved</div>
                </div>
              </div>
            </div>
            
            <h2>Vehicle Utilization Details</h2>
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>License Plate</th>
                  <th>Days Reserved</th>
                  <th>Reservations</th>
                  <th>Utilization %</th>
                </tr>
              </thead>
              <tbody>
                ${vehicleUtilizationData.sort((a, b) => b.utilizationPercentage - a.utilizationPercentage)
                  .map(vehicle => `
                    <tr>
                      <td>${vehicle.brand} ${vehicle.model}</td>
                      <td>${formatLicensePlate(vehicle.licensePlate)}</td>
                      <td>${vehicle.daysReserved} days</td>
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
              <h2>Report Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}</h2>
            </div>
            <h1>Expense Report</h1>
            <div class="report-meta">
              Date range: ${dateRangeString}${selectedCategory !== 'all' ? ` | Category: ${selectedCategory}` : ''}
              ${selectedVehicle !== 'all' ? ` | Vehicle: ${vehicles.find(v => v.id.toString() === selectedVehicle)?.licensePlate || ''}` : ''}
            </div>
            
            <div class="flex-container">
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${formatCurrency(Number(totalExpenses))}</div>
                  <div class="stat-label">Total Expenses</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${filteredExpenses.length}</div>
                  <div class="stat-label">Number of Expenses</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${formatCurrency(Number(avgExpensePerVehicle))}</div>
                  <div class="stat-label">Average per Vehicle</div>
                </div>
              </div>
            </div>
            
            <h2>Expense Breakdown</h2>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Number of Expenses</th>
                  <th>Total Amount</th>
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
                  : '<tr><td colspan="3" class="text-center">No expenses found for the selected filters</td></tr>'
                }
              </tbody>
            </table>
            
            <h2>Recent Expenses Detail</h2>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vehicle</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Amount</th>
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
                              : 'Unknown Vehicle'}</td>
                            <td style="text-transform: capitalize;">${expense.category}</td>
                            <td>${expense.description}</td>
                            <td>${formatCurrency(Number(expense.amount))}</td>
                          </tr>
                        `;
                      }).join('')
                  : '<tr><td colspan="5" class="text-center">No expenses found for the selected filters</td></tr>'
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
                  <th>Vehicle</th>
                  <th>License Plate</th>
                  <th>Warranty End Date</th>
                  <th>Days Remaining</th>
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
                          <td>${v.warrantyEndDate ? format(new Date(v.warrantyEndDate), 'dd/MM/yyyy') : 'N/A'}</td>
                          <td class="${statusClass}">${daysRemaining !== null 
                            ? daysRemaining < 0 
                              ? `Expired (${Math.abs(daysRemaining)} days ago)` 
                              : `${daysRemaining} days` 
                            : 'N/A'}</td>
                        </tr>
                      `;
                    }).join('')
                  : '<tr><td colspan="4" class="text-center">No vehicles found</td></tr>'
                }
              </tbody>
            </table>
          `;
          
          content = `
            <div class="company-info">
              <h2>Report Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}</h2>
            </div>
            <h1>Warranty Expiration Report</h1>
            
            <div class="flex-container">
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${expiredWarranties.length}</div>
                  <div class="stat-label">Expired Warranties</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${expiringWarranties.length}</div>
                  <div class="stat-label">Warranties Expiring Soon (90 days)</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${validWarranties.length}</div>
                  <div class="stat-label">Valid Warranties</div>
                </div>
              </div>
              <div class="flex-item">
                <div class="stat-card">
                  <div class="stat-value">${vehicles.length - vehiclesWithWarranty.length}</div>
                  <div class="stat-label">Vehicles without Warranty Date</div>
                </div>
              </div>
            </div>
            
            <h2>Expired Warranties</h2>
            ${generateWarrantyTable(expiredWarranties)}
            
            <h2>Warranties Expiring Soon (Next 90 Days)</h2>
            ${generateWarrantyTable(expiringWarranties)}
            
            <h2>Valid Warranties</h2>
            ${generateWarrantyTable(validWarranties)}
          `;
          break;
          
        case 'customer-impact':
          // Customer Impact Report
          content = `
            <div class="company-info">
              <h2>Report Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}</h2>
            </div>
            <h1>Customer Impact Analysis Report</h1>
            <div class="report-meta">
              Date range: ${dateRangeString}
            </div>
            
            <h2>Customer Usage and Expense Impact</h2>
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Reservations</th>
                  <th>Total Days</th>
                  <th>Vehicles Used</th>
                  <th>Related Expenses</th>
                  <th>Expense Per Day</th>
                </tr>
              </thead>
              <tbody>
                ${customerReservationStats.length > 0 
                  ? customerReservationStats.map(customer => `
                      <tr>
                        <td>${customer.name}</td>
                        <td>${customer.reservationCount}</td>
                        <td>${customer.totalReservationDays} days</td>
                        <td>${customer.vehicleCount}</td>
                        <td>${formatCurrency(Number(customer.totalExpenses))}</td>
                        <td>${formatCurrency(Number(customer.expensePerDay))}</td>
                      </tr>
                    `).join('')
                  : '<tr><td colspan="6" class="text-center">No customer data found for the selected filters</td></tr>'
                }
              </tbody>
            </table>
            
            <h2>Customer Expense Breakdown by Category</h2>
            ${customerReservationStats.length > 0 
              ? customerReservationStats.filter(c => c.totalExpenses > 0).map(customer => `
                  <h3>${customer.name}</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Amount</th>
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
                        : '<tr><td colspan="2" class="text-center">No expenses recorded</td></tr>'
                      }
                    </tbody>
                  </table>
                `).join('')
              : '<p class="text-center">No customer expense data available</p>'
            }
          `;
          break;
          
        default:
          content = '<h1>Report content not available</h1>';
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
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">
            Generate and analyze reports for your car rental business
          </p>
        </div>
        
        {/* Print Buttons - Mobile Optimized */}
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => printReport('apk')} className="h-8">
            <Printer className="mr-1 h-3 w-3" />
            <span className="text-xs">APK</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => printReport('warranty')} className="h-8">
            <Printer className="mr-1 h-3 w-3" />
            <span className="text-xs">Warranty</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => printReport('expenses')} className="h-8">
            <Printer className="mr-1 h-3 w-3" />
            <span className="text-xs">Expenses</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => printReport('utilization')} className="h-8">
            <Printer className="mr-1 h-3 w-3" />
            <span className="text-xs">Utilization</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => printReport('customer-impact')} className="h-8">
            <Printer className="mr-1 h-3 w-3" />
            <span className="text-xs">Customers</span>
          </Button>
          {activeTab !== 'operations' && (
            <Button 
              variant="default"
              size="sm"
              className="bg-primary h-8" 
              onClick={() => printReport(activeTab)}
            >
              <Printer className="mr-1 h-3 w-3" />
              <span className="text-xs">Current Tab</span>
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
                  <CardTitle>Custom Report Builder</CardTitle>
                  <CardDescription>Build custom reports with filters and aggregations</CardDescription>
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
                  <CardTitle>Maintenance Cost Analysis</CardTitle>
                  <CardDescription>Analyze vehicle maintenance costs and trends</CardDescription>
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
          <CardTitle>Report Filters</CardTitle>
          <CardDescription>
            Adjust the filters to customize your report view
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
              Reset Filters
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
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
                  All Data (Past & Future)
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setDateRangePreset('this-month')}
                  className="text-xs px-2 py-1 h-7"
                >
                  This Month
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setDateRangePreset('next-month')}
                  className="text-xs px-2 py-1 h-7"
                >
                  Next Month
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Vehicle</label>
              <VehicleSelector
                vehicles={vehicles || []}
                value={selectedVehicle}
                onChange={setSelectedVehicle}
                placeholder="All Vehicles"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Expense Category</label>
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="tires">Tires</SelectItem>
                  <SelectItem value="front window">Front Window</SelectItem>
                  <SelectItem value="damage">Damage</SelectItem>
                  <SelectItem value="repair">Repair</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="operations">
            <Settings className="h-4 w-4 mr-2" />
            Operations
          </TabsTrigger>
          <TabsTrigger value="expenses">
            <DollarSign className="h-4 w-4 mr-2" />
            Expenses
          </TabsTrigger>
          <TabsTrigger value="vehicles">
            <Car className="h-4 w-4 mr-2" />
            Vehicles
          </TabsTrigger>
          <TabsTrigger value="customers">
            <User className="h-4 w-4 mr-2" />
            Customers
          </TabsTrigger>
        </TabsList>
        
        {/* Operations Overview Tab */}
        <TabsContent value="operations" className="space-y-6">
          {/* Operations Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Vehicle Utilization</CardTitle>
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
                    ? `Based on yearly utilization of ${vehicleUtilizationData.filter(v => v.utilizationPercentage > 0).length} vehicles`
                    : `Average across ${vehicleUtilizationData.filter(v => v.utilizationPercentage > 0).length} ${vehicleUtilizationData.filter(v => v.utilizationPercentage > 0).length === 1 ? 'vehicle' : 'vehicles'} with rentals`
                  }
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(Number(totalExpenses))}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Across {filteredExpenses.length} expense entries
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg. Cost Per Vehicle</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(Number(avgExpensePerVehicle))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  For {activeVehicleCount} active {activeVehicleCount === 1 ? 'vehicle' : 'vehicles'}
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
                  <CardTitle>Vehicle Utilization</CardTitle>
                  <CardDescription>
                    {dateRange.from && dateRange.to && dateRange.from.getFullYear() <= 2000 && dateRange.to.getFullYear() >= 2050
                      ? "Top 10 vehicles by total yearly utilization"
                      : "Top 10 vehicles by utilization rate for selected period"
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
                  Print
                </Button>
              </CardHeader>
              <CardContent className="h-80">
                <UtilizationChart data={utilizationChartData} />
              </CardContent>
            </Card>
            
            {/* Expense by Category Chart */}
            <Card className="xl:col-span-1">
              <CardHeader>
                <CardTitle>Expenses by Category</CardTitle>
                <CardDescription>
                  Distribution of expenses for the selected period
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
              <CardTitle>Expense Trends</CardTitle>
              <CardDescription>
                Monthly expense comparison
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium">{expenseTrend.currentMonth.name}</h4>
                      <p className="text-2xl font-bold">{formatCurrency(Number(expenseTrend.currentMonth.total))}</p>
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
                      <p className="text-2xl font-bold">{formatCurrency(Number(expenseTrend.previousMonth.total))}</p>
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
                      <p className="text-2xl font-bold">{formatCurrency(Number(expenseTrend.twoMonthsAgo.total))}</p>
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
                <CardTitle>Expense Breakdown by Category</CardTitle>
                <CardDescription>
                  Detailed breakdown of expenses for the selected period
                </CardDescription>
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => printReport('expenses')}
                className="h-8 gap-1"
              >
                <Printer className="h-4 w-4" />
                Print
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
                            {filteredExpenses.filter(e => e.category === category).length} items
                          </span>
                          <span className="font-medium">{formatCurrency(Number(amount))}</span>
                        </div>
                      </div>
                    ))
                ) : (
                  <p className="text-muted-foreground text-center py-4">No expenses found for the selected filters</p>
                )}
              </div>
            </CardContent>
          </Card>
          
          {/* Expense List */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Expenses</CardTitle>
              <CardDescription>
                Detailed list of expenses for the selected period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
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
                                : 'Unknown Vehicle'}
                            </TableCell>
                            <TableCell className="capitalize">{expense.category}</TableCell>
                            <TableCell>{expense.description}</TableCell>
                            <TableCell className="text-right">{formatCurrency(Number(expense.amount))}</TableCell>
                          </TableRow>
                        );
                      })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4">No expenses found for the selected filters</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          
          {/* Expense Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Expense Visualization</CardTitle>
              <CardDescription>
                Visual breakdown by category
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
              <CardTitle>Vehicle Utilization</CardTitle>
              <CardDescription>
                Utilization rates across all vehicles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>License Plate</TableHead>
                    <TableHead>Days Reserved</TableHead>
                    <TableHead>Reservations</TableHead>
                    <TableHead>Utilization</TableHead>
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
                          <TableCell>{vehicle.daysReserved} days</TableCell>
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
                      <TableCell colSpan={5} className="text-center py-4">No vehicle utilization data available</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          
          {/* Vehicle Maintenance Costs */}
          <Card>
            <CardHeader>
              <CardTitle>Maintenance Costs by Vehicle</CardTitle>
              <CardDescription>
                Total maintenance and repair expenses per vehicle
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>License Plate</TableHead>
                    <TableHead>Expense Count</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
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
                          <TableCell>{vehicle.expenseCount} entries</TableCell>
                          <TableCell className="text-right">{formatCurrency(Number(vehicle.maintenanceCost))}</TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4">No maintenance cost data available</TableCell>
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
                <CardTitle>APK Inspection Overview</CardTitle>
                <CardDescription>
                  Vehicle inspection status and expiration dates
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
                  Print
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* APK Status Overview */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex flex-col p-4 rounded-md bg-slate-50">
                    <span className="text-muted-foreground text-sm">Vehicles with valid APK</span>
                    <span className="text-2xl font-bold">{vehiclesWithValidApk.length}</span>
                  </div>
                  <div className="flex flex-col p-4 rounded-md bg-yellow-50">
                    <span className="text-muted-foreground text-sm">APK expiring in 2-3 months</span>
                    <span className="text-2xl font-bold">{vehiclesWithApkExpiring2to3Months.length}</span>
                  </div>
                  <div className="flex flex-col p-4 rounded-md bg-amber-50">
                    <span className="text-muted-foreground text-sm">APK expiring in 30 days</span>
                    <span className="text-2xl font-bold">{vehiclesWithApkExpiringSoon.length}</span>
                  </div>
                  <div className="flex flex-col p-4 rounded-md bg-red-50">
                    <span className="text-muted-foreground text-sm">Expired APK</span>
                    <span className="text-2xl font-bold">{vehiclesWithExpiredApk.length}</span>
                  </div>
                </div>
                
                {/* APK Expiry Table */}
                <div className="flex justify-between mb-2">
                  <Input 
                    placeholder="Search by license plate, brand, or model..." 
                    className="max-w-sm"
                    value={apkSearchQuery || ''}
                    onChange={(e) => setApkSearchQuery(e.target.value)}
                  />
                  <Select
                    value={apkFilterStatus}
                    onValueChange={setApkFilterStatus}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="expiring_soon">Expiring Soon (30 days)</SelectItem>
                      <SelectItem value="expiring_2to3_months">Expiring in 2-3 Months</SelectItem>
                      <SelectItem value="valid">Valid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>License Plate</TableHead>
                      <TableHead>APK Expiry</TableHead>
                      <TableHead className="text-right">Status</TableHead>
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
                            statusText = 'Not set';
                          } else if (daysUntilExpiry < 0) {
                            statusClass = 'bg-red-100 text-red-800';
                            statusText = 'Expired';
                          } else if (daysUntilExpiry <= 30) {
                            statusClass = 'bg-amber-100 text-amber-800';
                            statusText = `Expires in ${daysUntilExpiry} days`;
                          } else if (daysUntilExpiry <= 90) {
                            statusClass = 'bg-yellow-100 text-yellow-800';
                            statusText = `Expires in ${daysUntilExpiry} days`;
                          } else {
                            statusClass = 'bg-green-100 text-green-800';
                            statusText = 'Valid';
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
                              <TableCell>{vehicle.apkDate ? formatDate(vehicle.apkDate) : 'Not set'}</TableCell>
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
                        <TableCell colSpan={4} className="text-center py-4">No APK data available</TableCell>
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
                <CardTitle>Warranty Status Overview</CardTitle>
                <CardDescription>
                  Vehicle warranty status and expiration dates
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
                  Print
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
                          <span className="text-muted-foreground text-sm">Vehicles with valid warranty</span>
                          <span className="text-2xl font-bold">{validWarranties.length}</span>
                        </div>
                        <div className="flex flex-col p-4 rounded-md bg-amber-50">
                          <span className="text-muted-foreground text-sm">Warranty expiring in 90 days</span>
                          <span className="text-2xl font-bold">{expiringWarranties.length}</span>
                        </div>
                        <div className="flex flex-col p-4 rounded-md bg-red-50">
                          <span className="text-muted-foreground text-sm">Expired Warranty</span>
                          <span className="text-2xl font-bold">{expiredWarranties.length}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
                
                {/* Warranty Expiry Table */}
                <div className="flex justify-between mb-2">
                  <Input 
                    placeholder="Search by license plate, brand, or model..." 
                    className="max-w-sm"
                    value={warrantySearchQuery || ''}
                    onChange={(e) => setWarrantySearchQuery(e.target.value)}
                  />
                  <Select
                    value={warrantyFilterStatus}
                    onValueChange={setWarrantyFilterStatus}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                      <SelectItem value="valid">Valid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>License Plate</TableHead>
                      <TableHead>Warranty End Date</TableHead>
                      <TableHead className="text-right">Status</TableHead>
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
                            statusText = 'Not set';
                          } else if (daysRemaining < 0) {
                            statusClass = 'bg-red-100 text-red-800';
                            statusText = `Expired (${Math.abs(daysRemaining)} days ago)`;
                          } else if (daysRemaining <= 90) {
                            statusClass = 'bg-amber-100 text-amber-800';
                            statusText = `Expires in ${daysRemaining} days`;
                          } else {
                            statusClass = 'bg-green-100 text-green-800';
                            statusText = 'Valid';
                          }
                          
                          return (
                            <TableRow key={vehicle.id} className={
                              daysRemaining === null ? 'bg-slate-50' : 
                              daysRemaining < 0 ? 'bg-red-50' : 
                              daysRemaining < 90 ? 'bg-amber-50' : ''
                            }>
                              <TableCell>{vehicle.brand} {vehicle.model}</TableCell>
                              <TableCell>{formatLicensePlate(vehicle.licensePlate)}</TableCell>
                              <TableCell>{vehicle.warrantyEndDate ? formatDate(vehicle.warrantyEndDate) : 'Not set'}</TableCell>
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
                        <TableCell colSpan={4} className="text-center py-4">No warranty data available</TableCell>
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
              <CardTitle>Vehicle Utilization Visualization</CardTitle>
              <CardDescription>
                Top vehicles by utilization percentage
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
                <CardTitle>Customer Impact Analysis</CardTitle>
                <CardDescription>
                  Analysis of customer impact on vehicle expenses and maintenance
                </CardDescription>
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => printReport('customer-impact')}
                className="h-8 gap-1"
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Reservations</TableHead>
                    <TableHead>Total Days</TableHead>
                    <TableHead>Total Vehicles</TableHead>
                    <TableHead>Related Expenses</TableHead>
                    <TableHead className="text-right">Cost Per Day</TableHead>
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
                          <TableCell>{customer.totalReservationDays} days</TableCell>
                          <TableCell>{customer.vehicleCount}</TableCell>
                          <TableCell>{formatCurrency(Number(customer.totalExpenses))}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(Number(customer.expensePerDay))}
                            {customer.expensePerDay > 0 && (
                              <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                                customer.expensePerDay > (avgExpensePerVehicle / 30) * 2
                                  ? "bg-red-100 text-red-800"
                                  : customer.expensePerDay > (avgExpensePerVehicle / 30)
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-green-100 text-green-800"
                              }`}>
                                {customer.expensePerDay > (avgExpensePerVehicle / 30) * 2
                                  ? "High"
                                  : customer.expensePerDay > (avgExpensePerVehicle / 30)
                                  ? "Medium"
                                  : "Low"}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-4">No customer analysis data available</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          
          {/* Customer Expense Impact Detail */}
          <Card>
            <CardHeader>
              <CardTitle>Expense Categories by Customer</CardTitle>
              <CardDescription>
                Breakdown of expense categories associated with each customer
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Tires</TableHead>
                    <TableHead>Maintenance</TableHead>
                    <TableHead>Damage</TableHead>
                    <TableHead>Repair</TableHead>
                    <TableHead>Other</TableHead>
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
                      <TableCell colSpan={6} className="text-center py-4">No expense data available</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          
          {/* Customer Reservation List */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Customer Reservations</CardTitle>
              <CardDescription>
                Details of recent bookings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
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
                            <TableCell>{customer?.name || 'Unknown'}</TableCell>
                            <TableCell>
                              {vehicle 
                                ? `${vehicle.brand} ${vehicle.model} (${formatLicensePlate(vehicle.licensePlate)})` 
                                : 'Unknown Vehicle'}
                            </TableCell>
                            <TableCell>{formatDate(reservation.startDate)}</TableCell>
                            <TableCell>{reservation.endDate ? formatDate(reservation.endDate) : 'Open-ended'}</TableCell>
                            <TableCell className="capitalize">
                              {reservation.status?.replace(/_/g, ' ')}
                            </TableCell>
                          </TableRow>
                        );
                      })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4">No reservation data available</TableCell>
                    </TableRow>
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
              <DialogTitle className="text-2xl">Custom Report Builder</DialogTitle>
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
              <DialogTitle className="text-2xl">Maintenance Cost Analysis</DialogTitle>
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