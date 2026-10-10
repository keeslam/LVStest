/**
 * A-12-10 (audit 2026-10-09): the setting `fineAdminFee` (the administration fee a
 * new fine starts with) had no field in App-instellingen. Saving the form also
 * left it out of the PUT, so the server's default (0) silently replaced a value
 * set elsewhere.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { PortalConfigForm } from "@/components/portal-admin/portal-config-form";

const CONFIG = {
  allowedFrameOrigins: ["https://lamgroep.nl"], notificationEmail: "", portalBaseUrl: "", fineAdminFee: 12.5,
  pickupAddress: "", openingHours: "", pickupInstructions: "", privacyUrl: "", phone: "",
};

let puts: Array<Record<string, unknown>> = [];
beforeEach(() => {
  puts = [];
  queryClient.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "PUT") {
      const body = JSON.parse(String(init!.body));
      puts.push(body);
      return new Response(JSON.stringify({ ...CONFIG, ...body }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(CONFIG), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); queryClient.clear(); });

function renderIt() {
  return render(<QueryClientProvider client={queryClient}><PortalConfigForm /><Toaster /></QueryClientProvider>);
}

describe("PortalConfigForm: administration fee", () => {
  it("shows the stored fee and saves a changed one", async () => {
    const user = userEvent.setup();
    renderIt();
    const field = await screen.findByLabelText(/administratiekosten/i);
    await vi.waitFor(() => expect((field as HTMLInputElement).value).toBe("12.5"));
    await user.clear(field);
    await user.type(field, "15");
    await user.click(screen.getByTestId("button-save-portal-config"));
    await vi.waitFor(() => expect(puts.length).toBe(1));
    expect(puts[0].fineAdminFee).toBe(15);
  });

  it("keeps the stored fee when nothing else about it is touched", async () => {
    const user = userEvent.setup();
    renderIt();
    const field = await screen.findByLabelText(/administratiekosten/i);
    await vi.waitFor(() => expect((field as HTMLInputElement).value).toBe("12.5"));
    await user.click(screen.getByTestId("button-save-portal-config"));
    await vi.waitFor(() => expect(puts.length).toBe(1));
    expect(puts[0].fineAdminFee).toBe(12.5);
  });

  it("refuses a negative or unreadable fee with a message and sends nothing", async () => {
    const user = userEvent.setup();
    renderIt();
    const field = await screen.findByLabelText(/administratiekosten/i);
    await vi.waitFor(() => expect((field as HTMLInputElement).value).toBe("12.5"));
    await user.clear(field);
    await user.type(field, "-3");
    await user.click(screen.getByTestId("button-save-portal-config"));
    expect(await screen.findByTestId("portal-config-fee-error")).toBeTruthy();
    expect(puts).toEqual([]);
  });
});
