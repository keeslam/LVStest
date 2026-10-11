/**
 * D11: fills the office time zone store (lib/office-timezone.ts) from the
 * `office_timezone` app setting once a user is signed in. Renders nothing.
 * Saving the setting invalidates `/api/app-settings*`, which refetches this query,
 * so a change shows up without a reload. Until the answer arrives (or when the
 * row does not exist) the store keeps Europe/Amsterdam.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { OFFICE_TIMEZONE_KEY } from "@shared/office-timezone";
import { setOfficeTimeZone } from "@/lib/office-timezone";

export function OfficeTimeZoneLoader() {
  const { data } = useQuery<{ value?: unknown } | null>({
    queryKey: [`/api/app-settings/key/${OFFICE_TIMEZONE_KEY}`],
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (data !== undefined) setOfficeTimeZone(data?.value);
  }, [data]);

  return null;
}
