/**
 * Audit remediation P5, A-5-2 - the vehicle-remarks warning is a modal, so the
 * employee's next click (usually on the customer field) landed on its backdrop
 * and did nothing, with no sign of why. The dialog now says that it wants an
 * answer, and a click next to it points at the buttons.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VehicleRemarksWarningDialog } from "@/components/vehicles/vehicle-remarks-warning-dialog";

const vehicle = {
  id: 1, licensePlate: "AB-123-C", brand: "Fiat", model: "Ducato", remarks: "Linkerspiegel los",
} as any;

function renderDialog(context: "reservation" | "pickup" | "view" = "reservation") {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <VehicleRemarksWarningDialog
        open
        onOpenChange={() => {}}
        vehicle={vehicle}
        context={context}
        onAcknowledge={() => {}}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("A-5-2 - the remarks warning explains why other clicks do nothing", () => {
  it("states that one of the two buttons is needed to continue", async () => {
    renderDialog("reservation");
    const hint = await screen.findByTestId("remarks-choose-hint");
    expect(hint).toHaveTextContent(/Kies .*Annuleren.*Ik bevestig/);
    expect(hint).toHaveAttribute("data-nudged", "false");
  });

  it("answers a click on the backdrop by pointing at the buttons", async () => {
    renderDialog("reservation");
    const hint = await screen.findByTestId("remarks-choose-hint");
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(hint).toHaveAttribute("data-nudged", "true"));
    expect(document.activeElement).toBe(screen.getByTestId("button-acknowledge-remarks"));
  });

  it("does not react to a click inside the dialog", async () => {
    renderDialog("reservation");
    const hint = await screen.findByTestId("remarks-choose-hint");
    fireEvent.pointerDown(screen.getByTestId("text-vehicle-remarks"));
    expect(hint).toHaveAttribute("data-nudged", "false");
  });

  it("is not shown for the plain 'view' context, which has a single close button", async () => {
    renderDialog("view");
    await screen.findByTestId("text-vehicle-remarks");
    expect(screen.queryByTestId("remarks-choose-hint")).toBeNull();
  });
});
