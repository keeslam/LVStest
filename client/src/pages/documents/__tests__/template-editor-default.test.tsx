/**
 * Audit remediation P11 / A-10-2 (docs/audit/fysieke-e2e-audit-2026-10-09.md, module 10): a contract
 * template without fields could be the default and then blocked every contract. The editor now
 *
 *  - warns, on the screen itself, when the default template has no fields,
 *  - refuses "Als standaard instellen" for a template without fields before it asks the server,
 *  - says the same in Dutch when the server refuses (stable code TEMPLATE_DEFAULT_WITHOUT_FIELDS),
 *  - reports unsaved changes to the dialog around it (A-10-3).
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
const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
  toast: toastSpy,
}));

import PDFTemplateEditor from "@/pages/documents/template-editor";

const FIELD = { id: "f1", name: "Naam", x: 100, y: 100, fontSize: 12, isBold: false, source: "customerName", textAlign: "left", locked: false };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let templates: any[];
let patchResponse: { status: number; body: unknown };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  toastSpy.mockClear();
  patchResponse = { status: 200, body: {} };
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === "string" ? input : (input as Request).url).replace(/^https?:\/\/[^/]+/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === "/api/pdf-templates" && method === "GET") return json(templates);
    if (url.startsWith("/api/pdf-templates/") && method === "PATCH") return json(patchResponse.body, patchResponse.status);
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderEditor(props: React.ComponentProps<typeof PDFTemplateEditor> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const { hook } = memoryLocation({ path: "/documents", static: true });
  return render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>
        <PDFTemplateEditor {...props} />
      </Router>
    </QueryClientProvider>,
  );
}

describe("A-10-2 - the default template without fields", () => {
  it("is called out on the screen", async () => {
    templates = [{ id: 1, name: "Standaard", isDefault: true, fields: [] }];
    renderEditor();
    const warning = await screen.findByTestId("template-default-empty-warning");
    expect(warning).toHaveTextContent("Dit standaardsjabloon heeft geen velden");
  });

  it("is not called out when it has a field, or when the empty one is not the default", async () => {
    templates = [{ id: 1, name: "Standaard", isDefault: true, fields: [FIELD] }];
    renderEditor();
    await screen.findByTestId("button-save-template");
    expect(screen.queryByTestId("template-default-empty-warning")).toBeNull();
  });

  it("refuses 'Als standaard instellen' for a template without fields without asking the server", async () => {
    const user = userEvent.setup();
    templates = [{ id: 2, name: "Leeg", isDefault: false, fields: [] }];
    renderEditor();
    await user.click(await screen.findByRole("button", { name: "Als standaard instellen" }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const call = toastSpy.mock.calls[0][0];
    expect(call.variant).toBe("destructive");
    expect(call.description).toMatch(/zonder velden kan niet het standaardsjabloon zijn/);
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")).toBe(false);
  });

  it("says it in Dutch when the server refuses a save with its code", async () => {
    const user = userEvent.setup();
    templates = [{ id: 1, name: "Standaard", isDefault: true, fields: [FIELD] }];
    patchResponse = { status: 409, body: { message: "A template without fields cannot be the default: ...", code: "TEMPLATE_DEFAULT_WITHOUT_FIELDS" } };
    renderEditor();
    await user.click(await screen.findByTestId("button-save-template"));
    await waitFor(() => expect(toastSpy.mock.calls.some(([c]) => c.variant === "destructive")).toBe(true));
    const call = toastSpy.mock.calls.find(([c]) => c.variant === "destructive")![0];
    expect(call.description).toMatch(/zonder velden kan niet het standaardsjabloon zijn/);
    expect(call.description).not.toMatch(/A template without fields/);
  });

  it("saving an empty default still goes through, with a plain warning", async () => {
    const user = userEvent.setup();
    templates = [{ id: 1, name: "Standaard", isDefault: true, fields: [] }];
    patchResponse = { status: 200, body: { id: 1, name: "Standaard", isDefault: true, fields: [] } };
    renderEditor();
    await user.click(await screen.findByTestId("button-save-template"));
    await waitFor(() => expect(toastSpy.mock.calls.some(([c]) => /geen velden/.test(c.title ?? ""))).toBe(true));
  });
});

describe("A-10-3 - unsaved changes are reported", () => {
  it("reports a clean editor as not dirty and says nothing in the save status", async () => {
    templates = [{ id: 1, name: "Standaard", isDefault: true, fields: [FIELD] }];
    const onDirtyChange = vi.fn();
    renderEditor({ onDirtyChange });
    await screen.findByTestId("button-save-template");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
    expect(screen.getByTestId("template-editor-save-status")).toHaveTextContent("");
  });

  it("reports a new field as an unsaved change, and the status line says so", async () => {
    const user = userEvent.setup();
    templates = [{ id: 1, name: "Standaard", isDefault: true, fields: [FIELD] }];
    const onDirtyChange = vi.fn();
    renderEditor({ onDirtyChange });
    await user.click(await screen.findByTestId("button-add-field"));
    await user.type(await screen.findByTestId("input-field-name"), "Kenteken");
    await user.click(screen.getByTestId("select-field-source"));
    await user.click(await screen.findByRole("option", { name: "Kenteken" }));
    await user.click(screen.getByTestId("button-add-field-confirm"));

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    expect(screen.getByTestId("template-editor-save-status")).toHaveTextContent("Er zijn niet-opgeslagen wijzigingen.");
  });
});
