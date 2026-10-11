/**
 * D11 — the office time zone reaches the client store from the app setting, and
 * keeps Europe/Amsterdam while nothing is stored or loaded.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { OfficeTimeZoneLoader } from "@/components/office-time-zone-loader";
import { getOfficeTimeZone, setOfficeTimeZone } from "@/lib/office-timezone";
import { officeDate } from "@/lib/office-date";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) } } })}>
    <OfficeTimeZoneLoader />
  </QueryClientProvider>,
);

describe("OfficeTimeZoneLoader", () => {
  beforeEach(() => setOfficeTimeZone("Europe/Amsterdam"));
  afterEach(() => { vi.unstubAllGlobals(); setOfficeTimeZone("Europe/Amsterdam"); });

  it("zet de opgeslagen zone in de client-opslag, zodat officeDate ermee rekent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ key: "office_timezone", value: "America/Curacao" })));
    mount();
    await waitFor(() => expect(getOfficeTimeZone()).toBe("America/Curacao"));
    expect(officeDate(new Date("2026-06-21T23:30:00Z"))).toBe("2026-06-21");
  });

  it("blijft op Europe/Amsterdam als er nog niets is opgeslagen", async () => {
    const fetchMock = vi.fn(async () => json(null));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(getOfficeTimeZone()).toBe("Europe/Amsterdam");
  });
});
