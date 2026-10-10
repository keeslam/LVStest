/**
 * A-12-16, A-12-17 (audit 2026-10-09): "Brieven scannen" and "Nieuwe bekeuring" both
 * take a letter and did not say how they differ; "Automatisch ophalen uit" read as a
 * broken sentence. Each entry point explains itself; the CJIB status reads as a sentence.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "t", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { FinesTable } from "@/components/fines/fines-table";
import { NewFineDialog } from "@/components/fines/new-fine-dialog";
import { FineImportDialog } from "@/components/fines/fine-import-dialog";
import { FineImportsDialog } from "@/components/fines/fine-imports-dialog";

beforeEach(() => {
  queryClient.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = (typeof input === "string" ? input : (input as Request).url).replace(/^https?:\/\/[^/]+/, "");
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url === "/api/fines/imports/status") return json({ enabled: false, host: "", running: false, lastRun: null, scheduledMinutes: null });
    if (url === "/api/portal-admin/config") return json({ fineAdminFee: 0 });
    return json([]);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); queryClient.clear(); });

function renderIt() {
  return render(
    <QueryClientProvider client={queryClient}>
      <GlobalDialogProvider>
        <FinesTable />
        <NewFineDialog />
        <FineImportDialog />
        <FineImportsDialog />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("fine entry points", () => {
  it("the new-fine dialog says it is for one fine, filled in by hand or from its letter", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("button-new-fine"));
    expect((await screen.findByTestId("new-fine-intro")).textContent).toMatch(/één bekeuring/iu);
  });

  it("the letter-import dialog says it is for a stack of letters that become fines straight away", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("button-import-fines"));
    expect((await screen.findByTestId("fine-import-intro")).textContent).toMatch(/meerdere brieven/i);
  });

  it("the toolbar buttons carry a short explanation as well", async () => {
    renderIt();
    expect((await screen.findByTestId("button-new-fine")).getAttribute("title")).toMatch(/bekeuring invullen/i);
    expect(screen.getByTestId("button-import-fines").getAttribute("title")).toMatch(/meerdere brieven/i);
  });

  it("the CJIB import dialog says 'staat uit' when automatic fetching is off", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByTestId("button-cjib-imports"));
    expect(await screen.findByText("Automatisch ophalen staat uit")).toBeTruthy();
  });
});
