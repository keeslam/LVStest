import { useState, ReactNode, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { SidebarNav } from "@/components/sidebar-nav";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/hooks/use-auth";
import { ScrollToTop } from "@/components/scroll-to-top";
import { NotificationCenter } from "@/components/ui/notification-center";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Car, User, Calendar, X, ClipboardCheck } from "lucide-react";
import { formatLicensePlate } from "@/lib/format-utils";
import { invalidateRelatedQueries } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VehicleViewDialog } from "@/components/vehicles/vehicle-view-dialog";
import { CustomerDetails } from "@/components/customers/customer-details";
import { ReservationViewDialog } from "@/components/reservations/reservation-view-dialog";
import { ReservationEditDialog } from "@/components/reservations/reservation-edit-dialog";
import { DialogDescription } from "@/components/ui/dialog";

interface MainLayoutProps {
  children: ReactNode;
}

// Define interfaces for search results
interface SearchResultVehicle {
  id: number;
  licensePlate: string;
  brand: string;
  model: string;
}

interface SearchResultCustomer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
}

interface SearchResultReservation {
  id: number;
  vehicleId: number;
  customerId: number;
  startDate: string;
  endDate: string;
  status: string;
  type?: string;
  maintenanceCategory?: string;
  vehicle?: {
    licensePlate: string;
    brand: string;
    model: string;
  };
  customer?: {
    name: string;
  };
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [showAllResultsDialog, setShowAllResultsDialog] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // Dialog states for viewing details
  const [viewVehicleId, setViewVehicleId] = useState<number | null>(null);
  const [viewVehicleDialogOpen, setViewVehicleDialogOpen] = useState(false);
  const [viewCustomerId, setViewCustomerId] = useState<number | null>(null);
  const [viewCustomerDialogOpen, setViewCustomerDialogOpen] = useState(false);
  const [viewReservationId, setViewReservationId] = useState<number | null>(null);
  const [viewReservationDialogOpen, setViewReservationDialogOpen] = useState(false);
  const [editReservationId, setEditReservationId] = useState<number | null>(null);
  const [editReservationDialogOpen, setEditReservationDialogOpen] = useState(false);
  
  const title = getPageTitle(location);
  
  // Query for vehicles based on search
  const { data: vehicleResults = [], isLoading: vehiclesLoading } = useQuery({
    queryKey: ["/api/vehicles", "search", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      console.log("Searching vehicles for:", searchQuery);
      const response = await fetch(`/api/vehicles?search=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) throw new Error("Failed to search vehicles");
      const data = await response.json();
      console.log("Vehicle search results:", data);
      return data;
    },
    enabled: searchQuery.length >= 2
  });

  // Query for customers based on search
  const { data: customerResults = [], isLoading: customersLoading } = useQuery({
    queryKey: ["/api/customers", "search", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      const response = await fetch(`/api/customers?search=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) throw new Error("Failed to search customers");
      return response.json();
    },
    enabled: searchQuery.length >= 2
  });

  // Query for reservations based on search
  const { data: reservationResults = [], isLoading: reservationsLoading } = useQuery({
    queryKey: ["/api/reservations", "search", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      const response = await fetch(`/api/reservations?search=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) throw new Error("Failed to search reservations");
      return response.json();
    },
    enabled: searchQuery.length >= 2
  });
  
  // Import the utility function from format-utils.ts instead of defining it here
  // This ensures consistency across the application
  
  // Handle click away from search results
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [searchRef]);
  
  // Helper functions to open detail dialogs
  const openVehicleDialog = (vehicleId: number) => {
    setViewVehicleId(vehicleId);
    setViewVehicleDialogOpen(true);
    setShowResults(false);
    setShowAllResultsDialog(false);
  };

  const openCustomerDialog = (customerId: number) => {
    setViewCustomerId(customerId);
    setViewCustomerDialogOpen(true);
    setShowResults(false);
    setShowAllResultsDialog(false);
  };

  const openReservationDialog = (reservationId: number) => {
    console.log('MainLayout openReservationDialog called with:', reservationId);
    setViewReservationId(reservationId);
    setViewReservationDialogOpen(true);
    setShowResults(false);
    setShowAllResultsDialog(false);
  };

  const handleEditReservation = (reservationId: number) => {
    console.log('handleEditReservation called with:', reservationId);
    setEditReservationId(reservationId);
    setEditReservationDialogOpen(true);
    setViewReservationDialogOpen(false);
  };
  
  // If we're at the auth page or not logged in, render without layout
  const isAuthPage = location === "/auth";
  
  if (isAuthPage || !user) {
    return <>{children}</>;
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ScrollToTop component to handle scrolling on route changes */}
      <ScrollToTop />
      
      {/* Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 w-64 bg-white shadow-md z-30 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-primary-600">Auto Lease LAM</h1>
            <button 
              className="md:hidden text-gray-500"
              onClick={() => setSidebarOpen(false)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x">
                <path d="M18 6 6 18"/>
                <path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
        </div>
        
        <SidebarNav />
      </aside>

      {/* Header */}
      <header className="bg-white shadow-sm md:ml-64">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center">
            <button 
              className="md:hidden text-gray-500 mr-4"
              onClick={() => setSidebarOpen(true)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-menu">
                <line x1="4" x2="20" y1="12" y2="12"/>
                <line x1="4" x2="20" y1="6" y2="6"/>
                <line x1="4" x2="20" y1="18" y2="18"/>
              </svg>
            </button>
            <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative" ref={searchRef}>
              <form onSubmit={(e) => {
                e.preventDefault();
                if (searchQuery.trim().length >= 2) {
                  setShowResults(false);
                  // If it looks like a license plate, try to standardize it for better search results
                  const searchTerm = searchQuery.includes('-') || /^[A-Za-z0-9]{6,8}$/.test(searchQuery.trim()) 
                    ? formatLicensePlate(searchQuery) 
                    : searchQuery.trim();
                  // Use only navigate with replace to avoid adding to browser history
                  navigate(`/search-results?q=${encodeURIComponent(searchTerm)}`, { replace: true });
                }
              }}>
                <input 
                  type="text" 
                  placeholder="Search..."
                  autoComplete="off"
                  className="w-full py-2 pl-10 pr-4 text-gray-700 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={searchQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchQuery(value);
                    if (value.length >= 2) {
                      setShowResults(true);
                    } else {
                      setShowResults(false);
                    }
                  }}
                  onFocus={() => {
                    if (searchQuery.length >= 2) {
                      setShowResults(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchQuery.trim().length >= 2) {
                      e.preventDefault();
                      setShowResults(false);
                      // If it looks like a license plate, try to standardize it for better search results
                      const searchTerm = searchQuery.includes('-') || /^[A-Za-z0-9]{6,8}$/.test(searchQuery.trim()) 
                        ? formatLicensePlate(searchQuery) 
                        : searchQuery.trim();
                      // Use only navigate with replace to avoid adding to browser history
                      navigate(`/search-results?q=${encodeURIComponent(searchTerm)}`, { replace: true });
                    }
                  }}
                />
              </form>
              {searchQuery ? (
                <button 
                  className="absolute right-3 top-2.5 text-gray-500"
                  onClick={() => {
                    setSearchQuery("");
                    setShowResults(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-search absolute left-3 top-2.5 text-gray-500">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.3-4.3"/>
                </svg>
              )}
              
              {/* Search Results Dropdown */}
              {showResults && searchQuery.length >= 2 && (
                <div className="absolute z-50 mt-2 w-96 bg-white rounded-md shadow-lg overflow-hidden">
                  <div className="max-h-[70vh] overflow-y-auto">
                    {/* Loading indicator */}
                    {(vehiclesLoading || customersLoading || reservationsLoading) && (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
                        <span>Searching...</span>
                      </div>
                    )}
                    
                    {/* No results */}
                    {!vehiclesLoading && !customersLoading && !reservationsLoading && 
                     (!vehicleResults?.length && !customerResults?.length && !reservationResults?.length) && (
                      <div className="p-4 text-center text-gray-500">
                        No results found for "{searchQuery}"
                      </div>
                    )}
                    
                    {/* View all results link */}
                    {!vehiclesLoading && !customersLoading && !reservationsLoading && 
                     (vehicleResults?.length > 0 || customerResults?.length > 0 || reservationResults?.length > 0) && (
                      <div className="p-2 border-t border-gray-100 text-center">
                        <button 
                          className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                          onClick={() => {
                            setShowResults(false);
                            setShowAllResultsDialog(true);
                          }}
                          data-testid="button-view-all-results"
                        >
                          View all results
                        </button>
                      </div>
                    )}
                    
                    {/* Vehicle Results */}
                    {vehicleResults?.length > 0 && (
                      <div className="border-b border-gray-100 p-2">
                        <div className="px-2 py-1 text-xs font-semibold bg-gray-50 text-gray-500 rounded-sm mb-1">
                          Vehicles
                        </div>
                        <ul className="divide-y divide-gray-100">
                          {vehicleResults.map((vehicle: SearchResultVehicle) => (
                            <li key={`vehicle-${vehicle.id}`} className="hover:bg-gray-50 rounded">
                              <button 
                                className="flex items-center p-2 w-full text-left"
                                onClick={() => openVehicleDialog(vehicle.id)}
                              >
                                <Car className="h-4 w-4 text-primary-500 mr-2" />
                                <div>
                                  <div className="font-medium">{vehicle.brand} {vehicle.model}</div>
                                  <div className="text-xs text-gray-500">{formatLicensePlate(vehicle.licensePlate)}</div>
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Customer Results */}
                    {customerResults?.length > 0 && (
                      <div className="border-b border-gray-100 p-2">
                        <div className="px-2 py-1 text-xs font-semibold bg-gray-50 text-gray-500 rounded-sm mb-1">
                          Customers
                        </div>
                        <ul className="divide-y divide-gray-100">
                          {customerResults.map((customer: SearchResultCustomer) => (
                            <li key={`customer-${customer.id}`} className="hover:bg-gray-50 rounded">
                              <button 
                                className="flex items-center p-2 w-full text-left"
                                onClick={() => openCustomerDialog(customer.id)}
                              >
                                <User className="h-4 w-4 text-primary-500 mr-2" />
                                <div>
                                  <div className="font-medium">{customer.name}</div>
                                  <div className="text-xs text-gray-500">
                                    {customer.email || customer.phone || "No contact info"}
                                  </div>
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Reservation Results */}
                    {reservationResults?.length > 0 && (
                      <div className="p-2">
                        <div className="px-2 py-1 text-xs font-semibold bg-gray-50 text-gray-500 rounded-sm mb-1">
                          Reservations
                        </div>
                        <ul className="divide-y divide-gray-100">
                          {reservationResults.map((reservation: SearchResultReservation) => {
                            const isMaintenance = reservation.type === 'maintenance_block';
                            return (
                              <li key={`reservation-${reservation.id}`} className="hover:bg-gray-50 rounded">
                                <button 
                                  className="flex items-center p-2 w-full text-left"
                                  onClick={() => openReservationDialog(reservation.id)}
                                >
                                  {isMaintenance ? (
                                    <ClipboardCheck className="h-4 w-4 text-purple-500 mr-2" />
                                  ) : (
                                    <Calendar className="h-4 w-4 text-primary-500 mr-2" />
                                  )}
                                  <div className="flex-1">
                                    <div className="font-medium flex items-center gap-2">
                                      <span>
                                        {reservation.vehicle?.brand} {reservation.vehicle?.model} 
                                        {reservation.vehicle?.licensePlate && ` (${formatLicensePlate(reservation.vehicle.licensePlate)})`}
                                      </span>
                                      {isMaintenance && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                          Maintenance
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {isMaintenance ? (
                                        <>{reservation.maintenanceCategory || "Maintenance"} • {reservation.startDate}</>
                                      ) : (
                                        <>{reservation.customer?.name || "Unknown Customer"} • {reservation.startDate} to {reservation.endDate}</>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <NotificationCenter />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="md:ml-64 pt-4 px-4 pb-12">
        {children}
      </main>

      {/* All Results Dialog */}
      <Dialog open={showAllResultsDialog} onOpenChange={setShowAllResultsDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Search Results for "{searchQuery}"</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[calc(85vh-8rem)] pr-4">
            {/* Vehicle Results */}
            {vehicleResults?.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  Vehicles ({vehicleResults.length})
                </h3>
                <div className="space-y-2">
                  {vehicleResults.map((vehicle: SearchResultVehicle) => (
                    <button
                      key={`dialog-vehicle-${vehicle.id}`}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors text-left"
                      onClick={() => openVehicleDialog(vehicle.id)}
                      data-testid={`vehicle-result-${vehicle.id}`}
                    >
                      <Car className="h-5 w-5 text-primary-500 flex-shrink-0" />
                      <div>
                        <div className="font-medium">{vehicle.brand} {vehicle.model}</div>
                        <div className="text-sm text-gray-500">{formatLicensePlate(vehicle.licensePlate)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Customer Results */}
            {customerResults?.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Customers ({customerResults.length})
                </h3>
                <div className="space-y-2">
                  {customerResults.map((customer: SearchResultCustomer) => (
                    <button
                      key={`dialog-customer-${customer.id}`}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors text-left"
                      onClick={() => openCustomerDialog(customer.id)}
                      data-testid={`customer-result-${customer.id}`}
                    >
                      <User className="h-5 w-5 text-primary-500 flex-shrink-0" />
                      <div>
                        <div className="font-medium">{customer.name}</div>
                        <div className="text-sm text-gray-500">
                          {customer.email || customer.phone || "No contact info"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reservation Results */}
            {reservationResults?.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Reservations ({reservationResults.length})
                </h3>
                <div className="space-y-2">
                  {reservationResults.map((reservation: SearchResultReservation) => {
                    const isMaintenance = reservation.type === 'maintenance_block';
                    return (
                      <button
                        key={`dialog-reservation-${reservation.id}`}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors text-left"
                        onClick={() => openReservationDialog(reservation.id)}
                        data-testid={`reservation-result-${reservation.id}`}
                      >
                        {isMaintenance ? (
                          <ClipboardCheck className="h-5 w-5 text-purple-500 flex-shrink-0" />
                        ) : (
                          <Calendar className="h-5 w-5 text-primary-500 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <div className="font-medium flex items-center gap-2 flex-wrap">
                            <span>
                              {reservation.vehicle?.brand} {reservation.vehicle?.model}
                              {reservation.vehicle?.licensePlate && ` (${formatLicensePlate(reservation.vehicle.licensePlate)})`}
                            </span>
                            {isMaintenance && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                Maintenance
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            {isMaintenance ? (
                              <>{reservation.maintenanceCategory || "Maintenance"} • {reservation.startDate}</>
                            ) : (
                              <>{reservation.customer?.name || "Unknown Customer"} • {reservation.startDate} to {reservation.endDate}</>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No Results */}
            {vehicleResults?.length === 0 && customerResults?.length === 0 && reservationResults?.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No results found for "{searchQuery}"
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* View Detail Dialogs */}
      <VehicleViewDialog
        open={viewVehicleDialogOpen}
        onOpenChange={setViewVehicleDialogOpen}
        vehicleId={viewVehicleId}
      />
      
      <Dialog open={viewCustomerDialogOpen} onOpenChange={setViewCustomerDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
            <DialogDescription>
              View customer information and reservation history
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {viewCustomerId && (
              <CustomerDetails 
                customerId={viewCustomerId} 
                inDialog={true}
                onClose={() => setViewCustomerDialogOpen(false)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      <ReservationViewDialog
        open={viewReservationDialogOpen}
        onOpenChange={(open) => {
          console.log('MainLayout ReservationViewDialog onOpenChange:', open);
          setViewReservationDialogOpen(open);
        }}
        reservationId={viewReservationId}
        onEdit={(id) => {
          console.log('MainLayout onEdit called from ReservationViewDialog with:', id);
          handleEditReservation(id);
        }}
      />
      
      <ReservationEditDialog
        open={editReservationDialogOpen}
        onOpenChange={setEditReservationDialogOpen}
        reservationId={editReservationId}
        onSuccess={() => {
          setEditReservationDialogOpen(false);
          invalidateRelatedQueries('reservations');
        }}
      />
    </div>
  );
}

function getPageTitle(location: string): string {
  if (location === "/") return "Dashboard";
  if (location.startsWith("/vehicles")) return "Vehicles";
  if (location.startsWith("/customers")) return "Customers";
  if (location.startsWith("/reservations")) return "Reservations";
  if (location.startsWith("/maintenance")) return "Maintenance";
  if (location.startsWith("/expenses")) return "Expenses";
  if (location.startsWith("/documents")) return "Documents";
  if (location.startsWith("/reports")) return "Reports";
  if (location.startsWith("/search-results")) return "Search Results";
  if (location.startsWith("/notifications")) return "Notifications";
  return "Auto Lease LAM";
}
