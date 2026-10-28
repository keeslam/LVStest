/**
 * Lease offertes list and settings tab: rows with the derived Verlopen badge, the copy question
 * (Ja / Nee / Annuleren) and the settings form that reads Dutch numbers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));
vi.mock("@/components/recycle-bin/recycle-bin-dialog", () => ({ RecycleBinDialog: () => null }));

import { QuoteList } from "@/pages/lease-quotes/quote-list";
import { QuoteSettings } from "@/pages/lease-quotes/quote-settings";

const ROWS = [
  { id: 1, quoteNumber: "LO-2026-0001", quoteDate: "2026-10-01", validUntil: "2026-10-31", status: "sent", displayStatus: "sent", customerName: "Jansen BV", vehicle: "Audi A3 Sportback", licensePlate: "AB-123-C", monthlyPrice: 466.23 },
  { id: 2, quoteNumber: "LO-2026-0002", quoteDate: "2026-08-01", validUntil: "2026-08-31", status: "sent", displayStatus: "expired", customerName: "Pietersen", vehicle: "VW Golf", licensePlate: null, monthlyPrice: 380 },
];

const calls: Array<{ method: string; path: string; body: unknown }> = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url, "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, path: url.pathname + url.search, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.pathname === "/api/lease-quotes" && method === "GET") return json({ rows: ROWS, total: ROWS.length });
    if (url.pathname === "/api/lease-quotes/settings") {
      return json({ interestRatePercent: 9, marginPerMonth: 0, robPerYear: 275, otherCostsPerYear: 350, excessKmPrice: 0.1, shortfallKmPrice: 0.05, validityDays: 30 });
    }
    if (url.pathname.endsWith("/pdf") && method === "POST") return json({ message: "No template", code: "LEASE_NO_TEMPLATE" }, 409);
    if (url.pathname.endsWith("/copy")) return json({ id: 3, quoteNumber: "LO-2026-0003" }, 201);
    if (method === "DELETE") return json({ ok: true, quoteNumber: "LO-2026-0001" });
    return json({});
  }));
});

function renderWith(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(<QueryClientProvider client={client}>{ui}<Toaster /></QueryClientProvider>);
}

describe("QuoteList PDF errors", () => {
  it("LEASE_NO_TEMPLATE shows the same Dutch sentence as the editor", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    renderWith(<QuoteList onOpenQuote={() => {}} />);
    await userEvent.click(await screen.findByTestId("button-pdf-lease-quote-1"));
    expect(await screen.findByText("Er is nog geen PDF-sjabloon voor lease offertes. Maak er een bij Documenten.")).toBeInTheDocument();
  });
});

describe("QuoteList", () => {
  it("shows the rows with Dutch amounts and the Verlopen badge from displayStatus", async () => {
    renderWith(<QuoteList onOpenQuote={() => {}} />);
    expect(await screen.findByText("LO-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("Jansen BV")).toBeInTheDocument();
    expect(screen.getByText(/466,23/)).toBeInTheDocument();
    expect(screen.getByText("01-10-2026")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-lease-quote-1")).getByText("Verstuurd")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-lease-quote-2")).getByText("Verlopen")).toBeInTheDocument();
  });

  it("opens a quote on row click", async () => {
    const onOpenQuote = vi.fn();
    renderWith(<QuoteList onOpenQuote={onOpenQuote} />);
    await userEvent.click(await screen.findByText("Jansen BV"));
    expect(onOpenQuote).toHaveBeenCalledWith(1);
  });

  async function openCopyDialog() {
    const onOpenQuote = vi.fn();
    renderWith(<QuoteList onOpenQuote={onOpenQuote} />);
    await userEvent.click(await screen.findByTestId("button-copy-lease-quote-1"));
    expect(await screen.findByText("Bijlagen (dealerofferte) ook kopiëren?")).toBeInTheDocument();
    return onOpenQuote;
  }

  it("copy with Ja sends withAttachments true and opens the new quote", async () => {
    const onOpenQuote = await openCopyDialog();
    await userEvent.click(screen.getByTestId("button-copy-yes"));
    await waitFor(() => expect(calls.find((c) => c.path === "/api/lease-quotes/1/copy")?.body).toEqual({ withAttachments: true }));
    await waitFor(() => expect(onOpenQuote).toHaveBeenCalledWith(3));
  });

  it("copy with Nee sends withAttachments false", async () => {
    await openCopyDialog();
    await userEvent.click(screen.getByTestId("button-copy-no"));
    await waitFor(() => expect(calls.find((c) => c.path === "/api/lease-quotes/1/copy")?.body).toEqual({ withAttachments: false }));
  });

  it("copy with Annuleren sends nothing", async () => {
    await openCopyDialog();
    await userEvent.click(screen.getByTestId("button-copy-cancel"));
    expect(calls.some((c) => c.path.endsWith("/copy"))).toBe(false);
  });

  it("delete asks for confirmation, then says the quote is in the prullenbak", async () => {
    renderWith(<QuoteList onOpenQuote={() => {}} />);
    await userEvent.click(await screen.findByTestId("button-delete-lease-quote-1"));
    await userEvent.click(await screen.findByTestId("button-confirm-delete-lease-quote"));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/lease-quotes/1")).toBe(true));
    expect(await screen.findByText("Offerte LO-2026-0001 staat in de prullenbak.")).toBeInTheDocument();
  });

  it("sends the status filter and search to the server", async () => {
    renderWith(<QuoteList onOpenQuote={() => {}} />);
    await screen.findByText("LO-2026-0001");
    await userEvent.type(screen.getByTestId("input-search-lease-quotes"), "Jansen");
    await waitFor(() => expect(calls.some((c) => c.path.includes("search=Jansen"))).toBe(true));
  });
});

describe("QuoteList sorting", () => {
  it("clicking a header sends sort and dir, flips on the second click and goes back to page 1", async () => {
    renderWith(<QuoteList onOpenQuote={() => {}} />);
    await screen.findByText("LO-2026-0001");
    expect(calls.some((c) => c.path.includes("sort=quoteDate") && c.path.includes("dir=desc") && c.path.includes("page=1"))).toBe(true);
    await userEvent.click(screen.getByTestId("sort-lease-quotes-monthlyPrice"));
    await waitFor(() => expect(calls.some((c) => c.path.includes("sort=monthlyPrice") && c.path.includes("dir=asc") && c.path.includes("page=1"))).toBe(true));
    await userEvent.click(screen.getByTestId("sort-lease-quotes-monthlyPrice"));
    await waitFor(() => expect(calls.some((c) => c.path.includes("sort=monthlyPrice") && c.path.includes("dir=desc"))).toBe(true));
  });
});

describe("QuoteSettings", () => {
  it("sends interestRatePercent 9.5 when 9,5 is typed", async () => {
    renderWith(<QuoteSettings />);
    const field = await screen.findByTestId("input-interestRatePercent");
    await waitFor(() => expect(field).toHaveValue("9"));
    await userEvent.clear(field);
    await userEvent.type(field, "9,5");
    await userEvent.click(screen.getByTestId("button-save-lease-settings"));
    await waitFor(() => {
      const put = calls.find((c) => c.method === "PUT" && c.path === "/api/lease-quotes/settings");
      expect(put?.body).toMatchObject({ interestRatePercent: 9.5, robPerYear: 275, validityDays: 30 });
    });
    expect(screen.getByText("Geldt voor nieuwe offertes; bestaande offertes houden hun eigen waarden.")).toBeInTheDocument();
  });

  it("does not save a value it cannot read", async () => {
    renderWith(<QuoteSettings />);
    const field = await screen.findByTestId("input-robPerYear");
    await waitFor(() => expect(field).toHaveValue("275"));
    await userEvent.clear(field);
    await userEvent.type(field, "abc");
    await userEvent.click(screen.getByTestId("button-save-lease-settings"));
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });
});
