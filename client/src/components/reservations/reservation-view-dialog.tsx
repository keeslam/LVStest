import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDate, formatCurrency, formatLicensePlate, formatReservationStatus } from "@/lib/format-utils";
import { Price } from "@/components/ui/price";
import { Reservation, Vehicle, Customer, Driver, Document } from "@shared/schema";
import { BarcodeSvg } from "@/components/barcodes/barcode-svg";
import { formatReservationBarcode } from "@shared/barcode";
import { differenceInDays, parseISO } from "date-fns";
import { Wrench, Car, ArrowRightLeft, Trash2, Edit, FileText, Upload, FileCheck, X, Camera, AlertCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { apiRequest, invalidateRelatedQueries , invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { UploadContractButton } from "@/components/documents/contract-upload-button";
import { SpareVehicleDialog } from "@/components/reservations/spare-vehicle-dialog";
import { ServiceVehicleDialog } from "@/components/reservations/service-vehicle-dialog";
import { ReturnFromServiceDialog } from "@/components/reservations/return-from-service-dialog";
import { ExpenseAddDialog } from "@/components/expenses/expense-add-dialog";
import { CustomerViewDialog } from "@/components/customers/customer-view-dialog";
import { VehicleViewDialog } from "@/components/vehicles/vehicle-view-dialog";
import { ReservationDocumentsDialog } from "@/components/reservations/reservation-documents-dialog";
import { PickupDialog, ReturnDialog } from "@/components/reservations/pickup-return-dialogs";

const DOCUMENT_QUICK_TYPE_KEYS: Record<string, string> = {
  "Contract (Signed)": "contractSigned",
  "Damage Report Photo": "damageReportPhoto",
  "Damage Report PDF": "damageReportPdf",
  "Other": "other",
};

interface ReservationViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: number | null;
  onEdit?: (reservationId: number) => void;
}

export function ReservationViewDialog({ 
  open, 
  onOpenChange, 
  reservationId,
  onEdit 
}: ReservationViewDialogProps) {
  const { t } = useTranslation("reservations");
  const { toast } = useToast();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [isSpareDialogOpen, setIsSpareDialogOpen] = useState(false);
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
  const [isVehicleDialogOpen, setIsVehicleDialogOpen] = useState(false);
  const [viewVehicleId, setViewVehicleId] = useState<number | null>(null);
  const [isDocumentsDialogOpen, setIsDocumentsDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [pickupDialogOpen, setPickupDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [deleteDocDialogOpen, setDeleteDocDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  const queryClient = useQueryClient();

  // Fetch reservation details
  const { data: reservation, isLoading, error } = useQuery<Reservation>({
    queryKey: [`/api/reservations/${reservationId}`],
    enabled: !!reservationId && open,
  });
  
  // Delete reservation mutation
  const deleteReservationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/reservations/${reservationId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete reservation');
      }
      return true;
    },
    onSuccess: async () => {
      // Use comprehensive cache invalidation for reservations
      invalidateRelatedQueries('reservations', {
        id: reservationId!,
        vehicleId: reservation?.vehicleId || undefined,
        customerId: reservation?.customerId || undefined
      });
      
      toast({
        title: t('viewDialog.toasts.reservationDeletedTitle'),
        description: t('viewDialog.toasts.reservationDeletedDescription'),
      });

      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('viewDialog.errorTitle'),
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Fetch vehicle and customer details if reservation is loaded
  const { data: vehicle } = useQuery<Vehicle>({
    queryKey: [`/api/vehicles/${reservation?.vehicleId}`],
    enabled: !!reservation?.vehicleId && open,
  });

  const { data: customer } = useQuery<Customer>({
    queryKey: [`/api/customers/${reservation?.customerId}`],
    enabled: !!reservation?.customerId && open,
  });

  // Fetch driver details if there's a driverId
  const { data: driver } = useQuery<Driver>({
    queryKey: [`/api/drivers/${reservation?.driverId}`],
    enabled: !!reservation?.driverId && open,
  });

  // For maintenance blocks, fetch active rentals for the vehicle to find the customer
  const { data: vehicleReservations } = useQuery<Reservation[]>({
    queryKey: [`/api/reservations/vehicle/${reservation?.vehicleId}`],
    enabled: !!reservation?.vehicleId && reservation?.type === 'maintenance_block' && open,
  });

  // Find active rental for this vehicle (for maintenance blocks)
  const activeRental = (() => {
    if (reservation?.type !== 'maintenance_block' || !vehicleReservations) return null;
    
    const now = new Date();
    
    return vehicleReservations.find(r => {
      if (r.type !== 'standard') return false;
      if (r.status !== 'booked' && r.status !== 'picked_up') return false;
      
      const startDate = parseISO(r.startDate);
      
      // Check if rental is currently active
      if (!r.endDate) {
        // Open-ended rental - check if started
        return startDate <= now;
      } else {
        // Has end date - check if we're within the rental period
        const endDate = parseISO(r.endDate);
        return startDate <= now && now <= endDate;
      }
    }) || null;
  })();

  // Fetch the customer from active rental (for maintenance blocks)
  const { data: rentalCustomer } = useQuery<Customer>({
    queryKey: [`/api/customers/${activeRental?.customerId}`],
    enabled: !!activeRental?.customerId && open,
  });

  // Fetch the driver from active rental (for maintenance blocks)
  const { data: rentalDriver } = useQuery<Driver>({
    queryKey: [`/api/drivers/${activeRental?.driverId}`],
    enabled: !!activeRental?.driverId && open,
  });

  // Use rental customer/driver for maintenance blocks if available, otherwise use direct customer/driver
  const displayCustomer = reservation?.type === 'maintenance_block' && rentalCustomer ? rentalCustomer : customer;
  const displayDriver = reservation?.type === 'maintenance_block' && rentalDriver ? rentalDriver : driver;

  // Fetch documents for the reservation
  const { data: reservationDocuments } = useQuery<any[]>({
    queryKey: [`/api/documents/reservation/${reservationId}`],
    enabled: !!reservationId && open,
  });

  // Fetch active replacement reservation if this is an original reservation
  const { data: activeReplacement } = useQuery<Reservation>({
    queryKey: [`/api/reservations/${reservationId}/active-replacement`],
    enabled: !!reservation && reservation.type === 'standard' && open,
  });

  // Fetch original reservation if this is a replacement
  const { data: originalReservation } = useQuery<Reservation>({
    queryKey: [`/api/reservations/${reservation?.replacementForReservationId}`],
    enabled: !!reservation?.replacementForReservationId && open,
  });

  // Calculate rental duration
  const rentalDuration = (() => {
    if (!reservation?.startDate || !reservation?.endDate) return 0;
    return differenceInDays(
      parseISO(reservation.endDate),
      parseISO(reservation.startDate)
    ) + 1; // Include both start and end days
  })();

  // Get status badge style
  const getStatusStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case "booked":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "picked_up":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "returned":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  // Get reservation type badge style and text
  const getReservationTypeInfo = (type: string) => {
    switch (type) {
      case "replacement":
        return {
          text: t('viewDialog.reservationTypeInfo.replacementVehicle'),
          className: "bg-orange-100 text-orange-800 border-orange-200",
          icon: <ArrowRightLeft className="w-3 h-3" />
        };
      case "maintenance_block":
        return {
          text: t('viewDialog.reservationTypeInfo.maintenanceBlock'),
          className: "bg-purple-100 text-purple-800 border-purple-200",
          icon: <Wrench className="w-3 h-3" />
        };
      default:
        return null;
    }
  };

  // Always render the Dialog component to prevent unmounting issues during data loading
  // The open prop controls visibility
  return (
    <>
      {/* Hidden (not closed) while Pickup/Return is open, so starting one doesn't
          leave this dialog stacked underneath it — it reappears once that closes,
          without going through onOpenChange (which would trigger the "reopen the
          list" logic some callers wire up on close). */}
      <Dialog open={open && !!reservationId && !pickupDialogOpen && !returnDialogOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-reservation-view">
          <DialogHeader>
            <DialogTitle>{t('viewDialog.title')}</DialogTitle>
            <p className="text-gray-500">{t('viewDialog.reservationHash', { id: reservationId })}</p>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : error || !reservation ? (
            <div className="bg-red-50 border border-red-200 p-4 rounded-md">
              <h3 className="text-lg font-semibold text-red-800">{t('viewDialog.errorTitle')}</h3>
              <p className="text-red-600">{t('viewDialog.failedToLoad', { error: (error as Error)?.message || '' })}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Status and basic info */}
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">{t('viewDialog.statusLabel')}</h3>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    <Badge className={`${getStatusStyle(reservation.status)}`}>
                      {formatReservationStatus(reservation.status)}
                    </Badge>
                    {reservation.type && reservation.type !== 'standard' && (() => {
                      const typeInfo = getReservationTypeInfo(reservation.type);
                      return typeInfo ? (
                        <Badge className={`flex items-center gap-1 ${typeInfo.className}`} data-testid={`badge-${reservation.type}`}>
                          {typeInfo.icon}
                          {typeInfo.text}
                        </Badge>
                      ) : null;
                    })()}
                    {reservation.status === 'picked_up' && reservation.endDate &&
                      differenceInDays(new Date(), parseISO(reservation.endDate)) > 0 && (
                        <Badge className="bg-red-100 text-red-800 border-red-200 flex items-center gap-1" data-testid="badge-overdue">
                          <AlertCircle className="w-3 h-3" />
                          {t('viewDialog.overdueDays', { count: differenceInDays(new Date(), parseISO(reservation.endDate)) })}
                        </Badge>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">{t('viewDialog.rentalPeriodLabel')}</h3>
                  <p className="text-base mt-1">
                    {formatDate(reservation.startDate)} - {reservation.endDate ? formatDate(reservation.endDate) : t('viewDialog.naValue')}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {t('form.dayCount', { count: rentalDuration })}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">{t('viewDialog.totalPriceLabel')}</h3>
                  <p className="text-base font-medium mt-1">
                    {reservation.totalPrice ? formatCurrency(Number(reservation.totalPrice)) : t('viewDialog.naValue')}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Vehicle details */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">{t('viewDialog.vehicleLabel')}</h3>
                <div className="bg-gray-50 p-4 rounded-md">
                  {vehicle ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                      <div>
                        <h4 className="font-medium flex items-center gap-2">
                          <span className="bg-primary-100 text-primary-800 px-2 py-1 rounded text-sm font-semibold">
                            {formatLicensePlate(vehicle.licensePlate)}
                          </span>
                          {vehicle.brand} {vehicle.model}
                        </h4>
                        <p className="text-sm text-gray-500 mt-1">
                          {vehicle.vehicleType || t('viewDialog.unknownType')} • {vehicle.fuel || t('viewDialog.unknownFuel')}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {vehicle.apkDate && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 font-medium">
                              {t('viewDialog.apkExpiryBadge', { date: formatDate(vehicle.apkDate) })}
                            </Badge>
                          )}
                          {vehicle.departureMileage && (
                            <Badge variant="outline" className="bg-gray-50 text-gray-800 border-gray-200">
                              {t('viewDialog.pickupMileageBadge', { mileage: vehicle.departureMileage.toLocaleString() })}
                            </Badge>
                          )}
                          {vehicle.returnMileage && (
                            <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
                              {t('viewDialog.returnMileageBadge', { mileage: vehicle.returnMileage.toLocaleString() })}
                            </Badge>
                          )}
                          {vehicle.maintenanceStatus && vehicle.maintenanceStatus !== 'ok' && (
                            <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200 font-medium">
                              <Wrench className="w-3 h-3 mr-1" />
                              {vehicle.maintenanceStatus === 'needs_service' ? t('viewDialog.needsServiceBadge') : t('viewDialog.inServiceBadge')}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 sm:mt-0"
                        onClick={() => {
                          setViewVehicleId(vehicle.id);
                          setIsVehicleDialogOpen(true);
                        }}
                        data-testid="button-view-vehicle"
                      >
                        {t('viewDialog.viewVehicleButton')}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-gray-500">{t('viewDialog.vehicleInfoUnavailable')}</p>
                  )}
                </div>
              </div>

              {/* Customer details */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                  {t('viewDialog.customerLabel')}
                  {reservation.type === 'maintenance_block' && displayCustomer && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">{t('viewDialog.fromActiveRentalSuffix')}</span>
                  )}
                </h3>
                <div className="bg-gray-50 p-4 rounded-md">
                  {displayCustomer ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                      <div>
                        <h4 className="font-medium flex items-center gap-2">
                          {displayCustomer.debtorNumber && (
                            <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                              {displayCustomer.debtorNumber}
                            </span>
                          )}
                          <span>{displayCustomer.name}</span>
                          {displayCustomer.companyName && (
                            <span className="text-gray-500 text-sm font-normal">
                              ({displayCustomer.companyName})
                            </span>
                          )}
                        </h4>
                        
                        <div className="mt-2 grid grid-cols-1 gap-1">
                          {/* Contact information */}
                          {(displayCustomer.phone || displayCustomer.email) && (
                            <div className="flex flex-col text-sm">
                              {displayCustomer.phone && (
                                <div className="flex items-center gap-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                  </svg>
                                  <span>{displayCustomer.phone}</span>
                                </div>
                              )}
                              {displayCustomer.email && (
                                <div className="flex items-center gap-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                    <polyline points="22,6 12,13 2,6"/>
                                  </svg>
                                  <span>{displayCustomer.email}</span>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Address information */}
                          {(displayCustomer.address || displayCustomer.city || displayCustomer.postalCode || displayCustomer.country) && (
                            <div className="flex items-start gap-1 text-sm">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 mt-0.5">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                <circle cx="12" cy="10" r="3"/>
                              </svg>
                              <span>
                                {displayCustomer.address && <span>{displayCustomer.address}</span>}
                                {displayCustomer.address && (displayCustomer.postalCode || displayCustomer.city) && <span>, </span>}
                                {displayCustomer.postalCode && <span>{displayCustomer.postalCode} </span>}
                                {displayCustomer.city && <span>{displayCustomer.city}</span>}
                                {(displayCustomer.address || displayCustomer.postalCode || displayCustomer.city) && displayCustomer.country && <span>, </span>}
                                {displayCustomer.country && <span>{displayCustomer.country}</span>}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <CustomerViewDialog customerId={displayCustomer.id}>
                        <Button variant="ghost" size="sm" className="mt-2 sm:mt-0" data-testid="button-view-customer">
                          {t('viewDialog.viewCustomerButton')}
                        </Button>
                      </CustomerViewDialog>
                    </div>
                  ) : (
                    <p className="text-gray-500">{t('viewDialog.noCustomerAssigned')}</p>
                  )}
                </div>
              </div>

              {/* Driver details */}
              {displayDriver && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    {t('viewDialog.assignedDriverLabel')}
                    {reservation.type === 'maintenance_block' && displayDriver && (
                      <span className="ml-2 text-xs text-gray-400 font-normal">{t('viewDialog.fromActiveRentalSuffix')}</span>
                    )}
                  </h3>
                  <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
                    <div>
                      <h4 className="font-medium text-blue-900 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                        </svg>
                        {displayDriver.displayName}
                        {displayDriver.isPrimaryDriver && (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200">{t('viewDialog.primaryBadge')}</Badge>
                        )}
                      </h4>
                      
                      <div className="mt-2 grid grid-cols-1 gap-1">
                        {/* Contact information */}
                        {(displayDriver.phone || displayDriver.email) && (
                          <div className="flex flex-col text-sm text-blue-800">
                            {displayDriver.phone && (
                              <div className="flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                </svg>
                                <span>{displayDriver.phone}</span>
                              </div>
                            )}
                            {displayDriver.email && (
                              <div className="flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                  <polyline points="22,6 12,13 2,6"/>
                                </svg>
                                <span>{displayDriver.email}</span>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* License information */}
                        {displayDriver.driverLicenseNumber && (
                          <div className="flex items-center gap-1 text-sm text-blue-800 mt-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                              <rect width="20" height="14" x="2" y="5" rx="2"/>
                              <line x1="2" x2="22" y1="10" y2="10"/>
                            </svg>
                            <span>{t('viewDialog.licenseLabel', { number: displayDriver.driverLicenseNumber })}</span>
                            {displayDriver.licenseExpiry && (
                              <span className="text-blue-600">{t('viewDialog.licenseExpiry', { date: formatDate(displayDriver.licenseExpiry) })}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Documents Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">
                  {reservation.type === 'maintenance_block' ? t('viewDialog.serviceDocumentationLabel') : t('viewDialog.documentsLabel')}
                </h3>
                
                {reservation.type === 'maintenance_block' ? (
                  <div className="space-y-4">
                    {/* Quick Actions for Maintenance */}
                    <div className="flex flex-wrap gap-2">
                      {reservation.vehicleId && (
                        <ExpenseAddDialog 
                          vehicleId={reservation.vehicleId}
                          onSuccess={() => {
                            invalidateByPrefix('/api/expenses');
                            invalidateByPrefix(`/api/vehicles/${reservation.vehicleId}`);
                          }}
                        >
                          <Button variant="outline" size="sm">
                            <FileText className="mr-2 h-4 w-4" />
                            {t('viewDialog.addExpenseButton')}
                          </Button>
                        </ExpenseAddDialog>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (reservation.vehicleId) {
                            setViewVehicleId(reservation.vehicleId);
                            setIsDocumentsDialogOpen(true);
                          }
                        }}
                        data-testid="button-upload-documents"
                      >
                        <Camera className="mr-2 h-4 w-4" />
                        {t('viewDialog.uploadDocumentsButton')}
                      </Button>
                    </div>

                    {/* Uploaded Documents Display */}
                    {reservationDocuments && reservationDocuments.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-gray-700">{t('viewDialog.uploadedDocumentsLabel')}</span>
                        <div className="flex flex-wrap gap-2">
                          {reservationDocuments.map((doc) => {
                            const ext = doc.fileName.split('.').pop()?.toLowerCase();
                            const isPdf = doc.contentType?.includes('pdf') || ext === 'pdf';
                            const isImage = doc.contentType?.includes('image') || ['jpg', 'jpeg', 'png', 'gif'].includes(ext || '');
                            
                            return (
                              <div key={doc.id} className="relative group">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (isPdf) {
                                      window.open(`/api/documents/view/${doc.id}`, '_blank');
                                    } else {
                                      setPreviewDocument(doc);
                                      setPreviewDialogOpen(true);
                                    }
                                  }}
                                  className="flex items-center gap-2 pr-8"
                                >
                                  {isPdf ? (
                                    <FileText className="h-4 w-4 text-red-600" />
                                  ) : isImage ? (
                                    <FileCheck className="h-4 w-4 text-blue-600" />
                                  ) : (
                                    <FileText className="h-4 w-4 text-gray-600" />
                                  )}
                                  <div className="text-left">
                                    <div className="text-xs font-semibold truncate max-w-[150px]">{doc.documentType}</div>
                                    <div className="text-[10px] text-gray-500">
                                      {doc.fileName.split('.').pop()?.toUpperCase() || 'FILE'}
                                    </div>
                                  </div>
                                </Button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDocumentToDelete(doc);
                                    setDeleteDocDialogOpen(true);
                                  }}
                                  className="absolute top-1 right-1 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity"
                                  title={t('viewDialog.deleteDocumentTooltip')}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Quick Upload Buttons */}
                    {reservation.vehicleId && (
                      <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-md">
                        <span className="text-xs text-gray-600 w-full mb-1">{t('viewDialog.quickUploadLabel')}</span>
                        {[
                          { type: 'Contract (Signed)', accept: '.pdf' },
                          { type: 'Damage Report Photo', accept: '.jpg,.jpeg,.png' },
                          { type: 'Damage Report PDF', accept: '.pdf' },
                          { type: 'Other', accept: '.pdf,.jpg,.jpeg,.png,.doc,.docx' }
                        ].map(({ type, accept }) => (
                          <Button
                            key={type}
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = accept;
                              input.onchange = async (e) => {
                                const file = (e.target as HTMLInputElement).files?.[0];
                                if (!file) return;

                                setUploadingDoc(true);
                                const formData = new FormData();
                                formData.append('vehicleId', reservation.vehicleId!.toString());
                                formData.append('reservationId', reservation.id.toString());
                                formData.append('documentType', type);
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
                                  
                                  invalidateByPrefix(`/api/documents/reservation/${reservation.id}`);
                                  toast({
                                    title: t('form.toasts.uploadSuccessTitle'),
                                    description: t('form.toasts.uploadSuccessDescription', { type: t(`form.docTypes.${DOCUMENT_QUICK_TYPE_KEYS[type]}`, { defaultValue: type }) }),
                                  });
                                } catch (error) {
                                  console.error('Upload failed:', error);
                                  toast({
                                    title: t('form.toasts.uploadErrorTitle'),
                                    description: t('form.toasts.uploadErrorDescription'),
                                    variant: "destructive",
                                  });
                                } finally {
                                  setUploadingDoc(false);
                                }
                              };
                              input.click();
                            }}
                            disabled={uploadingDoc}
                            className="text-xs"
                          >
                            + {t(`form.docTypes.${DOCUMENT_QUICK_TYPE_KEYS[type]}`, { defaultValue: type })}
                          </Button>
                        ))}
                      </div>
                    )}

                    {/* Uploaded Documents */}
                    {reservationDocuments && reservationDocuments.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-gray-700">{t('viewDialog.uploadedDocumentsLabel')}</span>
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            const contractDocs = reservationDocuments.filter(d => 
                              d.documentType?.startsWith('Contract (Unsigned)') || 
                              d.documentType?.startsWith('Contract (Signed)') || 
                              d.documentType === 'Contract'
                            );
                            const damageReportDocs = reservationDocuments.filter(d => 
                              d.documentType === 'Damage Report Photo' || d.documentType === 'Damage Report PDF'
                            );
                            const otherDocs = reservationDocuments.filter(d => 
                              !d.documentType?.startsWith('Contract (Unsigned)') && 
                              !d.documentType?.startsWith('Contract (Signed)') && 
                              d.documentType !== 'Contract' && 
                              d.documentType !== 'Damage Report Photo' && 
                              d.documentType !== 'Damage Report PDF'
                            );
                            
                            return [...contractDocs, ...damageReportDocs, ...otherDocs];
                          })().map((doc) => {
                            const ext = doc.fileName.split('.').pop()?.toLowerCase();
                            const isPdf = doc.contentType?.includes('pdf') || ext === 'pdf';
                            const isImage = doc.contentType?.includes('image') || ['jpg', 'jpeg', 'png', 'gif'].includes(ext || '');
                            
                            return (
                              <div key={doc.id} className="relative group">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (isPdf) {
                                      window.open(`/api/documents/view/${doc.id}`, '_blank');
                                    } else {
                                      setPreviewDocument(doc);
                                      setPreviewDialogOpen(true);
                                    }
                                  }}
                                  className="flex items-center gap-2 pr-8"
                                >
                                  {isPdf ? (
                                    <FileText className="h-4 w-4 text-red-600" />
                                  ) : isImage ? (
                                    <FileCheck className="h-4 w-4 text-blue-600" />
                                  ) : (
                                    <FileText className="h-4 w-4 text-gray-600" />
                                  )}
                                  <div className="text-left">
                                    <div className="text-xs font-semibold truncate max-w-[150px]">{doc.documentType}</div>
                                    <div className="text-[10px] text-gray-500">
                                      {doc.fileName.split('.').pop()?.toUpperCase() || 'FILE'}
                                    </div>
                                  </div>
                                </Button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDocumentToDelete(doc);
                                    setDeleteDocDialogOpen(true);
                                  }}
                                  className="absolute top-1 right-1 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity"
                                  title={t('viewDialog.deleteDocumentTooltip')}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Fuel Tracking Information */}
              {(reservation.fuelLevelPickup || reservation.fuelLevelReturn || reservation.fuelCost || reservation.fuelCardNumber || reservation.fuelNotes) && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">{t('viewDialog.fuelTrackingLabel')}</h3>
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {reservation.fuelLevelPickup && (
                        <div>
                          <p className="text-xs text-blue-600 font-medium">{t('viewDialog.fuelAtPickupLabel')}</p>
                          <p className="text-sm font-semibold text-blue-900 mt-1">{reservation.fuelLevelPickup}</p>
                        </div>
                      )}
                      {reservation.fuelLevelReturn && (
                        <div>
                          <p className="text-xs text-blue-600 font-medium">{t('viewDialog.fuelAtReturnLabel')}</p>
                          <p className="text-sm font-semibold text-blue-900 mt-1">{reservation.fuelLevelReturn}</p>
                        </div>
                      )}
                      {reservation.fuelCost && (
                        <div>
                          <p className="text-xs text-blue-600 font-medium">{t('viewDialog.fuelCostLabelShort')}</p>
                          <p className="text-sm font-semibold text-blue-900 mt-1">{<Price value={Number(reservation.fuelCost)} />}</p>
                        </div>
                      )}
                      {reservation.fuelCardNumber && (
                        <div>
                          <p className="text-xs text-blue-600 font-medium">{t('viewDialog.fuelCardNumberLabel')}</p>
                          <p className="text-sm font-semibold text-blue-900 mt-1">{reservation.fuelCardNumber}</p>
                        </div>
                      )}
                    </div>
                    {reservation.fuelNotes && (
                      <div className="mt-3 pt-3 border-t border-blue-200">
                        <p className="text-xs text-blue-600 font-medium">{t('viewDialog.fuelNotesLabel')}</p>
                        <p className="text-sm text-blue-800 mt-1">{reservation.fuelNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Spare Vehicle Management */}
              {reservation.type === 'standard' && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-3">{t('viewDialog.vehicleServiceLabel')}</h3>
                  <div className="space-y-2">
                    {!activeReplacement && vehicle?.maintenanceStatus === 'ok' && (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        size="sm"
                        onClick={() => setIsServiceDialogOpen(true)}
                        data-testid="button-mark-for-service"
                      >
                        <Wrench className="mr-2 h-4 w-4" />
                        {t('viewDialog.markForServiceButton')}
                      </Button>
                    )}

                    {(vehicle?.maintenanceStatus === 'in_service' || vehicle?.maintenanceStatus === 'needs_service') && !activeReplacement && (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        size="sm"
                        onClick={() => setIsSpareDialogOpen(true)}
                        data-testid="button-assign-spare"
                      >
                        <Car className="mr-2 h-4 w-4" />
                        {t('viewDialog.assignSpareButton')}
                      </Button>
                    )}

                    {activeReplacement && (
                      <div className="space-y-2">
                        <div className="p-3 border border-orange-200 bg-orange-50 rounded-md">
                          <p className="text-sm font-medium text-orange-800">{t('viewDialog.spareAssignedTitle')}</p>
                          <p className="text-xs text-orange-600 mt-1">
                            {t('viewDialog.spareAssignedHint')}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          size="sm"
                          onClick={() => setIsReturnDialogOpen(true)}
                          data-testid="button-return-from-service"
                        >
                          <Car className="mr-2 h-4 w-4" />
                          {t('viewDialog.returnFromServiceButton')}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Barcode Section */}
              <div className="flex justify-center py-2">
                <BarcodeSvg value={formatReservationBarcode(reservation.id)} height={35} />
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            {reservation?.status === 'booked' && (
              <Button
                onClick={() => {
                  setPickupDialogOpen(true);
                }}
                data-testid="button-start-pickup-view"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                {t('viewDialog.startPickupButton')}
              </Button>
            )}

            {reservation?.status === 'picked_up' && (
              <Button
                onClick={() => {
                  setReturnDialogOpen(true);
                }}
                data-testid="button-start-return-view"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"></path>
                  <path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9"></path>
                  <path d="M12 3v6"></path>
                </svg>
                {t('viewDialog.startReturnButton')}
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-reservation"
            >
              {t('viewDialog.closeButton')}
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                console.log('Edit button clicked', { reservationId, onEdit });
                if (reservationId) onEdit?.(reservationId);
              }}
              data-testid="button-edit-reservation"
            >
              <Edit className="mr-2 h-4 w-4" />
              {t('viewDialog.editButton')}
            </Button>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" data-testid="button-delete-reservation">
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('viewDialog.deleteButton')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('viewDialog.deleteConfirm.title')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('viewDialog.deleteConfirm.description', { id: reservationId })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('viewDialog.deleteConfirm.cancelButton')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteReservationMutation.mutate()}
                    disabled={deleteReservationMutation.isPending}
                  >
                    {deleteReservationMutation.isPending ? t('viewDialog.deletingButton') : t('viewDialog.deleteButton')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Service-related dialogs */}
      <ServiceVehicleDialog
        open={isServiceDialogOpen}
        onOpenChange={setIsServiceDialogOpen}
        reservationId={reservationId || 0}
        onSuccess={() => {
          invalidateByPrefix(`/api/vehicles/${reservation?.vehicleId}`);
          invalidateByPrefix(`/api/reservations/${reservationId}`);
        }}
      />

      <SpareVehicleDialog
        open={isSpareDialogOpen}
        onOpenChange={setIsSpareDialogOpen}
        originalReservation={reservation}
        onSuccess={() => {
          invalidateByPrefix(`/api/reservations/${reservationId}/active-replacement`);
          invalidateByPrefix(`/api/reservations`);
        }}
      />

      <ReturnFromServiceDialog
        open={isReturnDialogOpen}
        onOpenChange={setIsReturnDialogOpen}
        originalReservation={reservation}
        replacementReservation={activeReplacement}
        onSuccess={() => {
          invalidateByPrefix(`/api/vehicles/${reservation?.vehicleId}`);
          invalidateByPrefix(`/api/reservations/${reservationId}/active-replacement`);
          invalidateByPrefix(`/api/reservations`);
        }}
      />

      {/* Vehicle View Dialog */}
      <VehicleViewDialog
        open={isVehicleDialogOpen}
        onOpenChange={setIsVehicleDialogOpen}
        vehicleId={viewVehicleId}
      />

      {/* Reservation Documents Dialog */}
      <ReservationDocumentsDialog
        open={isDocumentsDialogOpen}
        onOpenChange={setIsDocumentsDialogOpen}
        reservationId={reservationId}
        vehicleId={viewVehicleId}
      />

      {/* Document Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewDocument?.documentType || t('form.documentPreviewTitleFallback')}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-gray-100 rounded-md p-4">
            {previewDocument && (() => {
              const ext = previewDocument.fileName.split('.').pop()?.toLowerCase();
              const isImage = previewDocument.contentType?.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');

              if (isImage) {
                return (
                  <div className="flex items-center justify-center h-full">
                    <img
                      src={`/api/documents/view/${previewDocument.id}`}
                      alt={previewDocument.fileName}
                      className="max-w-full max-h-[70vh] object-contain rounded shadow-lg"
                    />
                  </div>
                );
              } else {
                return (
                  <div className="flex flex-col items-center justify-center h-full space-y-4">
                    <p className="text-gray-600">{t('form.documentPreview.previewNotAvailable')}</p>
                    <Button onClick={() => window.open(`/api/documents/view/${previewDocument.id}`, '_blank')}>
                      {t('form.documentPreview.openFileButton')}
                    </Button>
                  </div>
                );
              }
            })()}
          </div>
          <div className="flex justify-between items-center pt-4 border-t">
            <Button variant="outline" onClick={() => window.open(`/api/documents/view/${previewDocument?.id}`, '_blank')}>
              {t('form.documentPreview.openInNewTabButton')}
            </Button>
            <Button onClick={() => setPreviewDialogOpen(false)}>
              {t('viewDialog.closeButton')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pickup/Return Dialogs */}
      {reservation && (
        <>
          <PickupDialog
            key={`pickup-${reservation.id}`}
            open={pickupDialogOpen}
            onOpenChange={setPickupDialogOpen}
            reservation={reservation}
          />
          <ReturnDialog
            key={`return-${reservation.id}`}
            open={returnDialogOpen}
            onOpenChange={setReturnDialogOpen}
            reservation={reservation}
          />
        </>
      )}

      <ConfirmDialog
        open={deleteDocDialogOpen}
        onOpenChange={setDeleteDocDialogOpen}
        title={t('form.deleteDocumentDialog.title')}
        description={t('form.deleteDocumentDialog.description', { type: documentToDelete?.documentType })}
        variant="danger"
        confirmLabel={t('form.deleteDocumentDialog.confirmLabel')}
        onConfirm={async () => {
          if (!documentToDelete) return;
          try {
            const response = await fetch(`/api/documents/${documentToDelete.id}`, {
              method: 'DELETE',
              credentials: 'include',
            });

            if (!response.ok) {
              throw new Error('Delete failed');
            }

            invalidateByPrefix(`/api/documents/reservation/${reservationId}`);
            toast({
              title: t('form.toasts.uploadSuccessTitle'),
              description: t('form.toasts.documentDeletedDescription'),
            });
          } catch (error) {
            console.error('Delete failed:', error);
            toast({
              title: t('viewDialog.errorTitle'),
              description: t('form.toasts.failedToDeleteDocumentDescription'),
              variant: "destructive",
            });
          }
          setDocumentToDelete(null);
        }}
        onCancel={() => setDocumentToDelete(null)}
      />
    </>
  );
}
