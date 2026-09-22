/**
 * Task 5 (docs/superpowers/specs/2026-09-21-toegang-design.md, §3; fact
 * sheet, PAGE x PERMISSION TABLE row 12) — the page's own permission is
 * MANAGE_EMAIL_TEMPLATES (B-29 narrowed it, shared/page-access.ts); none of
 * the three recipient-list queries accept it. These are the actual
 * recipient-selection lists the send buttons act on - a visible hole, so
 * denied renders NoDataAccess in place of each grid instead of a silent
 * empty box. `/api/email-templates` and `/api/email-logs` both accept
 * MANAGE_EMAIL_TEMPLATES alone (server/index.ts:417/418) - matching the
 * page's own gate exactly, unaffected.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";

let role: string = UserRole.USER;
let permissions: string[] = [UserPermission.MANAGE_EMAIL_TEMPLATES];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import CustomerCommunications from "@/pages/CustomerCommunications";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

function calledWith(url: string): boolean {
  return fetchMock.mock.calls.some(([input]) => {
    const requestUrl = typeof input === "string" ? input : (input as Request)?.url ?? "";
    return requestUrl.includes(url);
  });
}

beforeEach(() => {
  fetchMock = vi.fn(async () => json([]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function withClient(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe("CustomerCommunications — recipient-list queries follow their own families, not manage_email_templates", () => {
  it("fires /api/email-templates and /api/email-logs, never /api/vehicles/filtered or /api/customers, and shows NoDataAccess in the apk-tab grid", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_EMAIL_TEMPLATES];
    withClient(<CustomerCommunications />);

    await waitFor(() => expect(calledWith("/api/email-templates")).toBe(true));
    await waitFor(() => expect(calledWith("/api/email-logs")).toBe(true));
    // Default tab ("send") + default mode ("apk"): the vehicle grid shows NoDataAccess.
    expect(await screen.findByTestId("no-data-access")).toHaveTextContent("Voertuigen bekijken");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith("/api/vehicles/filtered")).toBe(false);
    expect(calledWith("/api/customers")).toBe(false);
  });

  it("fires /api/vehicles/filtered with view_vehicles, no NoDataAccess in the apk-tab grid", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_EMAIL_TEMPLATES, UserPermission.VIEW_VEHICLES];
    withClient(<CustomerCommunications />);

    await waitFor(() => expect(calledWith("/api/vehicles/filtered")).toBe(true));
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
  });

  it("fires /api/customers with view_customers", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_EMAIL_TEMPLATES, UserPermission.VIEW_CUSTOMERS];
    withClient(<CustomerCommunications />);

    await waitFor(() => expect(calledWith("/api/customers")).toBe(true));
  });

  it("admin gets every query regardless of the permissions array", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    withClient(<CustomerCommunications />);

    await waitFor(() => expect(calledWith("/api/email-templates")).toBe(true));
    await waitFor(() => expect(calledWith("/api/vehicles/filtered")).toBe(true));
    await waitFor(() => expect(calledWith("/api/customers")).toBe(true));
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
  });
});

/**
 * B-29a — the screen now also opens for MANAGE_NOTIFICATIONS alone (an
 * account that may send but not manage templates, per the owner). Template
 * MANAGEMENT (create, edit, delete, the e-mail log) stays behind
 * MANAGE_EMAIL_TEMPLATES: its two queries (`/api/email-templates`,
 * `/api/email-logs`) stay gated exactly as above, and every control that
 * mutates a template is wrapped in `RequiresPermission
 * anyOf={[MANAGE_EMAIL_TEMPLATES]}` - visible, disabled, explains itself -
 * while the three send openers stay wrapped in `RequiresPermission
 * anyOf={[MANAGE_NOTIFICATIONS]}`, unaffected by this change.
 */
describe("CustomerCommunications — B-29a: opener gating follows manage_notifications vs manage_email_templates independently", () => {
  it("manage_notifications alone: the send opener stays enabled, template management is disabled and explains itself, and neither template query fires", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_NOTIFICATIONS];
    const user = userEvent.setup();
    withClient(<CustomerCommunications />);

    // Default tab ("send") + default mode ("apk"): the preview-and-send
    // opener needs MANAGE_NOTIFICATIONS only, which this profile holds.
    const sendOpener = await screen.findByTestId("button-preview-apk");
    expect(sendOpener).not.toHaveAttribute("aria-disabled", "true");

    // Neither query the templates tab depends on is gated by
    // MANAGE_NOTIFICATIONS - both stay disabled, no request fires.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith("/api/email-templates")).toBe(false);
    expect(calledWith("/api/email-logs")).toBe(false);

    // Switch to the template builder tab: its list is a visible hole, not
    // a genuine "zero templates" state.
    await user.click(screen.getByRole("tab", { name: "Sjabloonbouwer" }));
    expect(await screen.findByTestId("no-data-access")).toHaveTextContent("E-mailsjablonen beheren");

    // The "new template" opener needs MANAGE_EMAIL_TEMPLATES, which this
    // profile does not hold: visible, disabled, and the tooltip names the
    // missing right (reachable by keyboard focus on the wrapping span, same
    // as client/src/components/ui/__tests__/requires-permission.test.tsx).
    const newTemplateButton = await screen.findByTestId("button-new-template");
    expect(newTemplateButton).toHaveAttribute("aria-disabled", "true");
    const wrapper = newTemplateButton.parentElement as HTMLElement;
    wrapper.focus();
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent("E-mailsjablonen beheren");
    });
  });

  it("manage_email_templates alone: template management stays enabled and both its queries fire, the send opener is disabled and explains itself", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_EMAIL_TEMPLATES];
    const user = userEvent.setup();
    withClient(<CustomerCommunications />);

    await waitFor(() => expect(calledWith("/api/email-templates")).toBe(true));
    await waitFor(() => expect(calledWith("/api/email-logs")).toBe(true));

    // The preview-and-send opener needs MANAGE_NOTIFICATIONS, which this
    // profile does not hold.
    const sendOpener = await screen.findByTestId("button-preview-apk");
    expect(sendOpener).toHaveAttribute("aria-disabled", "true");
    const sendWrapper = sendOpener.parentElement as HTMLElement;
    sendWrapper.focus();
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent("Meldingen beheren");
    });

    // Template management stays enabled: no NoDataAccess, "new template" not disabled.
    await user.click(screen.getByRole("tab", { name: "Sjabloonbouwer" }));
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
    const newTemplateButton = await screen.findByTestId("button-new-template");
    expect(newTemplateButton).not.toHaveAttribute("aria-disabled", "true");
  });
});
