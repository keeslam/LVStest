import { format, parseISO, addDays, startOfWeek, endOfWeek, isAfter, isBefore, differenceInDays, isValid } from 'date-fns';

/**
 * Get color class based on urgency (days until expiration)
 */
export function getUrgencyColorClass(days: number): string {
  if (days <= 14) return "bg-danger-50 text-danger-500"; // Within 2 weeks
  if (days <= 30) return "bg-warning-50 text-warning-500"; // Within 1 month
  return "bg-primary-100 text-primary-600"; // More than 1 month
}

/**
 * Check if a date is within the next X days from today
 */
export function isWithinNextDays(dateStr: string | null | undefined, days: number): boolean {
  if (!dateStr) return false;
  
  try {
    const targetDate = parseISO(dateStr);
    if (!isValid(targetDate)) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const futureDate = addDays(today, days);
    
    return isAfter(targetDate, today) && isBefore(targetDate, futureDate);
  } catch (err) {
    return false;
  }
}

/**
 * Check if a date is within the next X months from today
 */
export function isWithinNextMonths(dateStr: string | null | undefined, months: number): boolean {
  if (!dateStr) return false;
  
  try {
    const targetDate = parseISO(dateStr);
    if (!isValid(targetDate)) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Add X months to today
    const futureDate = new Date(today);
    futureDate.setMonth(futureDate.getMonth() + months);
    
    return isAfter(targetDate, today) && isBefore(targetDate, futureDate);
  } catch (err) {
    return false;
  }
}

/**
 * Get days until a date from today. Negative means the date has already
 * passed — callers must handle that case (e.g. "N days overdue") rather than
 * clamping to 0, which would make an expired APK/warranty look like it
 * expires today instead of already having lapsed.
 */
export function getDaysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;

  try {
    const targetDate = parseISO(dateStr);
    if (!isValid(targetDate)) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);

    return differenceInDays(targetDate, today);
  } catch (err) {
    return 0;
  }
}

/**
 * Format a date range
 */
export function formatDateRange(startDate: Date, endDate: Date): string {
  return `${format(startDate, "MMMM d")} - ${format(endDate, "d, yyyy")}`;
}

/**
 * Calculate duration between two dates in days
 */
export function getDuration(startDateStr: string, endDateStr: string): string {
  try {
    const startDate = parseISO(startDateStr);
    const endDate = parseISO(endDateStr);
    
    if (!isValid(startDate) || !isValid(endDate)) return "";
    
    const days = differenceInDays(endDate, startDate) + 1; // Include both start and end days
    return `${days} day${days !== 1 ? 's' : ''}`;
  } catch (err) {
    return "";
  }
}

/**
 * Get an array of dates for a week
 */
export function getWeekDays(currentDate: Date): Date[] {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/**
 * Check if two date ranges overlap
 */
export function doDateRangesOverlap(
  startA: string, 
  endA: string, 
  startB: string, 
  endB: string
): boolean {
  try {
    const startDateA = parseISO(startA);
    const endDateA = parseISO(endA);
    const startDateB = parseISO(startB);
    const endDateB = parseISO(endB);
    
    if (!isValid(startDateA) || !isValid(endDateA) || !isValid(startDateB) || !isValid(endDateB)) {
      return false;
    }
    
    return isAfter(endDateA, startDateB) && isBefore(startDateA, endDateB);
  } catch (err) {
    return false;
  }
}
