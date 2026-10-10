/**
 * Audit remediation P8 / A-18-1 (docs/audit/fysieke-e2e-audit-2026-10-09.md, module 18):
 * "Document uploaden" and the Contractsjablonen tab were usable by someone without the
 * right, while the dashboard tile for the same action was greyed out. Both now follow
 * the right the server asks for (POST /api/documents: manage_documents; the template
 * lists: manage_pdf_templates), greyed out with the reason, like every other control.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getQueryFn } from "@/lib/queryClient";
import { UserRole } from "@shared/schema";

const authState = vi.hoisted(() => ({
  user: { id: 6, username: "e2e-user", role: "user", permissions: [] as string[] },
  isLoading: false,
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => authState }));

import DocumentsIndex from "@/pages/documents/index";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => json([])));
});
afterEach(() => vi.unstubAllGlobals());

function renderPage(role: string, permissions: string[]) {
  authState.user = { id: 6, username: "e2e-user", role, permissions };
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

// Located by role and visible name, so the test does not depend on test ids.
const uploadButton = () => screen.findByRole("button", { name: /Document uploaden/ });
const tab = (name: RegExp) => screen.getByRole("tab", { name });

describe("A-18-1 - the documents page follows the rights", () => {
  it("without manage_documents / manage_pdf_templates: the upload button and the contract and transport template tabs are greyed out", async () => {
    renderPage(UserRole.USER, ["view_documents"]);
    expect(await uploadButton()).toBeDisabled();
    expect(tab(/^Contractsjablonen/)).toBeDisabled();
    expect(tab(/^Transportrapportsjablonen/)).toBeDisabled();
  });

  it("with the rights: all three are usable", async () => {
    renderPage(UserRole.USER, ["view_documents", "manage_documents", "manage_pdf_templates"]);
    expect(await uploadButton()).toBeEnabled();
    expect(tab(/^Contractsjablonen/)).toBeEnabled();
    expect(tab(/^Transportrapportsjablonen/)).toBeEnabled();
  });

  it("an administrator passes without listing the rights", async () => {
    renderPage(UserRole.ADMIN, []);
    expect(await uploadButton()).toBeEnabled();
    expect(tab(/^Contractsjablonen/)).toBeEnabled();
  });
});
