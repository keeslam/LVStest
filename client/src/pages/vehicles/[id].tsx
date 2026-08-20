import { useParams } from "wouter";
import { VehicleDetails } from "@/components/vehicles/vehicle-details";

export default function VehicleDetail() {
  const params = useParams<{ id: string }>();
  const vehicleId = parseInt(params.id);

  if (isNaN(vehicleId)) {
    return <div>Invalid vehicle ID</div>;
  }

  return (
    <div>
      <VehicleDetails vehicleId={vehicleId} />
    </div>
  );
}
