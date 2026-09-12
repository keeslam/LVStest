/**
 * OPT-012 — the debounce the vehicles page already had (300 ms) and the global
 * search bar did not.
 *
 * The header search fired three parallel queries — vehicles, customers,
 * reservations — on every keystroke, without debounce: a seven-character
 * license plate cost 21 API calls (measured, workflow report §7 OPT-012). This
 * is the same `setTimeout`/`clearTimeout` pattern, in one place, so the next
 * search box does not have to reinvent it.
 */
import { useEffect, useState } from "react";

export const DEFAULT_DEBOUNCE_MS = 300;

export function useDebouncedValue<T>(value: T, delayMs: number = DEFAULT_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
