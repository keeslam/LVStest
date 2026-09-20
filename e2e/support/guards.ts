import { test as base, expect, type Page } from "@playwright/test";

export interface Violation { kind: "http" | "console" | "pageerror" | "toast" | "boundary"; detail: string }
export interface WatchOptions {
  /** Responses that are expected here, e.g. 403 for a page this role may not use. */
  allow?: Array<{ url: RegExp; status: number; reason: string }>;
  /** Off where refused requests are the point of the test: Chrome logs each as a console error. */
  console?: boolean;
}

/** Known harmless console noise. Every entry needs a reason. */
export const CONSOLE_ALLOWLIST: Array<{ pattern: RegExp; reason: string }> = [];

const inflight = new WeakMap<Page, Map<string, number>>();

/**
 * Waits until no /api/ request has been in flight for 400 ms. (networkidle never settles with socket.io polling.)
 *
 * Precondition: request tracking for a page only starts once `watchPage()` or
 * `settle()` has run for it at least once — that first call is what installs
 * the `request`/`requestfinished`/`requestfailed` listeners. Call `watchPage()`
 * (or request the `health` fixture) before the first `page.goto()`, not after.
 */
export async function settle(page: Page, quietMs = 400, timeoutMs = 20_000): Promise<void> {
  await page.waitForLoadState("load");
  const open = trackRequests(page);
  const deadline = Date.now() + timeoutMs;
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    if (open.size > 0) quietSince = Date.now();
    if (Date.now() - quietSince >= quietMs) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`Page did not settle within ${timeoutMs} ms; still loading: ${[...open.keys()].join(", ")}`);
}

/** Counts in-flight /api/ requests per URL (not just a Set), so two concurrent identical requests don't cancel each other's "in flight" state out. */
function trackRequests(page: Page): Map<string, number> {
  let open = inflight.get(page);
  if (open) return open;
  open = new Map<string, number>();
  inflight.set(page, open);
  const key = (url: string) => url.replace(/^https?:\/\/[^/]+/, "");
  const start = (url: string) => {
    if (!url.includes("/api/")) return;
    const k = key(url);
    open!.set(k, (open!.get(k) ?? 0) + 1);
  };
  const finish = (url: string) => {
    const k = key(url);
    const count = open!.get(k);
    if (count === undefined) return;
    if (count <= 1) open!.delete(k);
    else open!.set(k, count - 1);
  };
  page.on("request", (request) => {
    // A full navigation (page.goto() to a different route, or a real link
    // click that reloads the document) tears down the current document;
    // Chromium does not reliably emit requestfinished or requestfailed for a
    // request that document started but that navigation superseded before it
    // completed. Left alone, that entry sits in `open` forever and wedges
    // every later settle() call on this same page (seen when a spec calls
    // page.goto() twice on one page, e.g. layer-a/forbidden.spec.ts visiting
    // "/" and then the page under test). The navigation *request* itself
    // (request.isNavigationRequest()) marks the moment the new document
    // starts loading; anything still open at that point belonged to the
    // document being replaced, so it is safe to drop.
    //
    // This must NOT fire for a same-document, client-side route change
    // (wouter's <Link>/pushState, e.g. clicking a sidebar link) — that never
    // tears down the page, so a genuinely stuck request from the page the
    // user is still on would otherwise go undetected. `framenavigated` was
    // tried first and rejected: it also fires for pushState navigation, so
    // it cleared state a same-document navigation should not have touched.
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) open!.clear();
    start(request.url());
  });
  page.on("requestfinished", (request) => finish(request.url()));
  page.on("requestfailed", (request) => finish(request.url()));
  return open;
}

const TOAST_BINDING = "__guardReportToast";
const toastBound = new WeakSet<Page>();
const toastSinks = new WeakMap<Page, (text: string) => void>();

/**
 * Runs in the browser (via addInitScript/evaluate, not closed over any Node
 * variable). Reports every `li.destructive` the moment it is added, or its
 * class/data-state changes, by text — through the exposed `__guardReportToast`
 * binding. Guards itself against being installed twice on the same document.
 */
function observeDestructiveToasts() {
  const w = window as unknown as {
    __guardReportToast?: (text: string) => void;
    __guardToastObserverInstalled?: boolean;
  };
  if (w.__guardToastObserverInstalled) return;
  w.__guardToastObserverInstalled = true;
  const scan = () => {
    document.querySelectorAll("li.destructive").forEach((element) => {
      // innerText (not textContent): must produce the same string check()'s
      // fallback reads via Playwright's .innerText(), or the same toast seen
      // through both paths dedupes as two different strings instead of one.
      const text = ((element as HTMLElement).innerText || "").replace(/\s+/g, " ").trim();
      if (text) w.__guardReportToast?.(text);
    });
  };
  const start = () => {
    new MutationObserver(scan).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-state"],
    });
    scan();
  };
  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}

/**
 * Wires up live capture of destructive toasts for this page. `check()`'s old
 * one-shot `[data-state="open"]` read is too late by itself: ToastProvider
 * auto-closes after 2500 ms (client/src/components/ui/toaster.tsx) and
 * TOAST_LIMIT=1 (client/src/hooks/use-toast.ts) can let a later toast replace
 * an earlier one before a test gets around to reading the DOM. A
 * MutationObserver — injected via addInitScript so it re-runs on every
 * navigation — reports each occurrence through an exposed Node binding
 * instead, the moment it happens.
 */
async function ensureLiveToastCapture(page: Page, onToast: (text: string) => void): Promise<void> {
  // The binding must survive re-registration attempts (e.g. watchPage() called
  // more than once for the same page) without throwing, so only expose it
  // once; the sink it forwards to is still updated to the latest caller.
  toastSinks.set(page, onToast);
  if (toastBound.has(page)) return;
  toastBound.add(page);
  await page.exposeFunction(TOAST_BINDING, (text: string) => toastSinks.get(page)?.(text));
  await page.addInitScript(observeDestructiveToasts);
  // watchPage() is normally called before the first page.goto(), but if the
  // page already has a document loaded, addInitScript alone would miss it —
  // install the same observer script once on the current document too.
  await page.evaluate(observeDestructiveToasts).catch(() => {
    // No usable document yet (e.g. a navigation is already in flight);
    // addInitScript above still covers the document that is about to load.
  });
}

export async function watchPage(page: Page, options: WatchOptions = {}) {
  const violations: Violation[] = [];
  const seenToasts = new Set<string>();
  const reportToast = (rawText: string) => {
    const text = rawText.replace(/\s+/g, " ").trim();
    if (!text || seenToasts.has(text)) return;
    seenToasts.add(text);
    violations.push({ kind: "toast", detail: text });
  };

  trackRequests(page);
  await ensureLiveToastCapture(page, reportToast);

  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/api/")) return;
    const status = response.status();
    if (options.allow?.some((entry) => entry.status === status && entry.url.test(url))) return;
    if (status >= 500 || status === 429) violations.push({ kind: "http", detail: `${status} ${response.request().method()} ${url}` });
  });
  if (options.console !== false) {
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (CONSOLE_ALLOWLIST.some((entry) => entry.pattern.test(text))) return;
      // Chrome logs every response >= 400 as its own console error, regardless
      // of what the page does with it — "Failed to load resource: the server
      // responded with a status of 403 ()". Suppress that line ONLY when it
      // belongs to a response `allow` already excused (matched by the failing
      // request's URL and status); anything else still counts, including an
      // unexpected 4xx on a page this role may use.
      const resourceError = /Failed to load resource: the server responded with a status of (\d+)/.exec(text);
      if (resourceError) {
        const status = Number(resourceError[1]);
        const url = message.location().url;
        if (options.allow?.some((entry) => entry.status === status && entry.url.test(url))) return;
      }
      violations.push({ kind: "console", detail: text });
    });
  }
  page.on("pageerror", (error) => violations.push({ kind: "pageerror", detail: error.message }));

  return {
    violations,
    /** Looks at what is on screen now; call after the page settled. Belt-and-braces on top of the live capture above — no `[data-state="open"]` filter, still deduped by text. */
    async check() {
      if (await page.getByText("Er ging iets mis op dit scherm").count()) violations.push({ kind: "boundary", detail: page.url() });
      // allInnerTexts() reads every current match in one pass. A per-index
      // `.nth(i).innerText()` loop re-queries the DOM live on each iteration;
      // ToastProvider auto-closes after 2500 ms and TOAST_LIMIT=1 can remove
      // an earlier toast between iterations, so a later index stops matching
      // anything and Playwright's auto-wait hangs until the test timeout
      // waiting for an element that will never (re)appear.
      const texts = await page.locator("li.destructive").allInnerTexts();
      for (const text of texts) reportToast(text);
    },
  };
}

/** `health` fails the test afterwards when anything went wrong on the page. */
export const test = base.extend<{ health: Awaited<ReturnType<typeof watchPage>> }>({
  health: async ({ page }, use) => {
    const watcher = await watchPage(page);
    await use(watcher);
    await watcher.check();
    expect(watcher.violations.map((v) => `${v.kind}: ${v.detail}`), "page health").toEqual([]);
  },
});
export { expect };
