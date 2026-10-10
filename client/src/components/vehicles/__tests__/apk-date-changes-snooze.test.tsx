/**
 * A-20-1 (fysieke E2E-audit 2026-10-09, module 20) — the pop-up "APK-datums
 * gewijzigd bij de RDW" came back in every new session until each proposal was
 * decided. "Later" closes it and keeps it quiet until tomorrow (office date).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { officeTomorrow } from "@/lib/office-date";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [] }, isLoading: false }),
}));

import { ApkDateChangesDialog, APK_DATE_CHANGES_SNOOZE_KEY } from "@/components/vehicles/apk-date-changes-dialog";

const pending = [{
  id: 1, vehicleId: 9, previousApkDate: "2026-09-03", newApkDate: "2027-09-24",
  licensePlate: "2XJT31", brand: "VW", model: "Crafter",
}];

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider><ApkDateChangesDialog /></GlobalDialogProvider>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify(pending), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

describe("APK-date changes pop-up — Later", () => {
  it("opens by itself in a fresh session", async () => {
    renderDialog();
    expect(await screen.findByTestId("button-apk-changes-later")).toBeInTheDocument();
  });

  it("'Later' closes it and snoozes it until tomorrow", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("button-apk-changes-later"));

    expect(screen.queryByTestId("button-apk-changes-later")).not.toBeInTheDocument();
    expect(localStorage.getItem(APK_DATE_CHANGES_SNOOZE_KEY)).toBe(officeTomorrow());
  });

  it("stays closed in a new session while snoozed", async () => {
    localStorage.setItem(APK_DATE_CHANGES_SNOOZE_KEY, officeTomorrow());
    const client = renderDialog();
    // The pending changes have arrived (so the auto-open effect had its chance)...
    await waitFor(() => expect(client.getQueryData(["/api/apk-date-changes"])).toEqual(pending));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    // ...and the snooze kept the dialog shut.
    expect(screen.queryByTestId("button-apk-changes-later")).not.toBeInTheDocument();
  });

  it("opens again once the snooze day has come", async () => {
    localStorage.setItem(APK_DATE_CHANGES_SNOOZE_KEY, "2000-01-01");
    renderDialog();
    expect(await screen.findByTestId("button-apk-changes-later")).toBeInTheDocument();
  });
});
