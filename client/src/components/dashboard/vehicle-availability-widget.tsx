import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Car, Calendar } from "lucide-react";
import { formatLicensePlate } from "@/lib/format-utils";
import { ReservationAddDialog } from "@/components/reservations/reservation-add-dialog";
import { Vehicle } from "@shared/schema";

export function VehicleAvailabilityWidget() {
  const { data: vehicles, isLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles/available"],
  });

  return (
    <Card className="overflow-hidden h-full">
      <CardHeader className="bg-primary-600 py-3 px-4 flex-row justify-between items-center space-y-0">
        <CardTitle className="text-base font-medium text-gray-900">Available Vehicles</CardTitle>
        <Car className="w-5 h-5 text-gray-900" />
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <svg className="animate-spin h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        ) : vehicles?.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Car className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p className="text-sm">No vehicles available</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            <div className="mb-3 text-sm text-gray-600">
              <span className="font-medium">{vehicles?.length || 0}</span> ready to rent
            </div>
            {vehicles?.map((vehicle) => {
              const isOpnaam = vehicle.registeredTo === "true";
              const isBV = vehicle.company === "true";
              
              return (
                <div
                  key={vehicle.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                  data-testid={`available-vehicle-${vehicle.id}`}
                >
                  <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-md flex items-center justify-center">
                    <Car className="w-5 h-5 text-green-600" />
                  </div>
                  
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-gray-900">
                        {formatLicensePlate(vehicle.licensePlate)}
                      </span>
                      {isOpnaam && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                          Opnaam
                        </Badge>
                      )}
                      {isBV && (
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                          BV
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-gray-600 truncate">
                      {vehicle.brand} {vehicle.model}
                    </div>
                  </div>
                  
                  <ReservationAddDialog initialVehicleId={vehicle.id.toString()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0 text-primary-600 hover:bg-primary-50 rounded"
                      data-testid={`button-reserve-${vehicle.id}`}
                    >
                      <Calendar className="w-4 h-4" />
                    </Button>
                  </ReservationAddDialog>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
