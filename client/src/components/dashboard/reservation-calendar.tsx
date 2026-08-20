import { invalidateByPrefix } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { ReservationAddDialog } from "@/components/reservations/reservation-add-dialog";
import { ReservationForm } from "@/components/reservations/reservation-form";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  parseISO,
  differenceInDays,
  getDay,
  formatISO
} from "date-fns";
import { Vehicle, Reservation, Customer, Driver } from "@shared/schema";
import { formatCurrency } from "@/lib/utils";
import { formatLicensePlate } from "@/lib/format-utils";
import { formatReservationStatus } from "@/lib/format-utils";
import { PlusCircle, Edit, Eye, Calendar, User, Car, CreditCard, Clock, MapPin } from "lucide-react";
import { ReservationQuickStatusButton } from "@/components/reservations/reservation-quick-status-button";
import { SpareVehicleAssignmentDialog } from "@/components/reservations/spare-vehicle-assignment-dialog";

// Days of the week abbreviations
const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Holiday names for display
const DUTCH_HOLIDAY_NAMES: Record<string, string> = {
  nieuwjaarsdag: "Nieuwjaarsdag",
  goede_vrijdag: "Goede Vrijdag",
  eerste_paasdag: "Eerste Paasdag",
  tweede_paasdag: "Tweede Paasdag",
  koningsdag: "Koningsdag",
  bevrijdingsdag: "Bevrijdingsdag",
  hemelvaartsdag: "Hemelvaartsdag",
  eerste_pinksterdag: "Eerste Pinksterdag",
  tweede_pinksterdag: "Tweede Pinksterdag",
  eerste_kerstdag: "Eerste Kerstdag",
  tweede_kerstdag: "Tweede Kerstdag",
};

export function ReservationCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [_, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [selectedPlaceholderReservations, setSelectedPlaceholderReservations] = useState<any[]>([]);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<any | null>(null);

  // Safe date parsing and formatting functions to prevent errors
  const safeParseDateISO = (dateString: string | null | undefined): Date | null => {
    if (!dateString || dateString === 'undefined' || dateString === 'null') {
      return null;
    }
    try {
      const parsed = parseISO(dateString);
      // Check if the parsed date is valid
      if (isNaN(parsed.getTime())) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  };

  // Safe format function to prevent format errors with invalid dates
  const safeFormat = (date: Date | null | undefined, formatString: string, fallback: string = ''): string => {
    if (!date) return fallback;
    try {
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return fallback;
      }
      return format(date, formatString);
    } catch {
      return fallback;
    }
  };

  // Calculate date ranges for month view
  const dateRanges = useMemo(() => {
    // Month view calculations
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    
    // Get the first Monday before or on the first day of the month
    const firstDay = new Date(start);
    const firstDayOfWeek = getDay(firstDay) || 7; // Convert Sunday (0) to 7
    firstDay.setDate(firstDay.getDate() - ((firstDayOfWeek - 1) || 0));
    
    // Get the last Sunday after or on the last day of the month
    const lastDay = new Date(end);
    const lastDayOfWeek = getDay(lastDay) || 7; // Convert Sunday (0) to 7
    lastDay.setDate(lastDay.getDate() + (7 - lastDayOfWeek));
    
    // Generate all days in the calendar grid
    const dayCount = differenceInDays(lastDay, firstDay) + 1;
    const days = Array.from({ length: dayCount }, (_, i) => addDays(firstDay, i));
    
    const rangeText = format(currentDate, "MMMM yyyy");
    
    return { start, end, days, rangeText };
  }, [currentDate]);
  
  // Fetch reservations for the full calendar view (including adjacent month dates)
  const startDate = format(dateRanges.days[0], "yyyy-MM-dd");
  const endDate = format(dateRanges.days[dateRanges.days.length - 1], "yyyy-MM-dd");
  
  const { data: allReservations, isLoading: isLoadingReservations } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations/range", startDate, endDate],
    queryFn: async () => {
      const url = `/api/reservations/range?startDate=${startDate}&endDate=${endDate}`;
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Reservation range fetch error:", errorText);
        throw new Error(errorText);
      }
      return response.json();
    }
  });
  
  // Filter out completed reservations from calendar view
  const reservations = useMemo(() => {
    if (!allReservations) return [];
    // Only show booked, picked_up, returned reservations OR maintenance blocks
    return allReservations.filter(r => 
      r.type === 'maintenance_block' || 
      ['booked', 'picked_up', 'returned'].includes(r.status || '')
    );
  }, [allReservations]);
  
  // Fetch calendar settings for holidays and blocked dates
  const { data: calendarSettings } = useQuery<{ key: string; value: any } | null>({
    queryKey: ["/api/app-settings/key/calendar_settings"],
  });
  
  // Helper to check if a date is a holiday or blocked
  const getDateStatus = useMemo(() => {
    return (day: Date): { isHoliday: boolean; isBlocked: boolean; holidayName?: string; blockedReason?: string } => {
      const dateStr = format(day, "yyyy-MM-dd");
      let isHoliday = false;
      let isBlocked = false;
      let holidayName: string | undefined;
      let blockedReason: string | undefined;
      
      // Get settings value from single object response
      const settings = calendarSettings?.value;
      
      if (settings) {
        // Use allHolidayDates for efficient O(1) multi-year holiday lookup
        const allHolidayDates = settings.allHolidayDates;
        if (allHolidayDates && allHolidayDates[dateStr]) {
          const holiday = allHolidayDates[dateStr];
          if (holiday.enabled) {
            isHoliday = true;
            holidayName = DUTCH_HOLIDAY_NAMES[holiday.holidayKey] || holiday.holidayKey;
          }
        } else {
          // Fallback to dutchHolidays for backward compatibility
          const dutchHolidays = settings.dutchHolidays;
          if (dutchHolidays) {
            for (const [key, value] of Object.entries(dutchHolidays)) {
              // Handle both old format (boolean) and new format (object with enabled+date)
              if (typeof value === 'object' && value !== null && 'enabled' in value && 'date' in value) {
                const holiday = value as { enabled: boolean; date: string };
                if (holiday.enabled && holiday.date === dateStr) {
                  isHoliday = true;
                  holidayName = DUTCH_HOLIDAY_NAMES[key] || key;
                  break;
                }
              }
            }
          }
        }
        
        // Check custom holidays
        const customHolidays = settings.holidays;
        if (customHolidays && Array.isArray(customHolidays)) {
          for (const holiday of customHolidays) {
            if (holiday.date === dateStr) {
              isHoliday = true;
              holidayName = holiday.name;
              break;
            }
          }
        }
        
        // Check blocked dates
        const blockedDates = settings.blockedDates;
        if (blockedDates && Array.isArray(blockedDates)) {
          for (const blocked of blockedDates) {
            if (dateStr >= blocked.startDate && dateStr <= blocked.endDate) {
              isBlocked = true;
              blockedReason = blocked.reason;
              break;
            }
          }
        }
      }
      
      return { isHoliday, isBlocked, holidayName, blockedReason };
    };
  }, [calendarSettings]);
  
  // Navigation functions
  const navigatePrevious = () => {
    setCurrentDate(prevDate => subMonths(prevDate, 1));
  };
  
  const navigateNext = () => {
    setCurrentDate(prevDate => addMonths(prevDate, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };
  
  // Function to get reservation style
  const getReservationStyle = (status: string, isStart: boolean, isEnd: boolean) => {
    let bgColor, textColor;
    
    switch (status.toLowerCase()) {
      case "booked":
        bgColor = "bg-blue-100";
        textColor = "text-blue-800";
        break;
      case "picked_up":
        bgColor = "bg-orange-100";
        textColor = "text-orange-800";
        break;
      case "returned":
        bgColor = "bg-purple-100";
        textColor = "text-purple-800";
        break;
      case "completed":
        bgColor = "bg-green-100";
        textColor = "text-green-800";
        break;
      case "cancelled":
        bgColor = "bg-red-100";
        textColor = "text-red-800";
        break;
      default:
        bgColor = "bg-gray-100";
        textColor = "text-gray-800";
    }
    
    const roundedLeft = isStart ? "rounded-l-md" : "";
    const roundedRight = isEnd ? "rounded-r-md" : "";
    
    return `${bgColor} ${textColor} border ${roundedLeft} ${roundedRight}`;
  };
  
  // Generate calendar grid for month view
  const calendarGrid = useMemo(() => {
    const weeks = [];
    const days = dateRanges.days;
    
    // Group days into weeks
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    
    return weeks;
  }, [dateRanges.days]);

  return (
    <Card className="mt-6 overflow-hidden">
      <CardHeader className="px-4 py-3 border-b flex-row justify-between items-center space-y-0">
        <CardTitle className="text-base font-medium text-gray-800">Reservation Calendar</CardTitle>
        <div className="flex space-x-2">
          <ReservationAddDialog>
            <Button 
              size="sm" 
              variant="outline"
              className="h-8 text-xs"
            >
              <PlusCircle className="mr-1 h-3 w-3" />
              New Reservation
            </Button>
          </ReservationAddDialog>
          <Link href="/reservations/calendar">
            <Button variant="link" className="text-primary-600 hover:text-primary-700 text-sm font-medium h-8 px-0">
              Full Calendar
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {/* Month Navigation */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={navigatePrevious}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-left">
                <path d="m15 18-6-6 6-6"/>
              </svg>
            </Button>
            <Button variant="ghost" size="sm" onClick={goToToday} className="text-xs mx-1">
              Today
            </Button>
            <Button variant="ghost" size="icon" onClick={navigateNext}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-right">
                <path d="m9 18 6-6-6-6"/>
              </svg>
            </Button>
          </div>
          <h4 className="text-base font-medium">{dateRanges.rangeText}</h4>
        </div>
        
        {/* Calendar Header */}
        <div className="grid grid-cols-7 mb-2">
          {daysOfWeek.map((day) => (
            <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar Grid */}
        <div className="border rounded-md overflow-hidden">
          {isLoadingReservations ? (
            <div className="flex justify-center p-8">
              <svg className="animate-spin h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : (
            calendarGrid.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 divide-x border-b last:border-b-0">
                {week.map((day, dayIndex) => {
                  const isCurrentMonth = isSameMonth(day, currentDate);
                  const isToday = isSameDay(day, new Date());
                  const dateStatus = getDateStatus(day);
                  
                  // Only get reservations starting or ending on this day
                  const dayReservations = reservations?.filter(res => {
                    const startDate = res.startDate ? parseISO(res.startDate) : null;
                    const endDate = res.endDate ? parseISO(res.endDate) : null;
                    return (
                      (startDate && isSameDay(day, startDate)) || 
                      (endDate && isSameDay(day, endDate))
                    );
                  }) || [];
                  
                  // Determine background color based on status
                  let bgClass = isCurrentMonth ? '' : 'bg-gray-50';
                  if (dateStatus.isBlocked) {
                    bgClass = 'bg-red-50';
                  } else if (dateStatus.isHoliday) {
                    bgClass = 'bg-orange-50';
                  } else if (isToday) {
                    bgClass = 'bg-blue-50';
                  }
                  
                  return (
                    <div
                      key={dayIndex}
                      className={`min-h-[85px] p-2 ${bgClass} relative group`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-xs font-medium ${isToday ? 'bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center' : ''}`}>
                          {safeFormat(day, "d", "?")}
                        </span>
                        <div className="flex items-center gap-1">
                          {dateStatus.isHoliday && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-orange-100 text-orange-700 border-orange-300">
                              🎉 {dateStatus.holidayName || 'Holiday'}
                            </Badge>
                          )}
                          {dateStatus.isBlocked && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-red-100 text-red-700 border-red-300">
                              🚫 {dateStatus.blockedReason || 'Blocked'}
                            </Badge>
                          )}
                          {dayReservations.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {dayReservations.length}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {/* Add reservation button - positioned at top center */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="absolute top-1 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                              <ReservationAddDialog
                                initialStartDate={safeFormat(day, 'yyyy-MM-dd', undefined)}
                              >
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5 bg-primary/10 hover:bg-primary/20 rounded-full border border-primary/20 shadow-sm p-0"
                                >
                                  <PlusCircle className="h-3.5 w-3.5" />
                                </Button>
                              </ReservationAddDialog>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Add reservation</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      {/* Show up to 3 reservations */}
                      <div className="space-y-1">
                        {dayReservations && dayReservations.slice(0, 3).map(res => {
                          const startDate = safeParseDateISO(res.startDate);
                          const endDate = safeParseDateISO(res.endDate);
                          const isPickupDay = startDate ? isSameDay(day, startDate) : false;
                          const isReturnDay = endDate ? isSameDay(day, endDate) : false;
                          const rentalDuration = startDate && endDate ? 
                            differenceInDays(endDate, startDate) + 1 : 1;
                          
                          return (
                            <HoverCard key={res.id} openDelay={300} closeDelay={200}>
                              <HoverCardTrigger asChild>
                                <div 
                                  className={`px-1 py-0.5 text-xs truncate ${getReservationStyle(res.status, isPickupDay, isReturnDay)} group/res relative cursor-pointer hover:brightness-95`}
                                  onClick={() => {
                                    setSelectedReservation(res);
                                    setViewDialogOpen(true);
                                  }}
                                >
                                  <div className="flex justify-between items-center">
                                    <div className="truncate">
                                      {res.placeholderSpare ? 
                                        <span className="text-orange-700 font-medium">TBD</span> : 
                                        formatLicensePlate(res.vehicle?.licensePlate || '')
                                      }
                                      {isPickupDay && 
                                        <span className="ml-1 inline-block bg-green-200 text-green-800 text-[8px] px-1 rounded-sm">out</span>
                                      }
                                      {isReturnDay && 
                                        <span className="ml-1 inline-block bg-blue-200 text-blue-800 text-[8px] px-1 rounded-sm">in</span>
                                      }
                                    </div>
                                    
                                    {/* Edit button - only visible on hover */}
                                    <Button
                                      onClick={(e) => {
                                        e.stopPropagation(); // Prevent triggering the parent onClick
                                        navigate(`/reservations/edit/${res.id}`);
                                      }}
                                      size="icon"
                                      variant="ghost"
                                      className="h-3 w-3 opacity-0 group-hover/res:opacity-100 transition-opacity p-0"
                                    >
                                      <Edit className="h-2 w-2" />
                                    </Button>
                                  </div>
                                </div>
                              </HoverCardTrigger>
                              <HoverCardContent 
                                className="w-80 p-0 shadow-lg" 
                                side="right"
                                align="start"
                              >
                                {/* Reservation Preview Card */}
                                <div className="space-y-2">
                                  {/* Header with status badge */}
                                  <div className="flex items-center justify-between border-b p-3">
                                    <h4 className="font-medium">Reservation Details</h4>
                                    <Badge 
                                      className={`${
                                        res.status?.toLowerCase() === 'booked' ? 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200' : 
                                        res.status?.toLowerCase() === 'picked_up' ? 'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200' :
                                        res.status?.toLowerCase() === 'returned' ? 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200' :
                                        res.status?.toLowerCase() === 'completed' ? 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200' :
                                        res.status?.toLowerCase() === 'cancelled' ? 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200' :
                                        'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200'
                                      }`}
                                      variant="outline"
                                    >
                                      {formatReservationStatus(res.status)}
                                    </Badge>
                                  </div>
                                  
                                  {/* Vehicle details */}
                                  <div className="px-3 py-1 flex items-start space-x-2">
                                    <Car className="h-4 w-4 text-gray-500 mt-0.5" />
                                    <div>
                                      {res.placeholderSpare ? (
                                        <>
                                          <div className="font-medium text-sm text-orange-700">TBD Spare Vehicle</div>
                                          <div className="text-xs text-gray-600">Awaiting assignment</div>
                                        </>
                                      ) : (
                                        <>
                                          <div className="font-medium text-sm">{res.vehicle?.brand} {res.vehicle?.model}</div>
                                          <div className="text-xs text-gray-600">{formatLicensePlate(res.vehicle?.licensePlate || '')}</div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* Customer details */}
                                  <div className="px-3 py-1 flex items-start space-x-2">
                                    <User className="h-4 w-4 text-gray-500 mt-0.5" />
                                    <div>
                                      <div className="font-medium text-sm">{res.customer?.name}</div>
                                      <div className="text-xs text-gray-600">{res.customer?.email || 'No email provided'}</div>
                                      {res.customer?.phone && <div className="text-xs text-gray-600">{res.customer?.phone}</div>}
                                    </div>
                                  </div>

                                  {/* Driver indication */}
                                  {res.driverId && (
                                    <div className="px-3 py-1 flex items-start space-x-2 bg-blue-50 -mx-3 border-t border-blue-100">
                                      <User className="h-4 w-4 text-blue-600 mt-0.5" />
                                      <div>
                                        <div className="font-medium text-sm text-blue-900">
                                          Driver Assigned
                                        </div>
                                        <div className="text-xs text-blue-600">Click to view details</div>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Dates */}
                                  <div className="px-3 py-1 flex items-start space-x-2">
                                    <Calendar className="h-4 w-4 text-gray-500 mt-0.5" />
                                    <div>
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                          <span className="text-gray-500">Start:</span> {res.startDate ? safeFormat(safeParseDateISO(res.startDate), 'MMM d, yyyy', 'Invalid date') : 'Not set'}
                                        </div>
                                        <div>
                                          <span className="text-gray-500">End:</span> {res.endDate ? safeFormat(safeParseDateISO(res.endDate), 'MMM d, yyyy', 'Invalid date') : 'Open-ended'}
                                        </div>
                                        <div className="col-span-2">
                                          <span className="text-gray-500">Duration:</span> {rentalDuration} {rentalDuration === 1 ? 'day' : 'days'}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Price and mileage */}
                                  <div className="px-3 py-1 flex items-start space-x-2">
                                    <CreditCard className="h-4 w-4 text-gray-500 mt-0.5" />
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {(res as any).totalPrice ? (
                                        <div>
                                          <span className="text-gray-500">Price:</span> {formatCurrency((res as any).totalPrice)}
                                        </div>
                                      ) : null}
                                      {(res as any).startMileage ? (
                                        <div>
                                          <span className="text-gray-500">Start Mileage:</span> {(res as any).startMileage} km
                                        </div>
                                      ) : null}
                                      {(res as any).departureMileage ? (
                                        <div>
                                          <span className="text-gray-500">Return Mileage:</span> {(res as any).departureMileage} km
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                  
                                  {/* Notes if available */}
                                  {res.notes && (
                                    <div className="px-3 py-1 flex items-start space-x-2">
                                      <div className="bg-gray-50 p-2 rounded text-xs text-gray-700 w-full">
                                        {res.notes}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Action buttons */}
                                  <div className="border-t p-3 flex justify-end space-x-2">
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      className="h-8 text-xs"
                                      onClick={() => {
                                        setSelectedReservation(res);
                                        setViewDialogOpen(true);
                                      }}
                                    >
                                      <Eye className="mr-1 h-3 w-3" />
                                      View
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      className="h-8 text-xs"
                                      onClick={() => navigate(`/reservations/edit/${res.id}`)}
                                    >
                                      <Edit className="mr-1 h-3 w-3" />
                                      Edit
                                    </Button>
                                    {res.placeholderSpare ? (
                                      <Button 
                                        size="sm" 
                                        variant="default"
                                        className="h-8 text-xs bg-orange-600 hover:bg-orange-700"
                                        onClick={() => {
                                          setSelectedPlaceholderReservations([res]);
                                          setAssignmentDialogOpen(true);
                                        }}
                                        data-testid="button-assign-vehicle"
                                      >
                                        <Car className="mr-1 h-3 w-3" />
                                        Assign
                                      </Button>
                                    ) : (
                                      <ReservationQuickStatusButton 
                                        reservation={res}
                                        size="sm"
                                        variant="outline"
                                        withText={true}
                                        className="h-8 text-xs"
                                        onStatusChanged={() => {
                                          // Force refresh of reservations data
                                          invalidateByPrefix("/api/reservations/range");
                                        }}
                                      />
                                    )}
                                  </div>
                                </div>
                              </HoverCardContent>
                            </HoverCard>
                          );
                        })}
                        
                        {dayReservations && dayReservations.length > 3 && (
                          <div 
                            className="text-xs text-gray-500 cursor-pointer hover:underline"
                            onClick={() => navigate(`/reservations/calendar?date=${safeFormat(day, 'yyyy-MM-dd', '1970-01-01')}`)}
                          >
                            +{dayReservations.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </CardContent>
      
      {/* View Reservation Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={(open) => {
        setViewDialogOpen(open);
        if (!open) {
          setSelectedReservation(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reservation Details</DialogTitle>
            <DialogDescription>
              {selectedReservation ? `Reservation #${selectedReservation.id} - ${selectedReservation.customer?.name || 'No customer'}` : 'View detailed reservation information'}
            </DialogDescription>
          </DialogHeader>
          {selectedReservation && (
            <div className="space-y-4">
              {/* Status Badge */}
              <div>
                <Badge 
                  className={`${
                    selectedReservation.status?.toLowerCase() === 'booked' ? 'bg-blue-100 text-blue-800 border-blue-200' : 
                    selectedReservation.status?.toLowerCase() === 'picked_up' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                    selectedReservation.status?.toLowerCase() === 'returned' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                    selectedReservation.status?.toLowerCase() === 'completed' ? 'bg-green-100 text-green-800 border-green-200' :
                    selectedReservation.status?.toLowerCase() === 'cancelled' ? 'bg-red-100 text-red-800 border-red-200' :
                    'bg-gray-100 text-gray-800 border-gray-200'
                  }`}
                  variant="outline"
                >
                  {formatReservationStatus(selectedReservation.status)}
                </Badge>
              </div>

              {/* Vehicle & Customer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-md">
                  <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Car className="h-4 w-4" />
                    Vehicle
                  </h3>
                  <div className="space-y-1">
                    {selectedReservation.placeholderSpare ? (
                      <div className="text-orange-700 font-medium">TBD Spare Vehicle</div>
                    ) : (
                      <>
                        <div className="font-medium">{selectedReservation.vehicle?.brand} {selectedReservation.vehicle?.model}</div>
                        <div className="text-sm text-gray-600">{formatLicensePlate(selectedReservation.vehicle?.licensePlate || '')}</div>
                      </>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-md">
                  <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Customer
                  </h3>
                  <div className="space-y-1">
                    <div className="font-medium">{selectedReservation.customer?.name || 'No customer specified'}</div>
                    {selectedReservation.customer?.email && (
                      <div className="text-sm text-gray-600">{selectedReservation.customer.email}</div>
                    )}
                    {selectedReservation.customer?.phone && (
                      <div className="text-sm text-gray-600">{selectedReservation.customer.phone}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Dates and Price */}
              <div className="bg-gray-50 p-3 rounded-md">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">Start Date</label>
                    <p className="text-sm font-medium mt-1">{selectedReservation.startDate ? safeFormat(safeParseDateISO(selectedReservation.startDate), 'MMM d, yyyy', 'Invalid') : 'Not set'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">End Date</label>
                    <p className="text-sm font-medium mt-1">{selectedReservation.endDate ? safeFormat(safeParseDateISO(selectedReservation.endDate), 'MMM d, yyyy', 'Open-ended') : 'Open-ended'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">Duration</label>
                    <p className="text-sm font-medium mt-1">
                      {(() => {
                        if (!selectedReservation.startDate || !selectedReservation.endDate) return 'Open-ended';
                        const startDate = safeParseDateISO(selectedReservation.startDate);
                        const endDate = safeParseDateISO(selectedReservation.endDate);
                        if (!startDate || !endDate) return 'Invalid';
                        const duration = differenceInDays(endDate, startDate) + 1;
                        return `${duration} ${duration === 1 ? 'day' : 'days'}`;
                      })()}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">Price</label>
                    <p className="text-sm font-semibold mt-1">{selectedReservation.totalPrice ? formatCurrency(Number(selectedReservation.totalPrice)) : 'Not set'}</p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedReservation.notes && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-md">
                  <label className="text-xs font-medium text-amber-700 uppercase">Notes</label>
                  <p className="text-sm text-amber-900 mt-1 whitespace-pre-wrap">{selectedReservation.notes}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <Button 
                  onClick={() => {
                    setViewDialogOpen(false);
                    setEditDialogOpen(true);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Reservation
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setViewDialogOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Reservation Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) {
          setSelectedReservation(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Reservation</DialogTitle>
            <DialogDescription>
              Modify reservation details including dates, customer information, vehicle selection, and pricing.
            </DialogDescription>
          </DialogHeader>
          {selectedReservation && (
            <ReservationForm 
              editMode={true} 
              initialData={selectedReservation}
              onSuccess={() => {
                setEditDialogOpen(false);
                setSelectedReservation(null);
                // Refresh calendar data
                invalidateByPrefix("/api/reservations/range");
              }}
              onCancel={() => {
                setEditDialogOpen(false);
                setSelectedReservation(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      
      {/* Spare Vehicle Assignment Dialog */}
      <SpareVehicleAssignmentDialog
        open={assignmentDialogOpen}
        onOpenChange={(open) => {
          setAssignmentDialogOpen(open);
          if (!open) setSelectedPlaceholderReservations([]);
        }}
        placeholderReservations={selectedPlaceholderReservations}
      />
    </Card>
  );
}
