/** How many days ahead the portal starts offering to plan the APK. */
export const APK_PLAN_WINDOW_DAYS = 45;

/**
 * Whether the customer should be offered "APK inplannen" for a rental: the car is with them, the APK has expired or expires within
 * the window, and that date falls before the rental ends (or the rental has no end date). When the APK only runs out after the
 * rental, the rental is over before it matters and nothing is offered. `daysLeft` is negative once it has expired.
 */
export function apkPlanning(input: { status: string; endDate: string | null; apkDate: string | null; daysLeft: number | null }): { offer: boolean; expired: boolean } {
  const { status, endDate, apkDate, daysLeft } = input;
  if (status !== 'picked_up' || !apkDate || daysLeft === null) return { offer: false, expired: false };
  const expired = daysLeft < 0;
  const inWindow = daysLeft <= APK_PLAN_WINDOW_DAYS;
  const beforeEnd = !endDate || apkDate <= endDate;
  return { offer: inWindow && beforeEnd, expired };
}
