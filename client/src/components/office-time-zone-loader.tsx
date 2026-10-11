/**
 * D11: fills the office time zone store (lib/office-timezone.ts) from the
 * `office_timezone` app setting once a user is signed in. Renders nothing.
 *
 * Loaded once per app load (the loader is mounted once in App.tsx and the answer
 * never goes stale: the settings card updates the store itself when it saves). It
 * has its own query function that answers null on any failure instead of
 * throwing, because the app-wide query cache turns a failed query into a red
 * "could not load" toast, and a missing time zone must never be visible to the
 * user: the store simply keeps Europe/Amsterdam.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { OFFICE_TIMEZONE_KEY } from "@shared/office-timezone";
import { setOfficeTimeZone } from "@/lib/office-timezone";

async function fetchOfficeTimeZoneSetting(): Promise<{ value?: unknown } | null> {
  try {
    const res = await fetch(`/api/app-settings/key/${OFFICE_TIMEZONE_KEY}`, { credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as { value?: unknown } | null;
  } catch {
    return null;
  }
}

export function OfficeTimeZoneLoader() {
  const { data } = useQuery<{ value?: unknown } | null>({
    queryKey: ["office-timezone-store"],
    queryFn: fetchOfficeTimeZoneSetting,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (data !== undefined) setOfficeTimeZone(data?.value);
  }, [data]);

  return null;
}
