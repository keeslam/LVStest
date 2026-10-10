/**
 * A-19-6 (audit 2026-10-09): "Standaardindeling invoegen" replaced the fields
 * after a window.confirm (ignored by the built-in browser). With fields on the
 * canvas it asks in our own dialog; cancel leaves the layout alone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { DEFAULT_DAMAGE_CHECK_FIELDS } from "@shared/schema";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "admin", role: "admin", permissions: [] }, isLoading: false }),
}));

import DamageCheckTemplateCanvasEditor from "@/pages/settings/damage-check-template-editor";

const TEMPLATE = {
  id: 1, name: "Standaard", description: null, isDefault: true, language: "nl",
  canvasFields: [{ id: "f1", type: "inspection", name: "Bestaand veld", x: 20, y: 20, width: 120, height: 24, fontSize: 10, damageTypes: [] }],
  headerText: null, footerText: null,
};
const calls: string[] = [];
beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === "string" ? input : (input as Request).url).replace(/^https?:\/\/[^/]+/, "");
    calls.push(`${(init?.method ?? "GET").toUpperCase()} ${url}`);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url === "/api/damage-check-templates") return json([TEMPLATE]);
    if (url === "/api/damage-check-fields") return json(DEFAULT_DAMAGE_CHECK_FIELDS);
    return json([]);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("damage check template editor: default layout", () => {
  it("asks before replacing existing fields; cancel keeps the layout and the confirm button is gone", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <DamageCheckTemplateCanvasEditor embedded templateId={1} />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByTestId("button-insert-default-layout", {}, { timeout: 8000 }));
    expect(await screen.findByTestId("button-confirm-replace-layout")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("confirm-dialog-cancel"));
    await waitFor(() => expect(screen.queryByTestId("button-confirm-replace-layout")).not.toBeInTheDocument());
    expect(calls.filter((c) => !c.startsWith("GET"))).toEqual([]);
    // Cancel left the layout alone; only the confirm button replaces it.
    expect(screen.getByText("Bestaand veld")).toBeInTheDocument();
    await user.click(screen.getByTestId("button-insert-default-layout"));
    await user.click(await screen.findByTestId("button-confirm-replace-layout"));
    await waitFor(() => expect(screen.queryByText("Bestaand veld")).not.toBeInTheDocument());
  });
});
