import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, Car, Clock, CheckCircle, Truck, AlertCircle, User, ArrowRight } from "lucide-react";
import { Reservation } from "@shared/schema";
import { formatDate, formatLicensePlate } from "@/lib/format-utils";
import { useState, useEffect } from "react";
import { SpareVehicleAssignmentDialog } from "@/components/reservations/spare-vehicle-assignment-dialog";
import { PickupDialog } from "@/components/reservations/pickup-return-dialogs";
import { apiRequest, invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function SpareVehicleAssignmentsWidget() {
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [selectedPlaceholder, setSelectedPlaceholder] = useState<Reservation | null>(null);
  const [pickupDialogOpen, setPickupDialogOpen] = useState(false);
  const [selectedSpareForPickup, setSelectedSpareForPickup] = useState<Reservation | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get TBD spare vehicles (placeholder reservations needing assignment)
  // Using 30 days lookahead to show all upcoming placeholders
  const { data: pendingAssignments, isLoading: isLoadingPending } = useQuery<Reservation[]>({
    queryKey: ["/api/placeholder-reservations/needing-assignment?daysAhead=30"],
  });

  // Get all reservations to filter for assigned spare vehicles
  const { data: allReservations, isLoading: isLoadingAssigned } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
  });

  // Get all vehicles for displaying vehicle details
  const { data: allVehicles } = useQuery<any[]>({
    queryKey: ["/api/vehicles"],
  });

  // Get all customers for displaying customer info
  const { data: allCustomers } = useQuery<any[]>({
    queryKey: ["/api/customers"],
  });

  // Create a map of vehicles by ID for easy lookup
  const vehicleMap = (allVehicles ?? []).reduce((map: any, vehicle: any) => {
    map[vehicle.id] = vehicle;
    return map;
  }, {});

  // Create a map of customers by ID for easy lookup
  const customerMap = (allCustomers ?? []).reduce((map: any, customer: any) => {
    map[customer.id] = customer;
    return map;
  }, {});

  // Create a map of reservations by ID for looking up parent reservations
  const reservationMap = (allReservations ?? []).reduce((map: any, reservation: any) => {
    map[reservation.id] = reservation;
    return map;
  }, {});

  // Helper to get parent reservation info (the rental being replaced)
  const getParentReservationInfo = (spare: Reservation) => {
    if (!spare.replacementForReservationId) return null;
    const parentRes = reservationMap[spare.replacementForReservationId];
    if (!parentRes) return null;
    
    const customer = parentRes.customerId ? customerMap[parentRes.customerId] : null;
    const vehicle = parentRes.vehicleId ? vehicleMap[parentRes.vehicleId] : null;
    
    return { parentRes, customer, vehicle };
  };

  // Sort pending assignments by start date (closest first)
  const sortedPending = [...(pendingAssignments ?? [])].sort((a, b) => 
    new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
  
  // Auto-open spare assignment dialog from sessionStorage (from notifications)
  useEffect(() => {
    const checkForOpenSpare = () => {
      // Check sessionStorage for spare assignment flag
      const openSpareId = sessionStorage.getItem('openSpare');
      
      if (!openSpareId) return;
      
      // Clear immediately to prevent multiple triggers
      sessionStorage.removeItem('openSpare');
      
      console.log('[SpareVehicleAssignments] Found openSpare in sessionStorage:', openSpareId);
      
      if (!pendingAssignments || pendingAssignments.length === 0) {
        console.log('[SpareVehicleAssignments] No pending assignments loaded yet');
        return;
      }
      
      // Find the placeholder reservation by ID
      const placeholder = pendingAssignments.find(p => p.id === parseInt(openSpareId));
      
      if (placeholder) {
        console.log('[SpareVehicleAssignments] Opening spare assignment dialog for placeholder:', placeholder.id);
        setSelectedPlaceholder(placeholder);
        setAssignmentDialogOpen(true);
      } else {
        console.log('[SpareVehicleAssignments] Placeholder not found in pending assignments');
      }
    };
    
    // Check immediately when component mounts or data changes
    checkForOpenSpare();
    
    // Also listen for storage events (triggered when clicking notification while already on dashboard)
    window.addEventListener('storage', checkForOpenSpare);
    
    return () => {
      window.removeEventListener('storage', checkForOpenSpare);
    };
  }, [pendingAssignments]);

  // Filter all reservations for assigned spare vehicles with upcoming pickup dates
  // Only show pickups within the next 7 days or overdue (start date has passed)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  
  const upcomingAssigned = [...(allReservations ?? [])]
    .filter(spare => {
      if (spare.type !== 'replacement') return false; // Must be a replacement reservation
      if (!spare.vehicleId) return false; // Must have a vehicle assigned (not TBD anymore)
      if (spare.status === 'cancelled') return false;
      // Only show assigned or ready status (not picked_up or returned)
      if (spare.spareVehicleStatus && spare.spareVehicleStatus !== 'assigned' && spare.spareVehicleStatus !== 'ready') return false;
      
      // Only show if pickup date is within 7 days or already past (overdue)
      const startDate = new Date(spare.startDate);
      startDate.setHours(0, 0, 0, 0);
      return startDate <= sevenDaysFromNow;
    })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  // Filter for active spare vehicles (currently picked up / in use)
  const activeSpares = [...(allReservations ?? [])]
    .filter(spare => {
      if (spare.type !== 'replacement') return false;
      if (!spare.vehicleId) return false;
      if (spare.status === 'cancelled') return false;
      return spare.spareVehicleStatus === 'picked_up';
    })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  // Update spare vehicle status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ reservationId, status }: { reservationId: number; status: string }) => {
      return await apiRequest("PATCH", `/api/reservations/${reservationId}/spare-status`, {
        spareVehicleStatus: status
      });
    },
    onSuccess: () => {
      toast({
        title: "Status Updated",
        description: "Spare vehicle status has been updated successfully."
      });
      // Invalidate relevant queries
      invalidateRelatedQueries('reservations');
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update spare vehicle status.",
        variant: "destructive"
      });
    }
  });

  const handleAssignClick = (placeholder: Reservation) => {
    setSelectedPlaceholder(placeholder);
    setAssignmentDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setAssignmentDialogOpen(open);
    if (!open) setSelectedPlaceholder(null);
  };

  const handleStatusChange = (reservationId: number, status: string) => {
    updateStatusMutation.mutate({ reservationId, status });
  };

  const handleStartPickup = (spare: Reservation) => {
    // Enrich the spare reservation with vehicle data for the pickup dialog
    const vehicleData = spare.vehicleId ? vehicleMap[spare.vehicleId] : null;
    const enrichedSpare = vehicleData ? { ...spare, vehicle: vehicleData } : spare;
    setSelectedSpareForPickup(enrichedSpare);
    setPickupDialogOpen(true);
  };

  const handlePickupDialogClose = (open: boolean) => {
    setPickupDialogOpen(open);
    if (!open) setSelectedSpareForPickup(null);
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'ready': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'picked_up': return <Truck className="w-4 h-4 text-blue-500" />;
      case 'returned': return <CheckCircle className="w-4 h-4 text-gray-500" />;
      default: return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusBadgeVariant = (status?: string) => {
    switch (status) {
      case 'ready': return 'default';
      case 'picked_up': return 'secondary';
      case 'returned': return 'outline';
      default: return 'secondary';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'ready': return 'Ready';
      case 'picked_up': return 'Picked Up';
      case 'returned': return 'Returned';
      default: return 'Assigned';
    }
  };

  return (
    <>
      <Card className="overflow-hidden h-full">
        <CardHeader className="bg-orange-500 py-3 px-4 flex-row justify-between items-center space-y-0">
          <CardTitle className="text-base font-medium text-gray-900">
            Spare Vehicle Management
          </CardTitle>
          <Car className="w-5 h-5 text-gray-900" />
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pending" className="relative text-xs px-2">
                TBD
                {sortedPending.length > 0 && (
                  <Badge variant="destructive" className="ml-1 px-1 py-0 text-xs">
                    {sortedPending.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="assigned" className="relative text-xs px-2">
                Upcoming
                {upcomingAssigned.length > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1 py-0 text-xs">
                    {upcomingAssigned.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="active" className="relative text-xs px-2">
                Active
                {activeSpares.length > 0 && (
                  <Badge variant="default" className="ml-1 px-1 py-0 text-xs bg-blue-500">
                    {activeSpares.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="pending" className="p-4 space-y-3">
              <div className="text-sm text-gray-600 mb-3">
                Vehicles needed but not yet assigned to specific spare vehicles
              </div>
              
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {isLoadingPending ? (
                  <div className="flex justify-center p-4">
                    <svg className="animate-spin h-5 w-5 text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                  </div>
                ) : sortedPending.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-md">
                    <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    All spare vehicles assigned
                  </div>
                ) : (
                  sortedPending.map(placeholder => (
                    <div key={placeholder.id} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-md">
                      <div className="flex items-center space-x-3">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        <div>
                          <div className="font-medium text-sm text-red-700 dark:text-red-400">
                            TBD Spare Vehicle
                          </div>
                          <div className="text-xs text-gray-500">
                            Needed: {formatDate(placeholder.startDate)}
                            {placeholder.endDate && ` - ${formatDate(placeholder.endDate)}`}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAssignClick(placeholder)}
                        className="text-xs bg-red-500 text-white hover:bg-red-600 border-red-500"
                      >
                        Assign Vehicle
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="assigned" className="p-4 space-y-3">
              <div className="text-sm text-gray-600 mb-3">
                Spare vehicles to be picked up within the next 7 days
              </div>
              
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {isLoadingAssigned ? (
                  <div className="flex justify-center p-4">
                    <svg className="animate-spin h-5 w-5 text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                  </div>
                ) : upcomingAssigned.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-md">
                    <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    No upcoming pickups needed
                  </div>
                ) : (
                  upcomingAssigned.map(spare => {
                    const parentInfo = getParentReservationInfo(spare);
                    return (
                    <div key={spare.id} className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-md">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-3">
                          {getStatusIcon(spare.spareVehicleStatus ?? undefined)}
                          <div>
                            <div className="font-medium text-sm">
                              {spare.vehicleId && vehicleMap[spare.vehicleId] 
                                ? `${vehicleMap[spare.vehicleId].brand} ${vehicleMap[spare.vehicleId].model}`
                                : `Spare Vehicle (ID: ${spare.vehicleId})`
                              }
                              {spare.vehicleId && vehicleMap[spare.vehicleId]?.licensePlate && (
                                <span className="ml-2 text-xs text-gray-500">
                                  {formatLicensePlate(vehicleMap[spare.vehicleId].licensePlate)}
                                </span>
                              )}
                            </div>
                            {parentInfo && (
                              <div className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                                <User className="w-3 h-3" />
                                <span className="font-medium">{parentInfo.customer?.name || 'Unknown'}</span>
                                {parentInfo.vehicle && (
                                  <>
                                    <ArrowRight className="w-3 h-3 mx-1" />
                                    <span className="text-gray-500">
                                      replacing {parentInfo.vehicle.brand} {parentInfo.vehicle.model}
                                      {parentInfo.vehicle.licensePlate && ` (${formatLicensePlate(parentInfo.vehicle.licensePlate)})`}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                            <div className="text-xs text-gray-500">
                              Service dates: {formatDate(spare.startDate)}
                              {spare.endDate && ` - ${formatDate(spare.endDate)}`}
                            </div>
                          </div>
                        </div>
                        <Badge variant={getStatusBadgeVariant(spare.spareVehicleStatus ?? undefined)}>
                          {getStatusLabel(spare.spareVehicleStatus ?? undefined)}
                        </Badge>
                      </div>
                      
                      {spare.spareVehicleStatus !== 'returned' && (
                        <div className="flex gap-2 mt-2">
                          {spare.spareVehicleStatus === 'assigned' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStartPickup(spare)}
                              disabled={updateStatusMutation.isPending}
                              className="text-xs"
                              data-testid="button-start-pickup-spare"
                            >
                              Start Pickup
                            </Button>
                          )}
                          {spare.spareVehicleStatus === 'ready' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatusChange(spare.id, 'picked_up')}
                              disabled={updateStatusMutation.isPending}
                              className="text-xs"
                            >
                              Mark Picked Up
                            </Button>
                          )}
                          {spare.spareVehicleStatus === 'picked_up' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatusChange(spare.id, 'returned')}
                              disabled={updateStatusMutation.isPending}
                              className="text-xs"
                            >
                              Mark Returned
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );})
                )}
              </div>
            </TabsContent>

            <TabsContent value="active" className="p-4 space-y-3">
              <div className="text-sm text-gray-600 mb-3">
                Spare vehicles currently in use by customers
              </div>
              
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {isLoadingAssigned ? (
                  <div className="flex justify-center p-4">
                    <svg className="animate-spin h-5 w-5 text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                  </div>
                ) : activeSpares.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-md">
                    <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    No active spare vehicles
                  </div>
                ) : (
                  activeSpares.map(spare => (
                    <div key={spare.id} className="p-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-md">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-3">
                          <Truck className="w-4 h-4 text-blue-500" />
                          <div>
                            <div className="font-medium text-sm">
                              {spare.vehicleId && vehicleMap[spare.vehicleId] 
                                ? `${vehicleMap[spare.vehicleId].brand} ${vehicleMap[spare.vehicleId].model}`
                                : `Spare Vehicle (ID: ${spare.vehicleId})`
                              }
                              {spare.vehicleId && vehicleMap[spare.vehicleId]?.licensePlate && (
                                <span className="ml-2 text-xs text-gray-500">
                                  {formatLicensePlate(vehicleMap[spare.vehicleId].licensePlate)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              In use since: {formatDate(spare.startDate)}
                              {spare.endDate && ` • Expected return: ${formatDate(spare.endDate)}`}
                            </div>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                          In Use
                        </Badge>
                      </div>
                      
                      <div className="flex gap-2 mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusChange(spare.id, 'returned')}
                          disabled={updateStatusMutation.isPending}
                          className="text-xs"
                          data-testid="button-mark-returned-spare"
                        >
                          Mark Returned
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Spare Vehicle Assignment Dialog */}
      {selectedPlaceholder && (
        <SpareVehicleAssignmentDialog
          open={assignmentDialogOpen}
          onOpenChange={handleDialogClose}
          placeholderReservations={[selectedPlaceholder]}
        />
      )}

      {/* Pickup Dialog for Spare Vehicles */}
      {selectedSpareForPickup && (
        <PickupDialog
          open={pickupDialogOpen}
          onOpenChange={handlePickupDialogClose}
          reservation={selectedSpareForPickup}
          onSuccess={() => {
            invalidateRelatedQueries('reservations');
          }}
        />
      )}
    </>
  );
}