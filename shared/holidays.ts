/**
 * Dutch Holiday Calculator
 * 
 * Calculates Dutch public holidays for any given year.
 * - Fixed date holidays: New Year's Day, King's Day, Liberation Day, Christmas
 * - Variable holidays: Depend on Easter date (calculated using computus algorithm)
 */

export interface HolidayInfo {
  key: string;
  name: string;
  date: string; // ISO format YYYY-MM-DD
  isVariable: boolean; // true if depends on Easter
}

export interface DutchHolidays {
  nieuwjaarsdag: string;
  goede_vrijdag: string;
  eerste_paasdag: string;
  tweede_paasdag: string;
  koningsdag: string;
  bevrijdingsdag: string;
  hemelvaartsdag: string;
  eerste_pinksterdag: string;
  tweede_pinksterdag: string;
  eerste_kerstdag: string;
  tweede_kerstdag: string;
}

export const DUTCH_HOLIDAY_NAMES: Record<keyof DutchHolidays, string> = {
  nieuwjaarsdag: "Nieuwjaarsdag",
  goede_vrijdag: "Goede Vrijdag",
  eerste_paasdag: "Eerste Paasdag",
  tweede_paasdag: "Tweede Paasdag",
  koningsdag: "Koningsdag",
  bevrijdingsdag: "Bevrijdingsdag",
  hemelvaartsdag: "Hemelvaartsdag",
  eerste_pinksterdag: "Eerste Pinksterdag",
  tweede_pinksterdag: "Tweede Pinksterdag",
  eerste_kerstdag: "Eerste Kerstdag",
  tweede_kerstdag: "Tweede Kerstdag",
};

/**
 * Calculate Easter Sunday date using the Anonymous Gregorian algorithm (computus)
 * This is the most widely used algorithm for calculating Easter.
 * Easter falls on the first Sunday after the first full moon on or after March 21.
 */
export function calculateEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  
  return new Date(year, month - 1, day);
}

/**
 * Format a Date object to ISO date string (YYYY-MM-DD)
 */
function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Add days to a date
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Check if a date falls on a Sunday (day of week = 0)
 */
function isSunday(date: Date): boolean {
  return date.getDay() === 0;
}

/**
 * Calculate all Dutch public holidays for a given year
 */
export function calculateDutchHolidays(year: number): DutchHolidays {
  const easter = calculateEasterSunday(year);
  
  // King's Day: April 27, but moves to April 26 if April 27 is a Sunday
  const kingsDay = new Date(year, 3, 27); // April 27
  const kingsDayAdjusted = isSunday(kingsDay) ? new Date(year, 3, 26) : kingsDay;
  
  return {
    // Fixed holidays
    nieuwjaarsdag: formatDateISO(new Date(year, 0, 1)), // January 1
    koningsdag: formatDateISO(kingsDayAdjusted), // April 27 (or 26 if Sunday)
    bevrijdingsdag: formatDateISO(new Date(year, 4, 5)), // May 5
    eerste_kerstdag: formatDateISO(new Date(year, 11, 25)), // December 25
    tweede_kerstdag: formatDateISO(new Date(year, 11, 26)), // December 26
    
    // Easter-dependent holidays
    goede_vrijdag: formatDateISO(addDays(easter, -2)), // Good Friday: 2 days before Easter
    eerste_paasdag: formatDateISO(easter), // Easter Sunday
    tweede_paasdag: formatDateISO(addDays(easter, 1)), // Easter Monday: 1 day after Easter
    hemelvaartsdag: formatDateISO(addDays(easter, 39)), // Ascension Day: 39 days after Easter (40th day)
    eerste_pinksterdag: formatDateISO(addDays(easter, 49)), // Pentecost: 49 days after Easter
    tweede_pinksterdag: formatDateISO(addDays(easter, 50)), // Whit Monday: 50 days after Easter
  };
}

/**
 * Get holiday info with all details for a given year
 */
export function getDutchHolidaysWithInfo(year: number): HolidayInfo[] {
  const holidays = calculateDutchHolidays(year);
  
  return [
    { key: 'nieuwjaarsdag', name: DUTCH_HOLIDAY_NAMES.nieuwjaarsdag, date: holidays.nieuwjaarsdag, isVariable: false },
    { key: 'goede_vrijdag', name: DUTCH_HOLIDAY_NAMES.goede_vrijdag, date: holidays.goede_vrijdag, isVariable: true },
    { key: 'eerste_paasdag', name: DUTCH_HOLIDAY_NAMES.eerste_paasdag, date: holidays.eerste_paasdag, isVariable: true },
    { key: 'tweede_paasdag', name: DUTCH_HOLIDAY_NAMES.tweede_paasdag, date: holidays.tweede_paasdag, isVariable: true },
    { key: 'koningsdag', name: DUTCH_HOLIDAY_NAMES.koningsdag, date: holidays.koningsdag, isVariable: false },
    { key: 'bevrijdingsdag', name: DUTCH_HOLIDAY_NAMES.bevrijdingsdag, date: holidays.bevrijdingsdag, isVariable: false },
    { key: 'hemelvaartsdag', name: DUTCH_HOLIDAY_NAMES.hemelvaartsdag, date: holidays.hemelvaartsdag, isVariable: true },
    { key: 'eerste_pinksterdag', name: DUTCH_HOLIDAY_NAMES.eerste_pinksterdag, date: holidays.eerste_pinksterdag, isVariable: true },
    { key: 'tweede_pinksterdag', name: DUTCH_HOLIDAY_NAMES.tweede_pinksterdag, date: holidays.tweede_pinksterdag, isVariable: true },
    { key: 'eerste_kerstdag', name: DUTCH_HOLIDAY_NAMES.eerste_kerstdag, date: holidays.eerste_kerstdag, isVariable: false },
    { key: 'tweede_kerstdag', name: DUTCH_HOLIDAY_NAMES.tweede_kerstdag, date: holidays.tweede_kerstdag, isVariable: false },
  ];
}

/**
 * Merge calculated holidays with user overrides
 * Overrides can be stored as: { [holidayKey]: { enabled: boolean, overrideDate?: string } }
 */
export function mergeHolidaysWithOverrides(
  year: number,
  overrides: Record<string, { enabled: boolean; overrideDate?: string }>
): Record<string, { enabled: boolean; date: string; isOverridden: boolean; calculatedDate: string }> {
  const calculated = calculateDutchHolidays(year);
  const result: Record<string, { enabled: boolean; date: string; isOverridden: boolean; calculatedDate: string }> = {};
  
  for (const [key, calculatedDate] of Object.entries(calculated)) {
    const override = overrides[key];
    const isOverridden = override?.overrideDate ? true : false;
    
    result[key] = {
      enabled: override?.enabled ?? true,
      date: override?.overrideDate || calculatedDate,
      isOverridden,
      calculatedDate,
    };
  }
  
  return result;
}
