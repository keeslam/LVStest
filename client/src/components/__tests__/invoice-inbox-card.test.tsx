import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvoiceInboxCard } from "@/components/expenses/invoice-inbox-card";

const item = (over: Record<string, unknown> = {}) => ({
  id: 12, messageId: "<a@b>", fromAddress: "facturen@garage.nl", subject: "Factuur 2026-0412", mailDate: "2026-09-10T08:00:00.000Z",
  attachmentName: "factuur.pdf", attachmentPath: "invoice-inbox/1_abcd1234_factuur.pdf", attachmentHash: "h", attachmentContentType: "application/pdf",
  invoiceHash: "i", status: "review", reviewReason: "no_plate", vehicleId: null, expenseIds: [], errorMessage: null, note: null,
  receivedAt: "2026-09-10T08:05:00.000Z", processedAt: null, createdBy: "scheduler", updatedBy: null, vehiclePlate: null,
  parsed: {
    vendor: "Garage Jansen", invoiceNumber: "2026-0412", invoiceDate: "2026-09-10", currency: "EUR", totalAmount: 181.5, plates: [],
    lineItems: [{ description: "Grote beurt", amount: 100, category: "Maintenance" }, { description: "Remblokken", amount: 50, category: "Brakes" }],
  },
  ...over,
});
const vehicles = [{ id: 7, licensePlate: "V-123-XB", brand: "Volkswagen", model: "Crafter" }];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("InvoiceInboxCard", () => {
  let reviewItems: unknown[];
  let calls: Array<{ url: string; method: string; body: any }>;

  beforeEach(() => {
    reviewItems = [item()];
    calls = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes("/api/expenses/inbox/status")) return json({ enabled: true, running: false, lastRun: null, scheduledMinutes: 15, reviewCount: reviewItems.length, geminiConfigured: true });
      if (url.includes("/api/expenses/inbox/items?status=review")) return json(reviewItems);
      if (url.includes("/api/expenses/inbox/items?status=")) return json([]);
      if (url.endsWith("/book")) return json({ item: item({ status: "booked" }), expenses: [{ id: 1 }] });
      if (url.includes("/api/vehicles")) return json(vehicles);
      return json({}, 404);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const mount = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InvoiceInboxCard />
    </QueryClientProvider>,
  );

  it("lists what waits for review, with the reason in Dutch and the count in the badge", async () => {
    mount();
    expect(await screen.findByText("Ontvangen facturen")).toBeInTheDocument();
    const row = (await screen.findByText("Garage Jansen")).closest("tr")!;
    expect(within(row).getByText("Geen kenteken gevonden")).toBeInTheDocument();
    expect(within(row).getByText("facturen@garage.nl")).toBeInTheDocument();
    expect(within(row).getByText("2026-0412")).toBeInTheDocument();
    expect(screen.getByTestId("badge-invoice-inbox-review")).toHaveTextContent("1");
  });

  it("opens the review dialog pre-filled, and will not book without a vehicle", async () => {
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Controleren" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Factuur controleren")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Leverancier")).toHaveValue("Garage Jansen");
    expect(within(dialog).getByLabelText("Factuurnummer")).toHaveValue("2026-0412");
    expect(within(dialog).getByLabelText("Factuurdatum")).toHaveValue("2026-09-10");
    expect(within(dialog).getByTestId("input-description-1")).toHaveValue("Remblokken");
    expect(within(dialog).getByRole("button", { name: "Boeken" })).toBeDisabled();
  });

  it("books the ticked lines on the pre-filled vehicle", async () => {
    reviewItems = [item({ vehicleId: 7, reviewReason: "unknown_sender" })];
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Controleren" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByTestId("checkbox-item-1"));
    const book = within(dialog).getByRole("button", { name: "Boeken" });
    await waitFor(() => expect(book).toBeEnabled());
    await userEvent.click(book);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/expenses/inbox/items/12/book"))).toBe(true));
    expect(calls.find((c) => c.url.endsWith("/book"))!.body).toEqual({
      vehicleId: 7,
      invoice: { vendor: "Garage Jansen", invoiceNumber: "2026-0412", invoiceDate: "2026-09-10" },
      lineItems: [{ description: "Grote beurt", amount: 100, category: "Maintenance" }],
      groupByCategory: true,
    });
  });
});
