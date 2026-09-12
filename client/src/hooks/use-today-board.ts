/**
 * OPT-001 — the one query the "Vandaag" screen makes.
 *
 * One hook, one query key, so the screen and the dashboard's entry to it share
 * a single cache entry and a single request. BUG-204 was exactly this mistake
 * made the other way: `['/api/reservations']` and `['/api/reservations', n]`
 * are two cache entries for one URL, and the 8 MB list was downloaded twice on
 * first paint. `queryKeyUrl()` turns the object in slot 1 into the query
 * string, so both callers here produce the same URL *and* the same key.
 *
 * The date is the *browser's* today, not the server's: the office is in
 * Amsterdam and the container is on UTC, which are different days between
 * midnight and 02:00 CEST.
 */
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { TodayBoard } from "@shared/today";

/** `YYYY-MM-DD` in the employee's own timezone. */
export function localToday(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

export function todayBoardQueryKey(date: string): readonly unknown[] {
  return ["/api/today", { date }];
}

export function useTodayBoard(date: string = localToday()) {
  return useQuery<TodayBoard>({
    queryKey: todayBoardQueryKey(date),
  });
}
