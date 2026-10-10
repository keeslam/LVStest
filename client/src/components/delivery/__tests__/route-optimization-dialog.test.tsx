/**
 * A-8-5 (fysieke E2E-audit 2026-10-09, module 8) — "Route optimaliseren" must
 * not be usable while nothing is planned on the chosen date, and the dialog
 * must say why.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [] }, isLoading: false }),
}));

import { RouteOptimizationDialog } from "@/components/delivery/route-optimization-dialog";

function renderDialog(transports: any[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouteOptimizationDialog
        open
        onOpenChange={() => {}}
        reservations={[]}
        transports={transports}
        vehicles={[]}
        customers={[]}
      />
    </QueryClientProvider>,
  );
}

describe("RouteOptimizationDialog with nothing planned", () => {
  it("disables the optimise button and explains why", () => {
    renderDialog();
    expect(screen.getByTestId("button-optimize-route")).toBeDisabled();
    expect(screen.getByText(/Geen geplande leveringen of transporten/)).toBeInTheDocument();
    expect(screen.getByTestId("hint-optimize-route-disabled")).toBeInTheDocument();
  });
});
