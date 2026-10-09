/**
 * Physical audit 2026-10-09, module 13 (Communicatie), finding 1 (Hoog): the
 * tabs "E-maillogboek" and "Analyse" on /communications showed three
 * hard-coded rows from March 2024 ("APK Reminder - Inspection due soon", ...)
 * and fixed totals (44 sent, 1 failed, 3 campaigns), while the real log
 * (GET /api/email-logs, MANAGE_EMAIL_TEMPLATES only, server/index.ts) was
 * fetched and shown nowhere. A failed send was invisible to the staff.
 *
 * These tests pin the real thing: the page renders what the route returns
 * (newest first, a failed row with its error text), an empty log says so, an
 * account without the right the route needs never fetches the log and sees the
 * NoDataAccess line, and the analysis is computed from the same rows.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

// Rows in the shape GET /api/email-logs returns (shared/schema.ts, emailLogs):
// one row per send attempt (recipient + result set) and one summary row per
// notification run (recipient null).
const LOG_ROWS = [
  {
    id: 1, template: "apk", subject: "APK-herinnering AB-123-C", recipients: 1,
    emailsSent: 1, emailsFailed: 0, failureReason: null, vehicleIds: [],
    sentAt: "2026-10-01T10:00:00.000Z", recipient: "oud@voorbeeld.test", result: "sent", documentId: null,
  },
  {
    id: 3, template: "custom", subject: "Mislukte testmail", recipients: 1,
    emailsSent: 0, emailsFailed: 1, failureReason: "No valid email configuration for purpose: custom",
    vehicleIds: [], sentAt: "2026-10-09T12:00:00.000Z", recipient: "audit@e2e.invalid", result: "failed", documentId: null,
  },
  {
    id: 2, template: "maintenance", subject: "Onderhoudsronde oktober", recipients: 8,
    emailsSent: 7, emailsFailed: 1, failureReason: "No suitable email for DD-444-D",
    vehicleIds: [4, 5], sentAt: "2026-10-05T09:00:00.000Z", recipient: null, result: null, documentId: null,
  },
];

let fetchMock: ReturnType<typeof vi.fn>;
let logResponse: () => Response;

function calledWith(url: string): boolean {
  return fetchMock.mock.calls.some(([input]) => {
    const requestUrl = typeof input === "string" ? input : (input as Request)?.url ?? "";
    return requestUrl.includes(url);
  });
}

beforeEach(() => {
  logResponse = () => json(LOG_ROWS);
  fetchMock = vi.fn(async (input: unknown) => {
    const requestUrl = typeof input === "string" ? input : (input as Request)?.url ?? "";
    if (requestUrl.includes("/api/email-logs")) return logResponse();
    return json([]);
  });
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

describe("CustomerCommunications - E-maillogboek shows the real log", () => {
  it("renders the rows the route returns, newest first, and a failed row shows its error text", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_EMAIL_TEMPLATES];
    const user = userEvent.setup();
    withClient(<CustomerCommunications />);

    await user.click(screen.getByRole("tab", { name: "E-maillogboek" }));
    const rows = await screen.findAllByTestId("email-log-row");
    expect(rows).toHaveLength(3);

    // Newest first, whatever order the route used: 9 Oct, 5 Oct, 1 Oct.
    expect(within(rows[0]).getByText("Mislukte testmail")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Onderhoudsronde oktober")).toBeInTheDocument();
    expect(within(rows[2]).getByText("APK-herinnering AB-123-C")).toBeInTheDocument();

    // Recipient of a per-mail row, the date, and the status per row.
    expect(within(rows[0]).getByText("audit@e2e.invalid")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/9 oktober 2026/)).toBeInTheDocument();
    expect(within(rows[0]).getByTestId("email-log-status")).toHaveTextContent(/^mislukt$/);
    expect(within(rows[2]).getByTestId("email-log-status")).toHaveTextContent(/^verzonden$/);

    // The error text of a failed send is on screen, exactly as the log holds it.
    expect(within(rows[0]).getByText(/No valid email configuration for purpose: custom/)).toBeInTheDocument();

    // A run that partly failed says so, with its counts and reason.
    expect(within(rows[1]).getByTestId("email-log-status")).toHaveTextContent(/^deels mislukt$/);
    expect(within(rows[1]).getByText(/8 ontvangers/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/No suitable email for DD-444-D/)).toBeInTheDocument();

    // None of the hard-coded March 2024 rows survives.
    expect(screen.queryByText("APK Reminder - Inspection due soon")).not.toBeInTheDocument();
    expect(screen.queryByText("Scheduled maintenance reminder")).not.toBeInTheDocument();
    expect(screen.queryByText("Important vehicle recall notice")).not.toBeInTheDocument();
  });

  it("says so when the log is empty, and shows none of the old sample rows", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_EMAIL_TEMPLATES];
    logResponse = () => json([]);
    const user = userEvent.setup();
    withClient(<CustomerCommunications />);

    await user.click(screen.getByRole("tab", { name: "E-maillogboek" }));
    expect(await screen.findByTestId("email-log-empty")).toHaveTextContent("Er zijn nog geen e-mails verstuurd");
    expect(screen.queryAllByTestId("email-log-row")).toHaveLength(0);
    expect(screen.queryByText("APK Reminder - Inspection due soon")).not.toBeInTheDocument();
  });

  it("says the log could not be loaded when the route fails, instead of an empty list", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_EMAIL_TEMPLATES];
    logResponse = () => json({ error: "Failed to fetch email logs" }, 500);
    const user = userEvent.setup();
    withClient(<CustomerCommunications />);

    await user.click(screen.getByRole("tab", { name: "E-maillogboek" }));
    expect(await screen.findByTestId("email-log-error")).toBeInTheDocument();
    expect(screen.queryByTestId("email-log-empty")).not.toBeInTheDocument();
  });

  it("without manage_email_templates: no fetch of the log, NoDataAccess on both tabs", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_NOTIFICATIONS];
    const user = userEvent.setup();
    withClient(<CustomerCommunications />);

    await user.click(screen.getByRole("tab", { name: "E-maillogboek" }));
    expect(await screen.findByTestId("no-data-access")).toHaveTextContent("E-mailsjablonen beheren");
    expect(screen.queryByTestId("email-log-empty")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("email-log-row")).toHaveLength(0);

    await user.click(screen.getByRole("tab", { name: "Analyse" }));
    expect(await screen.findByTestId("no-data-access")).toHaveTextContent("E-mailsjablonen beheren");

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledWith("/api/email-logs")).toBe(false);
  });

  it("admin gets the log regardless of the permissions array", async () => {
    role = UserRole.ADMIN;
    permissions = [];
    const user = userEvent.setup();
    withClient(<CustomerCommunications />);

    await user.click(screen.getByRole("tab", { name: "E-maillogboek" }));
    expect(await screen.findAllByTestId("email-log-row")).toHaveLength(3);
    expect(calledWith("/api/email-logs")).toBe(true);
  });
});

describe("CustomerCommunications - Analyse is computed from the same log", () => {
  it("counts the sent and failed mails per recipient, the runs, and the kinds from the rows, not from fixed totals", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_EMAIL_TEMPLATES];
    const user = userEvent.setup();
    withClient(<CustomerCommunications />);

    await user.click(screen.getByRole("tab", { name: "Analyse" }));
    const sent = await screen.findByTestId("analytics-sent");
    // Per-recipient rows: one sent (apk), one failed (custom). One run row.
    await waitFor(() => expect(sent).toHaveTextContent(/^1$/));
    expect(screen.getByTestId("analytics-failed")).toHaveTextContent(/^1$/);
    expect(screen.getByTestId("analytics-runs")).toHaveTextContent(/^1$/);
    expect(screen.getByTestId("analytics-runs-failed")).toHaveTextContent(/^1$/);

    // Per kind: apk 1 sent / 0 failed, custom 0 sent / 1 failed, maintenance
    // has only a run row (no per-recipient row), so 0 and 0.
    expect(screen.getByTestId("analytics-kind-apk")).toHaveTextContent(/1s*E-mails verstuurds*0 mislukt/);
    expect(screen.getByTestId("analytics-kind-custom")).toHaveTextContent(/0s*E-mails verstuurds*1 mislukt/);
    expect(screen.getByTestId("analytics-kind-maintenance")).toHaveTextContent(/0s*E-mails verstuurds*0 mislukt/);
    expect(screen.getByTestId("analytics-basis-note")).toBeInTheDocument();

    // The old fixed totals (44 sent, 15 active customers) are gone.
    expect(screen.queryByText("44")).not.toBeInTheDocument();
    expect(screen.queryByText("15")).not.toBeInTheDocument();
  });

  it("shows zeros, not sample numbers, when the log is empty", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_EMAIL_TEMPLATES];
    logResponse = () => json([]);
    const user = userEvent.setup();
    withClient(<CustomerCommunications />);

    await user.click(screen.getByRole("tab", { name: "Analyse" }));
    expect(await screen.findByTestId("analytics-sent")).toHaveTextContent("0");
    expect(screen.getByTestId("analytics-failed")).toHaveTextContent("0");
    expect(screen.getByTestId("analytics-runs")).toHaveTextContent("0");
    expect(screen.queryByText("44")).not.toBeInTheDocument();
  });
});
