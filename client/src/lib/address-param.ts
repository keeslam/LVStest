/**
 * Rapporten herontwerp deel 1b, Task 3: a report opens a record in a new tab at an address like
 * /vehicles?vehicle=7. The page reads the parameter once and takes it off the address, so
 * closing the dialog, going back or reloading does not open it again.
 */

/** The value of `?name=`, taken off the address; null when it is not there. */
export function takeParamFromAddress(name: string): string | null {
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get(name);
    if (raw === null) return null;
    url.searchParams.delete(name);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    return raw;
  } catch {
    return null;
  }
}

/** A positive whole-number id from `?name=<id>`, taken off the address; null when missing or broken. */
export function takeIdFromAddress(name: string): number | null {
  const raw = takeParamFromAddress(name);
  if (raw === null) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
