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

  it("haalt de instelling één keer op, ook als de lader opnieuw wordt gemount", async () => {
    const fetchMock = vi.fn(async () => json({ key: "office_timezone", value: "America/Curacao" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient();
    const tree = () => (
      <QueryClientProvider client={client}>
        <OfficeTimeZoneLoader />
      </QueryClientProvider>
    );
    const first = render(tree());
    await waitFor(() => expect(getOfficeTimeZone()).toBe("America/Curacao"));
    first.unmount();
    render(tree());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("een mislukte aanvraag geeft geen fout (geen rode melding) en laat Europe/Amsterdam staan", async () => {
    for (const failing of [
      vi.fn(async () => new Response("{}", { status: 500 })),
      vi.fn(async () => { throw new Error("netwerk"); }),
    ]) {
      vi.stubGlobal("fetch", failing);
      const client = new QueryClient();
      const view = render(
        <QueryClientProvider client={client}>
          <OfficeTimeZoneLoader />
        </QueryClientProvider>,
      );
      await waitFor(() => expect(failing).toHaveBeenCalled());
      await waitFor(() => expect(client.getQueryState(["office-timezone-store"])?.status).toBe("success"));
      expect(getOfficeTimeZone()).toBe("Europe/Amsterdam");
      view.unmount();
    }
  });

  it("blijft op Europe/Amsterdam als er nog niets is opgeslagen", async () => {
    const fetchMock = vi.fn(async () => json(null));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(getOfficeTimeZone()).toBe("Europe/Amsterdam");
  });
});
