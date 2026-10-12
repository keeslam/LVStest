import { useCallback, useEffect, useRef, useState } from "react";
import { normalizePostcode, type AddressLookupQuery, type AddressLookupResult } from "@shared/address";

export type AddressLookupStatus = "idle" | "loading" | "found" | "partial" | "notfound" | "unavailable";

/**
 * Postcode + house number -> street and city, for any address form (customer portal, staff customer form,
 * and later wherever an address is typed). The form calls `trigger(...)` from the onChange of the postcode,
 * house number and addition fields; this waits until both are complete and the user paused typing, asks
 * `fetcher`, and hands the answer to `onFound`. Only the answer to the latest input counts, and nothing
 * runs on load, so opening a form never rewrites a stored address.
 *
 * `fetcher` is passed in because the staff app and the portal sit behind different sessions.
 */
export function useAddressAutofill(
  fetcher: (query: AddressLookupQuery) => Promise<AddressLookupResult>,
  onFound: (result: AddressLookupResult, query: AddressLookupQuery) => void,
  delayMs = 400,
) {
  const [status, setStatus] = useState<AddressLookupStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef(0);
  const fetcherRef = useRef(fetcher);
  const onFoundRef = useRef(onFound);
  fetcherRef.current = fetcher;
  onFoundRef.current = onFound;

  const reset = useCallback(() => {
    latest.current += 1;
    clearTimeout(timer.current);
    setStatus("idle");
  }, []);

  const trigger = useCallback((input: { postcode: string; number: string; addition?: string }) => {
    clearTimeout(timer.current);
    const id = ++latest.current;
    const postcode = normalizePostcode(input.postcode);
    const number = input.number.trim();
    if (!postcode || !/^\d{1,5}$/.test(number)) { setStatus("idle"); return; }
    setStatus("loading");
    const query: AddressLookupQuery = { postcode, number, addition: (input.addition ?? "").trim() };
    timer.current = setTimeout(async () => {
      try {
        const result = await fetcherRef.current(query);
        if (id !== latest.current) return;
        if (!result.found) { setStatus("notfound"); return; }
        onFoundRef.current(result, query);
        setStatus(result.exact ? "found" : "partial");
      } catch {
        if (id === latest.current) setStatus("unavailable");
      }
    }, delayMs);
  }, [delayMs]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return { status, trigger, reset };
}
