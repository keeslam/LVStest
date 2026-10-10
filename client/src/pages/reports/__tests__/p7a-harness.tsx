/**
 * Shared harness for the package P7a tests of /reports: an admin user, a fetch
 * that answers the list endpoints from a fixture, and a render helper. Not a
 * test file itself (no .test suffix).
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { getQueryFn } from "@/lib/queryClient";

export interface Fixture {
  vehicles?: any[];
  expenses?: any[];
  reservations?: any[];
  customers?: any[];
  transports?: any[];
  /** per path: a custom answer (object or function returning a Response) */
  extra?: Record<string, unknown>;
  /** delay in ms before /api/expenses answers, to see a loading state */
  delayExpenses?: number;
}

export const vehicle = (id: number, plate: string, brand = "Toyota", model = "Yaris") => ({
  id, licensePlate: plate, brand, model, vehicleType: "Sedan", apkDate: null, warrantyEndDate: null, gps: false,
});

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const daysFromNow = (n: number) => ymd(new Date(Date.now() + n * 86_400_000));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function installFetch(fixture: Fixture) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: any) => {
    const url = typeof input === "string" ? input : (input as Request)?.url ?? "";
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    calls.push(path);
    const bare = path.split("?")[0];
    if (fixture.extra && bare in fixture.extra) return json(fixture.extra[bare]);
    if (bare === "/api/vehicles") return json(fixture.vehicles ?? []);
    if (bare === "/api/expenses") {
      if (fixture.delayExpenses) await new Promise((r) => setTimeout(r, fixture.delayExpenses));
      return json(fixture.expenses ?? []);
    }
    if (bare === "/api/reservations") return json(fixture.reservations ?? []);
    if (bare === "/api/customers") return json(fixture.customers ?? []);
    if (bare === "/api/transports") return json(fixture.transports ?? []);
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

export function renderWithClient(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

/**
 * Makes the hidden print iframe of /reports observable: returns the HTML each
 * print() call was given. Call restore() when done.
 */
export function capturePrints() {
  const printed: string[] = [];
  const realCreate = document.createElement.bind(document);
  const spy = vi.spyOn(document, "createElement").mockImplementation(((tag: string, opts?: any) => {
    const el = realCreate(tag, opts);
    if (tag === "iframe") {
      Object.defineProperty(el, "contentWindow", {
        value: { print: () => printed.push((el as HTMLIFrameElement).contentDocument!.body.innerHTML), document: undefined },
      });
    }
    return el;
  }) as any);
  return { printed, restore: () => spy.mockRestore() };
}
