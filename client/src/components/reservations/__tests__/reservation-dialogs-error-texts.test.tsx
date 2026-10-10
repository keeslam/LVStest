/**
 * Final wave A, item 4 (P10 re-review carry): the sentences these dialogs show for a failure are
 * spoken by code, never by the server's English text and never by a generic "something went wrong"
 * where the state is not an error at all.
 *
 *   - the edit and the view dialog with no error and no reservation (an empty answer) say they could
 *     not load the reservation; they do not append the generic status sentence;
 *   - a failed load with a code is still told by that code;
 *   - the workshop-blocked dialog words a reason code it does not know in Dutch / English by the
 *     code VEHICLE_IN_WORKSHOP, not with the server's English message.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [] }, isLoading: false }),
  AuthContext: {},
}));
vi.mock("@/components/reservations/reservation-form", () => ({ ReservationForm: () => <div /> }));

import { ReservationEditDialog } from "@/components/reservations/reservation-edit-dialog";
import { ReservationViewDialog } from "@/components/reservations/reservation-view-dialog";
import { WorkshopBlockedDialog } from "@/components/reservations/workshop-blocked-dialog";

const GENERIC = "Er is iets misgegaan";

function withClient(ui: React.ReactNode, queryFn: () => Promise<unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn, retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>{ui}</GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

afterEach(async () => {
  await i18n.changeLanguage("nl");
});

describe("the reservation dialogs, no error and no reservation", () => {
  it("the edit dialog says the details could not be loaded, without the generic sentence", async () => {
    withClient(<ReservationEditDialog open onOpenChange={() => {}} reservationId={5} />, async () => null);
    const text = await screen.findByText(/Reserveringsgegevens laden mislukt/);
    expect(text).not.toHaveTextContent(GENERIC);
  });

  it("the view dialog says the details could not be loaded, without the generic sentence", async () => {
    withClient(<ReservationViewDialog open onOpenChange={() => {}} reservationId={5} />, async () => null);
    const text = await screen.findByText(/Reserveringsgegevens laden mislukt/);
    expect(text).not.toHaveTextContent(GENERIC);
  });

  it("a failed load still names its reason by the server's code", async () => {
    const failing = async () => {
      throw Object.assign(new Error("404: {}"), { httpStatus: 404, code: "NOT_FOUND" });
    };
    withClient(<ReservationEditDialog open onOpenChange={() => {}} reservationId={5} />, failing);
    const text = await screen.findByText(/Reserveringsgegevens laden mislukt/);
    // Whatever the 404 sentence is, it is the status one and it is not the English wire text.
    expect(text).not.toHaveTextContent("404:");
  });
});

describe("WorkshopBlockedDialog, a reason code it does not know", () => {
  const refusal = { reason: "SOMETHING_NEW", message: "The vehicle may not be handed over right now." };

  it("is worded in Dutch by the code, not with the server's English message", () => {
    render(<WorkshopBlockedDialog open onOpenChange={() => {}} refusal={refusal} onForce={() => {}} />);
    expect(screen.getByTestId("workshop-blocked")).toHaveTextContent("kan niet worden uitgegeven");
    expect(screen.queryByText(/may not be handed over/)).toBeNull();
  });

  it("is worded in English by the code too", async () => {
    await i18n.changeLanguage("en");
    render(<WorkshopBlockedDialog open onOpenChange={() => {}} refusal={refusal} onForce={() => {}} />);
    expect(screen.getByTestId("workshop-blocked")).toHaveTextContent("cannot be handed over");
    expect(screen.queryByText(/may not be handed over/)).toBeNull();
  });

  it("keeps the sentence of a code it knows", () => {
    render(<WorkshopBlockedDialog open onOpenChange={() => {}} refusal={{ reason: "NOT_FOR_RENTAL" }} onForce={() => {}} />);
    expect(screen.getByTestId("workshop-blocked")).toHaveTextContent("niet voor verhuur");
  });
});
