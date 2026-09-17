/**
 * Publishing a global configuration: the dialog shows exactly what changes
 * for ALL customers and refuses to send without an explicit confirmation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PublishDialog } from "@/components/fiscal/publish-dialog";
import type { FiscalParameterDefinition } from "@/components/fiscal/types";

const definitions: FiscalParameterDefinition[] = [
  { key: "PSEUDO_ENDHEFFING_RATE", ruleKey: "pseudo_eindheffing_fossiel", displayName: "Heffingspercentage pseudo-eindheffing", description: "…", category: "general", dataType: "decimal", unit: "percent_per_year", legalStatus: "legal", required: true, usedBy: "rule" },
  { key: "REPLACEMENT_VEHICLE_EXEMPTION_DAYS", ruleKey: "pseudo_eindheffing_fossiel", displayName: "Vervangend voertuig: vrijstellingsdagen", description: "…", category: "replacement", dataType: "integer", unit: "calendar_days", legalStatus: "legal", required: true, usedBy: "rule" },
];

const version = { id: 12, versionNumber: 2, title: "Wetsvoorstel OFM 2027", status: "approved", effectiveFrom: "2028-01-01", effectiveUntil: null, sourceUrl: "https://example.invalid/bron", legalReference: "art. 32bc", reasonCategory: "legislative_change", reasonText: "verlenging overgangsrecht", values: { PSEUDO_ENDHEFFING_RATE: 15, REPLACEMENT_VEHICLE_EXEMPTION_DAYS: 14 } };
const current = { id: 7, versionNumber: 1, title: "Belastingplan 2026", values: { PSEUDO_ENDHEFFING_RATE: 12, REPLACEMENT_VEHICLE_EXEMPTION_DAYS: 14 } };
const impact = { isEstimate: true, customers: 3, vehicles: 9, periods: 12, currentTotal: "1000.00", draftTotal: "1250.00", difference: "250.00", annualImpact: "250.00", monthlyImpact: "20.83", manualReview: 1, dataInsufficient: 2 };

function renderDialog(onPublished = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <PublishDialog open onOpenChange={() => {}} version={version as any} current={current as any} definitions={definitions} impact={impact as any} onPublished={onPublished} />
    </QueryClientProvider>,
  );
  return onPublished;
}

const calls: Array<{ url: string; init?: RequestInit }> = [];
beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ...version, status: "published" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("publicatiedialoog", () => {
  it("shows the change for all customers: parameter, old and new value, dates, scope, impact, source and reason", () => {
    renderDialog();
    expect(screen.getByText(/ALLE KLANTEN/)).toBeInTheDocument();
    expect(screen.getByText(/gevolgen hebben voor fiscale berekeningen van alle klanten/)).toBeInTheDocument();
    const rate = screen.getByTestId("change-PSEUDO_ENDHEFFING_RATE");
    expect(rate).toHaveTextContent("Heffingspercentage pseudo-eindheffing");
    expect(rate).toHaveTextContent("12");
    expect(rate).toHaveTextContent("15");
    expect(rate).toHaveTextContent("% per jaar");
    // Unchanged parameters are not listed as changes.
    expect(screen.queryByTestId("change-REPLACEMENT_VEHICLE_EXEMPTION_DAYS")).toBeNull();
    expect(screen.getByText(/1 januari 2028/)).toBeInTheDocument();
    expect(screen.getByTestId("publish-impact")).toHaveTextContent("3");
    expect(screen.getByTestId("publish-impact")).toHaveTextContent("9");
    expect(screen.getByText(/example.invalid\/bron/)).toBeInTheDocument();
    expect(screen.getByText(/verlenging overgangsrecht/)).toBeInTheDocument();
  });

  it("only publishes after an explicit confirmation, and then sends confirm: true", async () => {
    const user = userEvent.setup();
    const onPublished = renderDialog();
    const button = screen.getByTestId("button-publish-confirm");
    expect(button).toBeDisabled();
    await user.click(screen.getByTestId("checkbox-publish-confirm"));
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(onPublished).toHaveBeenCalled());
    const call = calls.find((c) => c.url.endsWith("/api/fiscal/rule-versions/12/publish"));
    expect(call?.init?.method).toBe("POST");
    expect(JSON.parse(String(call?.init?.body))).toEqual({ confirm: true });
  });
});
