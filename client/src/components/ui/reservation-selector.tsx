import * as React from "react";
import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search, Calendar, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatLicensePlate } from "@/lib/format-utils";
import { Reservation } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { format, parseISO } from "date-fns";

interface ReservationSelectorProps {
  reservations: Reservation[];
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  allowNone?: boolean;
}

export function ReservationSelector({
  reservations,
  value,
  onChange,
  placeholder = "Select a reservation...",
  disabled = false,
  className,
  allowNone = true,
}: ReservationSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");

  const filteredReservations = useMemo(() => {
    if (!reservations) return [];
    if (!searchQuery) return reservations;
    
    const query = searchQuery.toLowerCase().trim();
    const queryWithoutDashes = query.replace(/-/g, '');
    
    return reservations.filter((reservation) => {
      const customerName = reservation.customer?.name?.toLowerCase() || '';
      const licensePlate = reservation.vehicle?.licensePlate?.toLowerCase() || '';
      const licensePlateWithoutDashes = licensePlate.replace(/-/g, '');
      const vehicleBrand = reservation.vehicle?.brand?.toLowerCase() || '';
      const vehicleModel = reservation.vehicle?.model?.toLowerCase() || '';
      const reservationId = reservation.id.toString();
      
      return customerName.includes(query) ||
        licensePlate.includes(query) ||
        licensePlateWithoutDashes.includes(queryWithoutDashes) ||
        vehicleBrand.includes(query) ||
        vehicleModel.includes(query) ||
        reservationId.includes(query);
    });
  }, [reservations, searchQuery]);

  const displayedReservations = useMemo(() => {
    if (activeTab === "all") return filteredReservations;
    return filteredReservations.filter(
      reservation => reservation.status === activeTab
    );
  }, [filteredReservations, activeTab]);

  const selectedReservation = reservations?.find(r => r.id === value);

  const getStatusBadge = (status: string | null | undefined) => {
    const statusLower = status?.toLowerCase() || '';
    switch (statusLower) {
      case 'booked':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">Booked</Badge>;
      case 'picked_up':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs">Picked Up</Badge>;
      case 'returned':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs">Returned</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Completed</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    try {
      return format(parseISO(dateStr), 'MMM d');
    } catch {
      return '';
    }
  };

  const renderReservationItem = (reservation: Reservation) => {
    const customerName = reservation.customer?.name || 'Unknown Customer';
    const vehicleInfo = reservation.vehicle 
      ? `${reservation.vehicle.brand} ${reservation.vehicle.model}` 
      : 'No Vehicle';
    const licensePlate = reservation.vehicle?.licensePlate || '';
    
    return (
      <div
        key={reservation.id}
        className={cn(
          "flex items-center gap-3 p-3 rounded-md cursor-pointer hover:bg-gray-100 transition-colors",
          value === reservation.id && "bg-blue-50"
        )}
        onClick={() => {
          onChange(reservation.id);
          setOpen(false);
        }}
        data-testid={`reservation-option-${reservation.id}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-base">#{reservation.id}</span>
            {getStatusBadge(reservation.status)}
            {licensePlate && (
              <Badge variant="outline" className="text-xs font-mono">
                {formatLicensePlate(licensePlate)}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <User className="h-4 w-4" />
            <span className="truncate font-medium">{customerName}</span>
            <span className="text-gray-400">•</span>
            <span className="truncate">{vehicleInfo}</span>
          </div>
          {reservation.startDate && (
            <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
              <Calendar className="h-3.5 w-3.5" />
              <span>{formatDate(reservation.startDate)}</span>
              {reservation.endDate && (
                <>
                  <span>→</span>
                  <span>{formatDate(reservation.endDate)}</span>
                </>
              )}
            </div>
          )}
        </div>
        {value === reservation.id && (
          <Check className="h-5 w-5 text-blue-600 shrink-0" />
        )}
      </div>
    );
  };

  const displayReservations = () => {
    if (displayedReservations.length === 0) {
      return (
        <div className="text-center py-4 text-sm text-gray-500">
          No reservations found
        </div>
      );
    }
    
    return (
      <div className="space-y-1 max-h-[200px] overflow-y-auto">
        {displayedReservations.map(renderReservationItem)}
      </div>
    );
  };

  return (
    <div className="relative w-full">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-between h-auto min-h-[40px] py-2",
              !value && "text-muted-foreground",
              className
            )}
            disabled={disabled}
            data-testid="select-reservation"
          >
            <div className="flex items-center truncate text-left">
              {selectedReservation ? (
                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">#{selectedReservation.id}</span>
                    {getStatusBadge(selectedReservation.status)}
                    {selectedReservation.vehicle?.licensePlate && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {formatLicensePlate(selectedReservation.vehicle.licensePlate)}
                      </Badge>
                    )}
                  </span>
                  <span className="text-xs text-gray-600">
                    {selectedReservation.customer?.name || 'Unknown'} - {selectedReservation.vehicle?.brand} {selectedReservation.vehicle?.model}
                  </span>
                </div>
              ) : (
                <span>{placeholder}</span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[320px] md:w-[500px] max-h-[350px] overflow-auto p-0"
          align="start"
          side="bottom"
          sideOffset={4}
          avoidCollisions={false}
          sticky="always"
        >
          <div className="p-3">
            <div className="flex items-center px-1 mb-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <Input
                placeholder="Search by ID, customer, license plate..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8"
                data-testid="reservation-search-input"
              />
            </div>
            
            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full mb-2 h-8">
                <TabsTrigger value="all" className="flex-1 text-xs h-7">All</TabsTrigger>
                <TabsTrigger value="booked" className="flex-1 text-xs h-7">Booked</TabsTrigger>
                <TabsTrigger value="picked_up" className="flex-1 text-xs h-7">Active</TabsTrigger>
                <TabsTrigger value="returned" className="flex-1 text-xs h-7">Returned</TabsTrigger>
              </TabsList>
              
              {allowNone && (
                <div
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-md cursor-pointer hover:bg-gray-100 transition-colors mb-2 border-b pb-3",
                    value === null && "bg-blue-50"
                  )}
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  data-testid="reservation-option-none"
                >
                  <span className="text-base text-gray-600">No Reservation</span>
                  {value === null && (
                    <Check className="h-5 w-5 text-blue-600 shrink-0 ml-auto" />
                  )}
                </div>
              )}
              
              <TabsContent value="all" className="mt-0">
                {displayReservations()}
              </TabsContent>
              
              <TabsContent value="booked" className="mt-0">
                {displayReservations()}
              </TabsContent>
              
              <TabsContent value="picked_up" className="mt-0">
                {displayReservations()}
              </TabsContent>
              
              <TabsContent value="returned" className="mt-0">
                {displayReservations()}
              </TabsContent>
            </Tabs>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
