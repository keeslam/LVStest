import { format, parseISO } from 'date-fns';
import i18n from '@/i18n';

/**
 * Format a date string or Date object into a readable format: 'MMM dd, yyyy'
 */
export function formatDate(date: string | Date): string {
  try {
    // If it's already a Date object, use it directly
    if (date instanceof Date) {
      return format(date, 'MMM dd, yyyy');
    }
    // If it's a string, parse it first
    return format(parseISO(date), 'MMM dd, yyyy');
  } catch (e) {
    // If all else fails, return a safe fallback
    return 'Invalid date';
  }
}

/**
 * Format a number as currency (EUR)
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Sum a list of money values without floating-point drift (0.1 + 0.2 !== 0.3).
 * Adds in integer cents and converts back, instead of summing raw floats.
 */
export function sumMoney<T>(items: T[], getAmount: (item: T) => number | string | null | undefined): number {
  const totalCents = items.reduce((cents, item) => {
    const value = Number(getAmount(item)) || 0;
    return cents + Math.round(value * 100);
  }, 0);
  return totalCents / 100;
}

/**
 * Format a license plate consistently throughout the application
 * Removes dashes and spaces, then formats as XX-LL-00 or similar
 * If the license plate is in a non-standard format, returns it as-is
 */
export function formatLicensePlate(licensePlate: string): string {
  // Remove any existing dashes or spaces
  const sanitized = licensePlate.replace(/[-\s]/g, '');
  
  // Standard Dutch license plate formats
  const formats = [
    { pattern: /^([A-Z]{2})(\d{2})(\d{2})$/, format: '$1-$2-$3' }, // XX-00-00
    { pattern: /^(\d{2})(\d{2})([A-Z]{2})$/, format: '$1-$2-$3' }, // 00-00-XX
    { pattern: /^(\d{2})([A-Z]{2})(\d{2})$/, format: '$1-$2-$3' }, // 00-XX-00
    { pattern: /^([A-Z]{2})([A-Z]{2})(\d{2})$/, format: '$1-$2-$3' }, // XX-XX-00
    { pattern: /^([A-Z]{2})(\d{2})([A-Z]{2})$/, format: '$1-$2-$3' }, // XX-00-XX
    { pattern: /^(\d{2})([A-Z]{2})([A-Z]{2})$/, format: '$1-$2-$3' }, // 00-XX-XX
    { pattern: /^([A-Z])(\d{3})([A-Z]{2})$/, format: '$1-$2-$3' }, // X-000-XX
    { pattern: /^([A-Z]{2})(\d{3})([A-Z])$/, format: '$1-$2-$3' }, // XX-000-X
    { pattern: /^([A-Z])(\d{2})([A-Z]{3})$/, format: '$1-$2-$3' }, // X-00-XXX
    { pattern: /^([A-Z]{3})(\d{2})([A-Z])$/, format: '$1-$2-$3' }, // XXX-00-X
    { pattern: /^(\d{1})([A-Z]{3})(\d{2})$/, format: '$1-$2-$3' }, // 0-XXX-00
    { pattern: /^(\d{2})([A-Z]{3})(\d{1})$/, format: '$1-$2-$3' }, // 00-XXX-0
    // Add more formats as needed
  ];
  
  // Try to match and format the license plate
  for (const { pattern, format } of formats) {
    if (pattern.test(sanitized)) {
      return sanitized.replace(pattern, format);
    }
  }
  
  // If no standard format matches, return as-is but uppercase
  return sanitized.toUpperCase();
}

/**
 * Format a reservation status to a human-readable string
 */
export function formatReservationStatus(status: string): string {
  const key = status.toLowerCase();
  const normalizedKey = key === 'pending' ? 'scheduled' : key === 'confirmed' ? 'active' : key;
  const fallback = status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return i18n.t(`reservations:detailsPage.statusLabels.${normalizedKey}`, { defaultValue: fallback });
}

/**
 * Format a file size in bytes to a human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format a phone number to a standard format
 * For Dutch phone numbers, formats as: +31 6 12345678
 */
export function formatPhoneNumber(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) return '';
  
  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Check if it's a Dutch mobile number
  if (cleaned.startsWith('31') && cleaned.length === 11) {
    // Format as: +31 6 12345678
    return `+${cleaned.substring(0, 2)} ${cleaned.substring(2, 3)} ${cleaned.substring(3)}`;
  }
  
  // For Dutch landlines and other formats
  if (cleaned.startsWith('31') && cleaned.length >= 10) {
    // Format as: +31 10 1234567
    return `+${cleaned.substring(0, 2)} ${cleaned.substring(2, 4)} ${cleaned.substring(4)}`;
  }
  
  // For Dutch numbers without country code
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    // Format as: 06-12345678
    return `${cleaned.substring(0, 2)}-${cleaned.substring(2)}`;
  }
  
  // For other formats or international numbers, just add basic formatting
  if (cleaned.length > 6) {
    // Insert a space every 3 digits for readability
    return cleaned.replace(/(\d{3})(?=\d)/g, '$1 ');
  }
  
  // Return the cleaned number as is if no pattern matches
  return cleaned;
}

/**
 * Capitalize the first letter of each word in a string
 * Example: "john doe" -> "John Doe", "main street" -> "Main Street"
 */
export function capitalizeWords(text: string): string {
  if (!text) return '';
  
  return text
    .split(' ')
    .map(word => {
      if (!word) return word;
      // Capitalize first letter, keep rest as typed
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Capitalize proper names (handles prefixes like "van", "de", "van der")
 * Example: "jan van der berg" -> "Jan van der Berg"
 */
export function capitalizeName(name: string): string {
  if (!name) return '';
  
  const lowercasePrefixes = ['van', 'de', 'der', 'den', 'het', 'ten', 'ter'];
  
  return name
    .split(' ')
    .map((word, index) => {
      if (!word) return word;
      
      const lowerWord = word.toLowerCase();
      
      // Keep prefixes lowercase unless they're the first word
      if (index > 0 && lowercasePrefixes.includes(lowerWord)) {
        return lowerWord;
      }
      
      // Capitalize first letter
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}