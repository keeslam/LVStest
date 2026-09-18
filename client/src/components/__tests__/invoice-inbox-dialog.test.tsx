import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { InvoiceInboxButton, inboxStatusRefetchInterval } from "@/components/expenses/invoice-inbox-dialog";

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

describe("InvoiceInboxButton", () => {
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
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/expenses");
  });

  const mount = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InvoiceInboxButton />
      <Toaster />
    </QueryClientProvider>,
  );

  const openInboxDialog = async () => {
    await userEvent.click(await screen.findByRole("button", { name: /Ontvangen facturen/ }));
  };

  it("shows a button with the number of invoices waiting, and nothing of the list until it is opened", async () => {
    mount();
    const button = await screen.findByRole("button", { name: /Ontvangen facturen/ });
    expect(await within(button).findByTestId("badge-invoice-inbox-review")).toHaveTextContent("1");
    expect(screen.queryByText("Garage Jansen")).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/api/expenses/inbox/items"))).toBe(false);
  });

  it("lists what waits for review, with the reason in Dutch and the count in the badge", async () => {
    mount();
    await openInboxDialog();
    const row = (await screen.findByText("Garage Jansen")).closest("tr")!;
    expect(within(row).getByText("Geen kenteken gevonden")).toBeInTheDocument();
    expect(within(row).getByText("facturen@garage.nl")).toBeInTheDocument();
    expect(within(row).getByText("2026-0412")).toBeInTheDocument();
    expect(screen.getByTestId("badge-invoice-inbox-review")).toHaveTextContent("1");
  });

  /** M7: the status poll used to keep hammering a route that answers 403. */
  it("stops polling the status once it has errored", () => {
    expect(inboxStatusRefetchInterval({ state: { status: "success" } } as any)).toBe(60_000);
    expect(inboxStatusRefetchInterval({ state: { status: "pending" } } as any)).toBe(60_000);
    expect(inboxStatusRefetchInterval({ state: { status: "error" } } as any)).toBe(false);
  });

  /**
   * M9: the label above the selector was not tied to it for a screen reader.
   * It must name the field *and* still say which vehicle is chosen — pointing
   * aria-labelledby at the label alone would have replaced the plate.
   */
  it("names the vehicle selector in the review dialog, without losing the chosen plate", async () => {
    reviewItems = [item({ vehicleId: 7 })];
    mount();
    await openInboxDialog();
    await userEvent.click(await screen.findByRole("button", { name: "Controleren" }));
    const dialog = (await screen.findByText("Factuur controleren")).closest('[role="dialog"]') as HTMLElement;
    const trigger = within(dialog).getByTestId("select-inbox-vehicle");
    expect(trigger).toHaveAccessibleName(/Voertuig/);
    expect(trigger).toHaveAccessibleName(/V-123-XB/);
  });

  it("opens the review dialog pre-filled, and will not book without a vehicle", async () => {
    mount();
    await openInboxDialog();
    await userEvent.click(await screen.findByRole("button", { name: "Controleren" }));
    const dialog = (await screen.findByText("Factuur controleren")).closest('[role="dialog"]') as HTMLElement;
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
    await openInboxDialog();
    await userEvent.click(await screen.findByRole("button", { name: "Controleren" }));
    const dialog = (await screen.findByText("Factuur controleren")).closest('[role="dialog"]') as HTMLElement;
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

  it("opens by itself when the page was reached through a notification", async () => {
    window.history.pushState({}, "", "/expenses?inbox=1");
    mount();
    expect(await screen.findByText("Garage Jansen")).toBeInTheDocument();
  });

  it("shows a translated toast, not the raw HTTP error, when booking fails", async () => {
    reviewItems = [item({ vehicleId: 7, reviewReason: "unknown_sender" })];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes("/api/expenses/inbox/status")) return json({ enabled: true, running: false, lastRun: null, scheduledMinutes: 15, reviewCount: reviewItems.length, geminiConfigured: true });
      if (url.includes("/api/expenses/inbox/items?status=review")) return json(reviewItems);
      if (url.includes("/api/expenses/inbox/items?status=")) return json([]);
      if (url.endsWith("/book")) return json({ message: "Deze factuur is al afgehandeld." }, 409);
      if (url.includes("/api/vehicles")) return json(vehicles);
      return json({}, 404);
    }));
    mount();
    await openInboxDialog();
    await userEvent.click(await screen.findByRole("button", { name: "Controleren" }));
    const dialog = (await screen.findByText("Factuur controleren")).closest('[role="dialog"]') as HTMLElement;
    await userEvent.click(within(dialog).getByTestId("checkbox-item-1"));
    const book = within(dialog).getByRole("button", { name: "Boeken" });
    await waitFor(() => expect(book).toBeEnabled());
    await userEvent.click(book);
    expect(await screen.findByText("Boeken mislukt")).toBeInTheDocument();
  });
});
