import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines multiple class names using clsx and tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a license plate to ensure consistent display with dashes
 * Handles different formats: XXLL20, XX-LL-20, XXLL-20, etc.
 * Standardizes to XX-LL-20 format
 */
export function formatLicensePlate(licensePlate: string): string {
  if (!licensePlate) return '';
  
  // Remove any existing dashes or spaces
  const cleanPlate = licensePlate.replace(/[-\s]/g, '');
  
  // Dutch license plates typically have formats like XX-XX-XX, XX-XXX-X, etc.
  // This attempts to add dashes in the most common pattern
  if (cleanPlate.length === 6) {
    // Common format: XXLLDD → XX-LL-DD
    return `${cleanPlate.substring(0, 2)}-${cleanPlate.substring(2, 4)}-${cleanPlate.substring(4, 6)}`;
  } else if (cleanPlate.length === 7) {
    // Other formats: XXLLLDD → XX-LLL-DD or XXLLLDDD → XX-LL-LDD
    // Make a best guess based on Dutch conventions
    return `${cleanPlate.substring(0, 2)}-${cleanPlate.substring(2, 5)}-${cleanPlate.substring(5, 7)}`;
  } else if (cleanPlate.length === 8) {
    // Format: DDLLLLDD → DD-LLL-LDD
    return `${cleanPlate.substring(0, 2)}-${cleanPlate.substring(2, 5)}-${cleanPlate.substring(5, 8)}`;
  }
  
  // If it doesn't match common patterns, add dashes after every 2 characters
  // This is a fallback for unusual formats
  return cleanPlate.match(/.{1,2}/g)?.join('-') || cleanPlate;
}

/**
 * Removes dashes from a license plate for storage or comparison
 */
export function normalizeLicensePlate(licensePlate: string): string {
  if (!licensePlate) return '';
  return licensePlate.replace(/[-\s]/g, '').toUpperCase();
}

/**
 * Displays a license plate without dashes in uppercase
 */
export function displayLicensePlate(licensePlate: string): string {
  if (!licensePlate) return '';
  return licensePlate.replace(/[-\s]/g, '').toUpperCase();
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