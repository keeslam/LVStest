/**
 * OPT-012 — the search bar: one request per pause, not three per keystroke.
 *
 * The measured behaviour was 21 API calls for a seven-character plate: three
 * parallel queries (vehicles, customers, reservations) on every keystroke, with
 * no debounce, while the vehicles page had had a 300 ms one all along.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useDebouncedValue, DEFAULT_DEBOUNCE_MS } from "@/hooks/use-debounced-value";

/**
 * A stand-in for the header search: the same hook, the same three queries, the
 * same `enabled` rule — without MainLayout's sidebar, auth and router.
 */
function SearchProbe() {
  const [term, setTerm] = useState("");
  const debounced = useDebouncedValue(term, DEFAULT_DEBOUNCE_MS);

  const search = (path: string) =>
    useQuery({
      queryKey: [path, "search", debounced],
      queryFn: async () => {
        const response = await fetch(`${path}?search=${encodeURIComponent(debounced)}`);
        return response.json();
      },
      enabled: debounced.length >= 2,
    });

  /* eslint-disable react-hooks/rules-of-hooks -- fixed call order, three of them */
  search("/api/vehicles");
  search("/api/customers");
  search("/api/reservations");
  /* eslint-enable react-hooks/rules-of-hooks */

  return (
    <input aria-label="zoek" value={term} onChange={(e) => setTerm(e.target.value)} />
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

function withClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OPT-012 — de zoekbalk vuurt niet per toetsaanslag", () => {
  it("types eight characters and still asks the server once per endpoint", () => {
    withClient(<SearchProbe />);
    const input = screen.getByLabelText("zoek") as HTMLInputElement;

    const plate = "12XT1023";
    for (let i = 1; i <= plate.length; i += 1) {
      act(() => {
        // Not userEvent: that one advances timers itself, which is exactly what
        // must not happen between keystrokes here.
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
        setter.call(input, plate.slice(0, i));
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    // Nothing yet: the employee is still typing.
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS); });

    // Three endpoints, once each — the measured 21 calls become 3.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith("/api/vehicles?search=12XT1023"))).toBe(true);
    expect(urls.some((u) => u.startsWith("/api/customers?search=12XT1023"))).toBe(true);
    expect(urls.some((u) => u.startsWith("/api/reservations?search=12XT1023"))).toBe(true);
  });

  it("asks nothing at all for a single character", () => {
    withClient(<SearchProbe />);
    const input = screen.getByLabelText("zoek") as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "1");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS * 2);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a pause mid-word does produce a request, and the next pause another", () => {
    withClient(<SearchProbe />);
    const input = screen.getByLabelText("zoek") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;

    act(() => {
      setter.call(input, "12XT");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    act(() => {
      setter.call(input, "12XT1023");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

describe("OPT-012 — de zoekbalk spreekt Nederlands", () => {
  it("has a Dutch string for every line the dropdown renders", async () => {
    const nl = (await import("@/locales/nl/nav.json")).default as any;
    // The two hardcoded English strings the report names ("No results found
    // for …"), plus the three that were found next to them while translating.
    expect(nl.search.noResultsFor).toBe('Geen resultaten gevonden voor "{{query}}"');
    expect(nl.search.maintenanceBadge).toBe("Onderhoud");
    expect(nl.search.unknownCustomer).toBe("Onbekende klant");
    expect(nl.search.openEnded).toBe("open einde");
    expect(nl.search.contractNumberLabel).toContain("Contractnr.");
  });

  it("leaves no English literal behind in the search bar", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/layouts/MainLayout.tsx"),
      "utf8",
    );
    expect(source).not.toContain('No results found for');
    expect(source).not.toContain('"Unknown Customer"');
    expect(source).not.toContain('|| "Maintenance"');
  });
});
