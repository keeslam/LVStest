/**
 * "Activiteit" (audit 2026-10-09, A-15-5): actions and details in words, not
 * as technical codes and JSON.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { ActivityTable } from "@/components/portal-admin/activity-table";

const base = { ip: null, userName: "Portaal Tester", customerName: "Klant BV", createdAt: "2026-09-16T20:26:40.000Z" };
const rows = [
  { ...base, id: 1, action: "login", entity: null, entityId: null, details: null },
  { ...base, id: 2, action: "request_replied", entity: "request", entityId: 577, details: { by: "admin", status: "done" } },
  { ...base, id: 3, action: "company_emails_updated", entity: "customer", entityId: 5, details: { emailForMOT: "apk@example.com" } },
  { ...base, id: 4, action: "something_new_and_unlisted", entity: null, entityId: null, details: null },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(<QueryClientProvider client={client}><ActivityTable /></QueryClientProvider>);
}

describe("activiteit in het portaal", () => {
  it("names the actions in words", async () => {
    renderTable();
    expect(await screen.findByText("Ingelogd")).toBeInTheDocument();
    expect(screen.getByText("Aanvraag beantwoord")).toBeInTheDocument();
    expect(screen.getByText("Bedrijfsadressen bijgewerkt")).toBeInTheDocument();
    expect(screen.queryByText("request_replied")).not.toBeInTheDocument();
  });

  it("writes the details as a sentence, without JSON or field names", async () => {
    renderTable();
    await screen.findByText("Aanvraag beantwoord");
    const cell = screen.getByTestId("activity-details-2");
    expect(cell).toHaveTextContent("Aanvraag #577");
    expect(cell).toHaveTextContent("door: admin");
    expect(cell).toHaveTextContent("status: Afgehandeld");
    expect(cell.textContent).not.toMatch(/[{}"]/);
    expect(screen.getByTestId("activity-details-3")).toHaveTextContent("APK-adres: apk@example.com");
  });

  it("falls back to a readable phrase for an action it does not know", async () => {
    renderTable();
    expect(await screen.findByText("Something new and unlisted")).toBeInTheDocument();
  });
});
