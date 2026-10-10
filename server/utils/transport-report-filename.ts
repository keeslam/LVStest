/**
 * The vehicle part of a transport report's file name (A-8-4).
 *
 * A vehicle saved without a real brand and model carries the placeholder
 * "Unknown" in both, which made the file "Transport_Report_Unknown_Unknown_...".
 * Placeholder and empty parts are left out; when nothing real is left the plate
 * names the vehicle.
 */
interface TransportVehicleLabelInput {
  vehicle?: { brand?: string | null; model?: string | null; licensePlate?: string | null } | null;
  isExternalVehicle?: boolean | null;
  externalBrand?: string | null;
  externalModel?: string | null;
  externalLicensePlate?: string | null;
  vehicleId?: number | null;
}

const real = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed && trimmed.toLowerCase() !== "unknown" ? trimmed : null;
};

export function transportReportVehicleLabel(t: TransportVehicleLabelInput): string {
  if (t.vehicle) {
    const parts = [real(t.vehicle.brand), real(t.vehicle.model)].filter((p): p is string => p !== null);
    if (parts.length) return parts.join("_");
    return real(t.vehicle.licensePlate) ?? `Vehicle_${t.vehicleId}`;
  }
  if (t.isExternalVehicle) {
    const parts = [real(t.externalBrand), real(t.externalModel)].filter((p): p is string => p !== null);
    if (parts.length) return parts.join("_");
    return real(t.externalLicensePlate) ?? "External";
  }
  return `Vehicle_${t.vehicleId}`;
}
