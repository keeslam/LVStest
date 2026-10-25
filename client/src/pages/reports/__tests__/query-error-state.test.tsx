/**
 * BUG-212 — "Mislukte GET-requests worden als lege toestand getoond, er is geen
 * requesttimeout, geen retry en geen enkele indicatie wanneer de server
 * onbereikbaar is."
 *
 * Reproduction (a) from the audit, as a component test: the maintenance-cost
 * report's backend answers 500 and the page shows "Geen onderhoudskostgegevens
 * beschikbaar" — indistinguishable from "these vehicles cost nothing". The
 * employee then reports a number that is not true.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MaintenanceCostsPage from "@/pages/reports/maintenance-costs";
import { RequestTimeoutError } from "@/lib/request-policy";

// The page renders <Price>, which reads the logged-in user to honour the
// "hide prices" flag. That is not what this test is about; one signed-in
// employee is enough context.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", hidePrices: false }, isLoading: false }),
}));

// Onderhoudsanalyse (Task 3): the page is now the analysis window; its Overzicht tab reads
// /api/reports/maintenance-analysis/overview. The other requests of the window (the choices of the
// filter bar) answer empty, so only the overview decides what is on screen.
type Fn = () => Promise<unknown>;
const onlyOverview = (overview: Fn) => ({ queryKey }: { queryKey: readonly unknown[] }) =>
  String(queryKey[0]).endsWith("/maintenance-analysis/overview") ? overview() : Promise.resolve(null);

/** A client with no retries and no cache carry-over between tests. */
function makeClient(queryFn: (ctx: { queryKey: readonly unknown[] }) => Promise<unknown>) {
  return new QueryClient({
    defaultOptions: {
      queries: { queryFn, retry: false, gcTime: 0, staleTime: 0 },
    },
  });
}

function renderPage(overview: Fn) {
  const client = makeClient(onlyOverview(overview));
  return render(
    <QueryClientProvider client={client}>
      <MaintenanceCostsPage />
    </QueryClientProvider>,
  );
}

const emptyButValidReport = {
  from: "2026-01-01",
  to: "2026-12-31",
  tiles: { total: 0, perVehicleMonth: null, count: 0 },
  byCategory: [],
  topVehicles: [],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("BUG-212 — a failed GET is not an empty state", () => {
  it("renders an error state, not 'geen onderhoudskostgegevens beschikbaar', when the server answers 500", async () => {
    const queryFn = vi.fn().mockRejectedValue(new Error("500: Internal Server Error"));
    renderPage(queryFn);

    await waitFor(() => expect(screen.getByTestId("query-error-state")).toBeInTheDocument());

    // The sentence the employee used to believe must not be on screen.
    expect(screen.queryByText(/Geen onderhoudskostgegevens beschikbaar/i)).toBeNull();
    expect(screen.getByText(/Kon de gegevens niet laden/i)).toBeInTheDocument();
    // And it is an alert, so a screen reader announces it too.
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("offers a retry that actually re-runs the request", async () => {
    const user = userEvent.setup();
    const queryFn = vi.fn().mockRejectedValue(new Error("500: Internal Server Error"));
    renderPage(queryFn);

    await waitFor(() => expect(screen.getByTestId("button-query-retry")).toBeInTheDocument());
    const callsBefore = queryFn.mock.calls.length;

    await user.click(screen.getByTestId("button-query-retry"));

    await waitFor(() => expect(queryFn.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("says the request timed out when the 30 s deadline was the cause, not the server", async () => {
    const queryFn = vi.fn().mockRejectedValue(new RequestTimeoutError());
    renderPage(queryFn);

    await waitFor(() => expect(screen.getByTestId("query-error-state")).toBeInTheDocument());

    expect(screen.getByText(/De server antwoordde niet op tijd/i)).toBeInTheDocument();
    expect(screen.getByText(/na 30 seconden afgebroken/i)).toBeInTheDocument();
    expect(screen.getByTestId("button-query-retry")).toBeInTheDocument();
  });

  it("still shows the genuine empty state when the server answers with no data", async () => {
    const queryFn = vi.fn().mockResolvedValue(emptyButValidReport);
    renderPage(queryFn);

    // A real, successful, empty report keeps its own wording: the fix must not
    // turn "no costs" into "something went wrong".
    await waitFor(() =>
      expect(screen.getByTestId("ma-overview-empty")).toHaveTextContent(/Geen onderhoudskosten in deze periode/i),
    );
    expect(screen.queryByTestId("query-error-state")).toBeNull();
  });
});
