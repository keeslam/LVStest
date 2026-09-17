/**
 * The fiscal section of the app settings (under Klantenportaal, besluit
 * F-13): which tabs a user sees follows their rights, and the configuration
 * lists every version with its status and validation. The overview lives in
 * its own dialog on the Klantenportaal page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

let permissions: string[] = [];
let role = "manager";
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));

import { FiscalSettingsSection } from "@/components/fiscal/fiscal-settings-section";
import { FiscalOverviewDialog } from "@/components/fiscal/fiscal-overview-dialog";

const draft = {
  id: 7,
  ruleKey: "pseudo_eindheffing_fossiel",
  versionNumber: 1,
  status: "draft",
  title: "Belastingplan 2026 (wet) — concept, te verifiëren",
  effectiveFrom: "2027-01-01",
  effectiveUntil: null,
  reasonCategory: "legislative_change",
  reasonText: "Eerste inrichting",
  sourceUrl: "https://ondernemersplein.overheid.nl/",
  legalReference: "art. 32bc",
  createdByName: "systeem",
  publishedByName: null,
  updatedAt: "2026-09-16T20:00:00.000Z",
  values: { PSEUDO_ENDHEFFING_RATE: 12 },
  sources: {},
  parameterRows: [],
  validation: { ok: true, issues: [] },
};

const responses: Record<string, unknown> = {
  "/api/fiscal/overview": {
    byStatus: { NOT_APPLICABLE: 0, POSSIBLY_APPLICABLE: 2, APPLICABLE: 5, MANUAL_REVIEW_REQUIRED: 1, DATA_INSUFFICIENT: 3, CONFIGURATION_INVALID: 0, RULE_NOT_AVAILABLE: 0 },
    openPeriods: 11,
    unassessedPeriods: 0,
    openReviewCases: 4,
    currentVersion: null,
    currentVersionStatus: "RULE_NOT_AVAILABLE",
  },
  "/api/fiscal/configuration": { today: "2026-09-17", rules: [{ rule: { key: "pseudo_eindheffing_fossiel", displayName: "Pseudo-eindheffing fossiele personenauto's", description: "…" }, current: null, upcoming: [], drafts: [draft], expired: [], archived: [] }] },
  "/api/fiscal/definitions": { rules: [], parameters: [] },
  "/api/fiscal/review-cases": [],
  "/api/fiscal/audit": [],
};

function withClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = String(url).split("?")[0];
    const body = responses[path] ?? {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("fiscale sectie in de instellingen", () => {
  it("a viewer sees the configuration read-only, and no queue or audit log", async () => {
    permissions = ["view_fiscal"];
    role = "manager";
    withClient(<FiscalSettingsSection />);
    expect(await screen.findByRole("tab", { name: "Configuratie" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Beoordelingen" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Auditlog" })).toBeNull();
    expect(await screen.findByTestId("version-row-7")).toBeInTheDocument();
    expect(screen.queryByTestId("button-new-draft")).toBeNull();
  });

  it("renders nothing for someone without any fiscal right", () => {
    permissions = [];
    role = "manager";
    withClient(<FiscalSettingsSection />);
    expect(screen.queryByTestId("fiscal-settings-section")).toBeNull();
  });

  it("an administrator sees every tab and can start a draft", async () => {
    permissions = [];
    role = "admin";
    withClient(<FiscalSettingsSection />);
    expect(await screen.findByRole("tab", { name: "Beoordelingen" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Auditlog" })).toBeInTheDocument();
    expect(await screen.findByTestId("button-new-draft")).toBeInTheDocument();
  });

  it("the configuration lists the draft with its status label and validation", async () => {
    permissions = ["view_fiscal", "manage_fiscal_configuration"];
    role = "manager";
    withClient(<FiscalSettingsSection />);
    await userEvent.setup().click(await screen.findByRole("tab", { name: "Configuratie" }));
    const row = await screen.findByTestId("version-row-7");
    expect(row).toHaveTextContent("Belastingplan 2026 (wet)");
    expect(row).toHaveTextContent("Concept");
    expect(row).toHaveTextContent("versie 1");
    expect(row).toHaveTextContent("1 januari 2027");
    expect(row).toHaveTextContent("Volledig");
  });
});

describe("overzichtsdialoog op de pagina Klantenportaal", () => {
  it("shows the counts in Dutch and the no-version warning", async () => {
    permissions = ["view_fiscal"];
    role = "manager";
    withClient(<FiscalOverviewDialog open onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("tile-APPLICABLE")).toHaveTextContent("5"));
    expect(screen.getByTestId("tile-APPLICABLE")).toHaveTextContent("Van toepassing");
    expect(screen.getByTestId("tile-open-cases")).toHaveTextContent("4");
    expect(screen.getByTestId("overview-no-version")).toHaveTextContent(/Geen regelversie beschikbaar/);
    expect(screen.getByText(/app-instellingen/)).toBeInTheDocument();
  });
});
