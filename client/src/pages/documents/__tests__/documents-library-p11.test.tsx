/**
 * Audit remediation P11 / A-10-5, A-10-8, A-10-4 (docs/audit/fysieke-e2e-audit-2026-10-09.md, module 10):
 * the document library
 *
 *  - writes plates with dashes and the generated document types and notes in the user's language
 *    (the stored values are untouched),
 *  - finds a vehicle by plate (with or without dashes), brand or model,
 *  - shows a preview that Escape and a click outside can close (an AlertDialog ignored both, and
 *    a preview that was still open left "Document uploaden" looking dead).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getQueryFn } from "@/lib/queryClient";
import { UserRole } from "@shared/schema";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [] }, isLoading: false }),
}));

import DocumentsIndex from "@/pages/documents/index";

const VEHICLES = [
  { id: 1, licensePlate: "11RHDF", brand: "Mitsubishi", model: "Spacestar", vehicleType: "Car" },
  { id: 2, licensePlate: "44-DD-HF", brand: "Fiat", model: "Ducato", vehicleType: "Van" },
];
const doc = (over: Record<string, unknown>) => ({
  contentType: "application/pdf", fileSize: 2048, uploadDate: "2026-10-09T17:35:00.000Z", version: 1, isStale: false,
  staleReason: null, createdBy: "t", filePath: "x/y.pdf", reservationId: null, notes: null, ...over,
});
const DOCUMENTS = [
  doc({ id: 10, vehicleId: 1, documentType: "Damage Check", fileName: "damage_a.pdf", notes: "Damage check recorded at return of reservation #3200", reservationId: 3200 }),
  doc({ id: 11, vehicleId: 1, documentType: "Contract (Unsigned)", fileName: "contract_a.pdf", reservationId: 3200 }),
  doc({ id: 12, vehicleId: 2, documentType: "Insurance", fileName: "polis.pdf" }),
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = (typeof input === "string" ? input : (input as Request).url).replace(/^https?:\/\/[^/]+/, "");
    if (url === "/api/documents") return json(DOCUMENTS);
    if (url === "/api/vehicles") return json(VEHICLES);
    return json([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  const { hook } = memoryLocation({ path: "/documents", static: true });
  return render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>
        <DocumentsIndex />
      </Router>
    </QueryClientProvider>,
  );
}

describe("A-10-5 - what the library shows", () => {
  it("writes the plate with dashes in the group header and the type and note in Dutch", async () => {
    const user = userEvent.setup();
    renderPage();
    const header = await screen.findByRole("heading", { name: "11-RH-DF - Mitsubishi Spacestar" });
    await user.click(header);
    // Both generated types, in Dutch (all contract spellings are one group, as before).
    await user.click(await screen.findByRole("heading", { name: "Schadecheck" }));
    expect(await screen.findByText("Schadecheck vastgelegd bij het inleveren van reservering #3200")).toBeInTheDocument();
    expect(screen.queryByText("Damage check recorded at return of reservation #3200")).toBeNull();
    expect(screen.getByRole("heading", { name: "Contracten" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Damage Check" })).toBeNull();
  });
});

describe("A-10-8 - finding a vehicle in a long list", () => {
  it("finds it by plate without dashes, and opens what matched", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "11-RH-DF - Mitsubishi Spacestar" });
    await user.type(screen.getByPlaceholderText(/Documenten zoeken/i), "44ddhf");

    await waitFor(() => expect(screen.queryByRole("heading", { name: "11-RH-DF - Mitsubishi Spacestar" })).toBeNull());
    expect(screen.getByRole("heading", { name: "44-DD-HF - Fiat Ducato" })).toBeInTheDocument();
    // The hit is on screen without clicking through two levels.
    expect(await screen.findByText("polis.pdf")).toBeInTheDocument();
  });

  it("finds it by brand or model", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "11-RH-DF - Mitsubishi Spacestar" });
    await user.type(screen.getByPlaceholderText(/Documenten zoeken/i), "spacestar");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "44-DD-HF - Fiat Ducato" })).toBeNull());
    expect(screen.getByRole("heading", { name: "11-RH-DF - Mitsubishi Spacestar" })).toBeInTheDocument();
  });

  it("can open and close everything at once", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "11-RH-DF - Mitsubishi Spacestar" });
    await user.click(screen.getByTestId("button-expand-all-documents"));
    expect(await screen.findByText("damage_a.pdf")).toBeInTheDocument();
    await user.click(screen.getByTestId("button-collapse-all-documents"));
    await waitFor(() => expect(screen.queryByText("damage_a.pdf")).toBeNull());
  });
});

describe("A-10-4 - the preview can always be closed", () => {
  it("closes with Escape, and 'Document uploaden' then opens", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("button-expand-all-documents"));
    await user.click(await screen.findByTestId("button-view-document-12"));
    const preview = await screen.findByTestId("dialog-document-preview");
    expect(preview.querySelector("iframe")?.getAttribute("src")).toBe("/api/documents/view/12");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("dialog-document-preview")).toBeNull());

    await user.click(screen.getByTestId("button-upload-document"));
    expect(await screen.findByTestId("dialog-upload-document")).toBeInTheDocument();
  });

  it("closes with its own Sluiten button", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("button-expand-all-documents"));
    await user.click(await screen.findByTestId("button-view-document-12"));
    await user.click(await screen.findByTestId("button-close-document-preview"));
    await waitFor(() => expect(screen.queryByTestId("dialog-document-preview")).toBeNull());
  });
});
