/**
 * A-6-6 - the fuel level the return form starts on.
 *
 * The form used to start on "Vol" whatever the car left with, so a forgotten
 * tick recorded a level nobody had looked at. It now starts on the level
 * written down at pickup, which is the least surprising guess (the employee
 * still confirms or changes it). The stored value is free text in old rows
 * ("full", "3/4"), so it is matched case-insensitively against the values the
 * select really offers; anything else falls back to "Full" as before.
 */
export const RETURN_FUEL_LEVELS = ["Full", "3/4", "1/2", "1/4", "Empty"] as const;
export type ReturnFuelLevel = (typeof RETURN_FUEL_LEVELS)[number];

export function defaultReturnFuelLevel(fuelLevelAtPickup: string | null | undefined): ReturnFuelLevel {
  const wanted = (fuelLevelAtPickup ?? "").trim().toLowerCase();
  return RETURN_FUEL_LEVELS.find((level) => level.toLowerCase() === wanted) ?? "Full";
}
