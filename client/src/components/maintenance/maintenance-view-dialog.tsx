import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Reservation, Vehicle, Customer, Driver } from "@shared/schema";
import { 
  Calendar, 
  Car, 
  User, 
  Phone, 
  Mail, 
  Wrench,
  Edit,
  FileText,
  Clock,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Upload,
  Receipt,
  Camera,
  AlertTriangle,
  FolderOpen,
  Download,
  Printer,
  Eye
} from "lucide-react";
import { displayLicensePlate } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { useState } from "react";
import { VehicleSelector } from "@/components/ui/vehicle-selector";
import { apiRequest , invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { InlineDocumentUpload } from "@/components/documents/inline-document-upload";
import { InvoiceScanner } from "@/components/invoice-scanner";
import { Link } from "wouter";

interface MaintenanceViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: number | null;
  onEdit?: (reservation: Reservation) => void;
}

export function MaintenanceViewDialog({
  open,
  onOpenChange,
  reservationId,
  onEdit,
}: MaintenanceViewDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingSpare, setEditingSpare] = useState<number | null>(null);
  const [showAllDocuments, setShowAllDocuments] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any | null>(null);

  // Fetch reservation data
  const { data: reservation, isLoading } = useQuery<Reservation>({
    queryKey: [`/api/reservations/${reservationId}`],
    enabled: !!reservationId && open,
  });

  // Fetch vehicle data
  const { data: vehicle } = useQuery<Vehicle>({
    queryKey: [`/api/vehicles/${reservation?.vehicleId}`],
    enabled: !!reservation?.vehicleId && open,
  });

  // Fetch customer data if available
  const { data: customer } = useQuery<Customer>({
    queryKey: [`/api/customers/${reservation?.customerId}`],
    enabled: !!reservation?.customerId && open,
  });

  // Fetch driver data if available
  const { data: driver } = useQuery<Driver>({
    queryKey: [`/api/drivers/${reservation?.driverId}`],
    enabled: !!reservation?.driverId && open,
  });

  // Fetch documents for this reservation
  const { data: documents = [] } = useQuery<any[]>({
    queryKey: [`/api/documents/reservation/${reservationId}`],
    enabled: !!reservationId && open,
  });

  // Fetch all reservations to find overlapping rentals
  const { data: allReservations = [] } = useQuery<Reservation[]>({
    queryKey: ['/api/reservations'],
    enabled: !!reservation && open,
  });

  // Fetch available vehicles for spare assignment
  const { data: availableVehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ['/api/vehicles/available'],
    enabled: open,
  });

  // Fetch all vehicles to display already-assigned spares
  const { data: allVehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ['/api/vehicles'],
    enabled: open,
  });

  // Find overlapping rentals during this maintenance
  const overlappingRentals = reservation ? allReservations.filter((r: Reservation) => {
    if (r.id === reservation.id) return false;
    if (r.type !== 'standard') return false;
    if (r.status !== 'booked' && r.status !== 'picked_up') return false;
    if (r.vehicleId !== reservation.vehicleId) return false;

    const maintenanceStart = new Date(reservation.startDate);
    const maintenanceEnd = reservation.endDate ? new Date(reservation.endDate) : maintenanceStart;
    const rentalStart = new Date(r.startDate);
    const rentalEnd = r.endDate ? new Date(r.endDate) : new Date('2099-12-31');

    return (rentalStart <= maintenanceEnd && rentalEnd >= maintenanceStart);
  }) : [];

  // Update spare vehicle mutation
  const updateSpareMutation = useMutation({
    mutationFn: async ({ rentalId, spareVehicleId, replacementReservationId, placeholder, ownTransport }: { 
      rentalId: number; 
      spareVehicleId: number | null;
      replacementReservationId?: number;
      placeholder?: boolean;
      ownTransport?: boolean;
    }) => {
      const rental = allReservations.find(r => r.id === rentalId);
      if (!rental) throw new Error('Rental not found');

      if (ownTransport) {
        // Mark as customer arranging own transport - delete any existing replacement reservation
        if (replacementReservationId) {
          const response = await apiRequest('DELETE', `/api/reservations/${replacementReservationId}`);
          return response.json();
        }
        // Update the rental to mark it as customer arranging
        const response = await apiRequest('PATCH', `/api/reservations/${rentalId}`, {
          spareAssignmentDecision: 'customer_arranging',
        });
        return response.json();
      } else if (placeholder) {
        // Create or update TBD placeholder spare
        if (replacementReservationId) {
          // Update existing to placeholder with maintenance period dates
          // Calculate overlap between maintenance window and rental period
          const maintenanceStart = reservation?.startDate;
          const maintenanceEnd = reservation?.endDate || reservation?.startDate;
          const rentalStart = rental.startDate;
          const rentalEnd = rental.endDate;
          
          // For open-ended rentals, use entire maintenance period
          const isOpenEnded = !rentalEnd || rentalEnd === null;
          const overlapStart = (maintenanceStart && rentalStart > maintenanceStart) ? rentalStart : maintenanceStart;
          const overlapEnd = isOpenEnded ? maintenanceEnd : (maintenanceEnd && rentalEnd && rentalEnd < maintenanceEnd ? rentalEnd : maintenanceEnd);
          
          const response = await apiRequest('PATCH', `/api/reservations/${replacementReservationId}`, {
            vehicleId: null,
            placeholderSpare: true,
            startDate: overlapStart,
            endDate: overlapEnd,
            status: 'booked', // Reset to booked if it was returned/completed
          });
          return response.json();
        } else {
          // Create new placeholder replacement reservation with maintenance period dates
          // Calculate overlap between maintenance window and rental period
          const maintenanceStart = reservation?.startDate;
          const maintenanceEnd = reservation?.endDate || reservation?.startDate;
          const rentalStart = rental.startDate;
          const rentalEnd = rental.endDate;
          
          // For open-ended rentals, use entire maintenance period
          const isOpenEnded = !rentalEnd || rentalEnd === null;
          const overlapStart = (maintenanceStart && rentalStart > maintenanceStart) ? rentalStart : maintenanceStart;
          const overlapEnd = isOpenEnded ? maintenanceEnd : (maintenanceEnd && rentalEnd && rentalEnd < maintenanceEnd ? rentalEnd : maintenanceEnd);
          
          const response = await apiRequest('POST', '/api/reservations', {
            type: 'replacement',
            replacementForReservationId: rentalId,
            vehicleId: null,
            placeholderSpare: true,
            customerId: rental.customerId,
            driverId: rental.driverId,
            startDate: overlapStart,
            endDate: overlapEnd,
            status: 'booked',
            totalPrice: 0,
          });
          return response.json();
        }
      } else if (spareVehicleId) {
        // Assign or update spare vehicle
        if (replacementReservationId) {
          // Update existing replacement reservation
          const response = await apiRequest('PATCH', `/api/reservations/${replacementReservationId}`, {
            vehicleId: spareVehicleId,
            placeholderSpare: false,
          });
          return response.json();
        } else {
          // Create new replacement reservation
          const response = await apiRequest('POST', '/api/reservations', {
            type: 'replacement',
            replacementForReservationId: rentalId,
            vehicleId: spareVehicleId,
            placeholderSpare: false,
            customerId: rental.customerId,
            driverId: rental.driverId,
            startDate: rental.startDate,
            endDate: rental.endDate || rental.startDate,
            status: 'booked',
            totalPrice: 0,
          });
          return response.json();
        }
      } else if (replacementReservationId) {
        // Remove spare vehicle by deleting replacement reservation
        const response = await apiRequest('DELETE', `/api/reservations/${replacementReservationId}`);
        return response.json();
      }
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Spare vehicle assignment updated",
      });
      invalidateByPrefix('/api/reservations');
      setEditingSpare(null);
    },
    onError: (error: any) => {
      console.error('Spare vehicle update error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update spare vehicle",
        variant: "destructive",
      });
    },
  });

  // Parse maintenance notes
  const parseMaintenanceNotes = (notes: string) => {
    const lines = notes.split('\n');
    const firstLine = lines[0] || '';
    const maintenanceType = firstLine.split(': ')[0] || '';
    const description = firstLine.split(': ')[1] || '';
    
    // Extract contact phone if present
    const contactPhoneLine = lines.find(line => line.startsWith('Contact Phone:'));
    const contactPhone = contactPhoneLine ? contactPhoneLine.replace('Contact Phone:', '').trim() : '';
    
    // Get additional notes (everything except first line and contact phone)
    const additionalNotes = lines
      .slice(1)
      .filter(line => !line.startsWith('Contact Phone:'))
      .join('\n')
      .trim();
    
    return {
      maintenanceType,
      description,
      contactPhone,
      notes: additionalNotes
    };
  };

  const parsed = reservation ? parseMaintenanceNotes(reservation.notes || '') : null;

  // Format maintenance type for display
  const formatMaintenanceType = (type: string) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><Clock className="h-3 w-3 mr-1" />Scheduled</Badge>;
      case 'in':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200"><Wrench className="h-3 w-3 mr-1" />In Progress</Badge>;
      case 'out':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!reservation || isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Loading...</DialogTitle>
            <DialogDescription>
              Please wait while we load the maintenance details.
            </DialogDescription>
          </DialogHeader>
          <div className="py-8 text-center text-muted-foreground">
            Loading maintenance details...
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl flex items-center gap-2">
                <Wrench className="h-6 w-6 text-orange-600" />
                Maintenance Details
              </DialogTitle>
              <DialogDescription>
                {vehicle && (
                  <span className="font-medium">
                    {vehicle.brand} {vehicle.model} ({displayLicensePlate(vehicle.licensePlate)})
                  </span>
                )}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(reservation.maintenanceStatus || 'scheduled')}
              {onEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit(reservation)}
                  data-testid="button-edit-maintenance"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Maintenance Information */}
          <div className="bg-orange-50 dark:bg-orange-950 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
            <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-3 flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Maintenance Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Type</label>
                <div className="text-sm font-medium text-orange-900 dark:text-orange-100 mt-1">
                  {parsed?.maintenanceType ? formatMaintenanceType(parsed.maintenanceType) : 'Not specified'}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Description</label>
                <div className="text-sm text-orange-900 dark:text-orange-100 mt-1">
                  {parsed?.description || 'No description provided'}
                </div>
              </div>
            </div>
          </div>

          {/* Schedule Information */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Schedule
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Start Date</label>
                <div className="text-sm font-medium mt-1">
                  {format(new Date(reservation.startDate), 'MMM dd, yyyy')}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">End Date</label>
                <div className="text-sm font-medium mt-1">
                  {reservation.endDate ? format(new Date(reservation.endDate), 'MMM dd, yyyy') : 'Not set'}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Duration</label>
                <div className="text-sm font-medium mt-1">
                  {reservation.maintenanceDuration || 1} day{reservation.maintenanceDuration !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Vehicle Information */}
          {vehicle && (
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <Car className="h-4 w-4" />
                Vehicle
              </h3>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <label className="text-xs text-muted-foreground">License Plate</label>
                    <div className="font-medium">{displayLicensePlate(vehicle.licensePlate)}</div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Brand</label>
                    <div className="font-medium">{vehicle.brand}</div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Model</label>
                    <div className="font-medium">{vehicle.model}</div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Type</label>
                    <div className="font-medium">{vehicle.vehicleType || 'N/A'}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Customer/Driver Information - Compact */}
          {(customer || driver || parsed?.contactPhone) && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Contact Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customer && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border">
                      <label className="text-xs text-muted-foreground">Customer</label>
                      <div className="font-medium text-sm mt-1">{customer.name}</div>
                      {customer.phone && (
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {customer.phone}
                        </div>
                      )}
                      {customer.email && (
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {customer.email}
                        </div>
                      )}
                    </div>
                  )}
                  {driver && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border">
                      <label className="text-xs text-muted-foreground">Driver</label>
                      <div className="font-medium text-sm mt-1">{driver.displayName}</div>
                      {driver.phone && (
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {driver.phone}
                        </div>
                      )}
                    </div>
                  )}
                  {parsed?.contactPhone && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border">
                      <label className="text-xs text-muted-foreground">Contact Phone</label>
                      <div className="font-medium text-sm mt-1 flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {parsed.contactPhone}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Spare Vehicle Assignments */}
          <Separator />
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Spare Vehicle Assignments
            </h3>
            {overlappingRentals.length > 0 ? (
              <div className="space-y-3">
                {overlappingRentals.map((rental: Reservation) => {
                  const rentalCustomer = allReservations.find(r => r.id === rental.id)?.customer;
                  const rentalDriver = allReservations.find(r => r.id === rental.id)?.driver;
                  
                  // Find the replacement reservation for this rental
                  const replacementReservation = allReservations.find(
                    (r: Reservation) => r.type === 'replacement' && r.replacementForReservationId === rental.id
                  );
                  const spareVehicleId = replacementReservation?.vehicleId;
                  const assignedSpareVehicle = spareVehicleId 
                    ? allVehicles.find(v => v.id === spareVehicleId)
                    : null;
                  
                  return (
                    <div key={rental.id} className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="font-medium text-blue-900 dark:text-blue-100">
                            {rentalCustomer?.name || 'Customer'}
                            {rentalDriver && <span className="text-sm ml-2">({rentalDriver.displayName})</span>}
                          </div>
                          <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                            Rental: {format(new Date(rental.startDate), 'MMM dd, yyyy')} - {rental.endDate ? format(new Date(rental.endDate), 'MMM dd, yyyy') : 'Open'}
                          </div>
                          {rentalCustomer?.phone && (
                            <div className="text-xs text-blue-700 dark:text-blue-300 mt-1 flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {rentalCustomer.phone}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Assigned Spare Vehicle</label>
                        {editingSpare === rental.id ? (
                          <div className="space-y-2">
                            <VehicleSelector
                              vehicles={availableVehicles}
                              value={spareVehicleId?.toString() || ""}
                              onChange={(vehicleId) => {
                                if (vehicleId) {
                                  updateSpareMutation.mutate({
                                    rentalId: rental.id,
                                    spareVehicleId: parseInt(vehicleId.toString()),
                                    replacementReservationId: replacementReservation?.id,
                                  });
                                }
                              }}
                              placeholder="Select spare vehicle..."
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  updateSpareMutation.mutate({
                                    rentalId: rental.id,
                                    spareVehicleId: null,
                                    replacementReservationId: replacementReservation?.id,
                                    placeholder: true,
                                  });
                                }}
                              >
                                TBD (Placeholder)
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  updateSpareMutation.mutate({
                                    rentalId: rental.id,
                                    spareVehicleId: null,
                                    replacementReservationId: replacementReservation?.id,
                                    ownTransport: true,
                                  });
                                }}
                              >
                                Own Transport
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingSpare(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-md p-2 border">
                            <div className="text-sm">
                              {rental.spareAssignmentDecision === 'customer_arranging' ? (
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4 text-blue-600" />
                                  <span className="font-medium text-blue-700 dark:text-blue-400">Own Transport</span>
                                  <span className="text-xs text-muted-foreground">(Customer arranging)</span>
                                </div>
                              ) : assignedSpareVehicle ? (
                                <div className="flex items-center gap-2">
                                  <Car className="h-4 w-4 text-green-600" />
                                  <span className="font-medium">
                                    {displayLicensePlate(assignedSpareVehicle.licensePlate)}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {assignedSpareVehicle.brand} {assignedSpareVehicle.model}
                                  </span>
                                </div>
                              ) : replacementReservation?.placeholderSpare ? (
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4 text-orange-600" />
                                  <span className="font-medium text-orange-700 dark:text-orange-400">TBD (Placeholder)</span>
                                  <span className="text-xs text-muted-foreground">(To be assigned)</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground italic">No spare vehicle assigned</span>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingSpare(rental.id)}
                              data-testid={`button-edit-spare-${rental.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground bg-gray-50 dark:bg-gray-800 rounded-lg border">
                <RefreshCw className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No overlapping rentals during this maintenance period</p>
              </div>
            )}
          </div>

          {/* Additional Notes */}
          {parsed?.notes && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Notes
                </h3>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border text-sm whitespace-pre-wrap">
                  {parsed.notes}
                </div>
              </div>
            </>
          )}

          {/* Maintenance Documents */}
          <Separator />
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Maintenance Documents</h3>
            
            {/* Quick Upload */}
            <div className="mb-4">
              <label className="text-sm text-gray-600 dark:text-gray-400 mb-2 block">Quick Upload:</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <InvoiceScanner
                  selectedVehicleId={vehicle?.id}
                  onExpensesCreated={(expenses) => {
                    console.log('Expenses created from invoice:', expenses);
                    invalidateByPrefix('/api/expenses');
                    invalidateByPrefix(`/api/documents/reservation/${reservation?.id}`);
                    toast({
                      title: "Expenses created",
                      description: `Created ${expenses.length} expense record(s) from invoice`,
                    });
                  }}
                />

                <InlineDocumentUpload
                  vehicleId={vehicle?.id || 0}
                  reservationId={reservation?.id}
                  preselectedType="Vehicle Photos"
                  onSuccess={() => {
                    invalidateByPrefix(`/api/documents/reservation/${reservation?.id}`);
                  }}
                >
                  <Button variant="outline" size="sm" className="w-full" data-testid="button-upload-photos">
                    + Service Photo
                  </Button>
                </InlineDocumentUpload>

                <InlineDocumentUpload
                  vehicleId={vehicle?.id || 0}
                  reservationId={reservation?.id}
                  preselectedType="Maintenance Record"
                  onSuccess={() => {
                    invalidateByPrefix(`/api/documents/reservation/${reservation?.id}`);
                  }}
                >
                  <Button variant="outline" size="sm" className="w-full" data-testid="button-upload-maintenance-pdf">
                    + Service Report PDF
                  </Button>
                </InlineDocumentUpload>

                <InlineDocumentUpload
                  vehicleId={vehicle?.id || 0}
                  reservationId={reservation?.id}
                  preselectedType="Other"
                  onSuccess={() => {
                    invalidateByPrefix(`/api/documents/reservation/${reservation?.id}`);
                  }}
                >
                  <Button variant="outline" size="sm" className="w-full" data-testid="button-upload-other">
                    + Other
                  </Button>
                </InlineDocumentUpload>
              </div>
            </div>

            {/* Uploaded Documents */}
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400 mb-2 block">Uploaded Documents:</label>
              {documents.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {documents.map((doc: any) => (
                    <div 
                      key={doc.id} 
                      className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      onClick={() => window.open(`/api/documents/download/${doc.id}`, '_blank')}
                    >
                      <FileText className="h-5 w-5 text-red-500" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{doc.documentType}</div>
                        <div className="text-xs text-muted-foreground uppercase">
                          {doc.fileName?.split('.').pop() || 'FILE'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground bg-gray-50 dark:bg-gray-800 rounded-lg border">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No maintenance documents uploaded yet</p>
                </div>
              )}
            </div>

            {/* View All Documents Button */}
            <Button 
              variant="link" 
              size="sm" 
              className="mt-3 p-0 h-auto" 
              data-testid="button-view-all-documents"
              onClick={() => setShowAllDocuments(true)}
            >
              View All Documents →
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* All Documents Dialog */}
    <Dialog open={showAllDocuments} onOpenChange={setShowAllDocuments}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Maintenance Documents</DialogTitle>
          <DialogDescription>
            All documents for {vehicle?.brand} {vehicle?.model} ({displayLicensePlate(vehicle?.licensePlate || '')})
          </DialogDescription>
        </DialogHeader>

        {documents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc: any) => {
              const isImage = doc.contentType?.startsWith('image/');
              const isPDF = doc.contentType === 'application/pdf';
              
              return (
                <div 
                  key={doc.id} 
                  className="flex flex-col gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border"
                >
                  {isImage ? (
                    <div className="aspect-video bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                      <img 
                        src={`/api/documents/download/${doc.id}`} 
                        alt={doc.documentType}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                      <FileText className="h-12 w-12 text-red-500" />
                    </div>
                  )}
                  <div>
                    <div className="font-medium text-sm truncate">{doc.documentType}</div>
                    <div className="text-xs text-muted-foreground uppercase">
                      {doc.fileName?.split('.').pop() || 'FILE'}
                    </div>
                    {doc.notes && (
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {doc.notes}
                      </div>
                    )}
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex gap-1 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 px-2"
                      onClick={() => setPreviewDocument(doc)}
                      data-testid={`button-view-${doc.id}`}
                      title="View document"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 px-2"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = `/api/documents/download/${doc.id}`;
                        link.download = doc.fileName || 'document';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      data-testid={`button-download-${doc.id}`}
                      title="Download document"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 px-2"
                      onClick={() => {
                        const printWindow = window.open(`/api/documents/download/${doc.id}`, '_blank');
                        if (printWindow) {
                          printWindow.addEventListener('load', () => {
                            setTimeout(() => {
                              printWindow.print();
                            }, 250);
                          });
                        }
                      }}
                      data-testid={`button-print-${doc.id}`}
                      title="Print document"
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No documents uploaded yet</p>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Document Preview Dialog */}
    <Dialog open={!!previewDocument} onOpenChange={() => setPreviewDocument(null)}>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{previewDocument?.documentType}</DialogTitle>
          <DialogDescription>
            {previewDocument?.fileName}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          {previewDocument?.contentType?.startsWith('image/') ? (
            <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-lg p-4">
              <img 
                src={`/api/documents/download/${previewDocument.id}`} 
                alt={previewDocument.documentType}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
          ) : previewDocument?.contentType === 'application/pdf' ? (
            <iframe
              src={`/api/documents/download/${previewDocument.id}`}
              className="w-full h-[70vh] rounded-lg border"
              title={previewDocument.documentType}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="h-16 w-16 mb-4 text-gray-300" />
              <p className="text-lg font-medium">Preview not available</p>
              <p className="text-sm">This file type cannot be previewed</p>
              <Button
                className="mt-4"
                onClick={() => window.open(`/api/documents/download/${previewDocument.id}`, '_blank')}
              >
                <Download className="h-4 w-4 mr-2" />
                Download to view
              </Button>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-4">
          <Button
            variant="outline"
            onClick={() => {
              const link = document.createElement('a');
              link.href = `/api/documents/download/${previewDocument.id}`;
              link.download = previewDocument.fileName || 'document';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const printWindow = window.open(`/api/documents/download/${previewDocument.id}`, '_blank');
              if (printWindow) {
                printWindow.addEventListener('load', () => {
                  setTimeout(() => {
                    printWindow.print();
                  }, 250);
                });
              }
            }}
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" onClick={() => setPreviewDocument(null)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
