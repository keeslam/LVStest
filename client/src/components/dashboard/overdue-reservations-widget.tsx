import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { formatLicensePlate } from "@/lib/format-utils";
import { differenceInDays, parseISO } from "date-fns";
import { ReservationViewDialog } from "@/components/reservations/reservation-view-dialog";

interface OverdueReservation {
  id: number;
  endDate: string | null;
  startDate: string;
  status: string;
  vehicle?: { make: string; model: string; licensePlate: string };
  customer?: { name: string; phone?: string | null };
}

function getUrgencyClass(days: number): string {
  if (days >= 7) return "bg-red-50 text-red-600";
  if (days >= 3) return "bg-orange-50 text-orange-600";
  return "bg-yellow-50 text-yellow-600";
}

export function OverdueReservationsWidget() {
  const [selectedReservationId, setSelectedReservationId] = useState<number | null>(null);
  
  // Note: No refetchInterval - real-time updates come via WebSocket to prevent dialog closures
  const { data: overdueReservations = [], isLoading, error } = useQuery<OverdueReservation[]>({
    queryKey: ['/api/reservations/overdue'],
  });

  const today = new Date();
  
  const reservationsWithDays = overdueReservations.map(reservation => ({
    ...reservation,
    daysOverdue: reservation.endDate 
      ? differenceInDays(today, parseISO(reservation.endDate))
      : 0
  })).sort((a, b) => b.daysOverdue - a.daysOverdue);

  return (
    <Card className="overflow-hidden h-full">
      <CardHeader className="bg-red-500 py-3 px-4 flex-row justify-between items-center space-y-0">
        <CardTitle className="text-base font-medium text-white">Overdue Rentals</CardTitle>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-alert-circle text-white">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
      </CardHeader>
      <CardContent className="p-4">
        <div className="mb-3">
          <div className="text-xl font-semibold">{isLoading ? "-" : reservationsWithDays?.length || 0}</div>
          <p className="text-xs text-gray-500">Vehicles not returned on time</p>
        </div>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center p-4">
              <svg className="animate-spin h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : error ? (
            <div className="text-center py-4 text-red-500">Failed to load overdue rentals</div>
          ) : reservationsWithDays?.length === 0 ? (
            <div className="text-center py-4 text-gray-500">No overdue rentals</div>
          ) : (
            reservationsWithDays?.map(reservation => (
              <div key={reservation.id} className="flex items-center p-2 border rounded-md hover:bg-gray-50" data-testid={`overdue-reservation-${reservation.id}`}>
                <div className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-md ${getUrgencyClass(reservation.daysOverdue)}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-clock">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="ml-3 flex-grow min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {formatLicensePlate(reservation.vehicle?.licensePlate || '')}
                  </div>
                  <div className="flex items-center">
                    <div className="text-xs text-gray-500 truncate">{reservation.customer?.name || 'Unknown'}</div>
                    <div className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${getUrgencyClass(reservation.daysOverdue)}`}>
                      {reservation.daysOverdue}d late
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-shrink-0 ml-2 h-8 w-8 p-0"
                  onClick={() => setSelectedReservationId(reservation.id)}
                  data-testid={`button-view-reservation-${reservation.id}`}
                >
                  <Eye className="h-4 w-4 text-gray-500 hover:text-gray-700" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
      
      {selectedReservationId && (
        <ReservationViewDialog
          reservationId={selectedReservationId}
          open={!!selectedReservationId}
          onOpenChange={(open) => !open && setSelectedReservationId(null)}
        />
      )}
    </Card>
  );
}
