/**
 * The customer portal asks "what day is it" in two places: the first day of a
 * rental request ("today") and the first day a customer may propose for
 * maintenance ("tomorrow"). Both read the date in UTC, so just after midnight
 * a rental started yesterday and "tomorrow" was today.
 *
 * The clock stands at 00:30 in Amsterdam on Monday 21 September 2026, which is
 * still 20 September in UTC.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-portal-auth", () => ({
  usePortalAuth: () => ({
    me: { id: 1, email: "klant@example.com", fullName: "Klant", role: "driver", customerId: 2, customerName: "Klant BV", language: "nl", settings: { canBook: true, showPrices: false } },
    isLoading: false,
    refresh: async () => {},
    logout: async () => {},
  }),
}));
vi.mock("@/hooks/use-portal-dialogs", () => ({ usePortalDialogs: () => ({ openNewRequest: () => {}, openList: () => {} }) }));

import { RequestForm } from "@/components/portal/request-form";
import { AvailableVehicles } from "@/components/portal/vehicle-cards";

let urls: string[];

beforeEach(() => {
  urls = [];
  // Only `Date` is faked: user-event and react-query keep their real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-20T22:30:00Z"));
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    urls.push(typeof input === "string" ? input : input?.url ?? String(input));
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderInClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("het klantportaal net na middernacht", () => {
  it("starts a rental request on the office's today", async () => {
    renderInClient(<RequestForm initialType="booking" onSubmitted={() => {}} />);
    await waitFor(() => expect(urls.some((u) => u.includes("/api/portal/vehicles?"))).toBe(true));
    expect(urls.find((u) => u.includes("/api/portal/vehicles?"))).toContain("start=2026-09-21&");
  });

  it("looks for free vehicles from the office's today", async () => {
    renderInClient(<AvailableVehicles />);
    await waitFor(() => expect(urls.some((u) => u.includes("/api/portal/vehicles?"))).toBe(true));
    expect(urls.find((u) => u.includes("/api/portal/vehicles?"))).toContain("start=2026-09-21&");
  });

  it("does not offer today as a day to propose for maintenance", async () => {
    const user = userEvent.setup();
    renderInClient(<RequestForm initialType="maintenance" reservationId={10} onSubmitted={() => {}} />);

    await user.click(screen.getByTestId("request-preferred-date-button"));

    // The calendar opens on September; the first "21" is Monday 21 September.
    const grid = (await screen.findAllByRole("grid"))[0];
    const day = (n: string) => within(grid).getAllByRole("gridcell", { name: n }).find((c) => c.tagName === "BUTTON") as HTMLButtonElement;
    expect(day("21")).toBeDisabled();
    expect(day("22")).toBeEnabled();
  });
});
