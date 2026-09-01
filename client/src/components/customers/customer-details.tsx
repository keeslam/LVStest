import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation } from "wouter";
import { ReservationAddDialog } from "@/components/reservations/reservation-add-dialog";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { CustomerEditDialog } from "./customer-edit-dialog";
import { DriverDialog } from "./driver-dialog";
import { DriverViewDialog } from "./driver-view-dialog";
import { formatDate, formatCurrency, formatPhoneNumber, formatReservationStatus, formatLicensePlate } from "@/lib/format-utils";
import { Price } from "@/components/ui/price";
import { displayLicensePlate } from "@/lib/utils";
import { Customer, Reservation, Driver } from "@shared/schema";
import { apiRequest, queryClient, invalidateRelatedQueries, invalidateByPrefix } from "@/lib/queryClient";
import { Calendar, Car, Check, FileWarning } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";

interface CustomerDetailsProps {
  customerId: number;
  inDialog?: boolean;
  onClose?: () => void;
}

export function CustomerDetails({ customerId, inDialog = false, onClose }: CustomerDetailsProps) {
  const { t } = useTranslation(["customers", "common"]);
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  // Reservation and vehicle detail dialogs are the global ones (GlobalDialogs),
  // which keeps this file out of the customer -> reservation -> customer import cycle.
  const { openReservationDialog, openVehicleDialog } = useGlobalDialog();
  
  // Driver view dialog state
  const [viewDriverDialogOpen, setViewDriverDialogOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  
  
  // Filter state
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [vehicleFilter, setVehicleFilter] = useState<string>("");
  
  // Driver search and pagination state
  const [driverSearch, setDriverSearch] = useState<string>("");
  const [driverPage, setDriverPage] = useState(1);
  const driversPerPage = 10;
  
  // Define query keys for easier reference
  const customerQueryKey = [`/api/customers/${customerId}`];
  const customerReservationsQueryKey = [`/api/reservations/customer/${customerId}`];
  const customerDriversQueryKey = [`/api/customers/${customerId}/drivers`];
  
  // Fetch customer details with proper caching
  const { 
    data: customer, 
    isLoading: isLoadingCustomer
  } = useQuery<Customer>({
    queryKey: customerQueryKey
  });
  
  // Fetch customer reservations with proper caching
  const { 
    data: reservations, 
    isLoading: isLoadingReservations
  } = useQuery<Reservation[]>({
    queryKey: customerReservationsQueryKey
  });
  
  // Find active reservation for selected driver (memoized)
  const selectedDriverActiveReservation = useMemo(() => {
    if (!selectedDriver || !reservations) return null;
    return reservations.find(
      (r) =>
        r.driverId === selectedDriver.id &&
        (r.status === 'booked' || r.status === 'picked_up') &&
        (!r.endDate || new Date(r.endDate) >= new Date())
    ) || null;
  }, [selectedDriver, reservations]);

  // Fetch customer drivers with proper caching
  const { 
    data: drivers, 
    isLoading: isLoadingDrivers,
    refetch: refetchDrivers
  } = useQuery<Driver[]>({
    queryKey: customerDriversQueryKey,
    staleTime: 0, // Always consider data stale
    refetchOnMount: 'always', // Always refetch when component mounts
  });

  // Fetch blacklisted vehicles for this customer
  const { 
    data: blockedVehicles = [], 
    isLoading: isLoadingBlockedVehicles
  } = useQuery<any[]>({
    queryKey: [`/api/customers/${customerId}/blacklist`],
  });
  
  // Mutation for deleting drivers with optimistic updates
  const deleteDriverMutation = useMutation({
    mutationFn: async (driverId: number) => {
      const response = await apiRequest('DELETE', `/api/drivers/${driverId}`);
      if (!response.ok) {
        throw new Error('Failed to delete driver');
      }
      return driverId;
    },
    onMutate: async (driverId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: customerDriversQueryKey });
      
      // Snapshot the previous value
      const previousDrivers = queryClient.getQueryData<Driver[]>(customerDriversQueryKey);
      
      // Optimistically update to the new value
      queryClient.setQueryData<Driver[]>(customerDriversQueryKey, (old) => {
        if (!old) return [];
        return old.filter(d => d.id !== driverId);
      });
      
      // Return a context with the previous value
      return { previousDrivers };
    },
    onSuccess: async () => {
      // Manually trigger refetch
      await refetchDrivers();
      
      toast({
        title: t('details.driverDeletedTitle'),
        description: t('details.driverDeletedDescription'),
        variant: "default"
      });
    },
    onError: (err, driverId, context) => {
      // Revert to previous value on error
      if (context?.previousDrivers) {
        queryClient.setQueryData(customerDriversQueryKey, context.previousDrivers);
      }
      toast({
        title: t('common:status.error'),
        description: t('details.driverDeleteFailed'),
        variant: "destructive"
      });
    },
  });
  
  // Filter and paginate drivers
  const { filteredDrivers, paginatedDrivers, totalPages, totalDrivers } = useMemo(() => {
    if (!drivers) {
      return { filteredDrivers: [], paginatedDrivers: [], totalPages: 0, totalDrivers: 0 };
    }
    
    // Filter drivers by search query
    const filtered = drivers.filter(driver => {
      if (!driverSearch) return true;
      
      const searchLower = driverSearch.toLowerCase();
      const displayName = driver.displayName?.toLowerCase() || '';
      const firstName = driver.firstName?.toLowerCase() || '';
      const lastName = driver.lastName?.toLowerCase() || '';
      const email = driver.email?.toLowerCase() || '';
      const phone = driver.phone?.toLowerCase() || '';
      const license = driver.driverLicenseNumber?.toLowerCase() || '';
      
      return (
        displayName.includes(searchLower) ||
        firstName.includes(searchLower) ||
        lastName.includes(searchLower) ||
        email.includes(searchLower) ||
        phone.includes(searchLower) ||
        license.includes(searchLower)
      );
    });
    
    // Calculate pagination
    const total = filtered.length;
    const pages = Math.ceil(total / driversPerPage);
    const startIndex = (driverPage - 1) * driversPerPage;
    const endIndex = startIndex + driversPerPage;
    const paginated = filtered.slice(startIndex, endIndex);
    
    return { 
      filteredDrivers: filtered, 
      paginatedDrivers: paginated, 
      totalPages: pages,
      totalDrivers: total
    };
  }, [drivers, driverSearch, driverPage, driversPerPage]);
  
  // Reset to page 1 when search changes
  useMemo(() => {
    setDriverPage(1);
  }, [driverSearch]);
  
  // Calculate rental statistics and filter active/past rentals
  const { activeRentals, pastRentals, rentalStats } = useMemo(() => {
    if (!reservations) {
      return {
        activeRentals: [],
        pastRentals: [],
        rentalStats: {
          totalRentals: 0,
          activeRentals: 0,
          completedRentals: 0,
          totalKilometersDriven: 0
        }
      };
    }

    // Apply filters
    const applyFilters = (rental: Reservation) => {
      // Date range filter
      if (dateFrom && new Date(rental.startDate) < new Date(dateFrom)) {
        return false;
      }
      if (dateTo) {
        // Check if rental starts after the "to" date
        if (new Date(rental.startDate) > new Date(dateTo)) {
          return false;
        }
        // Also check endDate if it exists
        if (rental.endDate && new Date(rental.endDate) > new Date(dateTo)) {
          return false;
        }
      }
      
      // Vehicle filter (search in license plate, brand, model)
      if (vehicleFilter) {
        const searchTerm = vehicleFilter.toLowerCase();
        const vehicleText = `${rental.vehicle?.licensePlate || ''} ${rental.vehicle?.brand || ''} ${rental.vehicle?.model || ''}`.toLowerCase();
        if (!vehicleText.includes(searchTerm)) {
          return false;
        }
      }
      
      return true;
    };

    // Active rentals: booked (upcoming) or picked_up (ongoing) status
    const active = reservations
      .filter(r => ["booked", "picked_up"].includes(r.status.toLowerCase()))
      .filter(applyFilters);

    // Past rentals: completed or cancelled status
    const past = reservations
      .filter(r => ["completed", "cancelled"].includes(r.status.toLowerCase()))
      .filter(applyFilters);
    
    // Sort past rentals by most recent first
    const sortedPast = [...past].sort((a, b) => 
      new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );
    
    // Calculate stats from ALL reservations (not filtered)
    const completedCount = reservations.filter(r => 
      r.status.toLowerCase() === 'completed'
    ).length;
    
    // Calculate total kilometers driven from completed rentals using reservation pickup/return mileage
    const totalKm = reservations.reduce((sum, res) => {
      if (res.status.toLowerCase() === 'completed' && res.pickupMileage && res.returnMileage) {
        return sum + (res.returnMileage - res.pickupMileage);
      }
      return sum;
    }, 0);

    return {
      activeRentals: active,
      pastRentals: sortedPast,
      rentalStats: {
        totalRentals: reservations.length,
        activeRentals: reservations.filter(r => ["booked", "picked_up"].includes(r.status.toLowerCase())).length,
        completedRentals: completedCount,
        totalKilometersDriven: totalKm
      }
    };
  }, [reservations, dateFrom, dateTo, vehicleFilter]);
  
  // Delete reservation mutation
  const deleteReservationMutation = useMutation({
    mutationFn: async (reservationId: number) => {
      const response = await apiRequest('DELETE', `/api/reservations/${reservationId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete reservation');
      }
      return await response.json();
    },
    onSuccess: async () => {
      // Use the unified invalidation system to update all related data
      await invalidateRelatedQueries('reservations', { customerId });
      
      toast({
        title: t('details.reservationDeletedTitle'),
        description: t('details.reservationDeletedDescription'),
        variant: "default"
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common:status.error'),
        description: error.message || t('details.reservationDeleteFailed'),
        variant: "destructive"
      });
    }
  });
  
  // Helper component for rendering a rental table
  const RentalTable = ({ rentals, emptyMessage }: { rentals: Reservation[], emptyMessage: string }) => {
    if (rentals.length === 0) {
      return <div className="text-center py-6 text-gray-500">{emptyMessage}</div>;
    }
    
    return (
      <div className="overflow-x-auto">
        <table className="w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('details.colVehicle')}
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('details.colPeriod')}
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('common:fields.status')}
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('details.colKilometers')}
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('details.colPrice')}
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('details.colDamage')}
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('details.colActions')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rentals.map((reservation) => {
              const vehicle = reservation.vehicle;
              const kmDriven = reservation.pickupMileage && reservation.returnMileage 
                ? reservation.returnMileage - reservation.pickupMileage 
                : null;
              
              return (
                <tr key={reservation.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {displayLicensePlate(vehicle?.licensePlate || 'N/A')}
                      </div>
                      <div className="text-xs text-gray-500">
                        {vehicle?.brand} {vehicle?.model}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      <div>{formatDate(reservation.startDate)}</div>
                      <div className="text-xs text-gray-500">
                        {reservation.endDate ? t('details.periodTo', { date: formatDate(reservation.endDate) }) : t('details.periodToTbd')}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={reservation.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {kmDriven !== null ? `${kmDriven.toLocaleString()} km` : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {<Price value={Number(reservation.totalPrice || 0)} />}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {reservation.damageCheckPath ? (
                      <FileWarning className="h-4 w-4 text-orange-600 mx-auto" />
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-primary-600 hover:text-primary-800"
                        onClick={() => openReservationDialog(reservation.id)}
                        data-testid={`button-view-reservation-${reservation.id}`}
                      >
                        {t('common:actions.view')}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-600 hover:text-red-800"
                          >
                            <svg 
                              xmlns="http://www.w3.org/2000/svg" 
                              width="16" 
                              height="16" 
                              viewBox="0 0 24 24" 
                              fill="none" 
                              stroke="currentColor" 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              className="mr-1"
                            >
                              <path d="M3 6h18"></path>
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                              <line x1="10" y1="11" x2="10" y2="17"></line>
                              <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                            {t('common:actions.delete')}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('details.deleteReservationTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('details.deleteReservationConfirm')}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => {
                                deleteReservationMutation.mutate(reservation.id);
                              }}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              {deleteReservationMutation.isPending ? (
                                <>
                                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Deleting...
                                </>
                              ) : (
                                'Delete'
                              )}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };
  
  if (isLoadingCustomer) {
    return (
      <div className="flex justify-center items-center h-64">
        <svg className="animate-spin h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }
  
  if (!customer) {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-2">{t('details.customerNotFoundTitle')}</h2>
        <p className="mb-4 text-gray-600">{t('details.customerNotFoundDescription')}</p>
        <Button onClick={() => navigate("/customers")}>{t('details.backToCustomers')}</Button>
      </div>
    );
  }
  
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          <p className="text-gray-600">{t('details.customerSince', { date: formatDate(customer.createdAt?.toString() || "") })}</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => inDialog && onClose ? onClose() : navigate("/customers")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <path d="m12 19-7-7 7-7"/>
              <path d="M19 12H5"/>
            </svg>
            {inDialog ? t('common:actions.back') : t('details.backToCustomers')}
          </Button>
          <CustomerEditDialog 
            customerId={customerId}
            onSuccess={() => {
              // Refresh customer data after successful edit
              invalidateByPrefix(`/api/customers/${customerId}`);
            }}
          />
          <ReservationAddDialog initialCustomerId={customerId.toString()}>
            <Button>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-calendar-plus mr-2">
                <path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
                <line x1="19" x2="19" y1="16" y2="22" />
                <line x1="16" x2="22" y1="19" y2="19" />
              </svg>
              {t('details.newReservation')}
            </Button>
          </ReservationAddDialog>
        </div>
      </div>
      
      {/* Customer Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">{t('details.totalRentals')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{rentalStats.totalRentals}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">{t('details.activeRentals')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{rentalStats.activeRentals}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">{t('details.completed')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{rentalStats.completedRentals}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">{t('details.totalKmDriven')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{rentalStats.totalKilometersDriven.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-4xl">
          <TabsTrigger value="personal">{t('details.tabPersonalInfo')}</TabsTrigger>
          <TabsTrigger value="drivers">{t('details.tabDrivers')}</TabsTrigger>
          <TabsTrigger value="active">{t('details.tabActiveRentals')}</TabsTrigger>
          <TabsTrigger value="history">{t('details.tabHistory')}</TabsTrigger>
        </TabsList>
        
        {/* Personal Info Tab */}
        <TabsContent value="personal" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('details.customerDetailsTitle')}</CardTitle>
              <CardDescription>{t('details.customerDetailsDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Personal Info Section */}
              <div className="border-b pb-4 mb-4">
                <h3 className="text-lg font-medium mb-3">{t('details.personalInformation')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.fullName')}</h4>
                    <p className="text-base">{customer.name}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.debtorNumber')}</h4>
                    <p className="text-base">{customer.debtorNumber || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.firstName')}</h4>
                    <p className="text-base">{customer.firstName || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.lastName')}</h4>
                    <p className="text-base">{customer.lastName || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.driverName')}</h4>
                    <p className="text-base">{customer.driverName || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.driverLicense')}</h4>
                    <p className="text-base">{customer.driverLicenseNumber || t('details.notProvided')}</p>
                  </div>
                </div>
              </div>

              {/* Contact Info Section */}
              <div className="border-b pb-4 mb-4">
                <h3 className="text-lg font-medium mb-3">{t('details.contactInformation')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.primaryEmail')}</h4>
                    <p className="text-base">{customer.email || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.primaryPhone')}</h4>
                    <p className="text-base">{customer.phone ? formatPhoneNumber(customer.phone) : t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.emailForMot')}</h4>
                    <p className="text-base">{customer.emailForMOT || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.emailForInvoices')}</h4>
                    <p className="text-base">{customer.emailForInvoices || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.generalEmail')}</h4>
                    <p className="text-base">{customer.emailGeneral || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.driverPhone')}</h4>
                    <p className="text-base">{customer.driverPhone ? formatPhoneNumber(customer.driverPhone) : t('details.notProvided')}</p>
                  </div>
                </div>
              </div>

              {/* Address Section */}
              <div className="border-b pb-4 mb-4">
                <h3 className="text-lg font-medium mb-3">{t('details.addressInformation')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.streetName')}</h4>
                    <p className="text-base">{customer.streetName || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('common:fields.address')}</h4>
                    <p className="text-base">{customer.address || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('common:fields.postalCode')}</h4>
                    <p className="text-base">{customer.postalCode || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('common:fields.city')}</h4>
                    <p className="text-base">{customer.city || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('common:fields.country')}</h4>
                    <p className="text-base">{customer.country || "Nederland"}</p>
                  </div>
                </div>
              </div>

              {/* Company Information */}
              <div className="border-b pb-4 mb-4">
                <h3 className="text-lg font-medium mb-3">{t('details.companyInformation')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.companyName')}</h4>
                    <p className="text-base">{customer.companyName || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.contactPerson')}</h4>
                    <p className="text-base">{customer.contactPerson || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.kvkNumber')}</h4>
                    <p className="text-base">{customer.chamberOfCommerceNumber || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.vatNumber')}</h4>
                    <p className="text-base">{customer.vatNumber || t('details.notProvided')}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">RSIN</h4>
                    <p className="text-base">{customer.rsin || t('details.notProvided')}</p>
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              <div className="border-b pb-4 mb-4">
                <h3 className="text-lg font-medium mb-3">{t('details.additionalInformation')}</h3>
                {customer.notes && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">{t('common:fields.notes')}</h4>
                    <p className="text-base">{customer.notes}</p>
                  </div>
                )}
              </div>
              
              {/* Tracking Information */}
              <div className="mt-6 border-t pt-6">
                <h3 className="text-lg font-medium mb-3">{t('details.trackingInformation')}</h3>

                {/* Status tracking section */}
                <div className="border-b pb-4 mb-4">
                  <h4 className="text-md font-medium mb-2">{t('details.statusInformation')}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('common:fields.status')}</h4>
                      <p className="text-base">{customer.status || t('details.notProvided')}</p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.statusDate')}</h4>
                      <p className="text-base">{customer.statusDate ? formatDate(customer.statusDate) : t('details.notProvided')}</p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.statusChangedBy')}</h4>
                      <p className="text-base">{customer.statusBy || t('details.notRecorded')}</p>
                    </div>
                  </div>
                </div>

                {/* Record tracking section */}
                <div>
                  <h4 className="text-md font-medium mb-2">{t('details.recordInformation')}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.createdBy')}</h4>
                      <p className="text-base">{customer.createdBy || t('details.notRecorded')}</p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.createdAt')}</h4>
                      <p className="text-base">{customer.createdAt ? new Date(customer.createdAt).toLocaleString() : t('details.notRecorded')}</p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.lastUpdatedBy')}</h4>
                      <p className="text-base">{customer.updatedBy || t('details.notRecorded')}</p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('details.lastUpdatedAt')}</h4>
                      <p className="text-base">{customer.updatedAt ? new Date(customer.updatedAt).toLocaleString() : t('details.notRecorded')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Blocked Vehicles Section */}
          <Card className="mt-6">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                  </svg>
                  {t('details.blockedVehiclesTitle')}
                </CardTitle>
                <CardDescription>{t('details.blockedVehiclesDescription')}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingBlockedVehicles ? (
                <div className="flex justify-center p-6">
                  <svg className="animate-spin h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : blockedVehicles.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <p>{t('details.noBlockedVehicles')}</p>
                  <p className="text-sm mt-1">{t('details.noBlockedVehiclesHint')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {blockedVehicles.map((entry: any) => (
                    <div key={entry.id} className="flex items-center justify-between p-4 border rounded-lg bg-red-50 dark:bg-red-900/10" data-testid={`blocked-vehicle-entry-${entry.id}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-gray-500" />
                          <span className="font-medium">
                            {entry.vehicle ? `${entry.vehicle.brand} ${entry.vehicle.model}` : t('details.unknownVehicle')}
                          </span>
                          {entry.vehicle?.licensePlate && (
                            <Badge variant="outline" className="ml-2">
                              {formatLicensePlate(entry.vehicle.licensePlate)}
                            </Badge>
                          )}
                        </div>
                        {entry.reason && (
                          <p className="text-sm text-gray-600 mt-1">
                            <span className="font-medium">{t('details.reason')}</span> {entry.reason}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {entry.createdByUsername
                            ? t('details.addedOnBy', {
                                date: entry.createdAt ? formatDate(entry.createdAt) : t('details.unknownDate'),
                                username: entry.createdByUsername,
                              })
                            : t('details.addedOn', {
                                date: entry.createdAt ? formatDate(entry.createdAt) : t('details.unknownDate'),
                              })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary-600"
                        data-testid={`button-view-blocked-vehicle-${entry.id}`}
                        onClick={() => openVehicleDialog(entry.vehicleId)}
                      >
                        {t('details.viewVehicle')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Drivers Tab */}
        <TabsContent value="drivers" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>{t('details.authorizedDriversTitle')}</CardTitle>
                  <CardDescription>{t('details.authorizedDriversDescription')}</CardDescription>
                </div>
                <DriverDialog customerId={customerId} onSuccess={() => refetchDrivers()}>
                  <Button size="sm" data-testid="button-add-driver">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <line x1="19" x2="19" y1="8" y2="14" />
                      <line x1="22" x2="16" y1="11" y2="11" />
                    </svg>
                    {t('driverForm.addDriver')}
                  </Button>
                </DriverDialog>
              </div>
            </CardHeader>
            <CardContent>
              {/* Driver Search Input */}
              {drivers && drivers.length > 0 && (
                <div className="mb-4">
                  <Input
                    placeholder={t('details.searchDriversPlaceholder')}
                    value={driverSearch}
                    onChange={(e) => setDriverSearch(e.target.value)}
                    className="max-w-md"
                    data-testid="input-driver-search"
                  />
                  {driverSearch && (
                    <p className="text-sm text-gray-500 mt-2">
                      {t('details.showingDriversOfTotal', { shown: totalDrivers, count: drivers.length })}
                    </p>
                  )}
                </div>
              )}
              
              {isLoadingDrivers ? (
                <div className="flex justify-center p-6">
                  <svg className="animate-spin h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : drivers?.length === 0 ? (
                <div className="text-center py-8" data-testid="text-no-drivers">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 text-gray-400">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" x2="19" y1="8" y2="14" />
                    <line x1="22" x2="16" y1="11" y2="11" />
                  </svg>
                  <p className="text-gray-500 mb-4">{t('details.noDriversYet')}</p>
                  <p className="text-sm text-gray-400">{t('details.addDriverToStart')}</p>
                </div>
              ) : filteredDrivers.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-2">{t('details.noDriversMatchSearch')}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDriverSearch("")}
                    className="text-primary-600"
                  >
                    {t('details.clearSearch')}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('details.colDriver')}
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('details.colContact')}
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('details.colLicense')}
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('details.colVehicle')}
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('common:fields.status')}
                        </th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('details.colActions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedDrivers?.map((driver) => (
                        <tr key={driver.id} data-testid={`row-driver-${driver.id}`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div>
                                <div className="text-sm font-medium text-gray-900 flex items-center gap-2" data-testid={`text-driver-name-${driver.id}`}>
                                  {driver.displayName}
                                  {driver.isPrimaryDriver && (
                                    <Badge className="bg-blue-100 text-blue-800 border-blue-200">{t('details.primary')}</Badge>
                                  )}
                                </div>
                                {driver.firstName || driver.lastName ? (
                                  <div className="text-xs text-gray-500">
                                    {driver.firstName} {driver.lastName}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {driver.email && <div data-testid={`text-driver-email-${driver.id}`}>{driver.email}</div>}
                              {driver.phone && <div className="text-xs text-gray-500" data-testid={`text-driver-phone-${driver.id}`}>{formatPhoneNumber(driver.phone)}</div>}
                              {!driver.email && !driver.phone && <span className="text-gray-400">—</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {driver.driverLicenseNumber ? (
                                <div>
                                  <div data-testid={`text-driver-license-${driver.id}`}>{driver.driverLicenseNumber}</div>
                                  {driver.licenseExpiry && (
                                    <div className="text-xs text-gray-500">{t('details.expiresAbbrev', { date: formatDate(driver.licenseExpiry) })}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {(() => {
                                const activeReservation = reservations?.find(
                                  (r) =>
                                    r.driverId === driver.id &&
                                    (r.status === 'booked' || r.status === 'picked_up') &&
                                    (!r.endDate || new Date(r.endDate) >= new Date())
                                );
                                return activeReservation?.vehicle ? (
                                  <div>
                                    <div className="font-medium" data-testid={`text-driver-vehicle-${driver.id}`}>
                                      {formatLicensePlate(activeReservation.vehicle.licensePlate)}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {activeReservation.vehicle.brand} {activeReservation.vehicle.model}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge
                              className={driver.status === 'active' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-800 border-gray-200'}
                              data-testid={`badge-driver-status-${driver.id}`}
                            >
                              {t(`common:status.${driver.status}`, { defaultValue: driver.status })}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-primary-600 hover:text-primary-800"
                                onClick={() => {
                                  setSelectedDriver(driver);
                                  setViewDriverDialogOpen(true);
                                }}
                                data-testid={`button-view-driver-${driver.id}`}
                              >
                                {t('common:actions.view')}
                              </Button>
                              <DriverDialog customerId={customerId} driver={driver} onSuccess={() => refetchDrivers()}>
                                <Button variant="ghost" size="sm" className="text-primary-600 hover:text-primary-800" data-testid={`button-edit-driver-${driver.id}`}>
                                  {t('common:actions.edit')}
                                </Button>
                              </DriverDialog>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-red-600 hover:text-red-800"
                                    data-testid={`button-delete-driver-${driver.id}`}
                                  >
                                    {t('common:actions.delete')}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>{t('details.deleteDriverTitle')}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {t('details.deleteDriverConfirm', { name: driver.displayName })}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => {
                                        deleteDriverMutation.mutate(driver.id);
                                      }}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-gray-500">
                        Page {driverPage} of {totalPages} ({totalDrivers} driver{totalDrivers !== 1 ? 's' : ''})
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDriverPage(prev => Math.max(1, prev - 1))}
                          disabled={driverPage === 1}
                          data-testid="button-driver-prev-page"
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDriverPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={driverPage === totalPages}
                          data-testid="button-driver-next-page"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Active Rentals Tab */}
        <TabsContent value="active" className="mt-6">
          <div className="space-y-6">
            {/* Filter Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('details.filterRentalsTitle')}</CardTitle>
                <CardDescription>{t('details.filterRentalsDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date-from">{t('details.dateFrom')}</Label>
                    <Input
                      id="date-from"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      data-testid="input-filter-date-from"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date-to">{t('details.dateTo')}</Label>
                    <Input
                      id="date-to"
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      data-testid="input-filter-date-to"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicle-search">{t('details.vehicleSearch')}</Label>
                    <Input
                      id="vehicle-search"
                      type="text"
                      placeholder={t('details.vehicleSearchPlaceholder')}
                      value={vehicleFilter}
                      onChange={(e) => setVehicleFilter(e.target.value)}
                      data-testid="input-filter-vehicle"
                    />
                  </div>
                </div>
                {(dateFrom || dateTo || vehicleFilter) && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDateFrom("");
                        setDateTo("");
                        setVehicleFilter("");
                      }}
                      data-testid="button-clear-filters"
                    >
                      {t('details.clearFilters')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Summary Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">{t('details.totalRentals')}</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{rentalStats.totalRentals}</div>
                  <p className="text-xs text-muted-foreground mt-1">{t('details.allTimeReservations')}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">{t('details.activeRentals')}</CardTitle>
                  <Car className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{rentalStats.activeRentals}</div>
                  <p className="text-xs text-muted-foreground mt-1">{t('details.currentlyActive')}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">{t('details.completed')}</CardTitle>
                  <Check className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{rentalStats.completedRentals}</div>
                  <p className="text-xs text-muted-foreground mt-1">{t('details.pastRentals')}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">{t('details.totalKmDriven')}</CardTitle>
                  <Car className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{rentalStats.totalKilometersDriven.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground mt-1">{t('details.kilometers')}</p>
                </CardContent>
              </Card>
            </div>

            {/* Active Rentals Table */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>{t('details.activeRentalsTitle')}</CardTitle>
                    <CardDescription>{t('details.activeRentalsDescription')}</CardDescription>
                  </div>
                  <ReservationAddDialog initialCustomerId={customerId.toString()}>
                    <Button size="sm">
                      <Calendar className="mr-2 h-4 w-4" />
                      New Reservation
                    </Button>
                  </ReservationAddDialog>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingReservations ? (
                  <div className="flex justify-center p-6">
                    <svg className="animate-spin h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                ) : (
                  <RentalTable rentals={activeRentals} emptyMessage={t('details.noActiveRentals')} />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Rental History Tab */}
        <TabsContent value="history" className="mt-6">
          <div className="space-y-6">
            {/* Filter Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('details.filterHistoryTitle')}</CardTitle>
                <CardDescription>{t('details.filterHistoryDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date-from-history">{t('details.dateFrom')}</Label>
                    <Input
                      id="date-from-history"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      data-testid="input-filter-date-from"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date-to-history">{t('details.dateTo')}</Label>
                    <Input
                      id="date-to-history"
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      data-testid="input-filter-date-to"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicle-search-history">{t('details.vehicleSearch')}</Label>
                    <Input
                      id="vehicle-search-history"
                      type="text"
                      placeholder={t('details.vehicleSearchPlaceholder')}
                      value={vehicleFilter}
                      onChange={(e) => setVehicleFilter(e.target.value)}
                      data-testid="input-filter-vehicle"
                    />
                  </div>
                </div>
                {(dateFrom || dateTo || vehicleFilter) && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDateFrom("");
                        setDateTo("");
                        setVehicleFilter("");
                      }}
                      data-testid="button-clear-filters"
                    >
                      {t('details.clearFilters')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Summary Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">{t('details.totalRentals')}</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{rentalStats.totalRentals}</div>
                  <p className="text-xs text-muted-foreground mt-1">{t('details.allTimeReservations')}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">{t('details.activeRentals')}</CardTitle>
                  <Car className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{rentalStats.activeRentals}</div>
                  <p className="text-xs text-muted-foreground mt-1">{t('details.currentlyActive')}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">{t('details.completed')}</CardTitle>
                  <Check className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{rentalStats.completedRentals}</div>
                  <p className="text-xs text-muted-foreground mt-1">{t('details.pastRentals')}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">{t('details.totalKmDriven')}</CardTitle>
                  <Car className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{rentalStats.totalKilometersDriven.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground mt-1">{t('details.kilometers')}</p>
                </CardContent>
              </Card>
            </div>

            {/* Rental History Table */}
            <Card>
              <CardHeader>
                <CardTitle>{t('details.rentalHistoryTitle')}</CardTitle>
                <CardDescription>{t('details.rentalHistoryDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingReservations ? (
                  <div className="flex justify-center p-6">
                    <svg className="animate-spin h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                ) : (
                  <RentalTable rentals={pastRentals} emptyMessage={t('details.noRentalHistory')} />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Driver View Dialog */}
      <DriverViewDialog
        driver={selectedDriver}
        activeReservation={selectedDriverActiveReservation}
        open={viewDriverDialogOpen}
        onOpenChange={setViewDriverDialogOpen}
      />
          </div>
  );
}

// Helper components
function StatusBadge({ status }: { status: string }) {
  switch (status.toLowerCase()) {
    case "booked":
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200">{formatReservationStatus(status)}</Badge>;
    case "picked_up":
      return <Badge className="bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200">{formatReservationStatus(status)}</Badge>;
    case "returned":
      return <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200">{formatReservationStatus(status)}</Badge>;
    case "completed":
      return <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-200">{formatReservationStatus(status)}</Badge>;
    case "cancelled":
      return <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-200">{formatReservationStatus(status)}</Badge>;
    default:
      return <Badge variant="outline">{formatReservationStatus(status)}</Badge>;
  }
}
