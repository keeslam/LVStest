import { differenceInDays, parseISO } from "date-fns";
import { formatNl as format } from "@/lib/format-date-nl";
import type { Vehicle } from "@shared/schema";

/**
 * The next APK date for a vehicle, worked out from its fuel and age.
 *
 * Moved verbatim from the maintenance calendar so the "Afronden" button in the
 * maintenance overview pre-fills the completion dialog the same way the calendar
 * does (A-7-11). Diesel/LPG: first inspection after 3 years, then yearly;
 * petrol/electric: after 4 years, then every 2 years until 8, then yearly.
 */
export function calculateNextApkDate(
  vehicle: Pick<Vehicle, "productionDate" | "apkDate" | "fuel">,
  completionDate: Date = new Date(),
): string {
  if (!vehicle.productionDate && !vehicle.apkDate) {
    // Default to 1 year if we don't have production date
    const nextDate = new Date(completionDate);
    nextDate.setFullYear(nextDate.getFullYear() + 1);
    return format(nextDate, "yyyy-MM-dd");
  }

  // Use apkDate if available for determining current cycle, otherwise use productionDate
  const referenceDate = vehicle.apkDate
    ? parseISO(vehicle.apkDate)
    : vehicle.productionDate
      ? parseISO(vehicle.productionDate)
      : null;

  if (!referenceDate) {
    // Default to 1 year if we can't determine reference date
    const nextDate = new Date(completionDate);
    nextDate.setFullYear(nextDate.getFullYear() + 1);
    return format(nextDate, "yyyy-MM-dd");
  }

  // Calculate vehicle age from production date
  const productionDate = vehicle.productionDate ? parseISO(vehicle.productionDate) : null;
  const vehicleAgeYears = productionDate
    ? differenceInDays(completionDate, productionDate) / 365.25
    : 0;

  const fuel = vehicle.fuel?.toLowerCase() || "";
  const isDieselOrLpg = fuel.includes("diesel") || fuel.includes("lpg");
  const isPetrolOrElectric = fuel.includes("petrol") || fuel.includes("benzine") || fuel.includes("electric");

  let yearsToAdd = 1; // Default to annual

  if (isDieselOrLpg) {
    // Diesel/LPG: First inspection after 3 years, then annually
    if (vehicleAgeYears < 3) {
      yearsToAdd = 3 - Math.floor(vehicleAgeYears);
    } else {
      yearsToAdd = 1;
    }
  } else if (isPetrolOrElectric) {
    // Petrol/Electric: First inspection after 4 years, then every 2 years until 8 years, then annually
    if (vehicleAgeYears < 4) {
      yearsToAdd = 4 - Math.floor(vehicleAgeYears);
    } else if (vehicleAgeYears < 8) {
      yearsToAdd = 2;
    } else {
      yearsToAdd = 1;
    }
  }

  const nextDate = new Date(completionDate);
  nextDate.setFullYear(nextDate.getFullYear() + yearsToAdd);
  return format(nextDate, "yyyy-MM-dd");
}
