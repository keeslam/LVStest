import { formatLicensePlate } from "./license-plate";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines multiple class names using clsx and tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a license plate with dashes (XX-LL-20). One implementation for the
 * whole client: see lib/license-plate.ts.
 */
export { formatLicensePlate } from "./license-plate";

/**
 * Removes dashes from a license plate for storage or comparison
 */
export function normalizeLicensePlate(licensePlate: string): string {
  if (!licensePlate) return '';
  return licensePlate.replace(/[-\s]/g, '').toUpperCase();
}

/**
 * How a plate reads on screen: with dashes, like everywhere else (A-7-5,
 * A-10-5). The name predates that rule; every caller is a display.
 */
export function displayLicensePlate(licensePlate: string): string {
  return formatLicensePlate(licensePlate);
}

/**
 * Checks if a value is truthy (boolean true or string "true")
 * Handles database fields that may be stored as strings but used as booleans in UI
 */
export function isTrueValue(value: string | boolean | null | undefined): boolean {
  return value === true || value === "true";
}

/**
 * Formats a number as a currency value in Euro format
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '€0,00';
  
  // Use Intl.NumberFormat to format as Euro with 2 decimal places
  return new Intl.NumberFormat('nl-NL', { 
    style: 'currency', 
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}