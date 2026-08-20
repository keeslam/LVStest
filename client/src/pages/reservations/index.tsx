import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { TabsFilter } from "@/components/ui/tabs-filter";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertTriangle, Phone, Calendar, Car, User } from "lucide-react";
import { StatusChangeDialog } from "@/components/reservations/status-change-dialog";
import { ReservationAddDialog } from "@/components/reservations/reservation-add-dialog";
import { PickupDialog, ReturnDialog } from "@/components/reservations/pickup-return-dialogs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, invalidateRelatedQueries } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Reservation, Vehicle } from "@shared/schema";
import { formatDate, formatCurrency, formatLicensePlate, formatReservationStatus } from "@/lib/format-utils";
import { getDuration } from "@/lib/date-utils";
import { format, differenceInDays, addDays, parseISO, startOfToday, endOfToday, isBefore, isAfter, isSameDay, endOfDay } from "date-fns";

export default function ReservationsIndex() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState("all");
  const [dateRangeFilter, setDateRangeFilter] = useState("all");
  const [vehicleGrouping, setVehicleGrouping] = useState("none");
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [pickupDialogOpen, setPickupDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [overdueDialogOpen, setOverdueDialogOpen] = useState(false);
  const { toast } = useToast();
  
  // Fetch overdue reservations
  // Note: No refetchInterval - real-time updates come via WebSocket to prevent dialog closures
  const { data: overdueReservations = [] } = useQuery<Reservation[]>({
    queryKey: ['/api/reservations/overdue'],
  });
  
  // Get current date
  const today = new Date();
  
  // Delete reservation mutation with optimistic updates
  const deleteReservationMutation = useMutation({
    mutationFn: async (reservationId: number) => {
      const response = await apiRequest('DELETE', `/api/reservations/${reservationId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete reservation');
      }
      return await response.json();
    },
    onMutate: async (reservationId: number) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: reservationsQueryKey });

      // Snapshot the previous value
      const previousReservations = queryClient.getQueryData<Reservation[]>(reservationsQueryKey);

      // Optimistically update to remove the reservation
      queryClient.setQueryData<Reservation[]>(reservationsQueryKey, (old) => 
        old?.filter(r => r.id !== reservationId) || []
      );

      // Return context with the snapshot
      return { previousReservations };
    },
    onError: (error: Error, reservationId, context) => {
      // Rollback on error
      if (context?.previousReservations) {
        queryClient.setQueryData(reservationsQueryKey, context.previousReservations);
      }
      
      toast({
        title: "Error",
        description: error.message || "Failed to delete reservation",
        variant: "destructive"
      });
    },
    onSuccess: async () => {
      // Invalidate to refetch and ensure consistency
      await invalidateRelatedQueries('reservations');
      
      toast({
        title: "Reservation deleted",
        description: "The reservation has been successfully deleted.",
        variant: "default"
      });
    }
  });
  
  // Quick status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number, status: string }) => {
      const response = await apiRequest('PATCH', `/api/reservations/${id}`, { status });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update reservation status');
      }
      return await response.json();
    },
    onSuccess: async () => {
      // Use unified invalidation system to update all related data
      await invalidateRelatedQueries('reservations');
      
      toast({
        title: "Status updated",
        description: "The reservation status has been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update reservation status",
        variant: "destructive"
      });
    }
  });
  
  // Define query key for easier reference
  const reservationsQueryKey = ["/api/reservations"];
  
  // Fetch reservations
  const { data: reservations, isLoading: isLoadingReservations, refetch: refetchReservations } = useQuery<Reservation[]>({
    queryKey: reservationsQueryKey,
  });
  
  // Fetch vehicles to help with filtering
  const { data: vehicles, isLoading: isLoadingVehicles } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });
  
  // Extract vehicle types for filter
  const vehicleTypes = useMemo(() => {
    if (!vehicles) return [];
    
    // Get unique vehicle types
    const types = Array.from(new Set(vehicles.map(v => v.vehicleType).filter(Boolean))) as string[];
    return types.sort();
  }, [vehicles]);
  
  // Filter reservations based on all filters
  const filteredReservations = useMemo(() => {
    if (!reservations) return [];
    
    return reservations.filter(reservation => {
      const searchLower = searchQuery.toLowerCase();
      const vehicle = reservation.vehicle;
      const customer = reservation.customer;
      
      // Search filter
      const matchesSearch = !searchQuery || (
        (vehicle?.licensePlate?.toLowerCase().includes(searchLower)) ||
        (vehicle?.brand?.toLowerCase().includes(searchLower)) ||
        (vehicle?.model?.toLowerCase().includes(searchLower)) ||
        (customer?.name?.toLowerCase().includes(searchLower)) ||
        (customer?.phone?.toLowerCase().includes(searchLower))
      );
      
      // Status filter - handle "overdue" as a special case
      let matchesStatus = false;
      if (statusFilter === "all") {
        matchesStatus = true;
      } else if (statusFilter === "overdue") {
        // Check if this reservation is in the overdue list
        matchesStatus = overdueReservations.some(r => r.id === reservation.id);
      } else {
        matchesStatus = reservation.status.toLowerCase() === statusFilter.toLowerCase();
      }
      
      // Vehicle type filter
      const matchesVehicleType = vehicleTypeFilter === "all" || 
        vehicle?.vehicleType === vehicleTypeFilter;
      
      // Date range filter
      let matchesDateRange = true;
      if (dateRangeFilter !== "all") {
        const startDate = reservation.startDate ? parseISO(reservation.startDate) : null;
        const endDate = reservation.endDate ? parseISO(reservation.endDate) : null;
        
        switch (dateRangeFilter) {
          case "today":
            // Today filter - reservation overlaps with today 
            if (!startDate || !endDate) {
              matchesDateRange = false;
              break;
            }
            
            const todayStart = startOfToday();
            const todayEnd = endOfToday();
            
            matchesDateRange = (
              // Starts today
              (isAfter(startDate, todayStart) || isSameDay(startDate, todayStart)) && 
              (isBefore(startDate, todayEnd) || isSameDay(startDate, todayEnd))
            ) || (
              // Ends today
              (isAfter(endDate, todayStart) || isSameDay(endDate, todayStart)) && 
              (isBefore(endDate, todayEnd) || isSameDay(endDate, todayEnd))
            ) || (
              // Spans over today
              isBefore(startDate, todayStart) && isAfter(endDate, todayEnd)
            );
            break;
          case "week":
            // This week filter - reservation is within the next 7 days
            if (!startDate || !endDate) {
              matchesDateRange = false;
              break;
            }
            
            const weekStart = startOfToday();
            const weekEnd = endOfDay(addDays(today, 7));
            
            matchesDateRange = (
              // Starts during the week
              ((isAfter(startDate, weekStart) || isSameDay(startDate, weekStart)) && 
               (isBefore(startDate, weekEnd) || isSameDay(startDate, weekEnd)))
            ) || (
              // Ends during the week
              ((isAfter(endDate, weekStart) || isSameDay(endDate, weekStart)) && 
               (isBefore(endDate, weekEnd) || isSameDay(endDate, weekEnd)))
            ) || (
              // Spans the entire week
              isBefore(startDate, weekStart) && isAfter(endDate, weekEnd)
            );
            break;
          case "month":
            // This month filter - reservation is within the next 30 days
            if (!startDate || !endDate) {
              matchesDateRange = false;
              break;
            }
            
            const monthStart = startOfToday();
            const monthEnd = endOfDay(addDays(today, 30));
            
            matchesDateRange = (
              // Starts during the month
              ((isAfter(startDate, monthStart) || isSameDay(startDate, monthStart)) && 
               (isBefore(startDate, monthEnd) || isSameDay(startDate, monthEnd)))
            ) || (
              // Ends during the month
              ((isAfter(endDate, monthStart) || isSameDay(endDate, monthStart)) && 
               (isBefore(endDate, monthEnd) || isSameDay(endDate, monthEnd)))
            ) || (
              // Spans the entire month
              isBefore(startDate, monthStart) && isAfter(endDate, monthEnd)
            );
            break;
          case "past":
            matchesDateRange = endDate ? isBefore(endDate, today) : false;
            break;
          case "future":
            matchesDateRange = startDate ? isAfter(startDate, today) : false;
            break;
        }
      }
      
      return matchesSearch && matchesStatus && matchesVehicleType && matchesDateRange;
    });
  }, [reservations, searchQuery, statusFilter, vehicleTypeFilter, dateRangeFilter, today, overdueReservations]);
  
  // Create groups based on the selected grouping
  const reservationGroups = useMemo(() => {
    if (vehicleGrouping === "none" || !filteredReservations.length) {
      return { "All Reservations": filteredReservations };
    }
    
    const groups: Record<string, Reservation[]> = {};
    
    filteredReservations.forEach((reservation) => {
      let groupKey: string;
      
      switch (vehicleGrouping) {
        case "vehicleType":
          groupKey = reservation.vehicle?.vehicleType || "Unknown Type";
          break;
        case "status":
          groupKey = formatReservationStatus(reservation.status);
          break;
        case "month":
          groupKey = format(parseISO(reservation.startDate), "MMMM yyyy");
          break;
        default:
          groupKey = "All Reservations";
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      
      groups[groupKey].push(reservation);
    });
    
    return groups;
  }, [filteredReservations, vehicleGrouping]);
  
  // Helper for status statistics
  const getStatusCounts = useMemo(() => {
    if (!reservations) return { all: 0, booked: 0, picked_up: 0, returned: 0, cancelled: 0, completed: 0 };
    
    const counts = {
      all: reservations.length,
      booked: 0,
      picked_up: 0,
      returned: 0,
      cancelled: 0,
      completed: 0
    };
    
    reservations.forEach(res => {
      const status = res.status.toLowerCase();
      if (counts[status as keyof typeof counts] !== undefined) {
        counts[status as keyof typeof counts]++;
      }
    });
    
    return counts;
  }, [reservations]);
  
  // Define table columns
  const columns: ColumnDef<Reservation>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => <span>#{row.getValue("id")}</span>,
    },
    {
      accessorKey: "vehicle",
      header: "Vehicle",
      cell: ({ row }) => {
        const vehicle = row.original.vehicle;
        const reservation = row.original;
        
        // Handle placeholder spare vehicles
        if (reservation.placeholderSpare) {
          return (
            <div>
              <div className="font-medium flex items-center gap-1">
                <span className="bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded text-xs font-semibold border border-orange-200">
                  TBD
                </span>
                <span className="text-orange-700">Spare Vehicle</span>
                <span className="bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded text-xs font-semibold border border-orange-200">
                  SPARE
                </span>
              </div>
              <div className="text-sm text-gray-500 flex flex-wrap items-center mt-1 gap-2">
                <span className="px-1.5 py-0.5 rounded-full text-xs bg-orange-50 text-orange-800 border border-orange-100">
                  Awaiting assignment
                </span>
                {reservation.type === 'replacement' && reservation.replacementForReservationId && (
                  <span className="px-1.5 py-0.5 rounded-full text-xs bg-orange-50 text-orange-800 border border-orange-100">
                    Spare for #{reservation.replacementForReservationId}
                  </span>
                )}
              </div>
            </div>
          );
        }
        
        return vehicle ? (
          <div>
            <div className="font-medium flex items-center gap-1">
              <span className="bg-primary-100 text-primary-800 px-1.5 py-0.5 rounded text-xs font-semibold">
                {formatLicensePlate(vehicle.licensePlate)}
              </span>
              <span>{vehicle.brand} {vehicle.model}</span>
              {reservation.type === 'replacement' && (
                <span className="bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded text-xs font-semibold border border-orange-200">
                  SPARE
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500 flex flex-wrap items-center mt-1 gap-2">
              {vehicle.vehicleType && (
                <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-100">{vehicle.vehicleType}</span>
              )}
              {vehicle.apkDate && (
                <span className="px-1.5 py-0.5 rounded-full text-xs bg-blue-50 text-blue-800 border border-blue-100">
                  APK: {formatDate(vehicle.apkDate)}
                </span>
              )}
              {reservation.type === 'replacement' && reservation.replacementForReservationId && (
                <span className="px-1.5 py-0.5 rounded-full text-xs bg-orange-50 text-orange-800 border border-orange-100">
                  Spare for #{reservation.replacementForReservationId}
                </span>
              )}
            </div>
          </div>
        ) : "—";
      },
    },
    {
      accessorKey: "customer",
      header: "Customer",
      cell: ({ row }) => {
        const customer = row.original.customer;
        return customer ? (
          <div className="min-w-[200px]">
            <div className="font-medium flex items-center gap-1">
              {customer.debtorNumber && (
                <span className="px-1 py-0.5 bg-green-50 text-green-700 text-xs rounded">
                  #{customer.debtorNumber}
                </span>
              )}
              <span>{customer.name}</span>
            </div>
            <div className="flex flex-col text-sm text-gray-500 mt-1">
              {customer.companyName && (
                <span className="text-xs">{customer.companyName}</span>
              )}
              {customer.phone && (
                <div className="flex items-center gap-1 mt-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  <span>{customer.phone}</span>
                </div>
              )}
              {customer.city && (
                <div className="flex items-center gap-1 mt-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span>{customer.city}</span>
                </div>
              )}
            </div>
          </div>
        ) : "—";
      },
    },
    {
      accessorKey: "period",
      header: "Period",
      cell: ({ row }) => {
        const startDate = row.original.startDate;
        const endDate = row.original.endDate;
        const start = startDate ? parseISO(startDate) : null;
        const end = endDate ? parseISO(endDate) : null;
        
        // Calculate if this is current, upcoming, or past
        const isPast = end ? isBefore(end, today) : false;
        const isCurrent = start && end ? isBefore(start, today) && isAfter(end, today) : false;
        const isUpcoming = start ? isAfter(start, today) : false;
        
        let timeIndicator = null;
        if (isPast) {
          timeIndicator = <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-800">Past</span>;
        } else if (isCurrent) {
          timeIndicator = <span className="px-1.5 py-0.5 rounded-full text-xs bg-green-100 text-green-800">Current</span>;
        } else if (isUpcoming && start) {
          const daysUntil = differenceInDays(start, today);
          if (daysUntil <= 3) {
            timeIndicator = <span className="px-1.5 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">Soon</span>;
          }
        }
        
        return (
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span>{startDate ? formatDate(startDate) : 'TBD'} - {endDate ? formatDate(endDate) : 'TBD'}</span>
              {timeIndicator}
            </div>
            <div className="text-sm text-gray-500">{startDate && endDate ? getDuration(startDate, endDate) : 'Duration TBD'}</div>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        const reservation = row.original;
        let badgeClass = "";
        
        switch (status.toLowerCase()) {
          case "booked":
            badgeClass = "bg-blue-100 text-blue-800 border-blue-200";
            break;
          case "picked_up":
            badgeClass = "bg-orange-100 text-orange-800 border-orange-200";
            break;
          case "returned":
            badgeClass = "bg-purple-100 text-purple-800 border-purple-200";
            break;
          case "completed":
            badgeClass = "bg-green-100 text-green-800 border-green-200";
            break;
          case "cancelled":
            badgeClass = "bg-red-100 text-red-800 border-red-200";
            break;
          default:
            badgeClass = "bg-gray-100 text-gray-800";
        }
        
        return (
          <div className="flex items-center space-x-2">
            <Badge className={badgeClass}>{formatReservationStatus(status)}</Badge>
            {status === "picked_up" && (
            <Button
              variant="ghost"
              size="sm"
              className="p-0 h-7 w-7"
              title="Revert to Booked"
              onClick={() => {
                setSelectedReservation(reservation);
                setStatusDialogOpen(true);
              }}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="14" 
                height="14" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="text-gray-500"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </Button>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "totalPrice",
      header: "Total",
      cell: ({ row }) => {
        const price = row.getValue("totalPrice") as string;
        return formatCurrency(Number(price || 0));
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const reservation = row.original;
        
        return (
          <div className="flex justify-end gap-2">
            <Link href={`/reservations/${reservation.id}`}>
              <Button variant="ghost" size="sm" data-testid="button-view-reservation">
                View
              </Button>
            </Link>
            
            {reservation.status === 'booked' && (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setSelectedReservation(reservation);
                  setPickupDialogOpen(true);
                }}
                data-testid={`button-start-pickup-${reservation.id}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                Start Pickup
              </Button>
            )}
            
            {reservation.status === 'picked_up' && (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setSelectedReservation(reservation);
                  setReturnDialogOpen(true);
                }}
                data-testid={`button-start-return-${reservation.id}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                  <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"></path>
                  <path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9"></path>
                  <path d="M12 3v6"></path>
                </svg>
                Start Return
              </Button>
            )}
            
            <Link href={`/documents/contract/${reservation.id}`}>
              <Button variant="outline" size="sm" data-testid="button-contract">
                Contract
              </Button>
            </Link>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-red-600 hover:text-red-800"
                  data-testid={`button-delete-${reservation.id}`}
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    className="mr-1"
                  >
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Reservation</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this reservation? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => {
                      deleteReservationMutation.mutate(reservation.id);
                    }}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {deleteReservationMutation.isPending ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Deleting...
                      </>
                    ) : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      },
    },
  ];
  
  // Status tabs config
  const statusTabs = [
    { id: "all", label: "All", count: getStatusCounts.all },
    { id: "booked", label: "Booked", count: getStatusCounts.booked },
    { id: "picked_up", label: "Picked Up", count: getStatusCounts.picked_up },
    { id: "returned", label: "Returned", count: getStatusCounts.returned },
    { id: "completed", label: "Completed", count: getStatusCounts.completed },
    { id: "cancelled", label: "Cancelled", count: getStatusCounts.cancelled },
    { id: "overdue", label: "Overdue", count: overdueReservations.length, variant: overdueReservations.length > 0 ? "destructive" : undefined },
  ];
  
  // Date range tabs
  const dateRangeTabs = [
    { id: "all", label: "All Dates" },
    { id: "today", label: "Today" },
    { id: "week", label: "This Week" },
    { id: "month", label: "This Month" },
    { id: "future", label: "Future" },
    { id: "past", label: "Past" },
  ];
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Reservation Management</h1>
        <div className="flex gap-2">
          <Link href="/reservations/calendar">
            <Button variant="outline">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-calendar mr-2">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
              Calendar View
            </Button>
          </Link>
          <ReservationAddDialog />
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Reservations</CardTitle>
              <CardDescription>
                Manage all your vehicle reservations and rental contracts.
              </CardDescription>
            </div>
            {overdueReservations.length > 0 && (
              <Dialog open={overdueDialogOpen} onOpenChange={setOverdueDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" className="flex items-center gap-2" data-testid="button-view-overdue">
                    <AlertTriangle className="h-4 w-4" />
                    {overdueReservations.length} Overdue Rental{overdueReservations.length !== 1 ? 's' : ''}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-600">
                      <AlertTriangle className="h-5 w-5" />
                      Overdue Rentals
                    </DialogTitle>
                    <DialogDescription>
                      These vehicles should have been returned but customer still has them. Contact them to arrange return.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 mt-4">
                    {overdueReservations.map((reservation) => {
                      const daysOverdue = reservation.endDate 
                        ? differenceInDays(new Date(), parseISO(reservation.endDate))
                        : 0;
                      
                      return (
                        <div 
                          key={reservation.id}
                          className="flex items-start justify-between p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800"
                          data-testid={`overdue-reservation-${reservation.id}`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Car className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">
                                {reservation.vehicle?.brand} {reservation.vehicle?.model}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {formatLicensePlate(reservation.vehicle?.licensePlate || '')}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <User className="h-3 w-3" />
                              <span>{reservation.customer?.name || "Unknown Customer"}</span>
                              {reservation.customer?.phone && (
                                <>
                                  <Phone className="h-3 w-3 ml-2" />
                                  <a 
                                    href={`tel:${reservation.customer.phone}`}
                                    className="text-blue-600 hover:underline"
                                    data-testid={`phone-link-${reservation.id}`}
                                  >
                                    {reservation.customer.phone}
                                  </a>
                                </>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                Should have returned: {reservation.endDate ? format(parseISO(reservation.endDate), 'MMM d, yyyy') : 'N/A'}
                              </span>
                            </div>
                          </div>
                          
                          <Badge variant="destructive" className="shrink-0">
                            {daysOverdue} day{daysOverdue !== 1 ? 's' : ''} overdue
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Status Filter Tabs */}
          <div className="mb-6">
            <TabsFilter
              tabs={statusTabs}
              activeTab={statusFilter}
              onChange={setStatusFilter}
            />
          </div>
          
          {/* Date Range Filter Tabs */}
          <div className="mb-6">
            <TabsFilter
              tabs={dateRangeTabs}
              activeTab={dateRangeFilter}
              onChange={setDateRangeFilter}
            />
          </div>
          
          {/* Advanced Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="flex-1 min-w-[280px]">
              <Input
                placeholder="Search vehicle, license plate, customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            
            {vehicleTypes.length > 0 && (
              <div>
                <Select value={vehicleTypeFilter} onValueChange={setVehicleTypeFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Vehicle Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {vehicleTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div>
              <Select value={vehicleGrouping} onValueChange={setVehicleGrouping}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Group By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Grouping</SelectItem>
                  <SelectItem value="vehicleType">Vehicle Type</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Loading State */}
          {(isLoadingReservations || isLoadingVehicles) ? (
            <div className="flex justify-center items-center h-64">
              <svg className="animate-spin h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : filteredReservations.length === 0 ? (
            <div className="flex flex-col items-center justify-center border rounded-lg p-8 text-center">
              <div className="h-12 w-12 rounded-full bg-primary-50 flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-calendar-x text-primary-600">
                  <path d="M21 14V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" />
                  <line x1="16" x2="16" y1="2" y2="6" />
                  <line x1="8" x2="8" y1="2" y2="6" />
                  <line x1="3" x2="21" y1="10" y2="10" />
                  <path d="m17 17 4 4" />
                  <path d="m21 17-4 4" />
                </svg>
              </div>
              <h3 className="font-medium text-lg mb-2">No Reservations Found</h3>
              <p className="text-gray-500 max-w-md mb-4">
                There are no reservations matching your current filters. Try adjusting your search criteria or create a new reservation.
              </p>
              <ReservationAddDialog>
                <Button size="sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus mr-2">
                    <line x1="12" x2="12" y1="5" y2="19" />
                    <line x1="5" x2="19" y1="12" y2="12" />
                  </svg>
                  New Reservation
                </Button>
              </ReservationAddDialog>
            </div>
          ) : (
            // Display grouped or ungrouped reservations
            <div className="space-y-8">
              {Object.entries(reservationGroups).map(([groupName, groupReservations]) => (
                <div key={groupName} className="space-y-4">
                  {vehicleGrouping !== "none" && (
                    <h3 className="text-lg font-medium">
                      {groupName} <span className="text-gray-500 text-sm">({groupReservations.length})</span>
                    </h3>
                  )}
                  <DataTable
                    columns={columns}
                    data={groupReservations}
                    searchColumn="id"
                    pagination
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Change Dialog */}
      {selectedReservation && (
        <StatusChangeDialog
          open={statusDialogOpen}
          onOpenChange={setStatusDialogOpen}
          reservationId={selectedReservation.id}
          initialStatus={selectedReservation.status}
          vehicle={selectedReservation.vehicle ? {
            ...selectedReservation.vehicle,
            currentMileage: selectedReservation.vehicle.currentMileage ?? undefined,
            departureMileage: selectedReservation.vehicle.departureMileage ?? undefined,
            returnMileage: selectedReservation.vehicle.returnMileage ?? undefined
          } : undefined}
          customer={selectedReservation.customer ? {
            ...selectedReservation.customer,
            firstName: selectedReservation.customer.firstName ?? undefined,
            lastName: selectedReservation.customer.lastName ?? undefined,
            companyName: selectedReservation.customer.companyName ?? undefined,
            phone: selectedReservation.customer.phone ?? undefined,
            email: selectedReservation.customer.email ?? undefined
          } : undefined}
          initialFuelData={{
            fuelLevelPickup: selectedReservation.fuelLevelPickup,
            fuelLevelReturn: selectedReservation.fuelLevelReturn,
            fuelCost: selectedReservation.fuelCost ? Number(selectedReservation.fuelCost) : null,
            fuelCardNumber: selectedReservation.fuelCardNumber,
            fuelNotes: selectedReservation.fuelNotes,
          }}
          onStatusChanged={async () => {
            // Force an immediate and complete refetch of all reservation data
            await refetchReservations();
            
            // Also reset any selections or filters that might be affecting the view
            if (selectedReservation) {
              // Find the updated reservation to see if status changed
              const updatedReservations = await queryClient.fetchQuery({ 
                queryKey: ["/api/reservations"] 
              });
              
              // Immediately update the UI with the new data
              queryClient.setQueryData(["/api/reservations"], updatedReservations);
            }
          }}
        />
      )}

      {/* Pickup Dialog */}
      {selectedReservation && (
        <PickupDialog
          open={pickupDialogOpen}
          onOpenChange={setPickupDialogOpen}
          reservation={selectedReservation}
        />
      )}

      {/* Return Dialog */}
      {selectedReservation && (
        <ReturnDialog
          open={returnDialogOpen}
          onOpenChange={setReturnDialogOpen}
          reservation={selectedReservation}
        />
      )}
    </div>
  );
}
