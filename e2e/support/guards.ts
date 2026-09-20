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

const inflight = new WeakMap<Page, Set<string>>();

/** Waits until no /api/ request has been in flight for 400 ms. (networkidle never settles with socket.io polling.) */
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
  throw new Error(`Page did not settle within ${timeoutMs} ms; still loading: ${[...open].join(", ")}`);
}

function trackRequests(page: Page): Set<string> {
  let open = inflight.get(page);
  if (open) return open;
  open = new Set<string>();
  inflight.set(page, open);
  const key = (url: string) => url.replace(/^https?:\/\/[^/]+/, "");
  page.on("request", (request) => { if (request.url().includes("/api/")) open!.add(key(request.url())); });
  const done = (url: string) => open!.delete(key(url));
  page.on("requestfinished", (request) => done(request.url()));
  page.on("requestfailed", (request) => done(request.url()));
  return open;
}

export function watchPage(page: Page, options: WatchOptions = {}) {
  const violations: Violation[] = [];
  trackRequests(page);
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
      violations.push({ kind: "console", detail: text });
    });
  }
  page.on("pageerror", (error) => violations.push({ kind: "pageerror", detail: error.message }));
  return {
    violations,
    /** Looks at what is on screen now; call after the page settled. */
    async check() {
      if (await page.getByText("Er ging iets mis op dit scherm").count()) violations.push({ kind: "boundary", detail: page.url() });
      const toasts = page.locator('li.destructive[data-state="open"]');
      for (let index = 0; index < await toasts.count(); index++) {
        violations.push({ kind: "toast", detail: (await toasts.nth(index).innerText()).replace(/\s+/g, " ").trim() });
      }
    },
  };
}

/** `health` fails the test afterwards when anything went wrong on the page. */
export const test = base.extend<{ health: ReturnType<typeof watchPage> }>({
  health: async ({ page }, use) => {
    const watcher = watchPage(page);
    await use(watcher);
    await watcher.check();
    expect(watcher.violations.map((v) => `${v.kind}: ${v.detail}`), "page health").toEqual([]);
  },
});
export { expect };
