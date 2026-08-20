import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { Vehicle } from "@shared/schema";

export default function EditVehiclePage() {
  const params = useParams<{ id: string }>();
  const vehicleId = parseInt(params.id);
  
  // Fetch the vehicle data
  const { data: vehicle, isLoading } = useQuery<Vehicle>({
    queryKey: [`/api/vehicles/${vehicleId}`],
  });
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <svg className="animate-spin h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }
  
  if (!vehicle) {
    return <div className="text-center p-8">Vehicle not found</div>;
  }
  
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">Edit Vehicle: {vehicle.brand} {vehicle.model}</h1>
      <VehicleForm editMode={true} initialData={vehicle} />
    </div>
  );
}