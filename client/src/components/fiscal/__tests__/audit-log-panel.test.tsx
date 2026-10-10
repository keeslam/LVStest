/**
 * The fiscal audit log (audit 2026-10-09, A-16-3): the automatic "profile
 * refreshed" rows no longer bury real changes, rows say which plate they are
 * about, and the list can be narrowed by action and plate.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { AuditLogPanel } from "@/components/fiscal/audit-log-panel";

const event = (over: Record<string, unknown>) => ({
  id: 1, occurredAt: "2026-10-09T10:00:00.000Z", username: "kees", role: "admin", action: "profile_overridden", entityType: "fiscal_profile", entityId: 95,
  ruleVersionId: null, parameterKey: null, oldValue: null, newValue: null, unit: null, reasonText: null, customerId: null, vehicleId: 3, details: null, licensePlate: "AB-123-C", ...over,
});
const everything = [
  event({ id: 3, action: "profile_refreshed" }),
  event({ id: 2, action: "profile_overridden", reasonText: "factuur", parameterKey: "ROUNDING_MODE", parameterLabel: "Afronding", newValue: "half_up_cents", newValueLabel: "afronden op centen, halve cent omhoog" }),
  event({ id: 1, action: "draft_created", entityType: "rule_version", entityId: 2, vehicleId: null, licensePlate: null, ruleVersionId: 2 }),
];
const urls: string[] = [];

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(<QueryClientProvider client={client}><AuditLogPanel /></QueryClientProvider>);
}

beforeEach(() => {
  urls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(String(url));
    if (String(url).includes("/api/fiscal/definitions")) return new Response(JSON.stringify({ rules: [], parameters: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    const u = new URL(String(url), "http://x");
    const exclude = (u.searchParams.get("excludeAction") ?? "").split(",").filter(Boolean);
    const only = (u.searchParams.get("action") ?? "").split(",").filter(Boolean);
    const rows = everything.filter((e) => !exclude.includes(e.action) && (only.length === 0 || only.includes(e.action)));
    return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("fiscale auditlog", () => {
  it("leaves the automatic profile refreshes out by default, so real changes stay visible", async () => {
    renderPanel();
    expect(await screen.findByTestId("audit-event-2")).toBeInTheDocument();
    expect(screen.queryByTestId("audit-event-3")).not.toBeInTheDocument();
    expect(urls.some((u) => u.includes("excludeAction=profile_refreshed"))).toBe(true);
  });

  it("shows the refreshes again when asked", async () => {
    renderPanel();
    const user = userEvent.setup();
    await screen.findByTestId("audit-event-2");
    await user.click(screen.getByLabelText("Automatische profielverversingen verbergen"));
    expect(await screen.findByTestId("audit-event-3")).toBeInTheDocument();
  });

  it("names the plate and the kind of record instead of 'fiscal_profile #95'", async () => {
    renderPanel();
    const row = await screen.findByTestId("audit-event-2");
    expect(row).toHaveTextContent("Voertuigprofiel");
    expect(row).toHaveTextContent("AB-123-C");
    expect(row).not.toHaveTextContent("fiscal_profile");
    // The parameter and its value come in words from the server, not as keys.
    expect(row).toHaveTextContent("Afronding");
    expect(row).toHaveTextContent("afronden op centen, halve cent omhoog");
    expect(row).not.toHaveTextContent("ROUNDING_MODE");
    expect(row).not.toHaveTextContent("half_up_cents");
    expect(screen.getByTestId("audit-event-1")).toHaveTextContent("Regelversie");
  });

  it("narrows the list to one action", async () => {
    renderPanel();
    const user = userEvent.setup();
    await screen.findByTestId("audit-event-2");
    await user.selectOptions(screen.getByLabelText("Actie"), "draft_created");
    await waitFor(() => expect(screen.queryByTestId("audit-event-2")).not.toBeInTheDocument());
    expect(screen.getByTestId("audit-event-1")).toBeInTheDocument();
    expect(urls.some((u) => u.includes("action=draft_created"))).toBe(true);
  });

  it("narrows the list to a plate typed in the box", async () => {
    renderPanel();
    const user = userEvent.setup();
    await screen.findByTestId("audit-event-2");
    await user.type(screen.getByLabelText("Kenteken"), "ab123");
    await waitFor(() => expect(screen.queryByTestId("audit-event-1")).not.toBeInTheDocument());
    expect(screen.getByTestId("audit-event-2")).toBeInTheDocument();
  });
});
