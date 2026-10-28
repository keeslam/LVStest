/**
 * Lease offertes editor: the lease price follows the typing (Excel case), exactly one variant
 * goes to the customer, a sent quote asks before it is changed, and the dealer scan only
 * writes what the user ticked.
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

import { QuoteEditor } from "@/pages/lease-quotes/quote-editor";

/** What a new quote's first variant gets from the settings (insurance and road tax stay empty). */
const settingsCosts = {
  interestRatePercent: 9, robPerYear: 275, otherCostsPerYear: 350, insurancePerMonth: null, roadTaxPerMonth: null, marginPerMonth: 0,
  excessKmPrice: 0.1, shortfallKmPrice: 0.05,
};

function baseQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: 7, quoteNumber: "LO-2026-0007", status: "concept", quoteDate: "2026-10-28", validUntil: "2026-11-27",
    customerId: null, customerName: null, prospectName: "Jansen", prospectCompany: null, prospectEmail: null, prospectPhone: null,
    vehicleMake: null, vehicleModel: null, vehicleTrim: null, licensePlate: null, dealerName: null, deliveryTime: null, vehicleNotes: null,
    purchasePrice: null, priceBreakdown: null,
    internalNotes: null,
    variants: [{ id: 1, position: 0, termMonths: 48, kmPerYear: 20000, residualValue: 0, isChosen: true, totalPerMonth: null, ...settingsCosts }],
    files: [],
    ...overrides,
  };
}

let quote = baseQuote();
let scanResponse: { status: number; body: unknown } = { status: 200, body: {} };
const calls: Array<{ method: string; path: string; body: unknown }> = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  calls.length = 0;
  quote = baseQuote();
  scanResponse = { status: 200, body: {} };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url, "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : init?.body;
    calls.push({ method, path: url.pathname, body });
    if (url.pathname === "/api/lease-quotes/7" && method === "GET") return json(quote);
    if (url.pathname === "/api/lease-quotes/7" && method === "PATCH") return json({ ...quote, ...(body as object), variants: (body as any).variants.map((v: any, i: number) => ({ ...v, id: i + 1, position: i, totalPerMonth: null })) });
    if (url.pathname === "/api/lease-quotes/7/files" && method === "POST") {
      return json({ id: 11, kind: "dealer", fileName: "dealer.pdf", fileSize: 1000, contentType: "application/pdf", createdAt: "2026-10-28T10:00:00.000Z", createdBy: "tester" }, 201);
    }
    if (url.pathname === "/api/lease-quotes/7/files/11/scan") return json(scanResponse.body, scanResponse.status);
    if (url.pathname === "/api/customers") return json([]);
    return json({});
  }));
});

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(
    <QueryClientProvider client={client}>
      <QuoteEditor quoteId={7} onClose={() => {}} onOpenQuote={() => {}} />
      <Toaster />
    </QueryClientProvider>,
  );
}

async function retype(testId: string, text: string) {
  const input = await screen.findByTestId(testId);
  await userEvent.clear(input);
  if (text) await userEvent.type(input, text);
  return input;
}

const patches = () => calls.filter((c) => c.method === "PATCH");

describe("QuoteEditor live calculation", () => {
  it("shows the Excel total in the chosen column while typing, without saving", async () => {
    renderEditor();
    await retype("input-purchasePrice", "17318");
    await retype("input-variant-insurancePerMonth-0", "97,80");
    await retype("input-variant-roadTaxPerMonth-0", "34");
    await retype("input-variant-residual-0", "10000");
    expect(screen.getByTestId("variant-total-0").textContent).toMatch(/€\s466,23/);
    expect(screen.getByTestId("variant-costPerKm-0").textContent).toMatch(/0,28/);
    expect(patches()).toHaveLength(0);

    await retype("input-variant-residual-0", "10500");
    expect(screen.getByTestId("variant-total-0").textContent).toMatch(/€\s455,81/);
    expect(patches()).toHaveLength(0);
  });

  it("marks an unreadable amount red and blocks Opslaan", async () => {
    renderEditor();
    const input = await retype("input-purchasePrice", "abc");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("button-save-lease-quote")).toBeDisabled();
  });

  it("shows the plain Dutch warnings under the column", async () => {
    renderEditor();
    await retype("input-purchasePrice", "10000");
    await retype("input-variant-residual-0", "12000");
    expect(screen.getByText("Restwaarde is hoger dan de aanschafwaarde")).toBeInTheDocument();
    await retype("input-variant-term-0", "");
    expect(screen.getByText("Vul een looptijd in")).toBeInTheDocument();
    expect(screen.getByTestId("variant-total-0").textContent).toBe("—");
  });
});

describe("QuoteEditor costs per variant", () => {
  it("has no separate costs section: the costs are rows of the variants table, prefilled from the quote", async () => {
    renderEditor();
    await screen.findByTestId("lease-variants-table");
    expect(screen.queryByTestId("section-lease-costs")).toBeNull();
    expect((screen.getByTestId("input-variant-interestRatePercent-0") as HTMLInputElement).value).toBe("9");
    expect((screen.getByTestId("input-variant-robPerYear-0") as HTMLInputElement).value).toBe("275");
    expect((screen.getByTestId("input-variant-otherCostsPerYear-0") as HTMLInputElement).value).toBe("350");
    expect((screen.getByTestId("input-variant-insurancePerMonth-0") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("input-variant-excessKmPrice-0") as HTMLInputElement).value).toBe("0,1");
    expect(screen.getByText("4. Varianten")).toBeInTheDocument();
    expect(screen.getByText("5. Offerte")).toBeInTheDocument();
  });

  it("'Variant toevoegen' copies the costs (and term / km) of the last variant, but not the residual value", async () => {
    renderEditor();
    await retype("input-variant-interestRatePercent-0", "7,5");
    await retype("input-variant-marginPerMonth-0", "25");
    await retype("input-variant-shortfallKmPrice-0", "0,0425");
    await retype("input-variant-residual-0", "10000");
    await userEvent.click(screen.getByTestId("button-add-variant"));
    expect((screen.getByTestId("input-variant-interestRatePercent-1") as HTMLInputElement).value).toBe("7,5");
    expect((screen.getByTestId("input-variant-marginPerMonth-1") as HTMLInputElement).value).toBe("25");
    expect((screen.getByTestId("input-variant-shortfallKmPrice-1") as HTMLInputElement).value).toBe("0,0425");
    expect((screen.getByTestId("input-variant-robPerYear-1") as HTMLInputElement).value).toBe("275");
    expect((screen.getByTestId("input-variant-term-1") as HTMLInputElement).value).toBe("48");
    expect((screen.getByTestId("input-variant-residual-1") as HTMLInputElement).value).toBe("");
    // Adding a third copies the second, not the first.
    await retype("input-variant-interestRatePercent-1", "6");
    await userEvent.click(screen.getByTestId("button-add-variant"));
    expect((screen.getByTestId("input-variant-interestRatePercent-2") as HTMLInputElement).value).toBe("6");
  });

  it("two variants with different interest show different totals, and each recalculates from its own costs", async () => {
    renderEditor();
    await retype("input-purchasePrice", "17318");
    await retype("input-variant-insurancePerMonth-0", "97,80");
    await retype("input-variant-roadTaxPerMonth-0", "34");
    await retype("input-variant-residual-0", "10000");
    await userEvent.click(screen.getByTestId("button-add-variant"));
    await retype("input-variant-residual-1", "10000");
    expect(screen.getByTestId("variant-total-0").textContent).toMatch(/€\s466,23/);
    expect(screen.getByTestId("variant-total-1").textContent).toMatch(/€\s466,23/);

    await retype("input-variant-interestRatePercent-1", "5");
    expect(screen.getByTestId("variant-interest-1").textContent).toMatch(/€\s72,16/);
    expect(screen.getByTestId("variant-total-1").textContent).toMatch(/€\s408,50/);
    // The first variant did not move.
    expect(screen.getByTestId("variant-total-0").textContent).toMatch(/€\s466,23/);
    expect(screen.getByTestId("variant-interest-0").textContent).toMatch(/€\s129,89/);

    await retype("input-variant-marginPerMonth-0", "50");
    expect(screen.getByTestId("variant-total-0").textContent).toMatch(/€\s516,23/);
    expect(screen.getByTestId("variant-total-1").textContent).toMatch(/€\s408,50/);
    expect(patches()).toHaveLength(0);
  });

  it("an unreadable cost marks the field red and blocks Opslaan; empty costs save as null", async () => {
    renderEditor();
    const input = await retype("input-variant-robPerYear-0", "abc");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("button-save-lease-quote")).toBeDisabled();
    await retype("input-variant-robPerYear-0", "");
    await retype("input-variant-residual-0", "10000");
    await userEvent.click(screen.getByTestId("button-save-lease-quote"));
    await waitFor(() => expect(patches()).toHaveLength(1));
    const body = patches()[0].body as any;
    expect(body.interestRatePercent).toBeUndefined();
    expect(body.variants[0]).toMatchObject({ interestRatePercent: 9, robPerYear: null, otherCostsPerYear: 350, insurancePerMonth: null, excessKmPrice: 0.1, shortfallKmPrice: 0.05 });
  });
});

describe("QuoteEditor variants", () => {
  it("'Deze selecteren' on column 2 leaves exactly one chosen and saves it that way", async () => {
    renderEditor();
    await userEvent.click(await screen.findByTestId("button-add-variant"));
    await userEvent.click(screen.getByTestId("button-choose-variant-1"));
    expect(screen.getByTestId("button-choose-variant-1")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("button-choose-variant-0")).toHaveAttribute("aria-checked", "false");
    await retype("input-variant-residual-1", "5000");
    await userEvent.click(screen.getByTestId("button-save-lease-quote"));
    await waitFor(() => expect(patches()).toHaveLength(1));
    const variants = (patches()[0].body as any).variants as Array<{ isChosen: boolean; residualValue: number }>;
    expect(variants).toHaveLength(2);
    expect(variants.filter((v) => v.isChosen)).toHaveLength(1);
    expect(variants[1]).toMatchObject({ isChosen: true, residualValue: 5000 });
  });

  it("'Deze selecteren' saves straight away and marks the column Geselecteerd", async () => {
    renderEditor();
    await userEvent.click(await screen.findByTestId("button-add-variant"));
    await retype("input-variant-residual-1", "5000");
    expect(screen.getByTestId("button-choose-variant-1")).toHaveTextContent("Deze selecteren");
    await userEvent.click(screen.getByTestId("button-choose-variant-1"));
    await waitFor(() => expect(patches()).toHaveLength(1));
    const variants = (patches()[0].body as any).variants as Array<{ isChosen: boolean }>;
    expect(variants.map((v) => v.isChosen)).toEqual([false, true]);
    expect(await screen.findByText("Variant 2 is geselecteerd en opgeslagen. Deze komt op de PDF.")).toBeInTheDocument();
    expect(screen.getByTestId("button-choose-variant-1")).toHaveTextContent("Geselecteerd");
    expect(screen.getByTestId("button-choose-variant-0")).toHaveTextContent("Deze selecteren");
  });

  it("'Deze selecteren' with an incomplete variant selects it but does not save", async () => {
    renderEditor();
    await userEvent.click(await screen.findByTestId("button-add-variant"));
    await userEvent.click(screen.getByTestId("button-choose-variant-1"));
    expect(screen.getByTestId("button-choose-variant-1")).toHaveAttribute("aria-checked", "true");
    expect(patches()).toHaveLength(0);
  });

  it("removing a variant that does not go to the customer shows no such message", async () => {
    renderEditor();
    await userEvent.click(await screen.findByTestId("button-add-variant"));
    await userEvent.click(screen.getByTestId("button-remove-variant-1"));
    expect(screen.queryByText(/ging. Variant 1 gaat nu/)).toBeNull();
  });

  it("removing the chosen variant moves 'Naar de klant' to variant 1 and says so", async () => {
    renderEditor();
    await userEvent.click(await screen.findByTestId("button-add-variant"));
    await userEvent.click(screen.getByTestId("button-choose-variant-1"));
    await userEvent.click(screen.getByTestId("button-remove-variant-1"));
    expect(await screen.findByText("Je hebt de variant verwijderd die naar de klant ging. Variant 1 gaat nu naar de klant.")).toBeInTheDocument();
    expect(screen.getByTestId("button-choose-variant-0")).toHaveAttribute("aria-checked", "true");
  });

  it("does not offer to remove the last variant", async () => {
    renderEditor();
    expect(await screen.findByTestId("button-remove-variant-0")).toBeDisabled();
  });
});

describe("QuoteEditor saving a sent quote", () => {
  it("asks first and sends no PATCH on Nee", async () => {
    quote = baseQuote({ status: "sent" });
    renderEditor();
    await retype("input-vehicleMake", "Audi");
    await userEvent.click(screen.getByTestId("button-save-lease-quote"));
    expect(await screen.findByText("Deze offerte is al verstuurd. Toch wijzigen?")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("confirm-dialog-cancel"));
    await new Promise((r) => setTimeout(r, 50));
    expect(patches()).toHaveLength(0);
  });

  it("sends the full payload on Ja", async () => {
    quote = baseQuote({ status: "accepted" });
    renderEditor();
    await retype("input-vehicleMake", "Audi");
    await userEvent.click(screen.getByTestId("button-save-lease-quote"));
    expect(await screen.findByText("Deze offerte is al geaccepteerd. Toch wijzigen?")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("button-confirm-edit-warning"));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toMatchObject({ status: "accepted", vehicleMake: "Audi", prospectName: "Jansen" });
    expect((patches()[0].body as any).variants[0]).toMatchObject({ interestRatePercent: 9, robPerYear: 275 });
  });

  it("does not ask for a concept quote", async () => {
    renderEditor();
    await retype("input-vehicleMake", "Audi");
    await userEvent.click(screen.getByTestId("button-save-lease-quote"));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(screen.queryByText(/Toch wijzigen\?/)).not.toBeInTheDocument();
  });
});

const PARSED = {
  dealerName: "Autohuis West", make: "Audi", model: "A3", trim: "Sportback", catalogPrice: 30000, options: 1500, discount: 2000,
  bpm: 3000, deliveryCosts: 900, totalExclVat: null, totalInclVat: 24000, deliveryTime: "6 weken", quoteDate: null, validUntil: null,
};

async function uploadAndScan() {
  const input = await screen.findByTestId("input-dealer-file");
  await userEvent.upload(input as HTMLInputElement, new File(["%PDF-1.4"], "dealer.pdf", { type: "application/pdf" }));
  return screen.findByTestId("dialog-dealer-scan");
}

describe("Dealer scan dialog", () => {
  it("with only an incl. btw amount leaves the purchase price as it was after Overnemen", async () => {
    quote = baseQuote({ purchasePrice: 17318 });
    scanResponse = { status: 200, body: { parsed: PARSED, suggestion: { amount: null, onlyInclVat: true } } };
    renderEditor();
    const before = ((await screen.findByTestId("input-purchasePrice")) as HTMLInputElement).value;
    const dialog = await uploadAndScan();
    expect(await within(dialog).findByText("De dealer noemt alleen een bedrag incl. btw. Vul de aanschafwaarde excl. btw zelf in.")).toBeInTheDocument();
    expect(within(dialog).getByTestId("checkbox-scan-purchasePrice")).not.toBeChecked();
    await userEvent.click(within(dialog).getByTestId("button-scan-apply"));
    await waitFor(() => expect(screen.queryByTestId("dialog-dealer-scan")).not.toBeInTheDocument());
    expect((screen.getByTestId("input-purchasePrice") as HTMLInputElement).value).toBe(before);
    expect((screen.getByTestId("input-vehicleMake") as HTMLInputElement).value).toBe("Audi");
    expect(patches()).toHaveLength(0);
  });

  it("applies only the ticked fields, including the suggested purchase price", async () => {
    scanResponse = { status: 200, body: { parsed: { ...PARSED, totalExclVat: 19834.71 }, suggestion: { amount: 19834.71, onlyInclVat: false } } };
    renderEditor();
    const dialog = await uploadAndScan();
    await within(dialog).findByTestId("checkbox-scan-model");
    expect(within(dialog).getByTestId("checkbox-scan-purchasePrice")).toBeChecked();
    await userEvent.click(within(dialog).getByTestId("checkbox-scan-model"));
    await userEvent.click(within(dialog).getByTestId("button-scan-apply"));
    await waitFor(() => expect(screen.queryByTestId("dialog-dealer-scan")).not.toBeInTheDocument());
    expect((screen.getByTestId("input-vehicleMake") as HTMLInputElement).value).toBe("Audi");
    expect((screen.getByTestId("input-vehicleModel") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("input-dealerName") as HTMLInputElement).value).toBe("Autohuis West");
    expect((screen.getByTestId("input-purchasePrice") as HTMLInputElement).value).toBe("19.834,71");
    expect((screen.getByTestId("input-breakdown-bpm") as HTMLInputElement).value).toBe("3.000");
  });

  it("says the file is kept when reading fails", async () => {
    scanResponse = { status: 502, body: { message: "The quote could not be read", code: "LEASE_SCAN_FAILED" } };
    renderEditor();
    const dialog = await uploadAndScan();
    expect(await within(dialog).findByText("Uitlezen lukte niet. Het bestand is bewaard; vul de gegevens zelf in.")).toBeInTheDocument();
  });
});
