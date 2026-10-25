/**
 * Rapporten herontwerp deel 1b, Task 3: a report opens a record in a new tab at an address like
 * /vehicles?vehicle=7. The page reads the id once and takes the parameter off the address, so
 * closing the dialog, going back or reloading does not open it again.
 */
export function takeIdFromAddress(name: string): number | null {
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get(name);
    if (raw === null) return null;
    url.searchParams.delete(name);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
