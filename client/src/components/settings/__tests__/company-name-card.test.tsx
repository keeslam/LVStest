/**
 * D15 (ontwerp 12) — Instellingen > Bedrijf > "Bedrijfsnaam": één naam voor alle mails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { getQueryFn } from "@/lib/queryClient";
import { CompanyNameCard } from "@/components/settings/company-name-card";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("CompanyNameCard", () => {
  let stored: string | null;
  let calls: Array<{ url: string; method: string; body: any }>;

  beforeEach(() => {
    stored = null;
    calls = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      if (url.endsWith("/api/app-settings/key/company_name")) return json(stored === null ? null : { key: "company_name", value: stored });
      if (url.endsWith("/api/app-settings") && method === "POST") { stored = body.value; return json({ key: body.key, value: body.value }); }
      return json({});
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const mount = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) } } })}>
      <CompanyNameCard />
      <Toaster />
    </QueryClientProvider>,
  );

  it("toont de standaardnaam zolang er niets is opgeslagen en legt uit waar de naam voor dient", async () => {
    mount();
    const input = (await screen.findByTestId("input-company-name")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("Autolease Lam"));
    expect(screen.getByText("Bedrijfsnaam", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByTestId("help-company-name").textContent?.toLowerCase()).toContain("mails");
  });

  it("toont de opgeslagen naam en slaat een nieuwe op als app-instelling company_name", async () => {
    stored = "Garage Voorbeeld";
    mount();
    const input = (await screen.findByTestId("input-company-name")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("Garage Voorbeeld"));
    await userEvent.clear(input);
    await userEvent.type(input, "Nieuwe Naam BV");
    await userEvent.click(screen.getByTestId("button-save-company-name"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ key: "company_name", value: "Nieuwe Naam BV", category: "business" });
  });

  it("laat een lege naam niet toe", async () => {
    mount();
    const input = (await screen.findByTestId("input-company-name")) as HTMLInputElement;
    await userEvent.clear(input);
    expect(screen.getByTestId("button-save-company-name")).toBeDisabled();
  });
});
