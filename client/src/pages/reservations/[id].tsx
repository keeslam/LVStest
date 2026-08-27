import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDate, formatCurrency, formatLicensePlate } from "@/lib/format-utils";
import { Price } from "@/components/ui/price";
import { Reservation, Vehicle, Customer } from "@shared/schema";
import { differenceInDays, parseISO } from "date-fns";
import { Calendar, List, ArrowLeft, Trash2, Wrench, Car, ArrowRightLeft, CheckCircle, ClipboardCheck, FileText } from "lucide-react";
import { format } from "date-fns";
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
import { apiRequest, queryClient, invalidateRelatedQueries, invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { UploadContractButton } from "@/components/documents/contract-upload-button";
import { SpareVehicleDialog } from "@/components/reservations/spare-vehicle-dialog";
import { ServiceVehicleDialog } from "@/components/reservations/service-vehicle-dialog";
import { ReturnFromServiceDialog } from "@/components/reservations/return-from-service-dialog";
import { PickupDialog, ReturnDialog } from "@/components/reservations/pickup-return-dialogs";

export default function ReservationDetails() {
  const { t } = useTranslation(["reservations", "common"]);
  const { id } = useParams();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [isSpareDialogOpen, setIsSpareDialogOpen] = useState(false);
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
  const [isPickupDialogOpen, setIsPickupDialogOpen] = useState(false);
  const [isReturnRentalDialogOpen, setIsReturnRentalDialogOpen] = useState(false);
  const clientQuery = useQueryClient();

  // Fetch reservation details
  const { data: reservation, isLoading, error } = useQuery<Reservation>({
    queryKey: [`/api/reservations/${id}`],
  });

  // Fetch interactive damage checks linked to this reservation
  const { data: damageChecks = [] } = useQuery<any[]>({
    queryKey: [`/api/interactive-damage-checks/reservation/${id}`],
    enabled: !!id,
  });
  
  // Delete reservation mutation
  const deleteReservationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/reservations/${id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete reservation');
      }
      return true;
    },
    onSuccess: async () => {
      // Use comprehensive cache invalidation for reservations
      invalidateRelatedQueries('reservations', {
        id: parseInt(id as string),
        vehicleId: reservation?.vehicleId,
        customerId: reservation?.customerId
      });
      
      toast({
        title: t('viewDialog.toasts.reservationDeletedTitle'),
        description: t('viewDialog.toasts.reservationDeletedDescription'),
      });
      
      // Wait a brief moment before navigating to ensure state is updated
      setTimeout(() => {
        navigate('/reservations');
      }, 300);
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
    enabled: !!reservation?.vehicleId,
  });

  const { data: customer } = useQuery<Customer>({
    queryKey: [`/api/customers/${reservation?.customerId}`],
    enabled: !!reservation?.customerId,
  });

  // Fetch active replacement reservation if this is an original reservation
  const { data: activeReplacement } = useQuery<Reservation>({
    queryKey: [`/api/reservations/${id}/active-replacement`],
    enabled: !!reservation && reservation.type === 'standard',
  });

  // Fetch original reservation if this is a replacement
  const { data: originalReservation } = useQuery<Reservation>({
    queryKey: [`/api/reservations/${reservation?.replacementForReservationId}`],
    enabled: !!reservation?.replacementForReservationId,
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
          text: t('detailsPage.replacementVehicleBadge'),
          className: "bg-orange-100 text-orange-800 border-orange-200",
          icon: <ArrowRightLeft className="w-3 h-3" />
        };
      case "maintenance_block":
        return {
          text: t('detailsPage.maintenanceBlockBadge'),
          className: "bg-purple-100 text-purple-800 border-purple-200",
          icon: <Wrench className="w-3 h-3" />
        };
      default:
        return null;
    }
  };
  
  // Handle viewing a vehicle (with cache invalidation)
  const handleViewVehicle = (vehicleId: number) => {
    if (vehicleId) {
      // Invalidate vehicle cache before navigating
      clientQuery.invalidateQueries({ queryKey: [`/api/vehicles/${vehicleId}`] });
      navigate(`/vehicles/${vehicleId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="bg-red-50 border border-red-200 p-4 rounded-md">
        <h2 className="text-lg font-semibold text-red-800">{t('viewDialog.errorTitle')}</h2>
        <p className="text-red-600">{t('viewDialog.failedToLoad', { error: (error as Error)?.message || '' })}</p>
        <Button
          variant="outline"
          className="mt-2"
          onClick={() => navigate("/reservations")}
        >
          {t('detailsPage.backToReservations')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Navigation bar with back buttons */}
      <div className="flex gap-2 mb-4">
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-1"
          onClick={() => navigate('/reservations')}
        >
          <ArrowLeft size={16} /> {t('detailsPage.backToListView')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => navigate('/reservations/calendar')}
        >
          <Calendar size={16} /> {t('detailsPage.backToCalendar')}
        </Button>
      </div>

      {/* Header with actions */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{t('viewDialog.title')}</h1>
          <p className="text-gray-500">{t('viewDialog.reservationHash', { id: reservation.id })}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/reservations/edit/${id}`}>
            <Button variant="outline">
              {t('detailsPage.editReservationButton')}
            </Button>
          </Link>
          <div className="flex gap-2">
            <Link href={`/documents/contract/${id}`}>
              <Button>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                  <path d="M14 3v5h5M16 13H8M16 17H8M10 9H8"/>
                </svg>
                {t('detailsPage.viewContractButton')}
              </Button>
            </Link>
            <UploadContractButton vehicleId={reservation.vehicleId} reservationId={reservation.id} />
          </div>
          <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" /> {t('viewDialog.deleteButton')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('detailsPage.confirmDeleteTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('detailsPage.confirmDeleteDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    deleteReservationMutation.mutate();
                    setIsDeleteDialogOpen(false);  // Close the dialog immediately
                  }}
                >
                  {deleteReservationMutation.isPending ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t('viewDialog.deletingButton')}
                    </>
                  ) : t('viewDialog.deleteButton')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column - Reservation details */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t('detailsPage.reservationInfoTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Status and reservation type */}
            <div className="flex flex-col sm:flex-row justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500">{t('viewDialog.statusLabel')}</h3>
                <div className="flex gap-2 mt-1">
                  <Badge className={`${getStatusStyle(reservation.status)}`}>
                    {t(`detailsPage.statusLabels.${reservation.status}`, { defaultValue: reservation.status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') })}
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
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">{t('viewDialog.rentalPeriodLabel')}</h3>
                <p className="text-base mt-1">
                  {formatDate(reservation.startDate)}{reservation.startTime && ` ${reservation.startTime}`} - {reservation.endDate ? `${formatDate(reservation.endDate)}${reservation.endTime ? ` ${reservation.endTime}` : ''}` : t('detailsPage.openEnded')}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {reservation.endDate ? t('detailsPage.dayCount', { count: rentalDuration }) : t('detailsPage.openEnded')}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">{t('viewDialog.totalPriceLabel')}</h3>
                <p className="text-base font-medium mt-1">
                  {<Price value={reservation.totalPrice} />}
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
                        {vehicle.vehicleType || t('viewDialog.unknownType')} • {vehicle.fuel || t('viewDialog.unknownFuel')} • {vehicle.color || t('detailsPage.noColorSpecified')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {vehicle.apkDate && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 font-medium">
                            {t('viewDialog.apkExpiryBadge', { date: formatDate(vehicle.apkDate) })}
                          </Badge>
                        )}
                        {vehicle.currentMileage && (
                          <Badge variant="outline" className="bg-gray-50 text-gray-800 border-gray-200">
                            {t('detailsPage.mileageBadge', { mileage: vehicle.currentMileage.toLocaleString() })}
                          </Badge>
                        )}
                        {vehicle.maintenanceStatus && vehicle.maintenanceStatus !== 'ok' && (
                          <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200 font-medium">
                            <Wrench className="w-3 h-3 mr-1" />
                            {vehicle.maintenanceStatus === 'needs_service' ? t('detailsPage.needsServiceBadge') : t('detailsPage.inServiceBadge')}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 sm:mt-0"
                      onClick={() => handleViewVehicle(vehicle.id)}
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
              <h3 className="text-sm font-medium text-gray-500 mb-2">{t('viewDialog.customerLabel')}</h3>
              <div className="bg-gray-50 p-4 rounded-md">
                {customer ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                    <div>
                      <h4 className="font-medium flex items-center gap-2">
                        {customer.debtorNumber && (
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                            {customer.debtorNumber}
                          </span>
                        )}
                        <span>{customer.name}</span>
                        {customer.companyName && (
                          <span className="text-gray-500 text-sm font-normal">
                            ({customer.companyName})
                          </span>
                        )}
                      </h4>
                      
                      <div className="mt-2 grid grid-cols-1 gap-1">
                        {/* Contact information */}
                        {(customer.phone || customer.email) && (
                          <div className="flex flex-col text-sm">
                            {customer.phone && (
                              <div className="flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                </svg>
                                <span>{customer.phone}</span>
                              </div>
                            )}
                            {customer.email && (
                              <div className="flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                  <polyline points="22,6 12,13 2,6"/>
                                </svg>
                                <span>{customer.email}</span>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Address information */}
                        {(customer.address || customer.city || customer.postalCode || customer.country) && (
                          <div className="flex items-start gap-1 text-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 mt-0.5">
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                              <circle cx="12" cy="10" r="3"/>
                            </svg>
                            <span>
                              {customer.address && <span>{customer.address}</span>}
                              {customer.address && (customer.postalCode || customer.city) && <span>, </span>}
                              {customer.postalCode && <span>{customer.postalCode} </span>}
                              {customer.city && <span>{customer.city}</span>}
                              {(customer.address || customer.postalCode || customer.city) && customer.country && <span>, </span>}
                              {customer.country && <span>{customer.country}</span>}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <Link href={`/customers/${customer.id}`}>
                      <Button variant="ghost" size="sm" className="mt-2 sm:mt-0">
                        {t('viewDialog.viewCustomerButton')}
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <p className="text-gray-500">{t('detailsPage.customerInfoUnavailable')}</p>
                )}
              </div>
            </div>

            {/* Replacement relationship */}
            {(originalReservation || activeReplacement) && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                  {reservation.type === 'replacement' ? t('detailsPage.originalReservationLabel') : t('detailsPage.replacementVehicleLabel')}
                </h3>
                <div className="bg-orange-50 border border-orange-200 p-4 rounded-md">
                  {reservation.type === 'replacement' && originalReservation ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {t('detailsPage.replacingReservation', { id: originalReservation.id })}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          {t('detailsPage.originalDatesLabel', { range: `${formatDate(originalReservation.startDate)} - ${originalReservation.endDate ? formatDate(originalReservation.endDate) : t('detailsPage.openEnded')}` })}
                        </p>
                      </div>
                      <Link href={`/reservations/${originalReservation.id}`}>
                        <Button variant="outline" size="sm" data-testid="link-original-reservation">
                          {t('detailsPage.viewOriginalButton')}
                        </Button>
                      </Link>
                    </div>
                  ) : activeReplacement ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {t('detailsPage.replacementLabel', { brand: activeReplacement.vehicle?.brand, model: activeReplacement.vehicle?.model })}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          {t('detailsPage.replacementPeriodLabel', { range: `${formatDate(activeReplacement.startDate)} - ${activeReplacement.endDate ? formatDate(activeReplacement.endDate) : t('detailsPage.openEnded')}` })}
                        </p>
                      </div>
                      <Link href={`/reservations/${activeReplacement.id}`}>
                        <Button variant="outline" size="sm" data-testid="link-replacement-reservation">
                          {t('detailsPage.viewReplacementButton')}
                        </Button>
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* Notes */}
            {reservation.notes && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">{t('detailsPage.notesLabel')}</h3>
                <div className="bg-gray-50 p-4 rounded-md">
                  <p className="text-sm whitespace-pre-wrap">{reservation.notes}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column - Related info and actions */}
        <Card>
          <CardHeader>
            <CardTitle>{t('detailsPage.documentsActionsTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Damage check document (legacy uploaded file) */}
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">{t('detailsPage.damageCheckLabel')}</h3>
              {reservation.damageCheckPath ? (
                <a
                  href={`/${reservation.damageCheckPath.replace(/^\/home\/runner\/workspace\//, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center p-3 border border-gray-200 rounded-md hover:bg-gray-50"
                >
                  <div className="bg-primary-100 text-primary-800 p-2 rounded-md mr-3">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{t('detailsPage.viewDamageCheckLink')}</p>
                    <p className="text-xs text-gray-500">{t('detailsPage.clickToOpenDocument')}</p>
                  </div>
                </a>
              ) : (
                <div className="p-3 border border-gray-200 border-dashed rounded-md bg-gray-50 text-gray-500 text-sm">
                  {t('detailsPage.noDamageCheckAttached')}
                </div>
              )}
            </div>

            {/* Interactive damage check log */}
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                <ClipboardCheck className="h-4 w-4" />
                {t('detailsPage.damageCheckLogLabel')}
              </h3>
              {damageChecks.length > 0 ? (
                <div className="space-y-2">
                  {damageChecks.map((check) => (
                    <div
                      key={check.id}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-md bg-white"
                      data-testid={`damage-check-row-${check.id}`}
                    >
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={check.checkType === 'pickup' ? 'default' : 'secondary'} className="text-xs">
                            {check.checkType === 'pickup' ? t('detailsPage.pickupBadge') : t('detailsPage.returnBadge')}
                          </Badge>
                          <span className="text-sm text-gray-700">
                            {check.checkDate ? format(new Date(check.checkDate), 'PP') : (check.createdAt ? format(new Date(check.createdAt), 'PP') : '—')}
                          </span>
                          {check.completedBy && (
                            <span className="text-xs text-gray-500">{t('detailsPage.byLabel', { name: check.completedBy })}</span>
                          )}
                        </div>
                        <div className="flex gap-3 text-xs text-gray-500">
                          {check.mileage && <span>{t('detailsPage.mileageShort', { mileage: Number(check.mileage).toLocaleString() })}</span>}
                          {check.fuelLevel && <span>{t('detailsPage.fuelShort', { fuel: check.fuelLevel })}</span>}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/api/interactive-damage-checks/${check.id}/pdf`, '_blank')}
                        data-testid={`button-damage-check-pdf-${check.id}`}
                      >
                        {t('detailsPage.viewPdfButton')}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 border border-gray-200 border-dashed rounded-md bg-gray-50 text-gray-500 text-sm">
                  {t('detailsPage.noInteractiveDamageChecks')}
                </div>
              )}
            </div>

            {/* Contract Documents */}
            <div className="pt-4">
              <h3 className="text-sm font-medium text-gray-500 mb-3">{t('detailsPage.contractDocumentsTitle')}</h3>
              <div className="space-y-2">
                <Link href={`/documents/contract/${id}`}>
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                      <path d="M14 3v5h5M16 13H8M16 17H8M10 9H8"/>
                    </svg>
                    {t('detailsPage.viewContractButton')}
                  </Button>
                </Link>

                <div className="w-full">
                  <div className="w-full">
                    <UploadContractButton 
                      vehicleId={reservation.vehicleId} 
                      reservationId={reservation.id}
                      onSuccess={() => {
                        invalidateByPrefix(`/api/reservations/${id}`);
                      }}
                    />
                  </div>
                </div>
                
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  size="sm"
                  onClick={() => vehicle && handleViewVehicle(vehicle.id)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <rect width="18" height="18" x="3" y="3" rx="2"/>
                    <path d="M7 7h.01"/>
                    <path d="M12 15l-3-3-3 3"/>
                    <path d="M9 12v-3"/>
                    <path d="M14 7h3"/>
                    <path d="M14 11h3"/>
                    <path d="M14 15h3"/>
                  </svg>
                  {t('detailsPage.allVehicleDocumentsButton')}
                </Button>
              </div>
            </div>
            
            {/* Spare Vehicle Management */}
            {reservation.type === 'standard' && (
              <div className="pt-4">
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
                        <CheckCircle className="mr-2 h-4 w-4" />
                        {t('viewDialog.returnFromServiceButton')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Related actions */}
            <div className="pt-4">
              <h3 className="text-sm font-medium text-gray-500 mb-3">{t('detailsPage.actionsTitle')}</h3>
              <div className="space-y-2">
                {reservation.status === 'booked' && (
                  <Button
                    variant="default"
                    className="w-full justify-start"
                    size="sm"
                    onClick={() => setIsPickupDialogOpen(true)}
                    data-testid="button-start-pickup"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    {t('detailsPage.startPickupContractButton')}
                  </Button>
                )}

                {reservation.status === 'picked_up' && (
                  <Button
                    variant="default"
                    className="w-full justify-start"
                    size="sm"
                    onClick={() => setIsReturnRentalDialogOpen(true)}
                    data-testid="button-start-return"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"></path>
                      <path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9"></path>
                      <path d="M12 3v6"></path>
                    </svg>
                    {t('detailsPage.startReturnDamageCheckButton')}
                  </Button>
                )}

                <Link href={`/expenses/new?vehicleId=${reservation.vehicleId}`}>
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" x2="12" y1="8" y2="16"/>
                      <line x1="8" x2="16" y1="12" y2="12"/>
                    </svg>
                    {t('detailsPage.createNewExpenseButton')}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Tracking information */}
            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-500 mb-3">{t('detailsPage.trackingInfoTitle')}</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('detailsPage.createdByLabel')}</span>
                  <span className="font-medium">{reservation.createdBy || t('detailsPage.unknown')}</span>
                </div>
                {reservation.createdAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('detailsPage.createdOnLabel')}</span>
                    <span className="font-medium">{new Date(reservation.createdAt).toLocaleString()}</span>
                  </div>
                )}
                {reservation.updatedBy && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('detailsPage.lastModifiedByLabel')}</span>
                    <span className="font-medium">{reservation.updatedBy}</span>
                  </div>
                )}
                {reservation.updatedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('detailsPage.lastModifiedOnLabel')}</span>
                    <span className="font-medium">{new Date(reservation.updatedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/reservations")}
            >
              {t('detailsPage.backToAllReservationsButton')}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Spare Vehicle Dialogs */}
      <ServiceVehicleDialog
        open={isServiceDialogOpen}
        onOpenChange={setIsServiceDialogOpen}
        reservationId={parseInt(id as string)}
        vehicle={vehicle}
        onSuccess={() => {
          invalidateRelatedQueries('reservations');
          invalidateRelatedQueries('vehicles');
        }}
      />

      <SpareVehicleDialog
        open={isSpareDialogOpen}
        onOpenChange={setIsSpareDialogOpen}
        originalReservation={reservation}
        onSuccess={() => {
          invalidateByPrefix(`/api/reservations/${id}`);
        }}
      />

      <ReturnFromServiceDialog
        open={isReturnDialogOpen}
        onOpenChange={setIsReturnDialogOpen}
        replacementReservation={activeReplacement}
        originalReservation={reservation}
        onSuccess={() => {
          invalidateByPrefix(`/api/reservations/${id}`);
          invalidateRelatedQueries('vehicles');
        }}
      />

      {/* Pickup/Return Dialogs */}
      {reservation && (
        <>
          <PickupDialog
            open={isPickupDialogOpen}
            onOpenChange={setIsPickupDialogOpen}
            reservation={reservation}
          />
          <ReturnDialog
            open={isReturnRentalDialogOpen}
            onOpenChange={setIsReturnRentalDialogOpen}
            reservation={reservation}
          />
        </>
      )}
    </div>
  );
}
