import { FC, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, Car, User, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatLicensePlate } from '@/lib/format-utils';
import { displayLicensePlate } from '@/lib/utils';
import { Vehicle } from '@shared/schema';
import type { Customer } from '@shared/schema';
import type { Reservation } from '@shared/schema';

const SearchResults: FC = () => {
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
        title: 'Error',
        description: 'Failed to fetch search results',
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
        <h1 className="text-3xl font-bold">Search Results</h1>
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              className="pl-8 h-9 w-[250px] md:w-[300px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button type="submit">Search</Button>
        </form>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Searching...</span>
        </div>
      ) : !query ? (
        <div className="text-center py-12">
          <Search className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">Enter a search term to begin</h2>
          <p className="mt-2 text-muted-foreground">
            Search for vehicles, customers, or reservations by typing in the search box above
          </p>
        </div>
      ) : !hasResults ? (
        <div className="text-center py-12">
          <Search className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">No results found</h2>
          <p className="mt-2 text-muted-foreground">
            Try adjusting your search term or search for something else
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <p className="text-muted-foreground">
              Found {resultsCount} result{resultsCount !== 1 ? 's' : ''} for "{query}"
            </p>
          </div>

          <Tabs defaultValue="all" className="w-full" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="all">
                All Results{' '}
                <Badge variant="secondary" className="ml-2">
                  {resultsCount}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="vehicles">
                Vehicles{' '}
                <Badge variant="secondary" className="ml-2">
                  {vehicles.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="customers">
                Customers{' '}
                <Badge variant="secondary" className="ml-2">
                  {customers.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="reservations">
                Reservations{' '}
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
                    <h2 className="text-xl font-semibold">Vehicles</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {vehicles.slice(0, 3).map((vehicle) => (
                      <Card key={vehicle.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => handleVehicleClick(vehicle)}>
                        <CardHeader className="pb-2">
                          <CardTitle className="flex justify-between items-center">
                            <span className="font-mono">{displayLicensePlate(vehicle.licensePlate)}</span>
                            <Badge>{vehicle.vehicleType || 'Unknown'}</Badge>
                          </CardTitle>
                          <CardDescription>
                            {vehicle.brand} {vehicle.model}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">APK Date:</span>{' '}
                              {vehicle.apkDate ? formatDate(vehicle.apkDate) : 'N/A'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Status:</span>{' '}
                              {vehicle.registeredTo === 'true' ? 'Registered' : 'Not Registered'}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  {vehicles.length > 3 && (
                    <Button variant="outline" className="mt-4" onClick={() => setActiveTab('vehicles')}>
                      View all {vehicles.length} vehicles
                    </Button>
                  )}
                </section>
              )}

              {/* Customers section */}
              {customers.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <User className="h-5 w-5" />
                    <h2 className="text-xl font-semibold">Customers</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {customers.slice(0, 3).map((customer) => (
                      <Card key={customer.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => handleCustomerClick(customer)}>
                        <CardHeader className="pb-2">
                          <CardTitle>{customer.name}</CardTitle>
                          <CardDescription>
                            {customer.email || 'No email'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Phone:</span>{' '}
                              {customer.phone || 'N/A'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Debtor #:</span>{' '}
                              {customer.debtorNumber || 'N/A'}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  {customers.length > 3 && (
                    <Button variant="outline" className="mt-4" onClick={() => setActiveTab('customers')}>
                      View all {customers.length} customers
                    </Button>
                  )}
                </section>
              )}

              {/* Reservations section */}
              {reservations.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5" />
                    <h2 className="text-xl font-semibold">Reservations</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {reservations.slice(0, 3).map((reservation) => (
                      <Card key={reservation.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => handleReservationClick(reservation)}>
                        <CardHeader className="pb-2">
                          <CardTitle className="flex justify-between items-center">
                            <span>
                              {reservation.vehicle?.licensePlate ? displayLicensePlate(reservation.vehicle.licensePlate) : 'Unknown vehicle'}
                            </span>
                            <Badge variant={reservation.status === 'booked' ? 'default' : reservation.status === 'cancelled' ? 'destructive' : 'secondary'}>
                              {reservation.status}
                            </Badge>
                          </CardTitle>
                          <CardDescription>
                            {reservation.customer?.name || 'Unknown customer'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">From:</span>{' '}
                              {formatDate(reservation.startDate)}
                            </div>
                            <div>
                              <span className="text-muted-foreground">To:</span>{' '}
                              {reservation.endDate ? formatDate(reservation.endDate) : 'Open-ended'}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  {reservations.length > 3 && (
                    <Button variant="outline" className="mt-4" onClick={() => setActiveTab('reservations')}>
                      View all {reservations.length} reservations
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
                        <Badge>{vehicle.vehicleType || 'Unknown'}</Badge>
                      </CardTitle>
                      <CardDescription>
                        {vehicle.brand} {vehicle.model}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">APK Date:</span>{' '}
                          {vehicle.apkDate ? formatDate(vehicle.apkDate) : 'N/A'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Status:</span>{' '}
                          {vehicle.registeredTo === 'true' ? 'Registered' : 'Not Registered'}
                        </div>
                        {vehicle.departureMileage && (
                          <div>
                            <span className="text-muted-foreground">Mileage:</span>{' '}
                            {vehicle.departureMileage} km
                          </div>
                        )}
                        {vehicle.fuel && (
                          <div>
                            <span className="text-muted-foreground">Fuel:</span>{' '}
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
                        {customer.email || 'No email'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Phone:</span>{' '}
                          {customer.phone || 'N/A'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Debtor #:</span>{' '}
                          {customer.debtorNumber || 'N/A'}
                        </div>
                        {customer.status && (
                          <div>
                            <span className="text-muted-foreground">Status:</span>{' '}
                            {customer.status}
                          </div>
                        )}
                        {customer.kvk && (
                          <div>
                            <span className="text-muted-foreground">KVK:</span>{' '}
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
                          {reservation.vehicle?.licensePlate ? displayLicensePlate(reservation.vehicle.licensePlate) : 'Unknown vehicle'}
                        </span>
                        <Badge variant={reservation.status === 'booked' ? 'default' : reservation.status === 'cancelled' ? 'destructive' : 'secondary'}>
                          {reservation.status}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        {reservation.customer?.name || 'Unknown customer'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">From:</span>{' '}
                          {formatDate(reservation.startDate)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">To:</span>{' '}
                          {reservation.endDate ? formatDate(reservation.endDate) : 'Open-ended'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Vehicle:</span>{' '}
                          {reservation.vehicle ? `${reservation.vehicle.brand} ${reservation.vehicle.model}` : 'N/A'}
                        </div>
                        {reservation.totalPrice && (
                          <div>
                            <span className="text-muted-foreground">Price:</span>{' '}
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