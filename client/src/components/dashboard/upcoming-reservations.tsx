import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatLicensePlate, formatReservationStatus } from "@/lib/format-utils";
import { Reservation } from "@shared/schema";
import { ReservationQuickStatusButton } from "@/components/reservations/reservation-quick-status-button";

// Function to calculate duration between two dates in days
function getDuration(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
}

// Function to get status badge style
function getStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case "booked":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">{formatReservationStatus(status)}</Badge>;
    case "picked_up":
      return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200">{formatReservationStatus(status)}</Badge>;
    case "returned":
      return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200">{formatReservationStatus(status)}</Badge>;
    case "completed":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">{formatReservationStatus(status)}</Badge>;
    case "cancelled":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-200">{formatReservationStatus(status)}</Badge>;
    default:
      return <Badge variant="outline">{formatReservationStatus(status)}</Badge>;
  }
}

export function UpcomingReservations() {
  const { data: reservations, isLoading } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations/upcoming"],
  });
  
  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader className="px-4 py-3 border-b flex-row justify-between items-center space-y-0">
        <CardTitle className="text-base font-medium text-gray-800">Upcoming Reservations</CardTitle>
        <Link href="/reservations">
          <Button variant="link" className="text-primary-600 hover:text-primary-700 text-sm font-medium h-8 px-0">
            View All
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[265px] overflow-y-auto">
          <table className="w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vehicle
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Period
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center">
                    <div className="flex justify-center">
                      <svg className="animate-spin h-5 w-5 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  </td>
                </tr>
              ) : reservations?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    No upcoming reservations
                  </td>
                </tr>
              ) : (
                reservations?.slice(0, 10).map(reservation => (
                  <tr key={reservation.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-gray-900">
                          {formatLicensePlate(reservation.vehicle?.licensePlate || '')}
                        </div>
                        <div className="ml-2 text-xs text-gray-500">{reservation.vehicle?.brand} {reservation.vehicle?.model}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{reservation.customer?.name}</div>
                      <div className="text-xs text-gray-500">{reservation.customer?.phone}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <span>{reservation.startDate ? formatDate(reservation.startDate) : ''}</span> - 
                        <span> {reservation.endDate ? formatDate(reservation.endDate) : ''}</span>
                      </div>
                      <div className="text-xs text-gray-500">{getDuration(reservation.startDate || '', reservation.endDate || '')}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(reservation.status || 'booked')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {/* Status change button */}
                      <ReservationQuickStatusButton 
                        reservation={reservation} 
                        size="icon"
                        variant="ghost"
                        className="mr-2 h-8 w-8"
                      />
                      
                      {/* Edit button */}
                      <Link href={`/reservations/${reservation.id}/edit`}>
                        <Button variant="ghost" size="icon" className="text-primary-600 hover:text-primary-800 mr-2 h-8 w-8">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                          </svg>
                        </Button>
                      </Link>
                      
                      {/* Contract button */}
                      <Link href={`/documents/contract/${reservation.id}`}>
                        <Button variant="ghost" size="icon" className="text-primary-600 hover:text-primary-800 h-8 w-8">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-text">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" x2="8" y1="13" y2="13"/>
                            <line x1="16" x2="8" y1="17" y2="17"/>
                            <line x1="10" x2="8" y1="9" y2="9"/>
                          </svg>
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
