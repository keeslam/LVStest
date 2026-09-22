/**
 * Forms that pre-fill "today" read it with
 * `new Date().toISOString().split("T")[0]`, which is the date in UTC. Between
 * midnight and 01:00 (winter) or 02:00 (summer) the desk saw yesterday. Commit
 * 61c10948 moved the pickup and return dialogs to `officeToday()`; these are
 * the other screens that ask the same question.
 *
 * The clock stands at 00:30 in Amsterdam on 21 September 2026, which is still
 * 20 September in UTC.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserRole } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { ReturnFromServiceDialog } from "@/components/reservations/return-from-service-dialog";
import { ServiceVehicleDialog } from "@/components/reservations/service-vehicle-dialog";
import { NotificationCenterDialog } from "@/components/notifications/notification-center-dialog";
import { CustomNotificationsPanel } from "@/components/notifications/custom-notifications-panel";
import { InvoiceReviewDialog } from "@/components/expenses/invoice-review-dialog";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { MaintenanceApproval } from "@/components/portal-admin/maintenance-approval";
import { ScheduleMaintenanceDialog } from "@/components/maintenance/schedule-maintenance-dialog";
import { TransportDialog } from "@/components/delivery/transport-dialog";
import { RouteOptimizationDialog } from "@/components/delivery/route-optimization-dialog";

// This file's own house pattern (see notification-center-dialog-permissions.test.tsx,
// quick-action-entry-points.test.tsx): a merge effect, not this file's own
// doing — it came from a branch based on 61c10948, before
// ScheduleMaintenanceDialog, TransportDialog and NotificationCenterDialog
// gained their useHasPermission(VIEW_CUSTOMERS, MANAGE_CUSTOMERS) gates on
// this branch. Every dialog here needs to render exactly as it did when this
// file was written, so an admin user (bypasses every permission check) is
// the least intrusive fix — nothing under test here is about permissions,
// only about which day a form pre-fills.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [], hidePrices: false }, isLoading: false }),
}));

const OFFICE_TODAY = "2026-09-21";
const OFFICE_TOMORROW = "2026-09-22";

let requests: Array<{ url: string; method: string; body: any }>;

beforeEach(() => {
  requests = [];
  // Only `Date` is faked: user-event and react-query keep their real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-20T22:30:00Z"));
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: any;
    try { body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined; } catch { body = undefined; }
    requests.push({ url, method, body });
    if (url.includes("/approve")) return json({ block: { id: 77 } });
    return json([]);
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderInClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: async () => [], retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>{ui}</GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

const valueOf = (testId: string) => (screen.getByTestId(testId) as HTMLInputElement).value;

describe("'vandaag' net na middernacht, op de kantoorklok", () => {
  it("Terug van onderhoud: the return date", async () => {
    renderInClient(
      <ReturnFromServiceDialog
        open
        onOpenChange={() => {}}
        replacementReservation={{ id: 3366, vehicleId: 1821, type: "replacement" } as any}
      />,
    );
    await screen.findByTestId("input-return-date");
    expect(valueOf("input-return-date")).toBe(OFFICE_TODAY);
  });

  it("Voertuig markeren voor onderhoud: the service start date", async () => {
    renderInClient(
      <ServiceVehicleDialog
        open
        onOpenChange={() => {}}
        reservationId={3364}
        vehicle={{ id: 1821, licensePlate: "HL-02-HL", brand: "Volkswagen", model: "Crafter" } as any}
      />,
    );
    await screen.findByTestId("input-service-start-date");
    expect(valueOf("input-service-start-date")).toBe(OFFICE_TODAY);
  });

  it("Meldingencentrum: the date of a new notification", async () => {
    const user = userEvent.setup();
    renderInClient(<NotificationCenterDialog open onOpenChange={() => {}} />);
    await user.click(await screen.findByTestId("tab-custom"));
    await user.click(await screen.findByTestId("button-add-notification"));
    await screen.findByTestId("input-notification-date");
    expect(valueOf("input-notification-date")).toBe(OFFICE_TODAY);
  });

  it("Eigen meldingen: the date of a new notification", async () => {
    const user = userEvent.setup();
    renderInClient(<CustomNotificationsPanel />);
    await user.click(await screen.findByTestId("button-add-notification"));
    await screen.findByTestId("input-notification-date");
    expect(valueOf("input-notification-date")).toBe(OFFICE_TODAY);
  });

  it("Factuur controleren: the invoice date when the mail gave none", async () => {
    const item = {
      id: 12, messageId: "<a@b>", fromAddress: "facturen@garage.nl", subject: "Factuur", mailDate: null,
      attachmentName: "factuur.pdf", attachmentPath: null, attachmentHash: "h", attachmentContentType: "application/pdf",
      invoiceHash: "i", status: "review", reviewReason: "no_plate", vehicleId: null, expenseIds: [], errorMessage: null, note: null,
      receivedAt: "2026-09-20T22:00:00.000Z", processedAt: null, createdBy: "scheduler", updatedBy: null, vehiclePlate: null,
      parsed: { vendor: "Garage Jansen", invoiceNumber: "2026-0412", invoiceDate: "", currency: "EUR", totalAmount: 100, plates: [], lineItems: [] },
    } as any;
    renderInClient(<InvoiceReviewDialog item={item} vehicles={[]} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText("Factuurdatum")).toHaveValue(OFFICE_TODAY));
  });

  it("Voertuig toevoegen: the registration date set by the BV switch", async () => {
    const user = userEvent.setup();
    renderInClient(<VehicleForm redirectToList={false} />);
    await user.click(screen.getByRole("tab", { name: "Datums" }));
    await user.click(await screen.findByRole("switch", { name: "Registratie: BV" }));
    await waitFor(() => expect(screen.getByLabelText("Registratiedatum bedrijf")).toHaveValue(OFFICE_TODAY));
  });

  it("Voertuig toevoegen: the registration date set by the Opnaam switch", async () => {
    const user = userEvent.setup();
    renderInClient(<VehicleForm redirectToList={false} />);
    await user.click(screen.getByRole("tab", { name: "Datums" }));
    await user.click(await screen.findByRole("switch", { name: "Registratie: Opnaam" }));
    await waitFor(() => expect(screen.getByLabelText("Registratiedatum")).toHaveValue(OFFICE_TODAY));
  });

  it("Onderhoud inplannen: the scheduled date", async () => {
    renderInClient(<ScheduleMaintenanceDialog open onOpenChange={() => {}} />);
    await screen.findByTestId("input-scheduled-date");
    expect(valueOf("input-scheduled-date")).toBe(OFFICE_TODAY);
  });

  it("Nieuw transport: the scheduled date", async () => {
    renderInClient(<TransportDialog open onOpenChange={() => {}} />);
    await screen.findByTestId("input-transport-scheduled-date");
    expect(valueOf("input-transport-scheduled-date")).toBe(OFFICE_TODAY);
  });

  it("Route optimaliseren: the day whose stops are shown", async () => {
    renderInClient(
      <RouteOptimizationDialog open onOpenChange={() => {}} reservations={[]} transports={[]} vehicles={[]} customers={[]} />,
    );
    const input = await waitFor(() => {
      const found = document.querySelector('input[type="date"]') as HTMLInputElement | null;
      expect(found).not.toBeNull();
      return found!;
    });
    expect(input.value).toBe(OFFICE_TODAY);
  });
});

describe("'morgen' net na middernacht, op de kantoorklok", () => {
  it("Portaalverzoek onderhoud: the proposed date when the customer gave none", async () => {
    const user = userEvent.setup();
    const request = { id: 5, type: "maintenance", payload: { issue: "Remmen piepen" } } as any;
    renderInClient(<MaintenanceApproval request={request} onApproved={() => {}} />);

    await user.click(screen.getByTestId("button-approve-maintenance"));

    await waitFor(() => expect(requests.some((r) => r.url.includes("/api/portal-requests/5/approve"))).toBe(true));
    // The old helper added a day to the browser's date and read it back in UTC,
    // so at 00:30 "tomorrow" was today.
    expect(requests.find((r) => r.url.includes("/approve"))!.body.startDate).toBe(OFFICE_TOMORROW);
  });
});
