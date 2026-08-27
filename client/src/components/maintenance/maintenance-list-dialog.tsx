import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { format, parseISO, differenceInDays } from "date-fns";
import { 
  AlertTriangle, 
  Shield, 
  Wrench, 
  Car, 
  Calendar,
  Search,
  Eye,
  Edit,
  Plus,
  Clock,
  Trash2
} from "lucide-react";
import { Vehicle, Reservation } from "@shared/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatLicensePlate } from "@/lib/format-utils";
import { MaintenanceEditDialog } from "@/components/maintenance/maintenance-edit-dialog";
import { ScheduleMaintenanceDialog } from "@/components/maintenance/schedule-maintenance-dialog";
import { VehicleViewDialog } from "@/components/vehicles/vehicle-view-dialog";
import { SpareVehicleDialog } from "@/components/reservations/spare-vehicle-dialog";
import { apiRequest, queryClient, invalidateRelatedQueries, invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MaintenanceListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Helper function to calculate days until a date
const getDaysUntil = (dateString: string): number => {
  if (!dateString) return 999;
  try {
    const targetDate = parseISO(dateString);
    const today = new Date();
    return differenceInDays(targetDate, today);
  } catch {
    return 999;
  }
};

// Use the shared license plate formatter

// Helper function to get urgency color
const getUrgencyColor = (days: number): string => {
  if (days < 0) return "bg-red-500 text-white"; // Overdue
  if (days <= 14) return "bg-orange-500 text-white"; // Very urgent
  if (days <= 30) return "bg-yellow-500 text-black"; // Urgent
  if (days <= 60) return "bg-blue-500 text-white"; // Soon
  return "bg-gray-200 text-gray-700"; // Future
};

// Helper function to get urgency text
const getUrgencyText = (days: number, t: TFunction): string => {
  if (days < 0) return t('listDialog.daysOverdue', { count: Math.abs(days) });
  if (days === 0) return t('listDialog.dueToday');
  if (days === 1) return t('listDialog.dueTomorrow');
  return t('listDialog.daysRemaining', { count: days });
};

export function MaintenanceListDialog({ open, onOpenChange }: MaintenanceListDialogProps) {
  const { t } = useTranslation(["maintenance", "common"]);
  const [searchTerm, setSearchTerm] = useState("");
  
  // State for maintenance edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedMaintenanceReservation, setSelectedMaintenanceReservation] = useState<Reservation | null>(null);
  
  // State for vehicle view dialog
  const [vehicleViewDialogOpen, setVehicleViewDialogOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  
  // State for spare vehicle assignment dialog
  const [spareDialogOpen, setSpareDialogOpen] = useState(false);
  const [selectedSpareAssignment, setSelectedSpareAssignment] = useState<any>(null);
  
  // State for delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reservationToDelete, setReservationToDelete] = useState<Reservation | null>(null);
  
  // State for schedule maintenance dialog
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [selectedVehicleIdForSchedule, setSelectedVehicleIdForSchedule] = useState<number | null>(null);
  const [selectedMaintenanceTypeForSchedule, setSelectedMaintenanceTypeForSchedule] = useState<"apk_inspection" | "warranty_service" | null>(null);
  
  const { toast } = useToast();

  // Fetch APK expiring vehicles
  const { data: apkVehicles = [], isLoading: apkLoading, error: apkError } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles/apk-expiring"],
    enabled: open,
  });

  // Fetch warranty expiring vehicles
  const { data: warrantyVehicles = [], isLoading: warrantyLoading, error: warrantyError } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles/warranty-expiring"],
    enabled: open,
  });

  // Fetch scheduled maintenance (maintenance block reservations)
  const { data: allReservations = [], isLoading: reservationsLoading, error: reservationsError } = useQuery<
    (Reservation & {
      vehicle?: Vehicle;
      customer?: { id: number; name: string; firstName?: string; lastName?: string };
    })[]
  >({
    queryKey: ["/api/reservations"],
    enabled: open,
  });

  // Fetch spare vehicle assignments needed
  const { data: spareAssignments = [], isLoading: spareLoading, error: spareError } = useQuery<Reservation[]>({
    queryKey: ["/api/placeholder-reservations/needing-assignment"],
    enabled: open,
  });

  // Filter maintenance reservations
  const maintenanceReservations = allReservations.filter(
    (reservation) => reservation.type === "maintenance_block"
  );

  // Delete maintenance function
  const [isDeleting, setIsDeleting] = useState(false);
  
  const handleDeleteMaintenance = async (reservation: Reservation) => {
    if (!reservation || isDeleting) return;
    
    setIsDeleting(true);
    try {
      await apiRequest("DELETE", `/api/reservations/${reservation.id}`);

      invalidateRelatedQueries('reservations');
      invalidateRelatedQueries('vehicles');
      invalidateByPrefix('/api/placeholder-reservations');

      toast({
        title: t('listDialog.maintenanceDeletedTitle'),
        description: t('listDialog.maintenanceDeletedDescription'),
      });

      // Close dialogs
      setDeleteDialogOpen(false);
      setReservationToDelete(null);
      
    } catch (error) {
      console.error('Error deleting maintenance:', error);
      toast({
        title: t('listDialog.errorTitle'),
        description: error instanceof Error ? error.message : t('listDialog.deleteFailedDescription'),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };
  
  // Helper function to check if active maintenance is already scheduled for a vehicle
  const isMaintenanceScheduled = (vehicleId: number, maintenanceType: 'apk_inspection' | 'warranty_service'): boolean => {
    if (!maintenanceReservations || maintenanceReservations.length === 0) return false;
    
    const today = new Date();
    
    return maintenanceReservations.some(reservation => {
      if (reservation.vehicleId !== vehicleId) return false;
      
      // Only consider active maintenance (not cancelled/completed and not in the past)
      if (reservation.status === 'cancelled' || reservation.status === 'completed') return false;
      
      // Check if maintenance is in the future or current
      const endDate = reservation.endDate ? new Date(reservation.endDate) : new Date(reservation.startDate);
      if (endDate < today) return false;
      
      // Check maintenance type from reservation notes
      const notes = (reservation.notes?.toLowerCase() || '').trim();
      
      if (maintenanceType === 'apk_inspection') {
        // APK inspection keywords
        return notes.includes('apk_inspection') ||
               notes.includes('apk') || 
               notes.includes('keuring') || 
               notes.includes('rdw');
      } else if (maintenanceType === 'warranty_service') {
        // Warranty service keywords
        return notes.includes('warranty_service') ||
               notes.includes('warranty') || 
               notes.includes('garantie') || 
               notes.includes('garanti') ||
               notes.includes('recall');
      }
      
      return false;
    });
  };
  
  // Create unified search filter
  const filterItems = (items: any[], searchFields: string[]) => {
    if (!searchTerm) return items;
    
    const search = searchTerm.toLowerCase();
    return items.filter((item) =>
      searchFields.some((field) => {
        const value = field.split('.').reduce((obj, key) => obj?.[key], item);
        return value?.toString().toLowerCase().includes(search);
      })
    );
  };

  // Apply search filters and maintenance scheduling filters
  const availableApkVehicles = apkVehicles.filter(vehicle => !isMaintenanceScheduled(vehicle.id, 'apk_inspection'));
  const availableWarrantyVehicles = warrantyVehicles.filter(vehicle => !isMaintenanceScheduled(vehicle.id, 'warranty_service'));
  
  const filteredApkVehicles = filterItems(availableApkVehicles, ['licensePlate', 'brand', 'model']);
  const filteredWarrantyVehicles = filterItems(availableWarrantyVehicles, ['licensePlate', 'brand', 'model']);
  const filteredMaintenanceReservations = filterItems(maintenanceReservations, [
    'vehicle.licensePlate', 
    'vehicle.brand', 
    'vehicle.model', 
    'notes'
  ]);
  const filteredSpareAssignments = filterItems(spareAssignments, [
    'customer.name', 
    'customer.firstName', 
    'customer.lastName'
  ]);

  // Calculate totals
  const totalItems = 
    filteredApkVehicles.length + 
    filteredWarrantyVehicles.length + 
    filteredMaintenanceReservations.length + 
    filteredSpareAssignments.length;

  const isLoading = apkLoading || warrantyLoading || reservationsLoading || spareLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            {t('listDialog.overviewTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('listDialog.overviewDescription')}
          </DialogDescription>
        </DialogHeader>

        {/* Search and Summary */}
        <div className="flex flex-col sm:flex-row gap-4 pb-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('listDialog.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-maintenance-search"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="font-medium">{t('listDialog.totalItems', { count: totalItems })}</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <Tabs defaultValue="apk" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="apk" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {t('listDialog.apkTab', { count: filteredApkVehicles.length })}
              </TabsTrigger>
              <TabsTrigger value="warranty" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                {t('listDialog.warrantyTab', { count: filteredWarrantyVehicles.length })}
              </TabsTrigger>
              <TabsTrigger value="scheduled" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {t('listDialog.scheduledTab', { count: filteredMaintenanceReservations.length })}
              </TabsTrigger>
              <TabsTrigger value="spares" className="flex items-center gap-2">
                <Car className="h-4 w-4" />
                {t('listDialog.sparesTab', { count: filteredSpareAssignments.length })}
              </TabsTrigger>
            </TabsList>

            {/* APK Expiring Tab */}
            <TabsContent value="apk" className="flex-1 overflow-auto">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    {t('listDialog.apkInspectionsDue')}
                  </CardTitle>
                  <CardDescription>
                    {t('listDialog.apkInspectionsDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : apkError ? (
                    <Alert className="bg-red-50 border-red-200">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-700">
                        {t('listDialog.failedToLoadApk')}
                      </AlertDescription>
                    </Alert>
                  ) : filteredApkVehicles.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      {searchTerm ? t('listDialog.noApkMatchSearch') : t('listDialog.noApkDueSoon')}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('listDialog.vehicleCol')}</TableHead>
                          <TableHead>{t('listDialog.licensePlateCol')}</TableHead>
                          <TableHead>{t('listDialog.apkDateCol')}</TableHead>
                          <TableHead>{t('listDialog.urgencyCol')}</TableHead>
                          <TableHead>{t('listDialog.actionsCol')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredApkVehicles
                          .map(vehicle => ({ 
                            ...vehicle, 
                            daysUntil: getDaysUntil(vehicle.apkDate || '') 
                          }))
                          .sort((a, b) => a.daysUntil - b.daysUntil)
                          .map((vehicle) => (
                            <TableRow key={vehicle.id} data-testid={`row-apk-${vehicle.id}`}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{vehicle.brand}</div>
                                  <div className="text-sm text-gray-500">{vehicle.model}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                                  {formatLicensePlate(vehicle.licensePlate)}
                                </code>
                              </TableCell>
                              <TableCell>
                                {vehicle.apkDate ? format(parseISO(vehicle.apkDate), "dd MMM yyyy") : t('listDialog.notSet')}
                              </TableCell>
                              <TableCell>
                                <Badge className={getUrgencyColor(vehicle.daysUntil)}>
                                  {getUrgencyText(vehicle.daysUntil, t)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => {
                                      setSelectedVehicleIdForSchedule(vehicle.id);
                                      setSelectedMaintenanceTypeForSchedule("apk_inspection");
                                      setIsScheduleDialogOpen(true);
                                    }}
                                    data-testid={`button-schedule-apk-${vehicle.id}`}
                                  >
                                    <Wrench className="h-4 w-4 mr-1" />
                                    {t('listDialog.schedule')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedVehicleId(vehicle.id);
                                      setVehicleViewDialogOpen(true);
                                    }}
                                    data-testid={`button-view-${vehicle.id}`}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    {t('listDialog.view')}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Warranty Expiring Tab */}
            <TabsContent value="warranty" className="flex-1 overflow-auto">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-blue-500" />
                    {t('listDialog.warrantiesExpiring')}
                  </CardTitle>
                  <CardDescription>
                    {t('listDialog.warrantiesDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : warrantyError ? (
                    <Alert className="bg-red-50 border-red-200">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-700">
                        {t('listDialog.failedToLoadWarranty')}
                      </AlertDescription>
                    </Alert>
                  ) : filteredWarrantyVehicles.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      {searchTerm ? t('listDialog.noWarrantyMatchSearch') : t('listDialog.noWarrantyExpiringSoon')}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('listDialog.vehicleCol')}</TableHead>
                          <TableHead>{t('listDialog.licensePlateCol')}</TableHead>
                          <TableHead>{t('listDialog.warrantyEndDateCol')}</TableHead>
                          <TableHead>{t('listDialog.urgencyCol')}</TableHead>
                          <TableHead>{t('listDialog.actionsCol')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredWarrantyVehicles
                          .map(vehicle => ({ 
                            ...vehicle, 
                            daysUntil: getDaysUntil(vehicle.warrantyEndDate || '') 
                          }))
                          .sort((a, b) => a.daysUntil - b.daysUntil)
                          .map((vehicle) => (
                            <TableRow key={vehicle.id} data-testid={`row-warranty-${vehicle.id}`}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{vehicle.brand}</div>
                                  <div className="text-sm text-gray-500">{vehicle.model}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                                  {formatLicensePlate(vehicle.licensePlate)}
                                </code>
                              </TableCell>
                              <TableCell>
                                {vehicle.warrantyEndDate ? format(parseISO(vehicle.warrantyEndDate), "dd MMM yyyy") : t('listDialog.notSet')}
                              </TableCell>
                              <TableCell>
                                <Badge className={getUrgencyColor(vehicle.daysUntil)}>
                                  {getUrgencyText(vehicle.daysUntil, t)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => {
                                      setSelectedVehicleIdForSchedule(vehicle.id);
                                      setSelectedMaintenanceTypeForSchedule("warranty_service");
                                      setIsScheduleDialogOpen(true);
                                    }}
                                    data-testid={`button-schedule-warranty-${vehicle.id}`}
                                  >
                                    <Wrench className="h-4 w-4 mr-1" />
                                    {t('listDialog.schedule')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedVehicleId(vehicle.id);
                                      setVehicleViewDialogOpen(true);
                                    }}
                                    data-testid={`button-view-${vehicle.id}`}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    {t('listDialog.view')}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Scheduled Maintenance Tab */}
            <TabsContent value="scheduled" className="flex-1 overflow-auto">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-green-500" />
                    {t('listDialog.scheduledMaintenance')}
                  </CardTitle>
                  <CardDescription>
                    {t('listDialog.scheduledDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : reservationsError ? (
                    <Alert className="bg-red-50 border-red-200">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-700">
                        {t('listDialog.failedToLoadScheduled')}
                      </AlertDescription>
                    </Alert>
                  ) : filteredMaintenanceReservations.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      {searchTerm ? t('listDialog.noScheduledMatchSearch') : t('listDialog.noScheduledMaintenance')}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('listDialog.vehicleCol')}</TableHead>
                          <TableHead>{t('listDialog.licensePlateCol')}</TableHead>
                          <TableHead>{t('listDialog.startDateCol')}</TableHead>
                          <TableHead>{t('listDialog.durationCol')}</TableHead>
                          <TableHead>{t('listDialog.statusCol')}</TableHead>
                          <TableHead>{t('listDialog.descriptionCol')}</TableHead>
                          <TableHead>{t('listDialog.scheduledByCol')}</TableHead>
                          <TableHead>{t('listDialog.actionsCol')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMaintenanceReservations
                          .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                          .map((reservation) => (
                            <TableRow key={reservation.id} data-testid={`row-maintenance-${reservation.id}`}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{reservation.vehicle?.brand}</div>
                                  <div className="text-sm text-gray-500">{reservation.vehicle?.model}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                                  {formatLicensePlate(reservation.vehicle?.licensePlate || '')}
                                </code>
                              </TableCell>
                              <TableCell>
                                {format(parseISO(reservation.startDate), "dd MMM yyyy")}
                              </TableCell>
                              <TableCell>
                                {reservation.maintenanceDuration ? t('listDialog.day', { count: reservation.maintenanceDuration }) : t('listDialog.tbd')}
                              </TableCell>
                              <TableCell>
                                {reservation.maintenanceStatus ? (
                                  <Badge 
                                    variant={reservation.maintenanceStatus === "in" ? "default" : "outline"} 
                                    className={
                                      reservation.maintenanceStatus === "scheduled" ? "bg-amber-500 text-white" :
                                      reservation.maintenanceStatus === "in" ? "bg-purple-500 text-white" : 
                                      "bg-green-500 text-white"
                                    }
                                  >
                                    {t(`listDialog.statusShort.${reservation.maintenanceStatus}`, { defaultValue: reservation.maintenanceStatus.toUpperCase() })}
                                  </Badge>
                                ) : (
                                  <Badge variant={reservation.status === "completed" ? "default" : "secondary"}>
                                    {reservation.status}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="max-w-xs">
                                <div className="truncate text-sm">
                                  {reservation.notes?.split('\n')[0] || t('listDialog.noDescription')}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <div className="font-medium">{reservation.createdBy || t('listDialog.systemLabel')}</div>
                                  <div className="text-xs text-gray-500">
                                    {reservation.createdAt ? format(new Date(reservation.createdAt), "dd MMM yyyy") : ''}
                                  </div>
                                  {reservation.updatedBy && reservation.updatedBy !== reservation.createdBy && (
                                    <div className="text-xs text-gray-400 mt-1">
                                      {t('listDialog.updatedBy', { name: reservation.updatedBy })}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedMaintenanceReservation(reservation);
                                      setEditDialogOpen(true);
                                    }}
                                    data-testid={`button-edit-${reservation.id}`}
                                  >
                                    <Edit className="h-4 w-4 mr-1" />
                                    {t('listDialog.edit')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setReservationToDelete(reservation);
                                      setDeleteDialogOpen(true);
                                    }}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    data-testid={`button-delete-${reservation.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    {t('listDialog.delete')}
                                  </Button>
                                  {reservation.vehicle && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setSelectedVehicleId(reservation.vehicle.id);
                                        setVehicleViewDialogOpen(true);
                                      }}
                                      data-testid={`button-view-vehicle-${reservation.vehicle.id}`}
                                    >
                                      <Eye className="h-4 w-4 mr-1" />
                                      {t('listDialog.vehicleAction')}
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Spare Vehicle Assignments Tab */}
            <TabsContent value="spares" className="flex-1 overflow-auto">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Car className="h-5 w-5 text-purple-500" />
                    {t('listDialog.spareVehicleAssignments')}
                  </CardTitle>
                  <CardDescription>
                    {t('listDialog.spareDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : spareError ? (
                    <Alert className="bg-red-50 border-red-200">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-700">
                        {t('listDialog.failedToLoadSpares')}
                      </AlertDescription>
                    </Alert>
                  ) : filteredSpareAssignments.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      {searchTerm ? t('listDialog.noSparesMatchSearch') : t('listDialog.noPendingSpares')}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('listDialog.customerCol')}</TableHead>
                          <TableHead>{t('listDialog.startDateCol')}</TableHead>
                          <TableHead>{t('listDialog.endDateCol')}</TableHead>
                          <TableHead>{t('listDialog.statusCol')}</TableHead>
                          <TableHead>{t('listDialog.daysUntilCol')}</TableHead>
                          <TableHead>{t('listDialog.actionsCol')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSpareAssignments
                          .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                          .map((assignment) => {
                            const daysUntilStart = getDaysUntil(assignment.startDate);
                            const customerName = assignment.customer?.name ||
                              `${assignment.customer?.firstName || ''} ${assignment.customer?.lastName || ''}`.trim() ||
                              t('listDialog.customerNumberFallback', { id: assignment.customerId });
                            
                            return (
                              <TableRow key={assignment.id} data-testid={`row-spare-${assignment.id}`}>
                                <TableCell>
                                  <div className="font-medium">{customerName}</div>
                                </TableCell>
                                <TableCell>
                                  {format(parseISO(assignment.startDate), "dd MMM yyyy")}
                                </TableCell>
                                <TableCell>
                                  {assignment.endDate ? format(parseISO(assignment.endDate), "dd MMM yyyy") : t('listDialog.tbd')}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                    {t('listDialog.needsAssignment')}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge className={getUrgencyColor(daysUntilStart)}>
                                    {getUrgencyText(daysUntilStart, t)}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setSelectedSpareAssignment(assignment);
                                      setSpareDialogOpen(true);
                                    }}
                                    data-testid={`button-assign-${assignment.id}`}
                                  >
                                    <Plus className="h-4 w-4 mr-1" />
                                    {t('listDialog.assign')}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>

      {/* Maintenance Edit Dialog */}
      <MaintenanceEditDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setSelectedMaintenanceReservation(null);
          }
        }}
        reservation={selectedMaintenanceReservation}
      />

      {/* Schedule Maintenance Dialog */}
      <ScheduleMaintenanceDialog
        open={isScheduleDialogOpen}
        onOpenChange={(open) => {
          setIsScheduleDialogOpen(open);
          if (!open) {
            setSelectedVehicleIdForSchedule(null);
            setSelectedMaintenanceTypeForSchedule(null);
          }
        }}
        initialVehicleId={selectedVehicleIdForSchedule || undefined}
        initialMaintenanceType={selectedMaintenanceTypeForSchedule || undefined}
        onSuccess={() => {
          invalidateRelatedQueries('reservations');
          invalidateRelatedQueries('vehicles');
          invalidateByPrefix('/api/placeholder-reservations');
          
          // Show success message
          toast({
            title: t('listDialog.maintenanceScheduledTitle'),
            description: t('listDialog.maintenanceScheduledDescription'),
          });
        }}
      />

      {/* Vehicle View Dialog */}
      <VehicleViewDialog
        open={vehicleViewDialogOpen}
        onOpenChange={(open) => {
          setVehicleViewDialogOpen(open);
          if (!open) {
            setSelectedVehicleId(null);
          }
        }}
        vehicleId={selectedVehicleId}
      />

      {/* Spare Vehicle Assignment Dialog */}
      <SpareVehicleDialog
        open={spareDialogOpen}
        onOpenChange={(open) => {
          setSpareDialogOpen(open);
          if (!open) {
            setSelectedSpareAssignment(null);
          }
        }}
        originalReservation={selectedSpareAssignment}
        onSuccess={() => {
          setSpareDialogOpen(false);
          setSelectedSpareAssignment(null);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('listDialog.deleteMaintenanceTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('listDialog.deleteMaintenanceConfirmPrefix')}
              {reservationToDelete?.vehicle ? (
                <>
                  <strong>
                    {reservationToDelete.vehicle.brand} {reservationToDelete.vehicle.model}
                  </strong>{' '}
                  ({formatLicensePlate(reservationToDelete.vehicle.licensePlate)})
                </>
              ) : (
                <strong>{t('listDialog.vehiclePlaceholder', { id: reservationToDelete?.vehicleId })}</strong>
              )}
              {t('listDialog.deleteMaintenanceConfirmSuffix')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (reservationToDelete) {
                  handleDeleteMaintenance(reservationToDelete);
                }
              }}
              disabled={isDeleting || !reservationToDelete}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              {isDeleting ? t('listDialog.deleting') : t('listDialog.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}