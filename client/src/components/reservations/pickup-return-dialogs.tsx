import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation(["reservations", "common", "vehicles"]);
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
  // Mirrored in a ref because cleanup runs from close handlers, which would
  // otherwise read a stale copy and delete documents that were already saved.
  const uploadedPaperCheckIdsRef = useRef<number[]>([]);
  const trackUploadedPaperCheck = (id: number) => {
    uploadedPaperCheckIdsRef.current = [...uploadedPaperCheckIdsRef.current, id];
    setUploadedPaperCheckIds(uploadedPaperCheckIdsRef.current);
  };
  const clearTrackedPaperChecks = () => {
    uploadedPaperCheckIdsRef.current = [];
    setUploadedPaperCheckIds([]);
  };

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
    const pending = uploadedPaperCheckIdsRef.current;
    uploadedPaperCheckIdsRef.current = [];
    for (const docId of pending) {
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

  // Closing with the X or Escape used to skip cleanup, so the uploaded ids
  // survived into the next reservation's pickup — where Cancel then deleted
  // the previous vehicle's paperwork.
  const handleOpenChange = async (next: boolean) => {
    if (!next) {
      await cleanupUploadedPaperChecks();
    }
    onOpenChange(next);
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
        title: t('pickupReturn.pickup.pickupCompletedTitle'),
        description: t('pickupReturn.pickup.pickupCompletedDescription'),
      });
      await invalidateByPrefix("/api/reservations");
      await invalidateByPrefix("/api/reservations");
      await invalidateByPrefix(`/api/documents/reservation/${reservation.id}`);
      // Pickup writes the vehicle's mileage and fuel level too - without this,
      // an already-open Vehicle Details view keeps showing stale values.
      await invalidateByPrefix("/api/vehicles");
      setOverridePassword("");
      setPendingMileage(null);
      clearTrackedPaperChecks(); // Clear tracked IDs - documents are now permanent
      
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
      // The override dialog reports these inline - a toast would double up.
      if (error.code === "MILEAGE_OVERRIDE_INVALID_PASSWORD" || error.code === "MILEAGE_OVERRIDE_FORBIDDEN") {
        return;
      }
      toast({
        variant: "destructive",
        title: t('pickupReturn.pickup.pickupFailedTitle'),
        description: error.message || t('pickupReturn.pickup.processPickupFailedFallback'),
      });
    },
  });

  const handleOverrideConfirm = async (password: string): Promise<boolean> => {
    if (pendingMileage === null) return false;

    setOverridePassword(password);

    try {
      // Await the server's verdict - closing the dialog before it answers would
      // hide a wrong password behind a toast instead of showing it inline.
      await pickupMutation.mutateAsync({
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
    } catch (error: any) {
      if (error?.code === "MILEAGE_OVERRIDE_FORBIDDEN") {
        throw new Error(t('vehicles:mileageOverrideDialog.notAuthorized'));
      }
      if (error?.code === "MILEAGE_OVERRIDE_INVALID_PASSWORD") {
        return false;
      }
      throw error instanceof Error ? error : new Error(String(error));
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
        title: t('pickupReturn.pickup.remarksNotAcknowledgedTitle'),
        description: t('pickupReturn.pickup.remarksNotAcknowledgedDescription'),
      });
      return;
    }

    // Validate contract number
    if (!contractNumber || contractNumber.trim() === "") {
      toast({
        variant: "destructive",
        title: t('pickupReturn.pickup.contractNumberRequiredTitle'),
        description: t('pickupReturn.pickup.contractNumberRequiredDescription'),
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
        title: t('pickupReturn.pickup.vehicleRequiredTitle'),
        description: t('pickupReturn.pickup.vehicleRequiredDescription'),
      });
      return;
    }

    const mileage = parseInt(pickupMileage);
    if (isNaN(mileage) || mileage < 0) {
      toast({
        variant: "destructive",
        title: t('pickupReturn.pickup.invalidMileageTitle'),
        description: t('pickupReturn.pickup.invalidMileageDescription'),
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
          title: t('pickupReturn.pickup.assignmentFailedTitle'),
          description: t('pickupReturn.pickup.assignmentFailedDescription'),
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* z-[60]: this can open on top of the New Reservation dialog, which also
          renders at z-50. Equal z-index falls back to DOM order, and the parent's
          portal is re-appended when it re-renders after save — which left the
          pickup dialog open but completely hidden behind it. */}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-[60]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            {t('pickupReturn.pickup.startPickupProcess')}
          </DialogTitle>
          <DialogDescription>
            {t('pickupReturn.pickup.pickupDialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* TBD Spare Vehicle Selection */}
          {isTBDSpare ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Car className="h-5 w-5 text-yellow-700" />
                  <h3 className="font-medium text-yellow-900">{t('pickupReturn.pickup.tbdSpareSelectVehicle')}</h3>
                </div>
                <p className="text-sm text-yellow-800">
                  {t('pickupReturn.pickup.placeholderSpareHint')}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="vehicle-select">{t('pickupReturn.pickup.selectVehicle')}</Label>
                  <VehicleSelector
                    vehicles={vehicles || []}
                    value={selectedVehicleId?.toString() || ""}
                    onChange={(value) => setSelectedVehicleId(parseInt(value))}
                    placeholder={t('pickupReturn.pickup.chooseAvailableVehiclePlaceholder')}
                  />
                </div>
                {selectedVehicle && (
                  <div className="space-y-2">
                    <div className="bg-white rounded p-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{t('pickupReturn.pickup.currentMileageLabel', { mileage: selectedVehicle.currentMileage?.toLocaleString() || t('pickupReturn.pickup.naValue') })}</span>
                        <span>•</span>
                        <span>{t('pickupReturn.pickup.fuelLabel', { fuel: selectedVehicle.currentFuelLevel || t('pickupReturn.pickup.naValue') })}</span>
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
                              {remarksAcknowledged ? t('pickupReturn.pickup.vehicleRemarksAcknowledged') : t('pickupReturn.pickup.vehicleHasRemarks')}
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
                                {t('pickupReturn.pickup.reviewAndAcknowledge')}
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
                  <h3 className="font-medium text-sm">{t('pickupReturn.common.vehicleInformation')}</h3>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    <div className="flex items-center">
                      <span className="text-muted-foreground mr-1">{t('pickupReturn.common.licenseLabel')}</span>
                      <span className="font-medium">{reservation.vehicle?.licensePlate}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground mr-1">{t('pickupReturn.common.vehicleLabel')}</span>
                      <span className="font-medium">{reservation.vehicle?.brand} {reservation.vehicle?.model}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground mr-1">{t('pickupReturn.common.customerLabel')}</span>
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
                        {remarksAcknowledged ? t('pickupReturn.pickup.vehicleRemarksAcknowledged') : t('pickupReturn.pickup.vehicleHasRemarks')}
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
                          {t('pickupReturn.pickup.reviewAndAcknowledge')}
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
              <h3 className="font-semibold text-base">{t('pickupReturn.pickup.pickupDetails')}</h3>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contractNumber">
                    {t('pickupReturn.pickup.contractNumberLabel')} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="contractNumber"
                    type="text"
                    value={contractNumber}
                    onChange={(e) => setContractNumber(e.target.value)}
                    placeholder={t('pickupReturn.pickup.autoGeneratedEditablePlaceholder')}
                    required
                    className={`bg-white ${isDuplicateContract ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                    data-testid="input-contract-number"
                  />
                  {isDuplicateContract && (
                    <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                      {t('pickupReturn.pickup.contractNumberExistsWarning')}
                    </p>
                  )}
                  {isHighContractNumber && !isDuplicateContract && (
                    <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                      {t('pickupReturn.pickup.unusuallyHighNumberWarning')}
                    </p>
                  )}
                  {!isDuplicateContract && !isHighContractNumber && (
                    <p className="text-xs text-muted-foreground">
                      {t('pickupReturn.pickup.autoGeneratedEditHint')}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pickupDate">
                    {t('pickupReturn.pickup.pickupDateLabel')}
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
                    {t('pickupReturn.pickup.pickupDateHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pickupMileage">
                    {t('pickupReturn.pickup.mileageAtPickup')}
                  </Label>
                  <Input
                    id="pickupMileage"
                    type="number"
                    value={pickupMileage}
                    onChange={(e) => setPickupMileage(e.target.value)}
                    placeholder={
                      isTBDSpare && selectedVehicle
                        ? t('pickupReturn.pickup.currentMileagePlaceholder', { mileage: selectedVehicle.currentMileage?.toLocaleString() || 0 })
                        : reservation.vehicle?.currentMileage
                        ? t('pickupReturn.pickup.currentMileagePlaceholder', { mileage: reservation.vehicle.currentMileage.toLocaleString() })
                        : t('pickupReturn.pickup.enterPickupMileagePlaceholder')
                    }
                    required
                    className="bg-white"
                    data-testid="input-pickup-mileage"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('pickupReturn.pickup.odometerAtPickupHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fuelLevelPickup">
                    {t('pickupReturn.pickup.fuelLevelAtPickup')}
                  </Label>
                  <Select value={fuelLevelPickup} onValueChange={setFuelLevelPickup}>
                    <SelectTrigger className="bg-white" data-testid="select-fuel-level-pickup">
                      <SelectValue placeholder={t('pickupReturn.common.fuelSelectPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Full">{t('pickupReturn.common.fuelFull')}</SelectItem>
                      <SelectItem value="3/4">3/4</SelectItem>
                      <SelectItem value="1/2">1/2</SelectItem>
                      <SelectItem value="1/4">1/4</SelectItem>
                      <SelectItem value="Empty">{t('pickupReturn.common.fuelEmpty')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('pickupReturn.common.currentFuelInTankHint')}
                  </p>
                </div>
              </div>
            </div>

            {/* Damage Check Section */}
            <div className="border rounded-lg p-4 bg-green-50 space-y-3">
              <h3 className="font-semibold text-base">{t('pickupReturn.common.damageCheck')}</h3>
              
              {pickupDamageChecks.length > 0 || pickupPaperDamageChecks.length > 0 ? (
                <div className="space-y-2">
                  {/* Interactive damage checks */}
                  {pickupDamageChecks.length > 0 && (() => {
                    const check = pickupDamageChecks[0];
                    return (
                      <div className="bg-white border rounded-md p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <ClipboardCheck className="h-4 w-4 text-green-600" />
                          <span className="text-xs font-medium text-green-600">{t('pickupReturn.common.interactiveCheck')}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm flex-1">
                            <p className="font-medium">
                              {t('pickupReturn.common.createdOnAt', { date: new Date(check.createdAt).toLocaleDateString(), time: new Date(check.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
                            </p>
                            {check.createdBy && (
                              <p className="text-xs text-muted-foreground">{t('pickupReturn.common.byLabel', { name: check.createdBy })}</p>
                            )}
                            {check.updatedBy && check.updatedBy !== check.createdBy && (
                              <p className="text-xs text-muted-foreground">
                                {t('pickupReturn.common.lastEditedBy', { name: check.updatedBy })}
                              </p>
                            )}
                            {check.pdfPath && (
                              <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {t('pickupReturn.common.pdfGenerated')}
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
                              title={t('pickupReturn.common.viewEditDamageCheckTitle')}
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              {t('pickupReturn.common.editButton')}
                            </Button>
                            {check.pdfPath && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(check.pdfPath, '_blank')}
                                title={t('pickupReturn.common.viewPdfTitle')}
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                {t('pickupReturn.common.pdfButton')}
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
                              title={t('pickupReturn.common.deleteDamageCheckTitle')}
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
                        <span className="text-xs font-medium text-blue-600">{t('pickupReturn.common.paperCheckUploaded')}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm flex-1">
                          <p className="font-medium">{doc.fileName || t('pickupReturn.common.paperDamageCheckFallbackName')}</p>
                          <p className="text-xs text-muted-foreground">
                            {t('pickupReturn.common.uploadedOnAt', { date: new Date(doc.createdAt).toLocaleDateString(), time: new Date(doc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(doc.filePath, '_blank')}
                            title={t('pickupReturn.common.viewDocumentTitle')}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            {t('pickupReturn.common.viewButton')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setPickupPaperCheckToDelete(doc.id);
                              setDeletePickupPaperCheckDialogOpen(true);
                            }}
                            title={t('pickupReturn.common.deletePaperDamageCheckTitle')}
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
                        {t('pickupReturn.common.addInteractiveCheck')}
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
                              title: t('pickupReturn.common.errorTitle'),
                              description: t('pickupReturn.common.noVehicleSelected'),
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
                            trackUploadedPaperCheck(uploadedDoc.id);
                            await refetchDocuments();
                            toast({
                              title: t('pickupReturn.common.successTitle'),
                              description: t('pickupReturn.common.paperDamageCheckUploadedDescription'),
                            });
                          } catch (error) {
                            console.error('Upload failed:', error);
                            toast({
                              title: t('pickupReturn.common.errorTitle'),
                              description: t('pickupReturn.common.failedToUploadPaperDamageCheck'),
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
                      {uploadingPaperDamageCheck ? t('pickupReturn.common.uploading') : t('pickupReturn.common.uploadPaperCheck')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {t('pickupReturn.pickup.createInteractiveCheckHintPickup')}
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
                      {t('pickupReturn.pickup.createPickupDamageCheck')}
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
                              title: t('pickupReturn.common.errorTitle'),
                              description: t('pickupReturn.common.noVehicleSelected'),
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
                            trackUploadedPaperCheck(uploadedDoc.id);
                            await refetchDocuments();
                            toast({
                              title: t('pickupReturn.common.successTitle'),
                              description: t('pickupReturn.common.paperDamageCheckUploadedDescription'),
                            });
                          } catch (error) {
                            console.error('Upload failed:', error);
                            toast({
                              title: t('pickupReturn.common.errorTitle'),
                              description: t('pickupReturn.common.failedToUploadPaperDamageCheck'),
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
                      {uploadingPaperDamageCheck ? t('pickupReturn.common.uploading') : t('pickupReturn.common.uploadPaperCheck')}
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pickupNotes">{t('pickupReturn.common.additionalNotesOptional')}</Label>
              <Textarea
                id="pickupNotes"
                value={pickupNotes}
                onChange={(e) => setPickupNotes(e.target.value)}
                placeholder={t('pickupReturn.pickup.notesPlaceholderPickup')}
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
                {t('common:actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={pickupMutation.isPending}
                data-testid="button-confirm-pickup"
              >
                {pickupMutation.isPending ? (
                  <>{t('pickupReturn.common.processing')}</>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    {t('pickupReturn.pickup.completePickupAndGenerateContract')}
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
              {t('pickupReturn.pickup.duplicateContractNumberTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('pickupReturn.pickup.duplicateContractNumberDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <p className="text-sm font-medium text-amber-900 mb-2">
                {t('pickupReturn.pickup.contractNumberAssignedTo', { number: contractNumber })}
              </p>
              {duplicateReservationInfo && (
                <div className="text-sm text-amber-800 space-y-1">
                  <div><strong>{t('pickupReturn.common.reservationIdLabel')}</strong> #{duplicateReservationInfo.id}</div>
                  {duplicateReservationInfo.vehicle && (
                    <div><strong>{t('pickupReturn.common.vehicleLabel')}</strong> {duplicateReservationInfo.vehicle.licensePlate} - {duplicateReservationInfo.vehicle.brand} {duplicateReservationInfo.vehicle.model}</div>
                  )}
                  {duplicateReservationInfo.customer && (
                    <div><strong>{t('pickupReturn.common.customerLabel')}</strong> {duplicateReservationInfo.customer.name}</div>
                  )}
                  <div><strong>{t('pickupReturn.common.statusLabel')}</strong> {duplicateReservationInfo.status}</div>
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              {t('pickupReturn.pickup.proceedWarning')}
            </p>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowDuplicateWarning(false)}
                data-testid="button-cancel-override"
              >
                {t('common:actions.cancel')}
              </Button>
              <Button
                variant="default"
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => proceedWithPickup(true)}
                data-testid="button-confirm-override"
              >
                {t('pickupReturn.pickup.overrideAndContinue')}
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
          <DialogTitle className="sr-only">{t('pickupReturn.pickup.interactiveDamageCheckPickupTitle')}</DialogTitle>
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
        title={t('pickupReturn.pickup.deletePickupDamageCheckTitle')}
        description={t('pickupReturn.pickup.deletePickupDamageCheckConfirm')}
        variant="danger"
        confirmLabel={t('pickupReturn.common.deleteConfirmLabel')}
        onConfirm={async () => {
          if (pickupDamageCheckToDelete) {
            try {
              await apiRequest('DELETE', `/api/interactive-damage-checks/${pickupDamageCheckToDelete}`, {});
              await refetchDamageChecks();
              toast({
                title: t('pickupReturn.common.deletedTitle'),
                description: t('pickupReturn.pickup.pickupDamageCheckDeletedDescription'),
              });
            } catch (error) {
              toast({
                variant: "destructive",
                title: t('pickupReturn.common.errorTitle'),
                description: t('pickupReturn.common.failedToDeleteDamageCheck'),
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
        title={t('pickupReturn.common.deletePaperDamageCheckDialogTitle')}
        description={t('pickupReturn.common.deletePaperDamageCheckConfirm')}
        variant="danger"
        confirmLabel={t('pickupReturn.common.deleteConfirmLabel')}
        onConfirm={async () => {
          if (pickupPaperCheckToDelete) {
            try {
              await apiRequest('DELETE', `/api/documents/${pickupPaperCheckToDelete}`, {});
              invalidateByPrefix(`/api/documents/reservation/${reservation.id}`);
              toast({
                title: t('pickupReturn.common.deletedTitle'),
                description: t('pickupReturn.common.paperDamageCheckDeletedDescription'),
              });
            } catch (error) {
              toast({
                variant: "destructive",
                title: t('pickupReturn.common.errorTitle'),
                description: t('pickupReturn.common.failedToDeletePaperDamageCheck'),
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
  const { t } = useTranslation(["reservations", "common"]);
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
  // Same stale-closure guard as the pickup dialog above.
  const uploadedPaperCheckIdsRef = useRef<number[]>([]);
  const trackUploadedPaperCheck = (id: number) => {
    uploadedPaperCheckIdsRef.current = [...uploadedPaperCheckIdsRef.current, id];
    setUploadedPaperCheckIds(uploadedPaperCheckIdsRef.current);
  };
  const clearTrackedPaperChecks = () => {
    uploadedPaperCheckIdsRef.current = [];
    setUploadedPaperCheckIds([]);
  };
  
  // Delete confirmation dialog states
  const [deleteReturnDamageCheckDialogOpen, setDeleteReturnDamageCheckDialogOpen] = useState(false);
  const [returnDamageCheckToDelete, setReturnDamageCheckToDelete] = useState<number | null>(null);
  const [deleteReturnPaperCheckDialogOpen, setDeleteReturnPaperCheckDialogOpen] = useState(false);
  const [returnPaperCheckToDelete, setReturnPaperCheckToDelete] = useState<number | null>(null);

  // Cleanup function to delete uploaded paper checks on cancel
  const cleanupUploadedPaperChecks = async () => {
    const pending = uploadedPaperCheckIdsRef.current;
    uploadedPaperCheckIdsRef.current = [];
    for (const docId of pending) {
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

  // Closing with X or Escape must clean up too, otherwise the ids leak into
  // the next reservation opened in this same dialog instance.
  const handleOpenChange = async (next: boolean) => {
    if (!next) {
      await cleanupUploadedPaperChecks();
    }
    onOpenChange(next);
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
        title: t('pickupReturn.return.returnCompletedTitle'),
        description: t('pickupReturn.return.returnCompletedDescription'),
      });
      await invalidateByPrefix("/api/reservations");
      await invalidateByPrefix("/api/reservations");
      await invalidateByPrefix(`/api/documents/reservation/${reservation.id}`);
      // Return writes the vehicle's mileage and fuel level too - without this,
      // an already-open Vehicle Details view keeps showing stale values.
      await invalidateByPrefix("/api/vehicles");
      clearTrackedPaperChecks(); // Clear tracked IDs - documents are now permanent
      
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
        title: t('pickupReturn.return.returnFailedTitle'),
        description: error.message || t('pickupReturn.return.processReturnFailedFallback'),
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const mileage = parseInt(returnMileage);
    if (isNaN(mileage) || mileage < 0) {
      toast({
        variant: "destructive",
        title: t('pickupReturn.pickup.invalidMileageTitle'),
        description: t('pickupReturn.pickup.invalidMileageDescription'),
      });
      return;
    }

    if (reservation.pickupMileage && mileage < reservation.pickupMileage) {
      toast({
        variant: "destructive",
        title: t('pickupReturn.pickup.invalidMileageTitle'),
        description: t('pickupReturn.return.returnMileageLessThanPickup', { km: reservation.pickupMileage }),
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* z-[60]: same stacking issue as the pickup dialog above. */}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-[60]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            {t('pickupReturn.return.startReturnProcess')}
          </DialogTitle>
          <DialogDescription>
            {t('pickupReturn.return.returnDialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Vehicle Information */}
          <div className="bg-muted/50 rounded-md p-3">
            <div className="space-y-1">
              <h3 className="font-medium text-sm">{t('pickupReturn.common.vehicleInformation')}</h3>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                <div className="flex items-center">
                  <span className="text-muted-foreground mr-1">{t('pickupReturn.common.licenseLabel')}</span>
                  <span className="font-medium">{reservation.vehicle?.licensePlate}</span>
                </div>
                <div className="flex items-center">
                  <span className="text-muted-foreground mr-1">{t('pickupReturn.common.vehicleLabel')}</span>
                  <span className="font-medium">{reservation.vehicle?.brand} {reservation.vehicle?.model}</span>
                </div>
                {reservation.pickupMileage && (
                  <div className="flex items-center">
                    <span className="text-muted-foreground mr-1">{t('pickupReturn.return.atPickupLabel')}</span>
                    <span className="font-medium">{reservation.pickupMileage.toLocaleString()} km</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Combined Completion Details and Fuel Tracking */}
            <div className="border rounded-lg p-4 bg-slate-50 space-y-4">
              <h3 className="font-semibold text-base">{t('pickupReturn.return.completionDetails')}</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="returnDate">
                    {t('pickupReturn.return.returnDateLabel')}
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
                    {t('pickupReturn.return.returnDateHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="returnMileage">
                    {t('pickupReturn.return.mileageWhenReturned')}
                  </Label>
                  <Input
                    id="returnMileage"
                    type="number"
                    value={returnMileage}
                    onChange={(e) => setReturnMileage(e.target.value)}
                    placeholder={reservation.pickupMileage ? t('pickupReturn.return.pickupMileagePlaceholder', { mileage: reservation.pickupMileage.toLocaleString() }) : t('pickupReturn.return.enterReturnMileagePlaceholder')}
                    required
                    className="bg-white"
                    data-testid="input-return-mileage"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('pickupReturn.return.odometerAtReturnHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fuelLevelReturn">
                    {t('pickupReturn.return.fuelLevelAtReturn')}
                  </Label>
                  <Select value={fuelLevelReturn} onValueChange={setFuelLevelReturn}>
                    <SelectTrigger className="bg-white" data-testid="select-fuel-level-return">
                      <SelectValue placeholder={t('pickupReturn.common.fuelSelectPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Full">{t('pickupReturn.common.fuelFull')}</SelectItem>
                      <SelectItem value="3/4">3/4</SelectItem>
                      <SelectItem value="1/2">1/2</SelectItem>
                      <SelectItem value="1/4">1/4</SelectItem>
                      <SelectItem value="Empty">{t('pickupReturn.common.fuelEmpty')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('pickupReturn.common.currentFuelInTankHint')}
                    {reservation.fuelLevelPickup && (
                      <span className="block text-blue-700 font-medium mt-0.5">
                        {t('pickupReturn.return.atPickupFuelLabel', { fuel: reservation.fuelLevelPickup })}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Damage Check Section */}
            <div className="border rounded-lg p-4 bg-green-50 space-y-3">
              <h3 className="font-semibold text-base">{t('pickupReturn.common.damageCheck')}</h3>
              
              {returnDamageChecks.length > 0 || returnPaperDamageChecks.length > 0 ? (
                <div className="space-y-2">
                  {/* Interactive damage checks */}
                  {returnDamageChecks.length > 0 && (() => {
                    const check = returnDamageChecks[0];
                    return (
                      <div className="bg-white border rounded-md p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <ClipboardCheck className="h-4 w-4 text-green-600" />
                          <span className="text-xs font-medium text-green-600">{t('pickupReturn.common.interactiveCheck')}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm flex-1">
                            <p className="font-medium">
                              {t('pickupReturn.common.createdOnAt', { date: new Date(check.createdAt).toLocaleDateString(), time: new Date(check.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
                            </p>
                            {check.createdBy && (
                              <p className="text-xs text-muted-foreground">{t('pickupReturn.common.byLabel', { name: check.createdBy })}</p>
                            )}
                            {check.updatedBy && check.updatedBy !== check.createdBy && (
                              <p className="text-xs text-muted-foreground">
                                {t('pickupReturn.common.lastEditedBy', { name: check.updatedBy })}
                              </p>
                            )}
                            {check.pdfPath && (
                              <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {t('pickupReturn.common.pdfGenerated')}
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
                              title={t('pickupReturn.common.viewEditDamageCheckTitle')}
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              {t('pickupReturn.common.editButton')}
                            </Button>
                            {check.pdfPath && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(check.pdfPath, '_blank')}
                                title={t('pickupReturn.common.viewPdfTitle')}
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                {t('pickupReturn.common.pdfButton')}
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
                              title={t('pickupReturn.common.deleteDamageCheckTitle')}
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
                        <span className="text-xs font-medium text-blue-600">{t('pickupReturn.common.paperCheckUploaded')}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm flex-1">
                          <p className="font-medium">{doc.fileName || t('pickupReturn.common.paperDamageCheckFallbackName')}</p>
                          <p className="text-xs text-muted-foreground">
                            {t('pickupReturn.common.uploadedOnAt', { date: new Date(doc.createdAt).toLocaleDateString(), time: new Date(doc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(doc.filePath, '_blank')}
                            title={t('pickupReturn.common.viewDocumentTitle')}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            {t('pickupReturn.common.viewButton')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReturnPaperCheckToDelete(doc.id);
                              setDeleteReturnPaperCheckDialogOpen(true);
                            }}
                            title={t('pickupReturn.common.deletePaperDamageCheckTitle')}
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
                        {t('pickupReturn.common.addInteractiveCheck')}
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
                              title: t('pickupReturn.common.errorTitle'),
                              description: t('pickupReturn.return.noVehicleAssociated'),
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
                            trackUploadedPaperCheck(uploadedDoc.id);
                            await refetchDocuments();
                            toast({
                              title: t('pickupReturn.common.successTitle'),
                              description: t('pickupReturn.common.paperDamageCheckUploadedDescription'),
                            });
                          } catch (error) {
                            console.error('Upload failed:', error);
                            toast({
                              title: t('pickupReturn.common.errorTitle'),
                              description: t('pickupReturn.common.failedToUploadPaperDamageCheck'),
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
                      {uploadingPaperDamageCheck ? t('pickupReturn.common.uploading') : t('pickupReturn.common.uploadPaperCheck')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {t('pickupReturn.return.createInteractiveCheckHintReturn')}
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
                      {t('pickupReturn.return.createReturnDamageCheck')}
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
                              title: t('pickupReturn.common.errorTitle'),
                              description: t('pickupReturn.return.noVehicleAssociated'),
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
                            trackUploadedPaperCheck(uploadedDoc.id);
                            await refetchDocuments();
                            toast({
                              title: t('pickupReturn.common.successTitle'),
                              description: t('pickupReturn.common.paperDamageCheckUploadedDescription'),
                            });
                          } catch (error) {
                            console.error('Upload failed:', error);
                            toast({
                              title: t('pickupReturn.common.errorTitle'),
                              description: t('pickupReturn.common.failedToUploadPaperDamageCheck'),
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
                      {uploadingPaperDamageCheck ? t('pickupReturn.common.uploading') : t('pickupReturn.common.uploadPaperCheck')}
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Notes Section */}
            <div className="space-y-2">
              <Label htmlFor="returnNotes">{t('pickupReturn.common.additionalNotesOptional')}</Label>
              <Textarea
                id="returnNotes"
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder={t('pickupReturn.return.notesPlaceholderReturn')}
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
                {t('common:actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={returnMutation.isPending}
                data-testid="button-confirm-return"
              >
                {returnMutation.isPending ? (
                  <>{t('pickupReturn.common.processing')}</>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    {t('pickupReturn.return.completeReturnAndGenerateDamageCheck')}
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
          <DialogTitle className="sr-only">{t('pickupReturn.return.interactiveDamageCheckReturnTitle')}</DialogTitle>
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
        title={t('pickupReturn.return.deleteReturnDamageCheckTitle')}
        description={t('pickupReturn.return.deleteReturnDamageCheckConfirm')}
        variant="danger"
        confirmLabel={t('pickupReturn.common.deleteConfirmLabel')}
        onConfirm={async () => {
          if (returnDamageCheckToDelete) {
            try {
              await apiRequest('DELETE', `/api/interactive-damage-checks/${returnDamageCheckToDelete}`, {});
              await refetchDamageChecks();
              toast({
                title: t('pickupReturn.common.deletedTitle'),
                description: t('pickupReturn.return.returnDamageCheckDeletedDescription'),
              });
            } catch (error) {
              toast({
                variant: "destructive",
                title: t('pickupReturn.common.errorTitle'),
                description: t('pickupReturn.common.failedToDeleteDamageCheck'),
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
        title={t('pickupReturn.common.deletePaperDamageCheckDialogTitle')}
        description={t('pickupReturn.common.deletePaperDamageCheckConfirm')}
        variant="danger"
        confirmLabel={t('pickupReturn.common.deleteConfirmLabel')}
        onConfirm={async () => {
          if (returnPaperCheckToDelete) {
            try {
              await apiRequest('DELETE', `/api/documents/${returnPaperCheckToDelete}`, {});
              invalidateByPrefix(`/api/documents/reservation/${reservation.id}`);
              toast({
                title: t('pickupReturn.common.deletedTitle'),
                description: t('pickupReturn.common.paperDamageCheckDeletedDescription'),
              });
            } catch (error) {
              toast({
                variant: "destructive",
                title: t('pickupReturn.common.errorTitle'),
                description: t('pickupReturn.common.failedToDeletePaperDamageCheck'),
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
