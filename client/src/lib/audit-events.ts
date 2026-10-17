/**
 * The activity log's view of what happens in the browser.
 *
 * The server logs every file it serves (server/middleware/audit.ts
 * TRACKED_READS), but two things never reach it: a print the browser does from
 * a preview it already loaded, and a label, barcode book or report the client
 * renders itself. These helpers report those, so "who printed the contract"
 * and "who exported the fines" have an answer.
 *
 * Reporting is fire-and-forget: a failed report must never stop the print or
 * the download, and the server's row is written from its own session, never
 * from anything the browser claims about the user.
 */

export type ClientAuditAction = "label.print" | "barcode-book.print" | "report.print" | "report.export";

/** `/api/documents/view/12` -> `/api/documents/view/12?intent=print`: the server logs that request as a print. */
export function withPrintIntent(url: string): string {
  return url.includes("?") ? `${url}&intent=print` : `${url}?intent=print`;
}

async function post(body: Record<string, unknown>): Promise<void> {
  try {
    if (typeof fetch !== "function") return;
    // Loaded on demand so this module stays importable in the plain-node tests
    // of the CSV writer, which has no query client around it.
    const { apiRequest } = await import("./queryClient");
    await apiRequest("POST", "/api/audit-events", body);
  } catch {
    // Deliberately silent: see the module comment.
  }
}

/** A file the browser printed from a preview it already had, by the URL that preview loaded. */
export function reportPrinted(url: string): void {
  const path = url.split("?")[0];
  if (!path.startsWith("/api/")) return;
  void post({ printedUrl: path });
}

/** Something the client rendered and printed or exported itself. */
export function reportClientAction(
  action: ClientAuditAction,
  input: { resourceType?: string; resourceId?: number; details?: Record<string, unknown> } = {},
): void {
  void post({ action, ...input });
}

/* ------------------------------------------------------------------------ */
/* Screens and dialogs                                                       */
/* ------------------------------------------------------------------------ */

export type UiEventKind = "screen" | "dialog";

interface UiEvent {
  kind: UiEventKind;
  name: string;
  path: string;
  at: string;
}

/** Oldest unsent events; one request carries up to this many. */
const UI_BATCH_MAX = 40;
/** How long events wait so a burst of dialogs becomes one request. */
const UI_FLUSH_MS = 4000;
/** The same screen or dialog twice within this window counts once (StrictMode, re-renders). */
const UI_DEDUPE_MS = 1500;

let uiQueue: UiEvent[] = [];
let uiTimer: ReturnType<typeof setTimeout> | null = null;
let lastUiKey = "";
let lastUiAt = 0;
let uiListenersInstalled = false;

function currentPath(): string {
  return typeof window === "undefined" ? "" : window.location.pathname;
}

/** The customer portal and the login page are not staff activity. */
function uiTrackingEnabled(): boolean {
  const path = currentPath();
  return !!path && !path.startsWith("/portaal") && path !== "/auth";
}

async function flushUiQueue(useBeacon = false): Promise<void> {
  if (uiQueue.length === 0) return;
  const events = uiQueue.splice(0, UI_BATCH_MAX);
  if (uiTimer && uiQueue.length === 0) {
    clearTimeout(uiTimer);
    uiTimer = null;
  }
  try {
    if (typeof fetch !== "function") return;
    const { apiRequest, getCsrfToken } = await import("./queryClient");
    if (useBeacon) {
      // The page is going away: a keepalive request outlives it, the normal
      // request would be cancelled.
      const token = getCsrfToken();
      await fetch("/api/audit-events", {
        method: "POST",
        keepalive: true,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { "X-CSRF-Token": token } : {}) },
        body: JSON.stringify({ events }),
      });
    } else {
      await apiRequest("POST", "/api/audit-events", { events });
    }
  } catch {
    // Silent, like the rest of this module.
  }
  if (uiQueue.length > 0) scheduleUiFlush();
}

function scheduleUiFlush(): void {
  if (uiTimer) return;
  uiTimer = setTimeout(() => {
    uiTimer = null;
    void flushUiQueue();
  }, UI_FLUSH_MS);
}

function installUiListeners(): void {
  if (uiListenersInstalled || typeof document === "undefined") return;
  uiListenersInstalled = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushUiQueue(true);
  });
  window.addEventListener("pagehide", () => { void flushUiQueue(true); });
}

/**
 * A screen (route) or dialog the employee opened. Batched: the activity log
 * gets one `screen.open` / `dialog.open` row per event, under "Schermen en
 * vensters", never mixed into the default view of changes.
 */
export function trackUi(kind: UiEventKind, name: string): void {
  if (!uiTrackingEnabled()) return;
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!clean) return;
  const now = Date.now();
  const key = `${kind}:${clean}`;
  if (key === lastUiKey && now - lastUiAt < UI_DEDUPE_MS) return;
  lastUiKey = key;
  lastUiAt = now;
  installUiListeners();
  uiQueue.push({ kind, name: clean, path: currentPath(), at: new Date(now).toISOString() });
  if (uiQueue.length >= UI_BATCH_MAX) void flushUiQueue();
  else scheduleUiFlush();
}

/**
 * Names a dialog by what the employee reads: its title. Falls back to the
 * aria-label, then the test id, so a dialog without a heading still has a name.
 */
export function dialogNameFrom(content: HTMLElement | null): string {
  if (!content) return "";
  const labelledBy = content.getAttribute("aria-labelledby");
  const title = (labelledBy && content.ownerDocument.getElementById(labelledBy)) || content.querySelector("h2, h1, h3");
  const text = title?.textContent?.trim();
  if (text) return text;
  return content.getAttribute("aria-label") || content.getAttribute("data-testid") || "";
}
