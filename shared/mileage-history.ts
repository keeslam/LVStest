export const MILEAGE_SOURCES = ["pickup", "return", "damage_check", "manual", "portal", "service", "import"] as const;
export type MileageSource = (typeof MILEAGE_SOURCES)[number];
