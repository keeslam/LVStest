import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, Car, Clock, CheckCircle, Truck, AlertCircle, User, ArrowRight } from "lucide-react";
import { Reservation, VehicleTransport } from "@shared/schema";
import { formatDate, formatLicensePlate } from "@/lib/format-utils";
import { useState, useEffect } from "react";
import { SpareVehicleAssignmentDialog } from "@/components/reservations/spare-vehicle-assignment-dialog";
import { PickupDialog } from "@/components/reservations/pickup-return-dialogs";
import { apiRequest, invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type ParentReservationInfo = { parentRes: any; customer: any; vehicle: any } | null;
type ParentTransportInfo = { transport: VehicleTransport; vehicle: any } | null;

// A spare reservation's "origin" is either a customer's active rental
// (replacementForReservationId — the normal case, including transport-created
// spares once linked to the rental they're covering) or, only when no active
// rental exists to link to (e.g. a garage pickup on an idle vehicle), the
// Transport that created it (replacementForTransportId). Reservation-origin
// always wins when both are somehow present. One shared renderer instead of
// three near-identical copies keeps that priority consistent everywhere it's
// shown (TBD / Aankomend / Actief tabs).
function SpareOriginInfo({ parentInfo, transportInfo, showReplacingDetail, t }: {
  parentInfo: ParentReservationInfo;
  transportInfo: ParentTransportInfo;
  showReplacingDetail?: boolean;
  t: (key: string, opts?: any) => string;
}) {
  if (parentInfo) {
    return (
      <div className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
        <User className="w-3 h-3" />
        <span className="font-medium">{parentInfo.customer?.name || t('spareWidget.unknownCustomer')}</span>
        {showReplacingDetail && parentInfo.vehicle && (
          <>
            <ArrowRight className="w-3 h-3 mx-1" />
            <span className="text-gray-500">
              {t('spareWidget.replacing', { brand: parentInfo.vehicle.brand, model: parentInfo.vehicle.model })}
              {parentInfo.vehicle.licensePlate && ` (${formatLicensePlate(parentInfo.vehicle.licensePlate)})`}
            </span>
          </>
        )}
      </div>
    );
  }
  if (transportInfo) {
    return (
      <div className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
        <Truck className="w-3 h-3" />
        {t('spareWidget.viaTransport', { id: transportInfo.transport.id })}
      </div>
    );
  }
  return null;
}

export function SpareVehicleAssignmentsWidget() {
  const { t } = useTranslation("dashboard");
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

  // Get all transports — a spare reservation created from a standalone Transport
  // (swap/tow/etc.) links back via replacementForTransportId instead of the
  // customer-rental-oriented replacementForReservationId.
  const { data: allTransports } = useQuery<VehicleTransport[]>({
    queryKey: ["/api/transports"],
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

  // Create a map of transports by ID for looking up transport-linked spares
  const transportMap = (allTransports ?? []).reduce((map: Record<number, VehicleTransport>, transport) => {
    map[transport.id] = transport;
    return map;
  }, {} as Record<number, VehicleTransport>);

  // Helper to get parent reservation info (the rental being replaced)
  const getParentReservationInfo = (spare: Reservation) => {
    if (!spare.replacementForReservationId) return null;
    const parentRes = reservationMap[spare.replacementForReservationId];
    if (!parentRes) return null;

    const customer = parentRes.customerId ? customerMap[parentRes.customerId] : null;
    const vehicle = parentRes.vehicleId ? vehicleMap[parentRes.vehicleId] : null;

    return { parentRes, customer, vehicle };
  };

  // Helper to get parent transport info — spares created from a standalone
  // Transport (swap/tow/etc.) rather than a customer rental.
  const getParentTransportInfo = (spare: Reservation) => {
    if (!spare.replacementForTransportId) return null;
    const transport = transportMap[spare.replacementForTransportId];
    if (!transport) return null;
    return { transport, vehicle: transport.vehicleId != null ? vehicleMap[transport.vehicleId] : null };
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
        title: t('spareWidget.statusUpdatedTitle'),
        description: t('spareWidget.statusUpdatedDescription')
      });
      // Invalidate relevant queries
      invalidateRelatedQueries('reservations');
    },
    onError: (error) => {
      toast({
        title: t('common:status.error'),
        description: t('spareWidget.statusUpdateFailed'),
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
      case 'ready': return t('spareWidget.statusReady');
      case 'picked_up': return t('spareWidget.statusPickedUp');
      case 'returned': return t('spareWidget.statusReturned');
      default: return t('spareWidget.statusAssigned');
    }
  };

  return (
    <>
      <Card className="overflow-hidden h-full">
        <CardHeader className="bg-orange-500 py-3 px-4 flex-row justify-between items-center space-y-0">
          <CardTitle className="text-base font-medium text-gray-900">
            {t('spareWidget.title')}
          </CardTitle>
          <Car className="w-5 h-5 text-gray-900" />
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pending" className="relative text-xs px-2">
                {t('spareWidget.tabTbd')}
                {sortedPending.length > 0 && (
                  <Badge variant="destructive" className="ml-1 px-1 py-0 text-xs">
                    {sortedPending.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="assigned" className="relative text-xs px-2">
                {t('spareWidget.tabUpcoming')}
                {upcomingAssigned.length > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1 py-0 text-xs">
                    {upcomingAssigned.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="active" className="relative text-xs px-2">
                {t('spareWidget.tabActive')}
                {activeSpares.length > 0 && (
                  <Badge variant="default" className="ml-1 px-1 py-0 text-xs bg-blue-500">
                    {activeSpares.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="pending" className="p-4 space-y-3">
              <div className="text-sm text-gray-600 mb-3">
                {t('spareWidget.pendingDescription')}
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
                    {t('spareWidget.allAssigned')}
                  </div>
                ) : (
                  sortedPending.map(placeholder => {
                    const parentInfo = getParentReservationInfo(placeholder);
                    const transportInfo = getParentTransportInfo(placeholder);
                    return (
                    <div key={placeholder.id} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-md">
                      <div className="flex items-center space-x-3">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        <div>
                          <div className="font-medium text-sm text-red-700 dark:text-red-400">
                            {t('spareWidget.tbdSpareVehicle')}
                          </div>
                          <SpareOriginInfo parentInfo={parentInfo} transportInfo={transportInfo} t={t} />
                          <div className="text-xs text-gray-500">
                            {t('spareWidget.needed', { date: formatDate(placeholder.startDate) })}
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
                        {t('spareWidget.assignVehicle')}
                      </Button>
                    </div>
                  );})
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="assigned" className="p-4 space-y-3">
              <div className="text-sm text-gray-600 mb-3">
                {t('spareWidget.upcomingDescription')}
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
                    {t('spareWidget.noUpcomingPickups')}
                  </div>
                ) : (
                  upcomingAssigned.map(spare => {
                    const parentInfo = getParentReservationInfo(spare);
                    const transportInfo = getParentTransportInfo(spare);
                    return (
                    <div key={spare.id} className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-md">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-3">
                          {getStatusIcon(spare.spareVehicleStatus ?? undefined)}
                          <div>
                            <div className="font-medium text-sm">
                              {spare.vehicleId && vehicleMap[spare.vehicleId]
                                ? `${vehicleMap[spare.vehicleId].brand} ${vehicleMap[spare.vehicleId].model}`
                                : t('spareWidget.spareVehicleWithId', { id: spare.vehicleId })
                              }
                              {spare.vehicleId && vehicleMap[spare.vehicleId]?.licensePlate && (
                                <span className="ml-2 text-xs text-gray-500">
                                  {formatLicensePlate(vehicleMap[spare.vehicleId].licensePlate)}
                                </span>
                              )}
                            </div>
                            <SpareOriginInfo parentInfo={parentInfo} transportInfo={transportInfo} showReplacingDetail t={t} />
                            <div className="text-xs text-gray-500">
                              {t('spareWidget.serviceDates', { date: formatDate(spare.startDate) })}
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
                              {t('spareWidget.startPickup')}
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
                              {t('spareWidget.markPickedUp')}
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
                              {t('spareWidget.markReturned')}
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
                {t('spareWidget.activeDescription')}
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
                    {t('spareWidget.noActiveSpares')}
                  </div>
                ) : (
                  activeSpares.map(spare => {
                    const parentInfo = getParentReservationInfo(spare);
                    const transportInfo = getParentTransportInfo(spare);
                    return (
                    <div key={spare.id} className="p-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-md">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-3">
                          <Truck className="w-4 h-4 text-blue-500" />
                          <div>
                            <div className="font-medium text-sm">
                              {spare.vehicleId && vehicleMap[spare.vehicleId]
                                ? `${vehicleMap[spare.vehicleId].brand} ${vehicleMap[spare.vehicleId].model}`
                                : t('spareWidget.spareVehicleWithId', { id: spare.vehicleId })
                              }
                              {spare.vehicleId && vehicleMap[spare.vehicleId]?.licensePlate && (
                                <span className="ml-2 text-xs text-gray-500">
                                  {formatLicensePlate(vehicleMap[spare.vehicleId].licensePlate)}
                                </span>
                              )}
                            </div>
                            <SpareOriginInfo parentInfo={parentInfo} transportInfo={transportInfo} t={t} />
                            <div className="text-xs text-gray-500">
                              {t('spareWidget.inUseSince', { date: formatDate(spare.startDate) })}
                              {spare.endDate && t('spareWidget.expectedReturn', { date: formatDate(spare.endDate) })}
                            </div>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                          {t('spareWidget.inUse')}
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
                          {t('spareWidget.markReturned')}
                        </Button>
                      </div>
                    </div>
                  );})
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
          key={`pickup-${selectedSpareForPickup.id}`}
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