import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateByPrefix } from "@/lib/queryClient";
import { Vehicle, Reservation } from "@shared/schema";
import { StatusChangeDialog } from "@/components/reservations/status-change-dialog";
import { VehicleSelector } from "@/components/ui/vehicle-selector";
import { formatDate, formatReservationStatus } from "@/lib/format-utils";
import { displayLicensePlate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarClock, RotateCw, Search, Wrench, User } from "lucide-react";
import { Input } from "@/components/ui/input";

interface VehicleReservationsStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChanged?: () => void;
}

export function VehicleReservationsStatusDialog({
  open,
  onOpenChange,
  onStatusChanged,
}: VehicleReservationsStatusDialogProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [selectedReservationId, setSelectedReservationId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"upcoming" | "all" | "past">("upcoming");
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Reset vehicle selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedVehicleId("");
      setSelectedReservationId(null);
    }
  }, [open]);
  
  // Fetch all vehicles
  const { data: vehicles, isLoading: isLoadingVehicles } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
    enabled: open, // Only fetch when dialog is open
  });
  
  // Fetch reservations for the selected vehicle
  const { data: vehicleReservations, isLoading: isLoadingReservations } = useQuery<Reservation[]>({
    queryKey: [`/api/reservations/vehicle/${selectedVehicleId}`],
    enabled: !!selectedVehicleId && open, // Only fetch when a vehicle is selected and dialog is open
  });
  
  // Filter reservations based on active tab
  const filteredReservations = React.useMemo(() => {
    if (!vehicleReservations) return [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Make sure we have proper Date objects
    const reservationsWithDates = vehicleReservations.map(res => ({
      ...res,
      startDateObj: res.startDate ? new Date(res.startDate) : null,
      endDateObj: res.endDate ? new Date(res.endDate) : null,
    }));
    
    switch (activeTab) {
      case "upcoming":
        return reservationsWithDates.filter(res => 
          (res.status === "booked" || res.status === "picked_up") &&
          (res.startDateObj === null || res.startDateObj >= today)
        );
      case "past":
        return reservationsWithDates.filter(res => 
          res.endDateObj !== null && res.endDateObj < today
        );
      case "all":
      default:
        return reservationsWithDates;
    }
  }, [vehicleReservations, activeTab]);
  
  // Handle reservation status change success
  const handleReservationStatusChanged = () => {
    // Invalidate all relevant queries
    invalidateByPrefix(`/api/reservations/vehicle/${selectedVehicleId}`);
    
    // Set selected reservation ID to null
    setSelectedReservationId(null);
    
    // Show success toast
    toast({
      title: "Status Updated",
      description: `Reservation status has been updated successfully.`,
    });
    
    // Call the callback if provided
    if (onStatusChanged) {
      onStatusChanged();
    }
  };
  
  // Find the selected vehicle and reservation objects
  const selectedVehicle = vehicles?.find(v => v.id.toString() === selectedVehicleId);
  const selectedReservation = vehicleReservations?.find(r => r.id === selectedReservationId);
  
  // Get customer for the selected reservation
  const customer = selectedReservation?.customer;
  
  return (
    <>
      {selectedReservationId && selectedReservation && (
        <StatusChangeDialog
          reservationId={selectedReservationId}
          open={!!selectedReservationId}
          onOpenChange={(open) => {
            if (!open) setSelectedReservationId(null);
          }}
          initialStatus={selectedReservation.status || ""}
          vehicle={selectedVehicle}
          customer={customer}
          initialFuelData={{
            fuelLevelPickup: selectedReservation.fuelLevelPickup,
            fuelLevelReturn: selectedReservation.fuelLevelReturn,
            fuelCost: selectedReservation.fuelCost ? Number(selectedReservation.fuelCost) : null,
            fuelCardNumber: selectedReservation.fuelCardNumber,
            fuelNotes: selectedReservation.fuelNotes,
          }}
          onStatusChanged={handleReservationStatusChanged}
        />
      )}
      
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl fixed top-[10vh] translate-y-0 max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change Reservation Status by Vehicle</DialogTitle>
            <DialogDescription>
              First select a vehicle, then choose a reservation to change its status.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 gap-4 py-4">
            {/* Vehicle Selector - placed at the top with more visible styling */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Select Vehicle</h3>
              {isLoadingVehicles ? (
                <div className="flex items-center justify-center p-4">
                  <RotateCw className="h-5 w-5 animate-spin text-primary-600 mr-2" />
                  <span>Loading vehicles...</span>
                </div>
              ) : (
                <div className="border rounded-md p-3 bg-slate-50 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by license plate, brand, or model"
                      value={vehicleSearchQuery}
                      onChange={(e) => setVehicleSearchQuery(e.target.value.toLowerCase())}
                      className="pl-8 bg-white"
                    />
                    {vehicleSearchQuery && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="absolute right-0 top-0 h-full px-3" 
                        onClick={() => setVehicleSearchQuery("")}
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                  <VehicleSelector
                    vehicles={vehicles?.filter(v => {
                      if (!vehicleSearchQuery) return true;
                      
                      const formattedLicensePlate = (v.licensePlate || '').replace(/-/g, '').toLowerCase();
                      const formattedQuery = vehicleSearchQuery.replace(/-/g, '').toLowerCase();
                      
                      return formattedLicensePlate.includes(formattedQuery) || 
                        (v.brand?.toLowerCase() || '').includes(vehicleSearchQuery) || 
                        (v.model?.toLowerCase() || '').includes(vehicleSearchQuery);
                    }) || []}
                    value={selectedVehicleId}
                    onChange={setSelectedVehicleId}
                    placeholder="Select a vehicle to view its reservations"
                  />
                </div>
              )}
            </div>
            
            {/* Reservations List */}
            {selectedVehicleId && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Reservations</h3>
                  <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "upcoming" | "all" | "past")}>
                    <TabsList className="grid w-auto grid-cols-3">
                      <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                      <TabsTrigger value="all">All</TabsTrigger>
                      <TabsTrigger value="past">Past</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                
                {isLoadingReservations ? (
                  <div className="flex items-center justify-center p-8">
                    <RotateCw className="h-5 w-5 animate-spin text-primary-600 mr-2" />
                    <span>Loading reservations...</span>
                  </div>
                ) : filteredReservations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    <div className="text-muted-foreground mb-2">No {activeTab} reservations found for this vehicle.</div>
                    {activeTab !== "all" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveTab("all")}
                      >
                        View all reservations
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <div className="max-h-[400px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-slate-100 border-b">
                            <th className="px-4 py-3 text-left font-medium">Type</th>
                            <th className="px-4 py-3 text-left font-medium">ID</th>
                            <th className="px-4 py-3 text-left font-medium">Customer</th>
                            <th className="px-4 py-3 text-left font-medium">Period</th>
                            <th className="px-4 py-3 text-left font-medium">Status</th>
                            <th className="px-4 py-3 text-center font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredReservations.map((reservation) => {
                            const isMaintenance = reservation.type === 'maintenance_block';
                            return (
                              <tr key={reservation.id} className={`border-t hover:bg-muted/20 ${isMaintenance ? 'bg-orange-50/30' : ''}`}>
                                <td className="px-4 py-3">
                                  {isMaintenance ? (
                                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                                      <Wrench className="h-3 w-3" />
                                      Maintenance
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                                      <User className="h-3 w-3" />
                                      Rental
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">#{reservation.id}</td>
                                <td className="px-4 py-3 font-medium">
                                  {reservation.customer?.name || 'Unknown'}
                                </td>
                                <td className="px-4 py-3">
                                  {reservation.startDate ? (
                                    <>
                                      {formatDate(reservation.startDate)} - {reservation.endDate ? formatDate(reservation.endDate) : 'Open-ended'}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">No dates specified</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`
                                    inline-block rounded-full px-2 py-1 text-xs border
                                    ${reservation.status === 'booked' ? 'bg-blue-100 text-blue-800 border-blue-200' : ''}
                                    ${reservation.status === 'picked_up' ? 'bg-orange-100 text-orange-800 border-orange-200' : ''}
                                    ${reservation.status === 'returned' ? 'bg-purple-100 text-purple-800 border-purple-200' : ''}
                                    ${reservation.status === 'completed' ? 'bg-green-100 text-green-800 border-green-200' : ''}
                                    ${reservation.status === 'cancelled' ? 'bg-red-100 text-red-800 border-red-200' : ''}
                                  `}>
                                    {formatReservationStatus(reservation.status || '')}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {reservation.status === 'picked_up' ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setSelectedReservationId(reservation.id)}
                                      className="bg-primary-50 hover:bg-primary-100 text-primary-600"
                                    >
                                      <CalendarClock className="mr-1 h-3 w-3" />
                                      Revert to Booked
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}