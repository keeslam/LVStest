import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, Car, User, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatLicensePlate, formatReservationStatus } from '@/lib/format-utils';
import { displayLicensePlate } from '@/lib/utils';
import { Vehicle } from '@shared/schema';
import type { Customer } from '@shared/schema';
import type { Reservation } from '@shared/schema';

const SearchResults: FC = () => {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('all');

  // Get the current URL search parameters
  const [location] = useLocation();
  
  // Parse query parameter from URL if available and refresh when URL changes
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const urlQuery = searchParams.get('q') || '';
    if (urlQuery) {
      setQuery(urlQuery);
    }
  }, [location]); // Re-run effect when URL location changes

  // Fetch vehicles matching the search query
  const {
    data: vehicles = [],
    isLoading: vehiclesLoading,
    error: vehiclesError,
  } = useQuery({
    queryKey: ['/api/vehicles', query],
    queryFn: async () => {
      if (!query) return [];
      const response = await fetch(`/api/vehicles?search=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Failed to fetch vehicles');
      return response.json();
    },
    enabled: !!query,
  });

  // Fetch customers matching the search query
  const {
    data: customers = [],
    isLoading: customersLoading,
    error: customersError,
  } = useQuery({
    queryKey: ['/api/customers', query],
    queryFn: async () => {
      if (!query) return [];
      const response = await fetch(`/api/customers?search=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Failed to fetch customers');
      return response.json();
    },
    enabled: !!query,
  });

  // Fetch reservations matching the search query
  const {
    data: reservations = [],
    isLoading: reservationsLoading,
    error: reservationsError,
  } = useQuery({
    queryKey: ['/api/reservations', query],
    queryFn: async () => {
      if (!query) return [];
      const response = await fetch(`/api/reservations?search=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Failed to fetch reservations');
      return response.json();
    },
    enabled: !!query,
  });

  // Display error if any of the queries fail
  useEffect(() => {
    if (vehiclesError || customersError || reservationsError) {
      toast({
        title: t('searchPage.toasts.errorTitle'),
        description: t('searchPage.toasts.searchFailedDescription'),
        variant: 'destructive',
      });
    }
  }, [vehiclesError, customersError, reservationsError, toast]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Update URL to include the search query using navigate
    if (query) {
      // If it looks like a license plate, try to standardize it for better search results
      const searchTerm = query.includes('-') || /^[A-Za-z0-9]{6,8}$/.test(query.trim()) 
        ? formatLicensePlate(query) 
        : query;
      setLocation(`/search-results?q=${encodeURIComponent(searchTerm)}`, { replace: true });
    }
  };

  const isLoading = vehiclesLoading || customersLoading || reservationsLoading;
  const hasResults = vehicles.length > 0 || customers.length > 0 || reservations.length > 0;
  const resultsCount = vehicles.length + customers.length + reservations.length;

  const handleVehicleClick = (vehicle: Vehicle) => {
    setLocation(`/vehicles/${vehicle.id}`);
  };

  const handleCustomerClick = (customer: Customer) => {
    setLocation(`/customers/${customer.id}`);
  };

  const handleReservationClick = (reservation: Reservation) => {
    setLocation(`/reservations/${reservation.id}`);
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">{t('searchPage.pageTitle')}</h1>
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('searchPage.searchPlaceholder')}
              className="pl-8 h-9 w-[250px] md:w-[300px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button type="submit">{t('searchPage.searchButton')}</Button>
        </form>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">{t('searchPage.searchingLabel')}</span>
        </div>
      ) : !query ? (
        <div className="text-center py-12">
          <Search className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">{t('searchPage.startSearchTitle')}</h2>
          <p className="mt-2 text-muted-foreground">
            {t('searchPage.startSearchDescription')}
          </p>
        </div>
      ) : !hasResults ? (
        <div className="text-center py-12">
          <Search className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">{t('searchPage.noResultsTitle')}</h2>
          <p className="mt-2 text-muted-foreground">
            {t('searchPage.noResultsDescription')}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <p className="text-muted-foreground">
              {t('searchPage.resultsCount', { count: resultsCount, query })}
            </p>
          </div>

          <Tabs defaultValue="all" className="w-full" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="all">
                {t('searchPage.allResultsTab')}{' '}
                <Badge variant="secondary" className="ml-2">
                  {resultsCount}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="vehicles">
                {t('searchPage.vehiclesTab')}{' '}
                <Badge variant="secondary" className="ml-2">
                  {vehicles.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="customers">
                {t('searchPage.customersTab')}{' '}
                <Badge variant="secondary" className="ml-2">
                  {customers.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="reservations">
                {t('searchPage.reservationsTab')}{' '}
                <Badge variant="secondary" className="ml-2">
                  {reservations.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-8">
              {/* Vehicles section */}
              {vehicles.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Car className="h-5 w-5" />
                    <h2 className="text-xl font-semibold">{t('searchPage.vehiclesHeading')}</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {vehicles.slice(0, 3).map((vehicle) => (
                      <Card key={vehicle.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => handleVehicleClick(vehicle)}>
                        <CardHeader className="pb-2">
                          <CardTitle className="flex justify-between items-center">
                            <span className="font-mono">{displayLicensePlate(vehicle.licensePlate)}</span>
                            <Badge>{vehicle.vehicleType || t('searchPage.unknownVehicleType')}</Badge>
                          </CardTitle>
                          <CardDescription>
                            {vehicle.brand} {vehicle.model}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">{t('searchPage.apkDateLabel')}</span>{' '}
                              {vehicle.apkDate ? formatDate(vehicle.apkDate) : t('searchPage.notAvailable')}
                            </div>
                            <div>
                              <span className="text-muted-foreground">{t('searchPage.statusLabel')}</span>{' '}
                              {vehicle.registeredTo === 'true' ? t('searchPage.registeredStatus') : t('searchPage.notRegisteredStatus')}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  {vehicles.length > 3 && (
                    <Button variant="outline" className="mt-4" onClick={() => setActiveTab('vehicles')}>
                      {t('searchPage.viewAllVehiclesButton', { count: vehicles.length })}
                    </Button>
                  )}
                </section>
              )}

              {/* Customers section */}
              {customers.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <User className="h-5 w-5" />
                    <h2 className="text-xl font-semibold">{t('searchPage.customersHeading')}</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {customers.slice(0, 3).map((customer) => (
                      <Card key={customer.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => handleCustomerClick(customer)}>
                        <CardHeader className="pb-2">
                          <CardTitle>{customer.name}</CardTitle>
                          <CardDescription>
                            {customer.email || t('searchPage.noEmail')}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">{t('searchPage.phoneLabel')}</span>{' '}
                              {customer.phone || t('searchPage.notAvailable')}
                            </div>
                            <div>
                              <span className="text-muted-foreground">{t('searchPage.debtorNumberLabel')}</span>{' '}
                              {customer.debtorNumber || t('searchPage.notAvailable')}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  {customers.length > 3 && (
                    <Button variant="outline" className="mt-4" onClick={() => setActiveTab('customers')}>
                      {t('searchPage.viewAllCustomersButton', { count: customers.length })}
                    </Button>
                  )}
                </section>
              )}

              {/* Reservations section */}
              {reservations.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5" />
                    <h2 className="text-xl font-semibold">{t('searchPage.reservationsHeading')}</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {reservations.slice(0, 3).map((reservation) => (
                      <Card key={reservation.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => handleReservationClick(reservation)}>
                        <CardHeader className="pb-2">
                          <CardTitle className="flex justify-between items-center">
                            <span>
                              {reservation.vehicle?.licensePlate ? displayLicensePlate(reservation.vehicle.licensePlate) : t('searchPage.unknownVehicle')}
                            </span>
                            <Badge variant={reservation.status === 'booked' ? 'default' : reservation.status === 'cancelled' ? 'destructive' : 'secondary'}>
                              {formatReservationStatus(reservation.status)}
                            </Badge>
                          </CardTitle>
                          <CardDescription>
                            {reservation.customer?.name || t('searchPage.unknownCustomer')}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">{t('searchPage.fromLabel')}</span>{' '}
                              {formatDate(reservation.startDate)}
                            </div>
                            <div>
                              <span className="text-muted-foreground">{t('searchPage.toLabel')}</span>{' '}
                              {reservation.endDate ? formatDate(reservation.endDate) : t('searchPage.openEnded')}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  {reservations.length > 3 && (
                    <Button variant="outline" className="mt-4" onClick={() => setActiveTab('reservations')}>
                      {t('searchPage.viewAllReservationsButton', { count: reservations.length })}
                    </Button>
                  )}
                </section>
              )}
            </TabsContent>

            <TabsContent value="vehicles">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vehicles.map((vehicle) => (
                  <Card key={vehicle.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => handleVehicleClick(vehicle)}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex justify-between items-center">
                        <span className="font-mono">{displayLicensePlate(vehicle.licensePlate)}</span>
                        <Badge>{vehicle.vehicleType || t('searchPage.unknownVehicleType')}</Badge>
                      </CardTitle>
                      <CardDescription>
                        {vehicle.brand} {vehicle.model}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">{t('searchPage.apkDateLabel')}</span>{' '}
                          {vehicle.apkDate ? formatDate(vehicle.apkDate) : t('searchPage.notAvailable')}
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('searchPage.statusLabel')}</span>{' '}
                          {vehicle.registeredTo === 'true' ? t('searchPage.registeredStatus') : t('searchPage.notRegisteredStatus')}
                        </div>
                        {vehicle.departureMileage && (
                          <div>
                            <span className="text-muted-foreground">{t('searchPage.mileageLabel')}</span>{' '}
                            {vehicle.departureMileage} km
                          </div>
                        )}
                        {vehicle.fuel && (
                          <div>
                            <span className="text-muted-foreground">{t('searchPage.fuelLabel')}</span>{' '}
                            {vehicle.fuel}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="customers">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {customers.map((customer) => (
                  <Card key={customer.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => handleCustomerClick(customer)}>
                    <CardHeader className="pb-2">
                      <CardTitle>{customer.name}</CardTitle>
                      <CardDescription>
                        {customer.email || t('searchPage.noEmail')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">{t('searchPage.phoneLabel')}</span>{' '}
                          {customer.phone || t('searchPage.notAvailable')}
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('searchPage.debtorNumberLabel')}</span>{' '}
                          {customer.debtorNumber || t('searchPage.notAvailable')}
                        </div>
                        {customer.status && (
                          <div>
                            <span className="text-muted-foreground">{t('searchPage.statusLabel')}</span>{' '}
                            {customer.status}
                          </div>
                        )}
                        {customer.kvk && (
                          <div>
                            <span className="text-muted-foreground">{t('searchPage.kvkLabel')}</span>{' '}
                            {customer.kvk}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="reservations">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reservations.map((reservation) => (
                  <Card key={reservation.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => handleReservationClick(reservation)}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex justify-between items-center">
                        <span>
                          {reservation.vehicle?.licensePlate ? displayLicensePlate(reservation.vehicle.licensePlate) : t('searchPage.unknownVehicle')}
                        </span>
                        <Badge variant={reservation.status === 'booked' ? 'default' : reservation.status === 'cancelled' ? 'destructive' : 'secondary'}>
                          {formatReservationStatus(reservation.status)}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        {reservation.customer?.name || t('searchPage.unknownCustomer')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">{t('searchPage.fromLabel')}</span>{' '}
                          {formatDate(reservation.startDate)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('searchPage.toLabel')}</span>{' '}
                          {reservation.endDate ? formatDate(reservation.endDate) : t('searchPage.openEnded')}
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('searchPage.vehicleLabel')}</span>{' '}
                          {reservation.vehicle ? `${reservation.vehicle.brand} ${reservation.vehicle.model}` : t('searchPage.notAvailable')}
                        </div>
                        {reservation.totalPrice && (
                          <div>
                            <span className="text-muted-foreground">{t('searchPage.priceLabel')}</span>{' '}
                            €{reservation.totalPrice}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};

export default SearchResults;