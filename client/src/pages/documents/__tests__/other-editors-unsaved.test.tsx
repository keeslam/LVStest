/**
 * Audit remediation P11 follow-up (A-10-3): the transport-report and the barcode-label template
 * editors are copies of the contract editor and get the same unsaved-changes guard - they report a
 * pending edit through `onDirtyChange`, say so on the screen, and ask before another template
 * replaces it. (The dialog around them asks before it closes; that wiring is the Layer B story.)
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

import TransportReportTemplateEditor from "@/pages/documents/transport-report-template-editor";
import LeaseQuoteTemplateEditor from "@/pages/documents/lease-quote-template-editor";
import BarcodeLabelTemplateEditor from "@/pages/documents/barcode-label-template-editor";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const transportTemplates = [
  { id: 1, name: "Standaard", isDefault: true, fields: [] },
  { id: 2, name: "Tweede", isDefault: false, fields: [] },
];
const barcodeTemplates = [
  { id: 1, name: "Sleutelkast", isDefault: true, labelWidthMm: 30, labelHeightMm: 18, fields: [] },
  { id: 2, name: "Auto", isDefault: false, labelWidthMm: 62, labelHeightMm: 29, fields: [] },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = (typeof input === "string" ? input : (input as Request).url).replace(/^https?:\/\/[^/]+/, "");
    if (url === "/api/transport-report-templates") return json(transportTemplates);
    if (url === "/api/lease-quote-templates") return json(transportTemplates);
    if (url === "/api/barcode-label-templates") return json(barcodeTemplates);
    return json([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderEditor(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  const { hook } = memoryLocation({ path: "/documents", static: true });
  return render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>{node}</Router>
    </QueryClientProvider>,
  );
}

async function addField(user: ReturnType<typeof userEvent.setup>, buttonTestId: string) {
  await user.click(await screen.findByTestId(buttonTestId));
  await user.type(await screen.findByTestId("input-field-name"), "Kenteken");
  await user.click(screen.getByTestId("select-field-source"));
  await user.click((await screen.findAllByRole("option", { name: "Kenteken" }))[0]);
  await user.click(screen.getByTestId("button-add-field-confirm"));
}

/**
 * The field the tests add is called "Kenteken" and reads the licence plate: the transport editor shows
 * its name (list entry or the selected field's name input), the barcode label shows what it prints for
 * the sample vehicle.
 */
const addedFieldShown = () =>
  screen.queryAllByText("Kenteken").length + screen.queryAllByDisplayValue("Kenteken").length + screen.queryAllByText("12-XT-102").length > 0;

describe.each([
  ["transport report editor", () => TransportReportTemplateEditor, "button-add-field", "Tweede"],
  ["lease quote editor", () => LeaseQuoteTemplateEditor, "button-add-field", "Tweede"],
  ["barcode label editor", () => BarcodeLabelTemplateEditor, "button-add-barcode-label-field", "Auto"],
] as const)("%s", (_name, component, addButton, otherName) => {
  it("is clean when nothing was edited", async () => {
    const Editor = component();
    const onDirtyChange = vi.fn();
    renderEditor(<Editor onDirtyChange={onDirtyChange} />);
    await screen.findByTestId(addButton);
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
    expect(screen.getByTestId("template-editor-save-status")).toHaveTextContent("");
  });

  it("reports an added field as unsaved and asks before another template replaces it", async () => {
    const user = userEvent.setup();
    const Editor = component();
    const onDirtyChange = vi.fn();
    renderEditor(<Editor onDirtyChange={onDirtyChange} />);
    await addField(user, addButton);

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    expect(screen.getByTestId("template-editor-save-status")).toHaveTextContent("Er zijn niet-opgeslagen wijzigingen.");

    // Picking another template does not silently drop the edit.
    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: new RegExp(otherName) }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Wijzigingen niet opgeslagen");

    // "Verder bewerken" keeps the edit and the template.
    await user.click(screen.getByRole("button", { name: "Verder bewerken" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByTestId("template-editor-save-status")).toHaveTextContent("niet-opgeslagen");
    // ...and the added field is still on the canvas, the first template still selected.
    expect(addedFieldShown()).toBe(true);
    expect(screen.getAllByRole("combobox")[0]).not.toHaveTextContent(otherName);

    // "Wijzigingen weggooien" switches and the editor is clean again.
    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: new RegExp(otherName) }));
    await user.click(await screen.findByRole("button", { name: "Wijzigingen weggooien" }));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    // The discard really did both halves: the other template is the selected one and the added field is gone.
    await waitFor(() => expect(screen.getAllByRole("combobox")[0]).toHaveTextContent(otherName));
    expect(addedFieldShown()).toBe(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByTestId("template-editor-save-status")).not.toHaveTextContent("niet-opgeslagen");
  });
});
