import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VehicleSelector } from "@/components/ui/vehicle-selector";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest , invalidateByPrefix } from "@/lib/queryClient";
import type { Reservation, Vehicle } from "@shared/schema";
import { Car, Fuel, Calendar, FileText, ClipboardCheck, ExternalLink, CheckCircle2, Edit, Trash2, Upload, AlertTriangle } from "lucide-react";
import { MileageOverridePasswordDialog } from "@/components/mileage-override-password-dialog";
import InteractiveDamageCheck from "@/pages/interactive-damage-check";
import { VehicleRemarksWarningDialog } from "@/components/vehicles/vehicle-remarks-warning-dialog";

interface PickupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation;
  onSuccess?: () => void | Promise<void>;
}

export function PickupDialog({ open, onOpenChange, reservation, onSuccess }: PickupDialogProps) {
  const { toast } = useToast();
  const isTBDSpare = reservation.placeholderSpare && !reservation.vehicleId;
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [pickupMileage, setPickupMileage] = useState(
    reservation.vehicle?.currentMileage?.toString() || ""
  );
  const [fuelLevelPickup, setFuelLevelPickup] = useState(
    reservation.vehicle?.currentFuelLevel || "Full"
  );
  const [pickupDate, setPickupDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [pickupNotes, setPickupNotes] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [isDuplicateContract, setIsDuplicateContract] = useState(false);
  const [isHighContractNumber, setIsHighContractNumber] = useState(false);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateReservationInfo, setDuplicateReservationInfo] = useState<any>(null);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingMileage, setPendingMileage] = useState<number | null>(null);
  const [overridePassword, setOverridePassword] = useState<string>("");
  const [damageCheckDialogOpen, setDamageCheckDialogOpen] = useState(false);
  const [editingDamageCheckId, setEditingDamageCheckId] = useState<number | null>(null);
  const [uploadingPaperDamageCheck, setUploadingPaperDamageCheck] = useState(false);
  const [uploadedPaperCheckIds, setUploadedPaperCheckIds] = useState<number[]>([]);
  
  // Vehicle remarks warning state - shown when vehicle has remarks before pickup
  const [remarksWarningOpen, setRemarksWarningOpen] = useState(false);
  const [remarksAcknowledged, setRemarksAcknowledged] = useState(false);
  
  // Delete confirmation dialog states
  const [deletePickupDamageCheckDialogOpen, setDeletePickupDamageCheckDialogOpen] = useState(false);
  const [pickupDamageCheckToDelete, setPickupDamageCheckToDelete] = useState<number | null>(null);
  const [deletePickupPaperCheckDialogOpen, setDeletePickupPaperCheckDialogOpen] = useState(false);
  const [pickupPaperCheckToDelete, setPickupPaperCheckToDelete] = useState<number | null>(null);

  // Cleanup function to delete uploaded paper checks on cancel
  const cleanupUploadedPaperChecks = async () => {
    for (const docId of uploadedPaperCheckIds) {
      try {
        await fetch(`/api/documents/${docId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      } catch (error) {
        console.error('Failed to cleanup paper damage check:', error);
      }
    }
    setUploadedPaperCheckIds([]);
  };

  // Fetch available vehicles for TBD spare selection
  const { data: vehicles } = useQuery<any[]>({
    queryKey: ['/api/vehicles/available'],
    enabled: open && isTBDSpare,
  });

  // Fetch existing damage checks for this reservation
  const { data: damageChecks, refetch: refetchDamageChecks } = useQuery<any[]>({
    queryKey: ['/api/interactive-damage-checks', 'reservation', reservation.id],
    queryFn: async () => {
      const response = await fetch(`/api/interactive-damage-checks/reservation/${reservation.id}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: open && !!reservation.id,
  });

  // Fetch paper damage check documents for this reservation
  const { data: reservationDocuments, refetch: refetchDocuments } = useQuery<any[]>({
    queryKey: [`/api/documents/reservation/${reservation.id}`],
    queryFn: async () => {
      const response = await fetch(`/api/documents/reservation/${reservation.id}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: open && !!reservation.id,
  });

  const pickupDamageChecks = damageChecks?.filter((check: any) => check.checkType === 'pickup') || [];
  const pickupPaperDamageChecks = reservationDocuments?.filter((doc: any) => doc.documentType === 'Damage Check (Pickup - Paper)') || [];
  
  // Get selected vehicle data
  const selectedVehicle = vehicles?.find(v => v.id === selectedVehicleId);

  // Reset form fields and auto-generate contract number when dialog opens
  useEffect(() => {
    async function initializeDialog() {
      if (open && reservation) {
        // Reset all form fields first
        setSelectedVehicleId(null);
        setPickupMileage(reservation.vehicle?.currentMileage?.toString() || "");
        setFuelLevelPickup(reservation.vehicle?.currentFuelLevel || "Full");
        setPickupDate(new Date().toISOString().split('T')[0]);
        setPickupNotes("");
        setIsDuplicateContract(false);
        setIsHighContractNumber(false);
        setOverridePassword("");
        setPendingMileage(null);
        
        // Reset remarks acknowledgement - require user to acknowledge again each time
        setRemarksAcknowledged(false);
        // Explicitly close any existing warning dialog first
        setRemarksWarningOpen(false);
        
        // Check if vehicle has remarks and show warning (only for non-TBD reservations)
        // For TBD spares, the warning will be shown when a vehicle is selected
        if (!isTBDSpare && reservation.vehicle?.remarks && reservation.vehicle.remarks.trim() !== '') {
          setRemarksWarningOpen(true);
        }
        
        // If reservation already has a contract number, use it
        if (reservation.contractNumber) {
          setContractNumber(reservation.contractNumber);
        } else {
          // Otherwise, fetch the next contract number
          try {
            const response = await fetch('/api/settings/next-contract-number', {
              credentials: 'include',
            });
            if (response.ok) {
              const data = await response.json();
              setContractNumber(data.contractNumber);
            } else {
              setContractNumber("");
            }
          } catch (error) {
            console.error('Failed to fetch next contract number:', error);
            setContractNumber("");
          }
        }
      }
    }
    initializeDialog();
  }, [open, reservation]);
  
  // Check for duplicate contract numbers and high numbers
  useEffect(() => {
    async function checkContractNumber() {
      if (!contractNumber || contractNumber.trim() === "") {
        setIsDuplicateContract(false);
        setIsHighContractNumber(false);
        return;
      }

      const trimmedNumber = contractNumber.trim();
      
      // Check for duplicates (excluding current reservation if it already has this number)
      try {
        const response = await fetch(`/api/reservations/find-by-contract/${encodeURIComponent(trimmedNumber)}`, {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          // If this reservation already has this contract number, it's not a duplicate
          const isCurrentNumber = reservation.contractNumber === trimmedNumber;
          const isDuplicate = data.exists && !isCurrentNumber;
          setIsDuplicateContract(isDuplicate);
          setDuplicateReservationInfo(isDuplicate ? data.reservation : null);
        }
      } catch (error) {
        console.error('Failed to check contract number:', error);
      }

      // Check if number is unusually high
      const numValue = parseInt(trimmedNumber, 10);
      if (!isNaN(numValue) && numValue > 9999) {
        setIsHighContractNumber(true);
      } else {
        setIsHighContractNumber(false);
      }
    }

    const debounceTimer = setTimeout(checkContractNumber, 300);
    return () => clearTimeout(debounceTimer);
  }, [contractNumber, reservation.id, reservation.contractNumber]);

  // Update mileage and fuel when vehicle is selected for TBD spare
  // Also reset remarks acknowledgement when a different vehicle is selected
  useEffect(() => {
    if (isTBDSpare && selectedVehicle) {
      setPickupMileage(selectedVehicle.currentMileage?.toString() || "");
      setFuelLevelPickup(selectedVehicle.currentFuelLevel || "Full");
      // Reset remarks acknowledgement when vehicle changes - user must re-acknowledge
      setRemarksAcknowledged(false);
      // Close any existing warning dialog first
      setRemarksWarningOpen(false);
      // If the new vehicle has remarks, show the warning after a short delay
      // (to ensure state has been cleared first)
      if (selectedVehicle.remarks && selectedVehicle.remarks.trim() !== '') {
        setTimeout(() => setRemarksWarningOpen(true), 0);
      }
    } else if (isTBDSpare && !selectedVehicle) {
      // No vehicle selected - reset states
      setRemarksAcknowledged(false);
      setRemarksWarningOpen(false);
    }
  }, [selectedVehicleId, selectedVehicle, isTBDSpare]);

  const pickupMutation = useMutation({
    mutationFn: async (data: {
      contractNumber: string;
      pickupMileage: number;
      fuelLevelPickup: string;
      pickupDate: string;
      pickupNotes?: string;
      allowMileageDecrease?: boolean;
      overridePassword?: string;
      overrideContractNumber?: boolean;
    }) => {
      return await apiRequest("POST", `/api/reservations/${reservation.id}/pickup`, data);
    },
    onSuccess: async () => {
      toast({
        title: "Pickup Completed",
        description: "Vehicle picked up successfully. Contract has been generated.",
      });
      await invalidateByPrefix("/api/reservations");
      await invalidateByPrefix("/api/reservations");
      await invalidateByPrefix(`/api/documents/reservation/${reservation.id}`);
      setOverridePassword("");
      setPendingMileage(null);
      setUploadedPaperCheckIds([]); // Clear tracked IDs - documents are now permanent
      
      // Call the success callback first (to reopen view dialog)
      if (onSuccess) {
        await onSuccess();
      }
      
      // Then close the pickup dialog
      onOpenChange(false);
    },
    onError: (error: any) => {
      if (error.requiresOverride) {
        setPendingMileage(parseInt(pickupMileage));
        setOverrideDialogOpen(true);
        return;
      }
      toast({
        variant: "destructive",
        title: "Pickup Failed",
        description: error.message || "Failed to process pickup. Please try again.",
      });
    },
  });

  const handleOverrideConfirm = async (password: string): Promise<boolean> => {
    try {
      setOverridePassword(password);
      
      if (pendingMileage === null) return false;
      
      pickupMutation.mutate({
        contractNumber: contractNumber.trim(),
        pickupMileage: pendingMileage,
        fuelLevelPickup,
        pickupDate,
        pickupNotes: pickupNotes || undefined,
        allowMileageDecrease: true,
        overridePassword: password,
      });
      
      setOverrideDialogOpen(false);
      return true;
    } catch (error) {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if vehicle has remarks that haven't been acknowledged
    // For TBD spare, check the selected vehicle's remarks
    // For regular reservations, check the reservation's vehicle remarks
    const vehicleToCheck = isTBDSpare ? selectedVehicle : reservation.vehicle;
    const vehicleHasRemarks = vehicleToCheck?.remarks && vehicleToCheck.remarks.trim() !== '';
    if (vehicleHasRemarks && !remarksAcknowledged) {
      // Show the remarks warning dialog
      setRemarksWarningOpen(true);
      toast({
        variant: "destructive",
        title: "Remarks Not Acknowledged",
        description: "You must acknowledge the vehicle remarks before proceeding with pickup.",
      });
      return;
    }
    
    // Validate contract number
    if (!contractNumber || contractNumber.trim() === "") {
      toast({
        variant: "destructive",
        title: "Contract Number Required",
        description: "Please enter a contract number before completing pickup.",
      });
      return;
    }

    // Check for duplicate contract number - show warning instead of blocking
    if (isDuplicateContract) {
      setShowDuplicateWarning(true);
      return;
    }
    
    // If no duplicate, proceed normally
    proceedWithPickup(false);
  };

  const proceedWithPickup = async (overrideDuplicate: boolean) => {
    setShowDuplicateWarning(false);
    
    // Check if TBD spare and no vehicle selected
    if (isTBDSpare && !selectedVehicleId) {
      toast({
        variant: "destructive",
        title: "Vehicle Required",
        description: "Please select a vehicle for this spare reservation.",
      });
      return;
    }
    
    const mileage = parseInt(pickupMileage);
    if (isNaN(mileage) || mileage < 0) {
      toast({
        variant: "destructive",
        title: "Invalid Mileage",
        description: "Please enter a valid mileage value.",
      });
      return;
    }

    // If TBD spare, assign vehicle first
    if (isTBDSpare && selectedVehicleId) {
      try {
        const assignResponse = await apiRequest('PATCH', `/api/reservations/${reservation.id}`, {
          vehicleId: selectedVehicleId
        });
        
        if (!assignResponse.ok) {
          throw new Error('Failed to assign vehicle');
        }
        
        // Invalidate queries to refresh data
        await invalidateByPrefix("/api/reservations");
        await invalidateByPrefix("/api/reservations");
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Assignment Failed",
          description: "Failed to assign vehicle to reservation.",
        });
        return;
      }
    }

    pickupMutation.mutate({
      contractNumber: contractNumber.trim(),
      pickupMileage: mileage,
      fuelLevelPickup,
      pickupDate,
      pickupNotes: pickupNotes || undefined,
      overrideContractNumber: overrideDuplicate,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* z-[60]: this can open on top of the New Reservation dialog, which also
          renders at z-50. Equal z-index falls back to DOM order, and the parent's
          portal is re-appended when it re-renders after save — which left the
          pickup dialog open but completely hidden behind it. */}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-[60]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Start Pickup Process
          </DialogTitle>
          <DialogDescription>
            Enter the vehicle's current mileage and fuel level at pickup. A contract will be generated automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* TBD Spare Vehicle Selection */}
          {isTBDSpare ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Car className="h-5 w-5 text-yellow-700" />
                  <h3 className="font-medium text-yellow-900">TBD Spare Vehicle - Select Vehicle</h3>
                </div>
                <p className="text-sm text-yellow-800">
                  This is a placeholder spare reservation. Please select the actual vehicle for pickup.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="vehicle-select">Select Vehicle</Label>
                  <VehicleSelector
                    vehicles={vehicles || []}
                    value={selectedVehicleId?.toString() || ""}
                    onChange={(value) => setSelectedVehicleId(parseInt(value))}
                    placeholder="Choose an available vehicle..."
                  />
                </div>
                {selectedVehicle && (
                  <div className="space-y-2">
                    <div className="bg-white rounded p-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>Current Mileage: {selectedVehicle.currentMileage?.toLocaleString() || 'N/A'} km</span>
                        <span>•</span>
                        <span>Fuel: {selectedVehicle.currentFuelLevel || 'N/A'}</span>
                      </div>
                    </div>
                    
                    {/* Remarks warning for TBD spare selected vehicle */}
                    {selectedVehicle.remarks && selectedVehicle.remarks.trim() !== '' && (
                      <div className={`rounded-md p-3 ${remarksAcknowledged ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                        <div className="flex items-start gap-2">
                          {remarksAcknowledged ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <h4 className={`font-medium text-sm ${remarksAcknowledged ? 'text-green-800' : 'text-amber-800'}`}>
                              {remarksAcknowledged ? 'Vehicle Remarks Acknowledged' : 'Vehicle Has Remarks'}
                            </h4>
                            <p className={`text-xs mt-1 ${remarksAcknowledged ? 'text-green-700' : 'text-amber-700'}`}>
                              {selectedVehicle.remarks}
                            </p>
                            {!remarksAcknowledged && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-2 text-amber-700 border-amber-300 hover:bg-amber-100"
                                onClick={() => setRemarksWarningOpen(true)}
                                data-testid="button-review-spare-remarks"
                              >
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Review & Acknowledge
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Vehicle Information */
            <div className="space-y-2">
              <div className="bg-muted/50 rounded-md p-3">
                <div className="space-y-1">
                  <h3 className="font-medium text-sm">Vehicle Information</h3>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    <div className="flex items-center">
                      <span className="text-muted-foreground mr-1">License:</span>
                      <span className="font-medium">{reservation.vehicle?.licensePlate}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground mr-1">Vehicle:</span>
                      <span className="font-medium">{reservation.vehicle?.brand} {reservation.vehicle?.model}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground mr-1">Customer:</span>
                      <span className="font-medium">{reservation.customer?.name}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Vehicle Remarks Warning - shown if vehicle has remarks */}
              {reservation.vehicle?.remarks && reservation.vehicle.remarks.trim() !== '' && (
                <div className={`rounded-md p-3 ${remarksAcknowledged ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className="flex items-start gap-2">
                    {remarksAcknowledged ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <h4 className={`font-medium text-sm ${remarksAcknowledged ? 'text-green-800' : 'text-amber-800'}`}>
                        {remarksAcknowledged ? 'Vehicle Remarks Acknowledged' : 'Vehicle Has Remarks'}
                      </h4>
                      <p className={`text-xs mt-1 ${remarksAcknowledged ? 'text-green-700' : 'text-amber-700'}`}>
                        {reservation.vehicle.remarks}
                      </p>
                      {!remarksAcknowledged && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2 text-amber-700 border-amber-300 hover:bg-amber-100"
                          onClick={() => setRemarksWarningOpen(true)}
                          data-testid="button-review-remarks"
                        >
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Review & Acknowledge
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Combined Pickup Details and Fuel Level */}
            <div className="border rounded-lg p-4 bg-slate-50 space-y-4">
              <h3 className="font-semibold text-base">Pickup Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contractNumber">
                    Contract Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="contractNumber"
                    type="text"
                    value={contractNumber}
                    onChange={(e) => setContractNumber(e.target.value)}
                    placeholder="Auto-generated (editable)"
                    required
                    className={`bg-white ${isDuplicateContract ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                    data-testid="input-contract-number"
                  />
                  {isDuplicateContract && (
                    <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                      ⚠️ This contract number already exists!
                    </p>
                  )}
                  {isHighContractNumber && !isDuplicateContract && (
                    <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                      ⚠️ Unusually high number - please verify
                    </p>
                  )}
                  {!isDuplicateContract && !isHighContractNumber && (
                    <p className="text-xs text-muted-foreground">
                      Auto-generated, you can edit if needed
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="pickupDate">
                    Pickup Date
                  </Label>
                  <Input
                    id="pickupDate"
                    type="date"
                    value={pickupDate}
                    onChange={(e) => setPickupDate(e.target.value)}
                    required
                    className="bg-white"
                    data-testid="input-pickup-date"
                  />
                  <p className="text-xs text-muted-foreground">
                    When the vehicle is being picked up
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pickupMileage">
                    Mileage at pickup
                  </Label>
                  <Input
                    id="pickupMileage"
                    type="number"
                    value={pickupMileage}
                    onChange={(e) => setPickupMileage(e.target.value)}
                    placeholder={
                      isTBDSpare && selectedVehicle
                        ? `Current: ${selectedVehicle.currentMileage?.toLocaleString() || 0} km`
                        : reservation.vehicle?.currentMileage 
                        ? `Current: ${reservation.vehicle.currentMileage.toLocaleString()} km` 
                        : "Enter pickup mileage"
                    }
                    required
                    className="bg-white"
                    data-testid="input-pickup-mileage"
                  />
                  <p className="text-xs text-muted-foreground">
                    Odometer reading at pickup
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fuelLevelPickup">
                    Fuel Level at Pickup
                  </Label>
                  <Select value={fuelLevelPickup} onValueChange={setFuelLevelPickup}>
                    <SelectTrigger className="bg-white" data-testid="select-fuel-level-pickup">
                      <SelectValue placeholder="Select fuel level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Full">Full</SelectItem>
                      <SelectItem value="3/4">3/4</SelectItem>
                      <SelectItem value="1/2">1/2</SelectItem>
                      <SelectItem value="1/4">1/4</SelectItem>
                      <SelectItem value="Empty">Empty</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Current fuel level in the tank
                  </p>
                </div>
              </div>
            </div>

            {/* Damage Check Section */}
            <div className="border rounded-lg p-4 bg-green-50 space-y-3">
              <h3 className="font-semibold text-base">Damage Check</h3>
              
              {pickupDamageChecks.length > 0 || pickupPaperDamageChecks.length > 0 ? (
                <div className="space-y-2">
                  {/* Interactive damage checks */}
                  {pickupDamageChecks.length > 0 && (() => {
                    const check = pickupDamageChecks[0];
                    return (
                      <div className="bg-white border rounded-md p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <ClipboardCheck className="h-4 w-4 text-green-600" />
                          <span className="text-xs font-medium text-green-600">Interactive Check</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm flex-1">
                            <p className="font-medium">
                              Created {new Date(check.createdAt).toLocaleDateString()} at {new Date(check.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {check.createdBy && (
                              <p className="text-xs text-muted-foreground">by {check.createdBy}</p>
                            )}
                            {check.updatedBy && check.updatedBy !== check.createdBy && (
                              <p className="text-xs text-muted-foreground">
                                Last edited by {check.updatedBy}
                              </p>
                            )}
                            {check.pdfPath && (
                              <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                PDF generated
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingDamageCheckId(check.id);
                                setDamageCheckDialogOpen(true);
                              }}
                              title="View/Edit damage check"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            {check.pdfPath && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(check.pdfPath, '_blank')}
                                title="View PDF"
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                PDF
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setPickupDamageCheckToDelete(check.id);
                                setDeletePickupDamageCheckDialogOpen(true);
                              }}
                              title="Delete damage check"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* Paper damage checks */}
                  {pickupPaperDamageChecks.map((doc: any) => (
                    <div key={doc.id} className="bg-white border rounded-md p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="text-xs font-medium text-blue-600">Paper Check (Uploaded)</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm flex-1">
                          <p className="font-medium">{doc.fileName || 'Paper Damage Check'}</p>
                          <p className="text-xs text-muted-foreground">
                            Uploaded {new Date(doc.createdAt).toLocaleDateString()} at {new Date(doc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(doc.filePath, '_blank')}
                            title="View document"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setPickupPaperCheckToDelete(doc.id);
                              setDeletePickupPaperCheckDialogOpen(true);
                            }}
                            title="Delete paper damage check"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Add more buttons */}
                  <div className="flex gap-2 mt-2">
                    {pickupDamageChecks.length === 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="bg-white"
                        onClick={() => {
                          setEditingDamageCheckId(null);
                          setDamageCheckDialogOpen(true);
                        }}
                      >
                        <ClipboardCheck className="h-3 w-3 mr-1" />
                        Add Interactive Check
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="bg-white"
                      disabled={uploadingPaperDamageCheck}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.pdf,.jpg,.jpeg,.png';
                        input.onchange = async (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (!file) return;
                          
                          setUploadingPaperDamageCheck(true);
                          const formData = new FormData();
                          const vehicleIdToUse = isTBDSpare && selectedVehicleId ? selectedVehicleId : reservation.vehicleId;
                          if (!vehicleIdToUse) {
                            toast({
                              title: "Error",
                              description: "No vehicle selected",
                              variant: "destructive",
                            });
                            setUploadingPaperDamageCheck(false);
                            return;
                          }
                          formData.append('vehicleId', vehicleIdToUse.toString());
                          formData.append('reservationId', reservation.id.toString());
                          formData.append('documentType', 'Damage Check (Pickup - Paper)');
                          formData.append('file', file);

                          try {
                            const response = await fetch('/api/documents', {
                              method: 'POST',
                              body: formData,
                              credentials: 'include',
                            });
                            
                            if (!response.ok) {
                              throw new Error('Upload failed');
                            }
                            
                            const uploadedDoc = await response.json();
                            setUploadedPaperCheckIds(prev => [...prev, uploadedDoc.id]);
                            await refetchDocuments();
                            toast({
                              title: "Success",
                              description: "Paper damage check uploaded successfully",
                            });
                          } catch (error) {
                            console.error('Upload failed:', error);
                            toast({
                              title: "Error",
                              description: "Failed to upload paper damage check",
                              variant: "destructive",
                            });
                          } finally {
                            setUploadingPaperDamageCheck(false);
                          }
                        };
                        input.click();
                      }}
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      {uploadingPaperDamageCheck ? "Uploading..." : "Upload Paper Check"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Create an interactive damage check to document the vehicle's condition at pickup
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 bg-white"
                      onClick={() => {
                        setEditingDamageCheckId(null);
                        setDamageCheckDialogOpen(true);
                      }}
                      data-testid="button-open-pickup-damage-check"
                    >
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                      Create Pickup Damage Check
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="bg-white"
                      disabled={uploadingPaperDamageCheck}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.pdf,.jpg,.jpeg,.png';
                        input.onchange = async (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (!file) return;
                          
                          setUploadingPaperDamageCheck(true);
                          const formData = new FormData();
                          const vehicleIdToUse = isTBDSpare && selectedVehicleId ? selectedVehicleId : reservation.vehicleId;
                          if (!vehicleIdToUse) {
                            toast({
                              title: "Error",
                              description: "No vehicle selected",
                              variant: "destructive",
                            });
                            setUploadingPaperDamageCheck(false);
                            return;
                          }
                          formData.append('vehicleId', vehicleIdToUse.toString());
                          formData.append('reservationId', reservation.id.toString());
                          formData.append('documentType', 'Damage Check (Pickup - Paper)');
                          formData.append('file', file);

                          try {
                            const response = await fetch('/api/documents', {
                              method: 'POST',
                              body: formData,
                              credentials: 'include',
                            });
                            
                            if (!response.ok) {
                              throw new Error('Upload failed');
                            }
                            
                            const uploadedDoc = await response.json();
                            setUploadedPaperCheckIds(prev => [...prev, uploadedDoc.id]);
                            await refetchDocuments();
                            toast({
                              title: "Success",
                              description: "Paper damage check uploaded successfully",
                            });
                          } catch (error) {
                            console.error('Upload failed:', error);
                            toast({
                              title: "Error",
                              description: "Failed to upload paper damage check",
                              variant: "destructive",
                            });
                          } finally {
                            setUploadingPaperDamageCheck(false);
                          }
                        };
                        input.click();
                      }}
                      data-testid="button-upload-paper-damage-check"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {uploadingPaperDamageCheck ? "Uploading..." : "Upload Paper Check"}
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pickupNotes">Additional Notes (Optional)</Label>
              <Textarea
                id="pickupNotes"
                value={pickupNotes}
                onChange={(e) => setPickupNotes(e.target.value)}
                placeholder="Any additional notes about the pickup..."
                rows={3}
                data-testid="textarea-pickup-notes"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await cleanupUploadedPaperChecks();
                  onOpenChange(false);
                }}
                disabled={pickupMutation.isPending}
                data-testid="button-cancel-pickup"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pickupMutation.isPending}
                data-testid="button-confirm-pickup"
              >
                {pickupMutation.isPending ? (
                  <>Processing...</>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Complete Pickup & Generate Contract
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>

      {/* Duplicate Contract Number Warning Dialog */}
      <Dialog open={showDuplicateWarning} onOpenChange={setShowDuplicateWarning}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Duplicate Contract Number
            </DialogTitle>
            <DialogDescription>
              This contract number is already in use.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <p className="text-sm font-medium text-amber-900 mb-2">
                Contract Number {contractNumber} is currently assigned to:
              </p>
              {duplicateReservationInfo && (
                <div className="text-sm text-amber-800 space-y-1">
                  <div><strong>Reservation ID:</strong> #{duplicateReservationInfo.id}</div>
                  {duplicateReservationInfo.vehicle && (
                    <div><strong>Vehicle:</strong> {duplicateReservationInfo.vehicle.licensePlate} - {duplicateReservationInfo.vehicle.brand} {duplicateReservationInfo.vehicle.model}</div>
                  )}
                  {duplicateReservationInfo.customer && (
                    <div><strong>Customer:</strong> {duplicateReservationInfo.customer.name}</div>
                  )}
                  <div><strong>Status:</strong> {duplicateReservationInfo.status}</div>
                </div>
              )}
            </div>
            
            <p className="text-sm text-muted-foreground">
              If you proceed, the contract number will be removed from the existing reservation and assigned to this one. This is useful for backfilling or correcting mistakes.
            </p>
            
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowDuplicateWarning(false)}
                data-testid="button-cancel-override"
              >
                Cancel
              </Button>
              <Button
                variant="default"
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => proceedWithPickup(true)}
                data-testid="button-confirm-override"
              >
                Override & Continue
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mileage Override Dialog */}
      <MileageOverridePasswordDialog
        open={overrideDialogOpen}
        onOpenChange={setOverrideDialogOpen}
        onConfirm={handleOverrideConfirm}
        currentMileage={reservation.vehicle?.currentMileage || 0}
        newMileage={pendingMileage || 0}
      />

      {/* Damage Check Dialog */}
      <Dialog open={damageCheckDialogOpen} onOpenChange={(open) => {
        setDamageCheckDialogOpen(open);
        if (!open) {
          setEditingDamageCheckId(null);
          refetchDamageChecks();
        }
      }}>
        {/* z-[70]: must render above this dialog's own z-[60] content (see note
            near that class above) — otherwise the pickup dialog stays on top and
            blocks the damage check that was just opened from within it. */}
        <DialogContent className="max-w-[95vw] h-[95vh] overflow-y-auto p-0 z-[70]">
          <DialogTitle className="sr-only">Interactive Damage Check - Pickup</DialogTitle>
          <InteractiveDamageCheck
            onClose={() => {
              setDamageCheckDialogOpen(false);
              setEditingDamageCheckId(null);
              refetchDamageChecks();
            }}
            editingCheckId={editingDamageCheckId}
            initialVehicleId={isTBDSpare && selectedVehicleId ? selectedVehicleId : reservation.vehicleId}
            initialReservationId={reservation.id}
            initialCheckType="pickup"
            initialMileage={pickupMileage}
            initialFuelLevel={fuelLevelPickup}
            initialDate={pickupDate}
          />
        </DialogContent>
      </Dialog>
      
      {/* Vehicle Remarks Warning Dialog - shown when vehicle has remarks before pickup */}
      <VehicleRemarksWarningDialog
        open={remarksWarningOpen}
        onOpenChange={setRemarksWarningOpen}
        vehicle={(isTBDSpare ? selectedVehicle : reservation.vehicle) as Vehicle | null}
        context="pickup"
        onAcknowledge={() => {
          setRemarksAcknowledged(true);
        }}
        onCancel={() => {
          // User cancelled acknowledgement - close the pickup dialog
          onOpenChange(false);
        }}
      />

      {/* Delete Pickup Damage Check Confirmation Dialog */}
      <ConfirmDialog
        open={deletePickupDamageCheckDialogOpen}
        onOpenChange={setDeletePickupDamageCheckDialogOpen}
        title="Delete Pickup Damage Check"
        description="Are you sure you want to delete this pickup damage check? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (pickupDamageCheckToDelete) {
            try {
              await apiRequest('DELETE', `/api/interactive-damage-checks/${pickupDamageCheckToDelete}`, {});
              await refetchDamageChecks();
              toast({
                title: "Deleted",
                description: "Pickup damage check deleted successfully",
              });
            } catch (error) {
              toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to delete damage check",
              });
            }
          }
          setPickupDamageCheckToDelete(null);
        }}
        onCancel={() => setPickupDamageCheckToDelete(null)}
      />

      {/* Delete Pickup Paper Damage Check Confirmation Dialog */}
      <ConfirmDialog
        open={deletePickupPaperCheckDialogOpen}
        onOpenChange={setDeletePickupPaperCheckDialogOpen}
        title="Delete Paper Damage Check"
        description="Are you sure you want to delete this paper damage check? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (pickupPaperCheckToDelete) {
            try {
              await apiRequest('DELETE', `/api/documents/${pickupPaperCheckToDelete}`, {});
              invalidateByPrefix(`/api/documents/reservation/${reservation.id}`);
              toast({
                title: "Deleted",
                description: "Paper damage check deleted successfully",
              });
            } catch (error) {
              toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to delete paper damage check",
              });
            }
          }
          setPickupPaperCheckToDelete(null);
        }}
        onCancel={() => setPickupPaperCheckToDelete(null)}
      />
    </Dialog>
  );
}

interface ReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation;
  onSuccess?: () => void | Promise<void>;
}

export function ReturnDialog({ open, onOpenChange, reservation, onSuccess }: ReturnDialogProps) {
  const { toast } = useToast();
  const [returnMileage, setReturnMileage] = useState(
    reservation.pickupMileage?.toString() || reservation.vehicle?.currentMileage?.toString() || ""
  );
  const [fuelLevelReturn, setFuelLevelReturn] = useState("Full");
  const [returnDate, setReturnDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [returnNotes, setReturnNotes] = useState("");
  const [damageCheckDialogOpen, setDamageCheckDialogOpen] = useState(false);
  const [editingDamageCheckId, setEditingDamageCheckId] = useState<number | null>(null);
  const [uploadingPaperDamageCheck, setUploadingPaperDamageCheck] = useState(false);
  const [uploadedPaperCheckIds, setUploadedPaperCheckIds] = useState<number[]>([]);
  
  // Delete confirmation dialog states
  const [deleteReturnDamageCheckDialogOpen, setDeleteReturnDamageCheckDialogOpen] = useState(false);
  const [returnDamageCheckToDelete, setReturnDamageCheckToDelete] = useState<number | null>(null);
  const [deleteReturnPaperCheckDialogOpen, setDeleteReturnPaperCheckDialogOpen] = useState(false);
  const [returnPaperCheckToDelete, setReturnPaperCheckToDelete] = useState<number | null>(null);

  // Cleanup function to delete uploaded paper checks on cancel
  const cleanupUploadedPaperChecks = async () => {
    for (const docId of uploadedPaperCheckIds) {
      try {
        await fetch(`/api/documents/${docId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      } catch (error) {
        console.error('Failed to cleanup paper damage check:', error);
      }
    }
    setUploadedPaperCheckIds([]);
  };

  // Fetch existing damage checks for this reservation
  const { data: damageChecks, refetch: refetchDamageChecks } = useQuery<any[]>({
    queryKey: ['/api/interactive-damage-checks', 'reservation', reservation.id],
    queryFn: async () => {
      const response = await fetch(`/api/interactive-damage-checks/reservation/${reservation.id}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: open && !!reservation.id,
  });

  // Fetch paper damage check documents for this reservation
  const { data: reservationDocuments, refetch: refetchDocuments } = useQuery<any[]>({
    queryKey: [`/api/documents/reservation/${reservation.id}`],
    queryFn: async () => {
      const response = await fetch(`/api/documents/reservation/${reservation.id}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: open && !!reservation.id,
  });

  const returnDamageChecks = damageChecks?.filter((check: any) => check.checkType === 'return') || [];
  const returnPaperDamageChecks = reservationDocuments?.filter((doc: any) => doc.documentType === 'Damage Check (Return - Paper)') || [];

  useEffect(() => {
    if (open && reservation) {
      setReturnMileage(
        reservation.pickupMileage?.toString() || reservation.vehicle?.currentMileage?.toString() || ""
      );
      setFuelLevelReturn("Full");
      setReturnDate(new Date().toISOString().split('T')[0]);
      setReturnNotes("");
    }
  }, [open, reservation]);

  const returnMutation = useMutation({
    mutationFn: async (data: {
      returnMileage: number;
      fuelLevelReturn: string;
      returnDate: string;
      returnNotes?: string;
    }) => {
      return await apiRequest("POST", `/api/reservations/${reservation.id}/return`, data);
    },
    onSuccess: async () => {
      toast({
        title: "Return Completed",
        description: "Vehicle returned successfully. Damage check has been generated.",
      });
      await invalidateByPrefix("/api/reservations");
      await invalidateByPrefix("/api/reservations");
      await invalidateByPrefix(`/api/documents/reservation/${reservation.id}`);
      setUploadedPaperCheckIds([]); // Clear tracked IDs - documents are now permanent
      
      // Call the success callback first (to reopen view dialog)
      if (onSuccess) {
        await onSuccess();
      }
      
      // Then close the return dialog
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Return Failed",
        description: error.message || "Failed to process return. Please try again.",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const mileage = parseInt(returnMileage);
    if (isNaN(mileage) || mileage < 0) {
      toast({
        variant: "destructive",
        title: "Invalid Mileage",
        description: "Please enter a valid mileage value.",
      });
      return;
    }

    if (reservation.pickupMileage && mileage < reservation.pickupMileage) {
      toast({
        variant: "destructive",
        title: "Invalid Mileage",
        description: `Return mileage cannot be less than pickup mileage (${reservation.pickupMileage} km).`,
      });
      return;
    }

    returnMutation.mutate({
      returnMileage: mileage,
      fuelLevelReturn,
      returnDate,
      returnNotes: returnNotes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* z-[60]: same stacking issue as the pickup dialog above. */}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-[60]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Start Return Process
          </DialogTitle>
          <DialogDescription>
            Enter the vehicle's current mileage and fuel level at return. A damage check will be generated automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Vehicle Information */}
          <div className="bg-muted/50 rounded-md p-3">
            <div className="space-y-1">
              <h3 className="font-medium text-sm">Vehicle Information</h3>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                <div className="flex items-center">
                  <span className="text-muted-foreground mr-1">License:</span>
                  <span className="font-medium">{reservation.vehicle?.licensePlate}</span>
                </div>
                <div className="flex items-center">
                  <span className="text-muted-foreground mr-1">Vehicle:</span>
                  <span className="font-medium">{reservation.vehicle?.brand} {reservation.vehicle?.model}</span>
                </div>
                {reservation.pickupMileage && (
                  <div className="flex items-center">
                    <span className="text-muted-foreground mr-1">At pickup:</span>
                    <span className="font-medium">{reservation.pickupMileage.toLocaleString()} km</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Combined Completion Details and Fuel Tracking */}
            <div className="border rounded-lg p-4 bg-slate-50 space-y-4">
              <h3 className="font-semibold text-base">Completion Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="returnDate">
                    Return Date
                  </Label>
                  <Input
                    id="returnDate"
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    required
                    className="bg-white"
                    data-testid="input-return-date"
                  />
                  <p className="text-xs text-muted-foreground">
                    When the vehicle was actually returned
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="returnMileage">
                    Mileage when returned
                  </Label>
                  <Input
                    id="returnMileage"
                    type="number"
                    value={returnMileage}
                    onChange={(e) => setReturnMileage(e.target.value)}
                    placeholder={reservation.pickupMileage ? `Pickup: ${reservation.pickupMileage.toLocaleString()} km` : "Enter return mileage"}
                    required
                    className="bg-white"
                    data-testid="input-return-mileage"
                  />
                  <p className="text-xs text-muted-foreground">
                    Odometer reading at return
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fuelLevelReturn">
                    Fuel Level at Return
                  </Label>
                  <Select value={fuelLevelReturn} onValueChange={setFuelLevelReturn}>
                    <SelectTrigger className="bg-white" data-testid="select-fuel-level-return">
                      <SelectValue placeholder="Select fuel level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Full">Full</SelectItem>
                      <SelectItem value="3/4">3/4</SelectItem>
                      <SelectItem value="1/2">1/2</SelectItem>
                      <SelectItem value="1/4">1/4</SelectItem>
                      <SelectItem value="Empty">Empty</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Current fuel level in the tank
                    {reservation.fuelLevelPickup && (
                      <span className="block text-blue-700 font-medium mt-0.5">
                        At pickup: {reservation.fuelLevelPickup}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Damage Check Section */}
            <div className="border rounded-lg p-4 bg-green-50 space-y-3">
              <h3 className="font-semibold text-base">Damage Check</h3>
              
              {returnDamageChecks.length > 0 || returnPaperDamageChecks.length > 0 ? (
                <div className="space-y-2">
                  {/* Interactive damage checks */}
                  {returnDamageChecks.length > 0 && (() => {
                    const check = returnDamageChecks[0];
                    return (
                      <div className="bg-white border rounded-md p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <ClipboardCheck className="h-4 w-4 text-green-600" />
                          <span className="text-xs font-medium text-green-600">Interactive Check</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm flex-1">
                            <p className="font-medium">
                              Created {new Date(check.createdAt).toLocaleDateString()} at {new Date(check.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {check.createdBy && (
                              <p className="text-xs text-muted-foreground">by {check.createdBy}</p>
                            )}
                            {check.updatedBy && check.updatedBy !== check.createdBy && (
                              <p className="text-xs text-muted-foreground">
                                Last edited by {check.updatedBy}
                              </p>
                            )}
                            {check.pdfPath && (
                              <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                PDF generated
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingDamageCheckId(check.id);
                                setDamageCheckDialogOpen(true);
                              }}
                              title="View/Edit damage check"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            {check.pdfPath && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(check.pdfPath, '_blank')}
                                title="View PDF"
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                PDF
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setReturnDamageCheckToDelete(check.id);
                                setDeleteReturnDamageCheckDialogOpen(true);
                              }}
                              title="Delete damage check"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* Paper damage checks */}
                  {returnPaperDamageChecks.map((doc: any) => (
                    <div key={doc.id} className="bg-white border rounded-md p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="text-xs font-medium text-blue-600">Paper Check (Uploaded)</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm flex-1">
                          <p className="font-medium">{doc.fileName || 'Paper Damage Check'}</p>
                          <p className="text-xs text-muted-foreground">
                            Uploaded {new Date(doc.createdAt).toLocaleDateString()} at {new Date(doc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(doc.filePath, '_blank')}
                            title="View document"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReturnPaperCheckToDelete(doc.id);
                              setDeleteReturnPaperCheckDialogOpen(true);
                            }}
                            title="Delete paper damage check"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Add more buttons */}
                  <div className="flex gap-2 mt-2">
                    {returnDamageChecks.length === 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="bg-white"
                        onClick={() => {
                          setEditingDamageCheckId(null);
                          setDamageCheckDialogOpen(true);
                        }}
                      >
                        <ClipboardCheck className="h-3 w-3 mr-1" />
                        Add Interactive Check
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="bg-white"
                      disabled={uploadingPaperDamageCheck}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.pdf,.jpg,.jpeg,.png';
                        input.onchange = async (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (!file) return;
                          
                          setUploadingPaperDamageCheck(true);
                          const formData = new FormData();
                          if (!reservation.vehicleId) {
                            toast({
                              title: "Error",
                              description: "No vehicle associated with this reservation",
                              variant: "destructive",
                            });
                            setUploadingPaperDamageCheck(false);
                            return;
                          }
                          formData.append('vehicleId', reservation.vehicleId.toString());
                          formData.append('reservationId', reservation.id.toString());
                          formData.append('documentType', 'Damage Check (Return - Paper)');
                          formData.append('file', file);

                          try {
                            const response = await fetch('/api/documents', {
                              method: 'POST',
                              body: formData,
                              credentials: 'include',
                            });
                            
                            if (!response.ok) {
                              throw new Error('Upload failed');
                            }
                            
                            const uploadedDoc = await response.json();
                            setUploadedPaperCheckIds(prev => [...prev, uploadedDoc.id]);
                            await refetchDocuments();
                            toast({
                              title: "Success",
                              description: "Paper damage check uploaded successfully",
                            });
                          } catch (error) {
                            console.error('Upload failed:', error);
                            toast({
                              title: "Error",
                              description: "Failed to upload paper damage check",
                              variant: "destructive",
                            });
                          } finally {
                            setUploadingPaperDamageCheck(false);
                          }
                        };
                        input.click();
                      }}
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      {uploadingPaperDamageCheck ? "Uploading..." : "Upload Paper Check"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Create an interactive damage check to document the vehicle's condition at return
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 bg-white"
                      onClick={() => {
                        setEditingDamageCheckId(null);
                        setDamageCheckDialogOpen(true);
                      }}
                      data-testid="button-open-return-damage-check"
                    >
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                      Create Return Damage Check
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="bg-white"
                      disabled={uploadingPaperDamageCheck}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.pdf,.jpg,.jpeg,.png';
                        input.onchange = async (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (!file) return;
                          
                          setUploadingPaperDamageCheck(true);
                          const formData = new FormData();
                          if (!reservation.vehicleId) {
                            toast({
                              title: "Error",
                              description: "No vehicle associated with this reservation",
                              variant: "destructive",
                            });
                            setUploadingPaperDamageCheck(false);
                            return;
                          }
                          formData.append('vehicleId', reservation.vehicleId.toString());
                          formData.append('reservationId', reservation.id.toString());
                          formData.append('documentType', 'Damage Check (Return - Paper)');
                          formData.append('file', file);

                          try {
                            const response = await fetch('/api/documents', {
                              method: 'POST',
                              body: formData,
                              credentials: 'include',
                            });
                            
                            if (!response.ok) {
                              throw new Error('Upload failed');
                            }
                            
                            const uploadedDoc = await response.json();
                            setUploadedPaperCheckIds(prev => [...prev, uploadedDoc.id]);
                            await refetchDocuments();
                            toast({
                              title: "Success",
                              description: "Paper damage check uploaded successfully",
                            });
                          } catch (error) {
                            console.error('Upload failed:', error);
                            toast({
                              title: "Error",
                              description: "Failed to upload paper damage check",
                              variant: "destructive",
                            });
                          } finally {
                            setUploadingPaperDamageCheck(false);
                          }
                        };
                        input.click();
                      }}
                      data-testid="button-upload-paper-return-damage-check"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {uploadingPaperDamageCheck ? "Uploading..." : "Upload Paper Check"}
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Notes Section */}
            <div className="space-y-2">
              <Label htmlFor="returnNotes">Additional Notes (Optional)</Label>
              <Textarea
                id="returnNotes"
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Any additional notes about the return (damage, issues, etc.)..."
                rows={3}
                data-testid="textarea-return-notes"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await cleanupUploadedPaperChecks();
                  onOpenChange(false);
                }}
                disabled={returnMutation.isPending}
                data-testid="button-cancel-return"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={returnMutation.isPending}
                data-testid="button-confirm-return"
              >
                {returnMutation.isPending ? (
                  <>Processing...</>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Complete Return & Generate Damage Check
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>

      {/* Damage Check Dialog */}
      <Dialog open={damageCheckDialogOpen} onOpenChange={(open) => {
        setDamageCheckDialogOpen(open);
        if (!open) {
          setEditingDamageCheckId(null);
          refetchDamageChecks();
        }
      }}>
        {/* z-[70]: must render above this dialog's own z-[60] content (see note
            near that class above) — otherwise the return dialog stays on top and
            blocks the damage check that was just opened from within it. */}
        <DialogContent className="max-w-[95vw] h-[95vh] overflow-y-auto p-0 z-[70]">
          <DialogTitle className="sr-only">Interactive Damage Check - Return</DialogTitle>
          <InteractiveDamageCheck
            onClose={() => {
              setDamageCheckDialogOpen(false);
              setEditingDamageCheckId(null);
              refetchDamageChecks();
            }}
            editingCheckId={editingDamageCheckId}
            initialVehicleId={reservation.vehicleId}
            initialReservationId={reservation.id}
            initialCheckType="return"
            initialMileage={returnMileage}
            initialFuelLevel={fuelLevelReturn}
            initialDate={returnDate}
            compareWithCheckId={damageChecks?.find((check: any) => check.checkType === 'pickup')?.id || null}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Return Damage Check Confirmation Dialog */}
      <ConfirmDialog
        open={deleteReturnDamageCheckDialogOpen}
        onOpenChange={setDeleteReturnDamageCheckDialogOpen}
        title="Delete Return Damage Check"
        description="Are you sure you want to delete this return damage check? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (returnDamageCheckToDelete) {
            try {
              await apiRequest('DELETE', `/api/interactive-damage-checks/${returnDamageCheckToDelete}`, {});
              await refetchDamageChecks();
              toast({
                title: "Deleted",
                description: "Return damage check deleted successfully",
              });
            } catch (error) {
              toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to delete damage check",
              });
            }
          }
          setReturnDamageCheckToDelete(null);
        }}
        onCancel={() => setReturnDamageCheckToDelete(null)}
      />

      {/* Delete Return Paper Damage Check Confirmation Dialog */}
      <ConfirmDialog
        open={deleteReturnPaperCheckDialogOpen}
        onOpenChange={setDeleteReturnPaperCheckDialogOpen}
        title="Delete Paper Damage Check"
        description="Are you sure you want to delete this paper damage check? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (returnPaperCheckToDelete) {
            try {
              await apiRequest('DELETE', `/api/documents/${returnPaperCheckToDelete}`, {});
              invalidateByPrefix(`/api/documents/reservation/${reservation.id}`);
              toast({
                title: "Deleted",
                description: "Paper damage check deleted successfully",
              });
            } catch (error) {
              toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to delete paper damage check",
              });
            }
          }
          setReturnPaperCheckToDelete(null);
        }}
        onCancel={() => setReturnPaperCheckToDelete(null)}
      />
    </Dialog>
  );
}
