import { useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { VehicleDetails } from "@/components/vehicles/vehicle-details";

export default function VehicleDetail() {
  const { t } = useTranslation("vehicles");
  const params = useParams<{ id: string }>();
  const vehicleId = parseInt(params.id);

  if (isNaN(vehicleId)) {
    return <div>{t('detailPage.invalidVehicleId')}</div>;
  }

  return (
    <div>
      <VehicleDetails vehicleId={vehicleId} />
    </div>
  );
}
