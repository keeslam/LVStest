/**
 * One rule version (audit 2026-10-09, A-16-1 and A-16-2): validation and history
 * use the parameter names shown above them instead of technical keys, and
 * archiving asks through the app's own dialog instead of window.confirm.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { VersionDialog } from "@/components/fiscal/version-dialog";
import type { FiscalParameterDefinition } from "@/components/fiscal/types";

const definitions: FiscalParameterDefinition[] = [
  { key: "KM_THRESHOLD_APPLIES", ruleKey: "r", displayName: "Kilometergrens van toepassing", description: "…", category: "general", dataType: "boolean", unit: "none", legalStatus: "legal", required: true, usedBy: "rule" },
  { key: "ROUNDING_MODE", ruleKey: "r", displayName: "Afrondingsmethode", description: "…", category: "general", dataType: "choice", unit: "none", legalStatus: "internal", required: true, usedBy: "assess", allowedValues: ["half_up_cents"] },
];

const detail = {
  id: 2, versionNumber: 2, ruleKey: "r", status: "draft", title: "AUDIT concept", effectiveFrom: null, effectiveUntil: null,
  reasonCategory: "other", reasonText: "test", sourceOrganisation: null, sourceUrl: null, legalReference: null, sourceVerifiedAt: null, assumptions: null,
  createdByName: "kees", submittedByName: null, approvedByName: null, publishedByName: null, publishedAt: null, rejectedByName: null, rejectionReason: null,
  supersededById: null, createdAt: "2026-10-09T10:00:00.000Z", updatedAt: "2026-10-09T10:00:00.000Z",
  values: {}, sources: {},
  validation: { ok: false, issues: [{ key: "KM_THRESHOLD_APPLIES", message: "verplichte waarde ontbreekt" }, { key: "UNLISTED_KEY", message: "onbekend" }] },
  audit: [{ id: 1, occurredAt: "2026-10-09T10:00:00.000Z", username: "kees", role: "admin", action: "draft_edited", entityType: "parameter", entityId: 2, ruleVersionId: 2, parameterKey: "ROUNDING_MODE", oldValue: null, newValue: "half_up_cents", unit: null, reasonText: null, customerId: null, vehicleId: null, details: null }],
};
const calls: Array<{ method: string; url: string }> = [];

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(
    <QueryClientProvider client={client}>
      <VersionDialog versionId={2} onOpenChange={() => {}} definitions={definitions} current={null} />
      <Toaster />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url: String(url) });
    const body = String(url).endsWith("/impact") ? { running: false, result: null, error: null } : method === "POST" ? { ...detail, status: "archived" } : detail;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("regelversie", () => {
  it("names the incomplete parameters like the list above, keeping an unknown key readable", async () => {
    renderDialog();
    const issues = await screen.findByText(/verplichte waarde ontbreekt/);
    expect(issues.closest("li")).toHaveTextContent("Kilometergrens van toepassing: verplichte waarde ontbreekt");
    expect(screen.queryByText(/KM_THRESHOLD_APPLIES/)).not.toBeInTheDocument();
    expect(screen.getByText("UNLISTED_KEY: onbekend")).toBeInTheDocument();
  });

  it("writes the history with the parameter name and a readable value", async () => {
    renderDialog();
    await screen.findByText(/verplichte waarde ontbreekt/);
    const history = screen.getByText(/Concept bewerkt/).closest("li")!;
    expect(history).toHaveTextContent("Afrondingsmethode");
    expect(history).not.toHaveTextContent("ROUNDING_MODE");
    expect(history).not.toHaveTextContent("half_up_cents");
  });

  it("asks with the app's own dialog before archiving, and archives after the click", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    renderDialog();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("button-version-archive"));
    expect(await screen.findByTestId("confirm-dialog-title")).toHaveTextContent("Versie archiveren?");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    await user.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/archive"))).toBe(true));
    expect(await screen.findByText("Versie gearchiveerd.")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("archives nothing when the dialog is cancelled", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("button-version-archive"));
    await user.click(await screen.findByTestId("confirm-dialog-cancel"));
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
});
