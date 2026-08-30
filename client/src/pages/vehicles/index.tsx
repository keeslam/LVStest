import { invalidateByPrefix } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ReservationAddDialog } from "@/components/reservations/reservation-add-dialog";
import { ReservationViewDialog } from "@/components/reservations/reservation-view-dialog";
import { VehicleViewDialog } from "@/components/vehicles/vehicle-view-dialog";
import { VehicleEditDialog } from "@/components/vehicles/vehicle-edit-dialog";
import { VehicleDeleteDialog } from "@/components/vehicles/vehicle-delete-dialog";
import { DeletedVehiclesDialog } from "@/components/vehicles/deleted-vehicles-dialog";
import { VehicleAddDialog } from "@/components/vehicles/vehicle-add-dialog";
import { VehicleBulkImportDialog } from "@/components/vehicles/vehicle-bulk-import-dialog";
import { VehicleRemarksWarningDialog } from "@/components/vehicles/vehicle-remarks-warning-dialog";
import { BarcodeBookDialog } from "@/components/barcodes/barcode-book-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ColumnDef } from "@tanstack/react-table";
import { Vehicle, Reservation } from "@shared/schema";
import { formatDate, formatLicensePlate } from "@/lib/format-utils";
import { displayLicensePlate } from "@/lib/utils";
import { isTrueValue } from "@/lib/utils";
import { getDaysUntil } from "@/lib/date-utils";
import { Search, SlidersHorizontal, Edit, Trash2, Archive, BookOpen } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { UserRole } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// Feature-based filter options. Each maps a user-facing label to the boolean
// column on the vehicle record. A vehicle "has" the feature when isTrueValue()
// is truthy for that column.
const FEATURE_FILTERS: { key: keyof Vehicle; labelKey: string }[] = [
  { key: "euroZoneAccess", labelKey: "emissionsZoneAccessLabel" },
  { key: "moveIziRegistered", labelKey: "moveIziLabel" },
  { key: "gps", labelKey: "gpsLabel" },
  { key: "gpsSwapped", labelKey: "gpsSwappedLabel" },
  { key: "seatcovers", labelKey: "seatCoversLabel" },
  { key: "backupbeepers", labelKey: "backupBeepersLabel" },
  { key: "spareKey", labelKey: "spareKeyLabel" },
];

export default function VehiclesIndex() {
  const { t } = useTranslation(["vehicles", "barcodes"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("default");
  // Feature filters: list of selected vehicle boolean columns to require, plus
  // the match mode (strict = vehicle must have ALL selected; broad = ANY).
  const [featureFilters, setFeatureFilters] = useState<(keyof Vehicle)[]>([]);
  const [featureMatchMode, setFeatureMatchMode] = useState<"all" | "any">("all");
  const [vehicleViewDialogOpen, setVehicleViewDialogOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [reservationViewDialogOpen, setReservationViewDialogOpen] = useState(false);
  const [selectedReservationId, setSelectedReservationId] = useState<number | null>(null);
  
  // Page-level reservation dialog state — kept here (not in the table cell) so it
  // survives table refetches that would otherwise unmount the dialog and lose the
  // user's form data (e.g. when adding a quick driver triggers a vehicles refetch).
  const [reserveDialogVehicleId, setReserveDialogVehicleId] = useState<string | null>(null);
  
  // Page-level edit/delete dialog state — same reason as above: dialogs that
  // live inside table cells get unmounted (and close) whenever a background
  // refetch re-renders the table, e.g. a few seconds after saving a vehicle.
  const [editVehicleId, setEditVehicleId] = useState<number | null>(null);
  const [deleteVehicleTarget, setDeleteVehicleTarget] = useState<Vehicle | null>(null);
  const [deletedVehiclesOpen, setDeletedVehiclesOpen] = useState(false);
  const [barcodeBookOpen, setBarcodeBookOpen] = useState(false);
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  
  // Vehicle remarks warning dialog state
  const [remarksWarningOpen, setRemarksWarningOpen] = useState(false);
  const [pendingViewVehicle, setPendingViewVehicle] = useState<Vehicle | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Debounce search query to prevent excessive filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // 300ms delay
    
    return () => clearTimeout(timer);
  }, [searchQuery]);
  
  const { data: vehicles, isLoading, refetch } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });
  
  // Fetch reservations to check for spare vehicle assignments
  const { data: reservations } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
  });
  
  // Dialog handlers
  const handleViewClick = (vehicle: Vehicle) => {
    // Check if vehicle has remarks - show warning first
    if (vehicle.remarks && vehicle.remarks.trim() !== '') {
      setPendingViewVehicle(vehicle);
      setRemarksWarningOpen(true);
    } else {
      // No remarks, open directly
      setSelectedVehicleId(vehicle.id);
      setVehicleViewDialogOpen(true);
    }
  };
  
  // Handle remarks acknowledgement - proceed to view vehicle
  const handleRemarksAcknowledged = () => {
    if (pendingViewVehicle) {
      setSelectedVehicleId(pendingViewVehicle.id);
      setVehicleViewDialogOpen(true);
      setPendingViewVehicle(null);
    }
  };
  
  // Handle successful operations from dialogs
  const handleDialogSuccess = () => {
    // Refresh the vehicles list after any dialog operation
    invalidateByPrefix("/api/vehicles");
  };
  
  // Custom filtering logic that works regardless of length
  const filteredVehicles = vehicles?.filter(vehicle => {
    // Apply search query filter
    if (debouncedSearchQuery && debouncedSearchQuery.trim() !== '') {
      // Convert search query to lowercase for case-insensitive matching
      const searchLower = debouncedSearchQuery.toLowerCase().trim();
      
      // Convert license plate to a format without dashes for comparison
      const formattedLicensePlate = vehicle.licensePlate?.replace(/-/g, '')?.toLowerCase() || '';
      const formattedSearchQuery = searchLower.replace(/-/g, '');
      
      // Check if any of these fields contain the search string (barcode included
      // so a scanner "typing" VEH-000123 into this box finds the vehicle)
      const formattedBarcode = vehicle.barcode?.replace(/-/g, '')?.toLowerCase() || '';
      const matchesSearch = (
        formattedLicensePlate.includes(formattedSearchQuery) ||
        (vehicle.brand?.toLowerCase().includes(searchLower) || false) ||
        (vehicle.model?.toLowerCase().includes(searchLower) || false) ||
        (vehicle.vehicleType?.toLowerCase().includes(searchLower) || false) ||
        (formattedBarcode !== '' && formattedBarcode.includes(formattedSearchQuery))
      );
      
      if (!matchesSearch) return false;
    }
    
    // Apply registration filter based on sortBy value
    if (sortBy === "filter-opnaam" || sortBy === "filter-bv" || sortBy === "filter-unspecified") {
      const isRegisteredToPerson = isTrueValue(vehicle.registeredTo);
      const isRegisteredToCompany = isTrueValue(vehicle.company);
      
      if (sortBy === "filter-opnaam" && !isRegisteredToPerson) return false;
      if (sortBy === "filter-bv" && !isRegisteredToCompany) return false;
      if (sortBy === "filter-unspecified" && (isRegisteredToPerson || isRegisteredToCompany)) return false;
    }
    
    // Apply availability status filter
    if (sortBy === "filter-needs-fixing") {
      if (vehicle.availabilityStatus !== 'needs_fixing') return false;
    }

    // Apply feature filters. Strict mode ("all") requires the vehicle to have
    // every selected feature; broad mode ("any") requires at least one.
    if (featureFilters.length > 0) {
      const hasFeature = (key: keyof Vehicle) => isTrueValue(vehicle[key] as any);
      const matches = featureMatchMode === "all"
        ? featureFilters.every(hasFeature)
        : featureFilters.some(hasFeature);
      if (!matches) return false;
    }

    return true;
  }).sort((a, b) => {
    // If sortBy is a filter option, use default sorting
    if (sortBy.startsWith("filter-")) {
      return a.id - b.id;
    }
    
    // Apply sorting based on selected option
    switch (sortBy) {
      case "apk-asc":
        // Sort by APK date ascending (earliest first)
        if (!a.apkDate) return 1; // No APK date comes last
        if (!b.apkDate) return -1; // No APK date comes last
        return new Date(a.apkDate).getTime() - new Date(b.apkDate).getTime();
      
      case "apk-desc":
        // Sort by APK date descending (latest first)
        if (!a.apkDate) return 1; // No APK date comes last
        if (!b.apkDate) return -1; // No APK date comes last
        return new Date(b.apkDate).getTime() - new Date(a.apkDate).getTime();
      
      case "availability-asc":
        // Sort by availability status - available vehicles first
        const statusOrder = { 'available': 1, 'scheduled': 2, 'needs_fixing': 3, 'not_for_rental': 4, 'rented': 5 };
        const aOrder = statusOrder[a.availabilityStatus as keyof typeof statusOrder] || 6;
        const bOrder = statusOrder[b.availabilityStatus as keyof typeof statusOrder] || 6;
        return aOrder - bOrder;
        
      case "availability-desc":
        // Sort by availability status - rented/reserved vehicles first
        const statusOrderDesc = { 'rented': 1, 'scheduled': 2, 'not_for_rental': 3, 'needs_fixing': 4, 'available': 5 };
        const aOrderDesc = statusOrderDesc[a.availabilityStatus as keyof typeof statusOrderDesc] || 6;
        const bOrderDesc = statusOrderDesc[b.availabilityStatus as keyof typeof statusOrderDesc] || 6;
        return aOrderDesc - bOrderDesc;
      
      case "brand":
        // Sort by brand name alphabetically
        return a.brand.localeCompare(b.brand);
      
      case "license":
        // Sort by license plate alphabetically
        return a.licensePlate.localeCompare(b.licensePlate);
      
      default:
        // Default sort by ID
        return a.id - b.id;
    }
  });
  
  // Define table columns
  const columns: ColumnDef<Vehicle>[] = [
    {
      id: "actions",
      header: t('indexPage.actionsColumn'),
      cell: ({ row }) => {
        const vehicle = row.original;

        return (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleViewClick(vehicle)}
              data-testid={`button-view-vehicle-${vehicle.id}`}
            >
              {t('indexPage.viewButton')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditVehicleId(vehicle.id)}
              data-testid={`button-edit-vehicle-${vehicle.id}`}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500"
              onClick={() => setDeleteVehicleTarget(vehicle)}
              data-testid={`button-delete-vehicle-${vehicle.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            {(() => {
              const isRented = vehicle.availabilityStatus === 'rented';
              const isNotForRental = vehicle.availabilityStatus === 'not_for_rental';
              
              // For rented vehicles, show "View Reservation" button
              if (isRented) {
                const activeReservation = reservations?.find(r => 
                  r.vehicleId === vehicle.id && 
                  r.status === 'picked_up'
                );
                
                if (activeReservation) {
                  return (
                    <Button 
                      variant="secondary" 
                      size="sm"
                      onClick={() => {
                        setSelectedReservationId(activeReservation.id);
                        setReservationViewDialogOpen(true);
                      }}
                      data-testid={`button-view-reservation-vehicle-${vehicle.id}`}
                    >
                      {t('indexPage.viewRentalButton')}
                    </Button>
                  );
                }
              }
              
              // For not-for-rental vehicles, show disabled button with tooltip
              if (isNotForRental) {
                return (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button 
                            variant="outline" 
                            size="sm"
                            disabled
                            className="opacity-50 cursor-not-allowed"
                            data-testid={`button-reserve-vehicle-${vehicle.id}`}
                          >
                            {t('indexPage.reserveButton')}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('indexPage.vehicleNotAvailableForRental')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              }
              
              // For available vehicles, show Reserve button. The actual dialog lives at
              // the page level (see below) so it isn't unmounted when the table refetches.
              return (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={`button-reserve-vehicle-${vehicle.id}`}
                  onClick={() => setReserveDialogVehicleId(vehicle.id.toString())}
                >
                  {t('indexPage.reserveButton')}
                </Button>
              );
            })()}
          </div>
        );
      },
    },
    {
      accessorKey: "licensePlate",
      header: t('indexPage.licensePlateColumn'),
      cell: ({ row }) => {
        const licensePlate = row.getValue("licensePlate") as string;
        // Display formatted license plate consistently across the app
        return (
          <div className="font-medium whitespace-nowrap bg-primary-50 text-primary-700 px-2 py-1 rounded inline-block">
            {formatLicensePlate(licensePlate)}
          </div>
        );
      },
    },
    {
      accessorKey: "brand",
      header: t('indexPage.brandColumn'),
    },
    {
      accessorKey: "model",
      header: t('indexPage.modelColumn'),
    },
    {
      accessorKey: "vehicleType",
      header: t('indexPage.typeColumn'),
      cell: ({ row }) => {
        const vehicleType = row.getValue("vehicleType") as string;
        return vehicleType || t('indexPage.notAvailable');
      },
    },
    {
      id: "status",
      header: t('indexPage.statusColumn'),
      cell: ({ row }) => {
        const vehicle = row.original;
        const availabilityStatus = vehicle.availabilityStatus || 'available';
        
        // Check if this vehicle has a spare assigned to cover it
        const vehicleReservations = reservations?.filter(r => r.vehicleId === vehicle.id && r.status !== 'cancelled' && r.status !== 'completed');
        const hasSpareAssigned = vehicleReservations?.some(originalRes => 
          reservations?.some(r => 
            r.type === 'replacement' && 
            r.replacementForReservationId === originalRes.id &&
            r.status !== 'cancelled' &&
            r.status !== 'completed'
          )
        );
        
        // Display the 5-state availability status
        if (availabilityStatus === 'available') {
          return (
            <Badge className="bg-green-100 text-green-800 font-semibold">
              {t('indexPage.availableStatus')}
            </Badge>
          );
        } else if (availabilityStatus === 'scheduled') {
          // Check if this vehicle has a replacement (spare) reservation
          const hasSpareReservation = reservations?.some(r => 
            r.vehicleId === vehicle.id && 
            r.type === 'replacement' && 
            r.status !== 'cancelled' &&
            r.status !== 'completed'
          );
          
          return (
            <Badge className={hasSpareReservation ? "bg-orange-100 text-orange-800 font-semibold" : "bg-purple-100 text-purple-800 font-semibold"}>
              {hasSpareReservation ? t('indexPage.spareVehicleStatus') : hasSpareAssigned ? t('indexPage.scheduledSpareAssignedStatus') : t('indexPage.scheduledStatus')}
            </Badge>
          );
        } else if (availabilityStatus === 'needs_fixing') {
          return (
            <Badge className="bg-yellow-100 text-yellow-800 font-semibold">
              {hasSpareAssigned ? t('indexPage.needsFixingSpareAssignedStatus') : t('indexPage.needsFixingStatus')}
            </Badge>
          );
        } else if (availabilityStatus === 'not_for_rental') {
          return (
            <Badge className="bg-gray-200 text-gray-700 font-semibold">
              {t('indexPage.notForRentalStatus')}
            </Badge>
          );
        } else if (availabilityStatus === 'rented') {
          // Check if this vehicle is being used as a spare (replacement reservation that's picked up)
          const hasActiveSpareReservation = reservations?.some(r => 
            r.vehicleId === vehicle.id && 
            r.type === 'replacement' && 
            r.status === 'picked_up'
          );
          
          return (
            <Badge className={hasActiveSpareReservation ? "bg-orange-100 text-orange-800 font-semibold" : "bg-blue-100 text-blue-800 font-semibold"}>
              {hasActiveSpareReservation ? t('indexPage.spareVehicleActiveStatus') : hasSpareAssigned ? t('indexPage.rentedSpareAssignedStatus') : t('indexPage.rentedStatus')}
            </Badge>
          );
        }
        
        // Fallback
        return (
          <Badge className="bg-gray-100 text-gray-600">
            {availabilityStatus}
          </Badge>
        );
      },
    },
    {
      id: "registration",
      header: t('indexPage.registrationColumn'),
      cell: ({ row }) => {
        const vehicle = row.original;
        // Use utility function for consistent boolean/string checks
        const isRegisteredToPerson = isTrueValue(vehicle.registeredTo);
        const isRegisteredToCompany = isTrueValue(vehicle.company);
        
        return (
          <div className="flex flex-col">
            {isRegisteredToPerson ? (
              <>
                <Badge className="bg-blue-50 text-blue-700 py-0.5 px-1.5">{t('indexPage.registeredToPersonBadge')}</Badge>
                {vehicle.registeredToDate && (
                  <span className="text-xs text-gray-500 mt-1">{t('indexPage.sinceLabel', { date: formatDate(vehicle.registeredToDate) })}</span>
                )}
              </>
            ) : isRegisteredToCompany ? (
              <>
                <Badge className="bg-green-50 text-green-700 py-0.5 px-1.5">{t('indexPage.registeredToCompanyBadge')}</Badge>
                {vehicle.companyDate && (
                  <span className="text-xs text-gray-500 mt-1">{t('indexPage.sinceLabel', { date: formatDate(vehicle.companyDate) })}</span>
                )}
              </>
            ) : (
              <span className="text-gray-500">{t('indexPage.notSpecified')}</span>
            )}
          </div>
        );
      },
    },
    {
      id: "gps",
      header: t('indexPage.gpsColumn'),
      cell: ({ row }) => {
        const vehicle = row.original;
        return vehicle.gps ?
          <Badge className="bg-blue-50 text-blue-700">{t('indexPage.yesLabel')}</Badge> :
          <span className="text-gray-400">{t('indexPage.noLabel')}</span>;
      },
    },
    {
      id: "radioCode",
      header: t('indexPage.radioCodeColumn'),
      cell: ({ row }) => {
        const vehicle = row.original;
        return vehicle.radioCode ?
          <span className="font-medium text-purple-700">{vehicle.radioCode}</span> :
          <span className="text-gray-400">{t('indexPage.notAvailable')}</span>;
      },
    },
    {
      id: "tireSize",
      header: t('indexPage.tireSizeColumn'),
      cell: ({ row }) => {
        const vehicle = row.original;
        return vehicle.tireSize ?
          <span className="font-medium">{vehicle.tireSize}</span> :
          <span className="text-gray-400">{t('indexPage.notAvailable')}</span>;
      },
    },
    {
      accessorKey: "apkDate",
      header: t('indexPage.apkExpiresColumn'),
      cell: ({ row }) => {
        const apkDate = row.getValue("apkDate") as string;
        if (!apkDate) return <span className="text-gray-500">{t('indexPage.apkNotSet')}</span>;
        
        const daysUntil = getDaysUntil(apkDate);
        let badgeClass = "bg-primary-100 text-primary-600";
        
        if (daysUntil <= 14) {
          badgeClass = "bg-danger-50 text-danger-500";
        } else if (daysUntil <= 30) {
          badgeClass = "bg-warning-50 text-warning-500";
        }
        
        return (
          <div className="flex items-center">
            <span className="mr-2">{formatDate(apkDate)}</span>
            <Badge className={badgeClass}>{daysUntil < 0 ? t('indexPage.daysOverdue', { count: Math.abs(daysUntil) }) : t('indexPage.daysRemaining', { count: daysUntil })}</Badge>
          </div>
        );
      },
    },

  ];
  
  return (
    <div className="space-y-6">
      {/* Vehicle View Dialog */}
      <VehicleViewDialog 
        open={vehicleViewDialogOpen}
        onOpenChange={setVehicleViewDialogOpen}
        vehicleId={selectedVehicleId}
      />
      
      {/* Reservation View Dialog - for starting pickup after creating reservation */}
      <ReservationViewDialog
        open={reservationViewDialogOpen}
        onOpenChange={setReservationViewDialogOpen}
        reservationId={selectedReservationId}
      />

      {/* Page-level Reservation Add Dialog. Lives here (not inside the table cell)
          so it survives table refetches that would otherwise unmount the dialog
          mid-flow — e.g. after creating a quick driver. */}
      {reserveDialogVehicleId !== null && (
        <ReservationAddDialog
          key={reserveDialogVehicleId}
          initialVehicleId={reserveDialogVehicleId}
          open={true}
          onOpenChange={(next) => {
            if (!next) setReserveDialogVehicleId(null);
          }}
          onSuccess={(reservation) => {
            handleDialogSuccess();
            setReserveDialogVehicleId(null);
            if (reservation.status !== 'picked_up') {
              toast({
                title: t('indexPage.toasts.reservationCreatedTitle'),
                description: t('indexPage.toasts.openingReservationDetails'),
              });
              setSelectedReservationId(reservation.id);
              setReservationViewDialogOpen(true);
            }
          }}
        />
      )}

      {/* Page-level Edit/Delete dialogs. Same pattern as above: table cells are
          remounted on every refetch-driven re-render, so an open dialog inside a
          cell would close on its own (e.g. ~5s after a save when background
          refreshes land). Keeping them here makes them survive table updates. */}
      {editVehicleId !== null && (
        <VehicleEditDialog
          key={editVehicleId}
          vehicleId={editVehicleId}
          open={true}
          onOpenChange={(next) => {
            if (!next) setEditVehicleId(null);
          }}
          onSuccess={handleDialogSuccess}
        />
      )}
      {deleteVehicleTarget !== null && (
        <VehicleDeleteDialog
          key={deleteVehicleTarget.id}
          vehicleId={deleteVehicleTarget.id}
          vehicleBrand={deleteVehicleTarget.brand}
          vehicleModel={deleteVehicleTarget.model}
          vehicleLicensePlate={deleteVehicleTarget.licensePlate}
          open={true}
          onOpenChange={(next) => {
            if (!next) setDeleteVehicleTarget(null);
          }}
          onSuccess={handleDialogSuccess}
        />
      )}
      
      <DeletedVehiclesDialog
        open={deletedVehiclesOpen}
        onOpenChange={setDeletedVehiclesOpen}
        onRestored={handleDialogSuccess}
      />

      <BarcodeBookDialog
        open={barcodeBookOpen}
        onOpenChange={setBarcodeBookOpen}
      />

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{t('indexPage.pageTitle')}</h1>
        <div className="flex space-x-2">
          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => setDeletedVehiclesOpen(true)}
              data-testid="button-open-recycle-bin"
            >
              <Archive className="h-4 w-4 mr-2" />
              {t('indexPage.deletedVehiclesButton')}
            </Button>
          )}
          <Button variant="outline" onClick={() => setBarcodeBookOpen(true)} data-testid="button-open-barcode-book">
            <BookOpen className="h-4 w-4 mr-2" />
            {t("barcodes:book.title")}
          </Button>
          <VehicleBulkImportDialog onSuccess={handleDialogSuccess} />
          <VehicleAddDialog onSuccess={handleDialogSuccess} />
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>{t('indexPage.fleetCardTitle')}</CardTitle>
          <CardDescription>
            {t('indexPage.fleetCardDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-4 items-center">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('indexPage.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-full"
                autoFocus
              />
              {searchQuery && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="absolute right-0 top-0 h-full px-3" 
                  onClick={() => setSearchQuery("")}
                >
                  ✕
                </Button>
              )}
            </div>
            {/* Feature filter — dropdown with checkboxes */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="button-feature-filter">
                  <SlidersHorizontal className="h-4 w-4" />
                  {t('indexPage.filterFeaturesButton')}
                  {featureFilters.length > 0 && (
                    <Badge variant="secondary" className="ml-1">{featureFilters.length}</Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <span className="text-sm font-medium">{t('indexPage.filterByFeaturesLabel')}</span>
                  {featureFilters.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto px-2 py-1 text-xs"
                      onClick={() => setFeatureFilters([])}
                      data-testid="button-clear-feature-filter"
                    >
                      {t('indexPage.clearButton')}
                    </Button>
                  )}
                </div>

                {/* Match mode toggle: strict (all) vs broad (any) */}
                <div className="px-4 py-3 border-b">
                  <div className="text-xs text-muted-foreground mb-2">{t('indexPage.showVehiclesThatHaveLabel')}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={featureMatchMode === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFeatureMatchMode("all")}
                      data-testid="button-match-all"
                    >
                      {t('indexPage.allSelectedButton')}
                    </Button>
                    <Button
                      variant={featureMatchMode === "any" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFeatureMatchMode("any")}
                      data-testid="button-match-any"
                    >
                      {t('indexPage.anySelectedButton')}
                    </Button>
                  </div>
                </div>

                <div className="px-2 py-2 max-h-72 overflow-auto">
                  {FEATURE_FILTERS.map(({ key, labelKey }) => {
                    const checked = featureFilters.includes(key);
                    return (
                      <label
                        key={String(key)}
                        className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent cursor-pointer"
                        data-testid={`feature-filter-${String(key)}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(val) => {
                            setFeatureFilters((prev) =>
                              val ? [...prev, key] : prev.filter((k) => k !== key)
                            );
                          }}
                        />
                        <span className="text-sm">{t(`vehicleForm.${labelKey}`)}</span>
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            <div className="flex items-center">
              <label htmlFor="sortBy" className="mr-2 text-sm font-medium">{t('indexPage.sortByLabel')}</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder={t('indexPage.sortDefaultPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t('indexPage.sortDefaultOption')}</SelectItem>
                  <SelectItem value="license">{t('indexPage.sortLicenseOption')}</SelectItem>
                  <SelectItem value="brand">{t('indexPage.sortBrandOption')}</SelectItem>
                  <SelectItem value="apk-asc">{t('indexPage.sortApkAscOption')}</SelectItem>
                  <SelectItem value="apk-desc">{t('indexPage.sortApkDescOption')}</SelectItem>
                  <SelectItem value="availability-asc">{t('indexPage.sortAvailabilityAscOption')}</SelectItem>
                  <SelectItem value="availability-desc">{t('indexPage.sortAvailabilityDescOption')}</SelectItem>
                  <SelectItem value="filter-needs-fixing">{t('indexPage.sortNeedsFixingOption')}</SelectItem>
                  <SelectItem value="filter-opnaam">{t('indexPage.sortOpnaamOption')}</SelectItem>
                  <SelectItem value="filter-bv">{t('indexPage.sortBvOption')}</SelectItem>
                  <SelectItem value="filter-unspecified">{t('indexPage.sortUnspecifiedOption')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <svg className="animate-spin h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredVehicles || []}
            />
          )}
        </CardContent>
      </Card>
      
      {/* Vehicle remarks warning dialog */}
      <VehicleRemarksWarningDialog
        open={remarksWarningOpen}
        onOpenChange={setRemarksWarningOpen}
        vehicle={pendingViewVehicle}
        context="view"
        onAcknowledge={handleRemarksAcknowledged}
        onCancel={() => setPendingViewVehicle(null)}
        onRemarksUpdated={(updatedVehicle) => setPendingViewVehicle(updatedVehicle)}
      />
    </div>
  );
}
