/**
 * D11 (ontwerp 7.1) — Instellingen > "Tijdzone van het kantoor".
 *
 * A select with the European zones plus a search field, the current offset and
 * whether daylight saving time is active, and a save button that stores the
 * `office_timezone` app setting. The zone that is stored always stays in the
 * list, also when it is not a European one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { getQueryFn } from "@/lib/queryClient";
import { OfficeTimeZoneCard } from "@/components/settings/office-timezone-card";
import { getOfficeTimeZone, setOfficeTimeZone } from "@/lib/office-timezone";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("OfficeTimeZoneCard", () => {
  let stored: string | null;
  let calls: Array<{ url: string; method: string; body: any }>;

  beforeEach(() => {
    stored = null;
    calls = [];
    setOfficeTimeZone("Europe/Amsterdam");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      if (url.endsWith("/api/app-settings/key/office_timezone")) return json(stored === null ? null : { key: "office_timezone", value: stored });
      if (url.endsWith("/api/app-settings") && method === "POST") { stored = body.value; return json({ key: body.key, value: body.value }); }
      return json({});
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); setOfficeTimeZone("Europe/Amsterdam"); });

  const mount = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) } } })}>
      <OfficeTimeZoneCard />
      <Toaster />
    </QueryClientProvider>,
  );

  it("toont Europe/Amsterdam met het huidige verschil en of zomertijd actief is", async () => {
    mount();
    const select = (await screen.findByTestId("select-office-timezone")) as HTMLSelectElement;
    expect(select.value).toBe("Europe/Amsterdam");
    expect(screen.getByTestId("office-timezone-offset").textContent).toMatch(/UTC\+0[12]:00/);
    expect(screen.getByTestId("office-timezone-dst").textContent).toMatch(/zomertijd|wintertijd/i);
    expect(screen.getByText("Tijdzone van het kantoor")).toBeInTheDocument();
  });

  it("biedt alleen Europese zones aan en filtert ze met het zoekveld", async () => {
    mount();
    const select = (await screen.findByTestId("select-office-timezone")) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("Europe/London");
    expect(values.every((v) => v.startsWith("Europe/"))).toBe(true);

    await userEvent.type(screen.getByTestId("input-office-timezone-search"), "lond");
    // The zone that is selected stays in the list (a select cannot show a value that is not an option).
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["Europe/Amsterdam", "Europe/London"]);
  });

  it("slaat de gekozen zone op als app-instelling office_timezone en past de client meteen aan", async () => {
    mount();
    const select = await screen.findByTestId("select-office-timezone");
    await userEvent.selectOptions(select, "Europe/London");
    await userEvent.click(screen.getByTestId("button-save-office-timezone"));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toMatch(/\/api\/app-settings$/);
    expect(post.body).toMatchObject({ key: "office_timezone", value: "Europe/London", category: "business" });
    await waitFor(() => expect(getOfficeTimeZone()).toBe("Europe/London"));
  });

  it("vertaalt de foutcode INVALID_OFFICE_TIMEZONE in een Nederlandse zin (niet de Engelse servertekst)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/app-settings") && (init?.method ?? "GET") === "POST") {
        return new Response(JSON.stringify({ message: "That is not a time zone", code: "INVALID_OFFICE_TIMEZONE" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      return json(null);
    }));
    mount();
    await userEvent.selectOptions(await screen.findByTestId("select-office-timezone"), "Europe/London");
    await userEvent.click(screen.getByTestId("button-save-office-timezone"));
    expect(await screen.findByText("Dit is geen tijdzone die de app kent.")).toBeInTheDocument();
    expect(screen.queryByText(/That is not a time zone/)).not.toBeInTheDocument();
  });

  it("houdt een opgeslagen zone buiten Europa in de lijst en selecteert hem", async () => {
    stored = "America/Curacao";
    mount();
    const select = (await screen.findByTestId("select-office-timezone")) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("America/Curacao"));
    expect(screen.getByTestId("office-timezone-offset").textContent).toContain("UTC-04:00");
    expect(screen.getByTestId("office-timezone-dst").textContent).toMatch(/geen zomertijd/i);
  });
});
