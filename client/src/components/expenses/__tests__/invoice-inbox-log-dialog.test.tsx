import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPermission } from "@shared/schema";

const { authUser } = vi.hoisted(() => ({
  authUser: { current: { id: 1, username: "kees", role: "manager", permissions: [] as string[] } },
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: authUser.current }) }));

import { InvoiceInboxLogButton } from "@/components/expenses/invoice-inbox-log-dialog";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

const logRow = (over: Record<string, unknown> = {}) => ({
  id: 1, receivedAt: "2026-09-18T08:05:00.000Z", mailDate: "2026-09-18T08:00:00.000Z",
  fromAddress: "facturen@garage.nl", subject: "Factuur 2026-0412", attachmentName: "factuur.pdf",
  status: "booked", reviewReason: null, errorMessage: null, vehiclePlate: "V-123-XB",
  vendor: "Garage Jansen", invoiceNumber: "2026-0412", totalAmount: 181.5, hasFile: true, expenseIds: [9],
  ...over,
});

describe("InvoiceInboxLogButton", () => {
  let calls: string[];
  /** Total the log route reports, so "Meer laden" can be made to appear. */
  let logTotal: number;

  const queryOf = (url: string) => new URL(url, "http://localhost").searchParams;
  const logCalls = () => calls.filter((u) => u.includes("/api/expenses/inbox/log"));
  const runCalls = () => calls.filter((u) => u.includes("/api/expenses/inbox/runs"));

  beforeEach(() => {
    calls = [];
    logTotal = 1;
    authUser.current = { id: 1, username: "kees", role: "manager", permissions: [UserPermission.MANAGE_EXPENSES] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/api/expenses/inbox/log")) {
        const params = queryOf(url);
        const offset = Number(params.get("offset") ?? 0);
        // Two rows per page, whatever the component asked for, so paging shows.
        return json({
          items: [logRow({ id: offset + 1 }), logRow({ id: offset + 2, subject: "Tweede factuur" })],
          total: logTotal,
        });
      }
      if (url.includes("/api/expenses/inbox/runs")) {
        return json({
          runs: [{
            id: 5, startedAt: "2026-09-18T09:00:00.000Z", finishedAt: "2026-09-18T09:00:02.000Z",
            trigger: "manual", triggeredBy: "kees", mails: 2, attachments: 2, booked: 1, review: 1,
            skipped: 0, failed: 0, errors: [],
          }],
          total: 1,
        });
      }
      return json({});
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const mount = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <InvoiceInboxLogButton />
    </QueryClientProvider>,
  );

  const openLog = async () => {
    await userEvent.click(await screen.findByTestId("button-invoice-inbox-log"));
    return (await screen.findByRole("dialog")) as HTMLElement;
  };

  it("fetches nothing until the log is opened, then asks for the invoices", async () => {
    mount();
    expect(logCalls()).toHaveLength(0);

    const dialog = await openLog();
    expect(await within(dialog).findByTestId("row-invoice-inbox-log-1")).toHaveTextContent("Factuur 2026-0412");
    await waitFor(() => expect(logCalls()).toHaveLength(1));
    expect(queryOf(logCalls()[0]).get("kind")).toBe("invoices");
    // Only the tab that is showing is fetched.
    expect(runCalls()).toHaveLength(0);
  });

  it("searches on the server once the typing has settled", async () => {
    mount();
    const dialog = await openLog();
    const search = within(dialog).getByTestId("input-invoice-inbox-log-search");
    await userEvent.type(search, "jansen");

    await waitFor(() => expect(logCalls().some((u) => queryOf(u).get("q") === "jansen")).toBe(true), { timeout: 3000 });
    // Debounced: the half-typed words never reached the server.
    expect(logCalls().some((u) => ["j", "ja", "jan"].includes(queryOf(u).get("q") ?? ""))).toBe(false);
  });

  it("asks for the other kind when the tab changes, and for the runs on the third tab", async () => {
    mount();
    const dialog = await openLog();

    await userEvent.click(within(dialog).getByTestId("tab-invoice-inbox-log-other"));
    await waitFor(() => expect(logCalls().some((u) => queryOf(u).get("kind") === "other")).toBe(true));

    await userEvent.click(within(dialog).getByTestId("tab-invoice-inbox-log-runs"));
    await waitFor(() => expect(runCalls()).toHaveLength(1));
  });

  it("asks for the next page when more is loaded", async () => {
    logTotal = 5;
    mount();
    const dialog = await openLog();
    await within(dialog).findByTestId("row-invoice-inbox-log-1");

    const more = await within(dialog).findByTestId("button-invoice-inbox-log-more");
    await userEvent.click(more);
    // Two rows were shown, so the next page starts after them.
    await waitFor(() => expect(logCalls().some((u) => queryOf(u).get("offset") === "2")).toBe(true));
  });

  it("offers the attachment and the review list only to whoever may manage expenses", async () => {
    authUser.current = { id: 2, username: "beheer", role: "manager", permissions: [UserPermission.MANAGE_SETTINGS] };
    mount();
    const dialog = await openLog();
    await within(dialog).findByTestId("row-invoice-inbox-log-1");
    expect(within(dialog).queryByTestId("link-invoice-inbox-log-file-1")).not.toBeInTheDocument();
  });

  it("opens the attachment for whoever may manage expenses", async () => {
    mount();
    const dialog = await openLog();
    await within(dialog).findByTestId("row-invoice-inbox-log-1");
    const link = within(dialog).getByTestId("link-invoice-inbox-log-file-1");
    expect(link).toHaveAttribute("href", "/api/expenses/inbox/items/1/file");
  });

  it("flips activeOnly with the switch on the runs tab", async () => {
    mount();
    const dialog = await openLog();
    await userEvent.click(within(dialog).getByTestId("tab-invoice-inbox-log-runs"));
    await waitFor(() => expect(runCalls()).toHaveLength(1));
    expect(queryOf(runCalls()[0]).get("activeOnly")).toBe("true");

    await userEvent.click(within(dialog).getByTestId("switch-invoice-inbox-log-active"));
    await waitFor(() => expect(runCalls().some((u) => queryOf(u).get("activeOnly") === "false")).toBe(true));
  });
});
