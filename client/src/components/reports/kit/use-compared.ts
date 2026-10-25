/**
 * Rapporten herontwerp deel 1b, Task 4: the summary of a kit card and, when the filter bar
 * compares, the same summary for the comparison period. The second query has the same key
 * shape (endpoint, params) with only `from`/`to` moved, so it is cached like any other period.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useComparisonRange } from "@/pages/reports/report-filters";

/** Days from `from` to `to`, both included. */
function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export interface ComparedSummary<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  /**
   * undefined: not comparing. null: comparing, but the old summary is not there (loading, refused
   * by the server, or longer than `maxDays`). Otherwise the summary of the comparison period.
   */
  previous: T | null | undefined;
  compareRange: { from: string; to: string } | null;
}

export function useComparedSummary<T>(
  endpoint: string,
  params: Record<string, string>,
  opts: { enabled: boolean; maxDays?: number },
): ComparedSummary<T> {
  const current = useQuery<T>({ queryKey: [endpoint, params], enabled: opts.enabled });
  const compareRange = useComparisonRange(params.from, params.to);
  const previousParams = useMemo(
    () => (compareRange ? { ...params, from: compareRange.from, to: compareRange.to } : null),
    [params, compareRange],
  );
  const tooLong = !!compareRange && opts.maxDays !== undefined && spanDays(compareRange.from, compareRange.to) > opts.maxDays;
  const previous = useQuery<T>({
    queryKey: [endpoint, previousParams ?? params],
    enabled: opts.enabled && previousParams !== null && !tooLong,
  });
  return {
    data: current.data,
    isLoading: current.isLoading,
    isError: current.isError,
    previous: compareRange ? (previous.isSuccess && !tooLong ? previous.data : null) : undefined,
    compareRange,
  };
}

/** A number of the old summary for `useCompareTile`: undefined when not comparing, null when not known. */
export function previousOf<T>(previous: T | null | undefined, pick: (summary: T) => number | null | undefined): number | null | undefined {
  if (previous === undefined) return undefined;
  if (previous === null) return null;
  return pick(previous) ?? null;
}
