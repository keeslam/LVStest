import { useCallback, useState } from "react";

const DISMISS_PREFIXES = ["dismissed_apk_", "dismissed_warranty_"];
const EXPIRY_DAYS = 7;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Reads all locally-dismissed-notification timestamps from localStorage,
// dropping (and evicting) any older than EXPIRY_DAYS so a dismissal doesn't
// hide a vehicle's APK/warranty warning forever.
function readDismissedTimestamps(): Record<string, number> {
  const now = Date.now();
  const result: Record<string, number> = {};
  const expired: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !DISMISS_PREFIXES.some((p) => key.startsWith(p))) continue;

    const raw = localStorage.getItem(key);
    const timestamp = raw ? parseInt(raw, 10) : NaN;
    if (isNaN(timestamp)) continue;

    if ((now - timestamp) / MS_PER_DAY > EXPIRY_DAYS) {
      expired.push(key);
    } else {
      result[key] = timestamp;
    }
  }

  expired.forEach((key) => localStorage.removeItem(key));
  return result;
}

// Dismissing an APK/warranty notification card is purely client-local (the
// server has no concept of it), so it can't be observed by invalidating a
// react-query cache - that query's data never actually changes. Tracking the
// dismissed set in real React state (instead of only localStorage) is what
// makes the dismiss button's effect show up immediately, rather than only
// after some unrelated re-render (e.g. switching tabs) happened to pick up
// the localStorage write.
export function useDismissedNotifications() {
  const [timestamps, setTimestamps] = useState<Record<string, number>>(readDismissedTimestamps);

  const isDismissed = useCallback(
    (key: string) => key in timestamps,
    [timestamps]
  );

  const dismiss = useCallback((key: string) => {
    const now = Date.now();
    localStorage.setItem(key, now.toString());
    setTimestamps((prev) => ({ ...prev, [key]: now }));
  }, []);

  return { isDismissed, dismiss };
}
