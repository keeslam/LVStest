/**
 * "APK inplannen" and "Onderhoud melden": send a request (the form opens with the rental filled in), or pick a day and time
 * yourself in the garage's online agenda. That agenda is a page of the garage software, so it is only shown on request, with
 * what to tick and the car's details next to it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const PLANNER = "https://planner.garage.software/#/afspraken/4353313633393035";
let plannerUrl = PLANNER;
const openNewRequest = vi.fn();
vi.mock("@/hooks/use-portal-auth", () => ({ usePortalAuth: () => ({ me: { id: 1, role: "admin", settings: { canSubmitRequests: true }, info: { apkPlannerUrl: plannerUrl } }, isLoading: false }) }));
vi.mock("@/hooks/use-portal-dialogs", () => ({ usePortalDialogs: () => ({ openNewRequest }) }));

import { ApkDialog } from "@/components/portal/apk-dialog";

const reservation = { id: 77, status: "picked_up", vehicle: { brand: "PEUGEOT", model: "BOXER", licensePlate: "11ZSZ3", apkDate: "2026-11-20" } };

beforeEach(() => {
  plannerUrl = PLANNER; openNewRequest.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(reservation), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

function renderDialog(onClose = () => {}, props: { reservationId?: number | null; mode?: "apk" | "maintenance" } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><ApkDialog open reservationId={props.reservationId === undefined ? 77 : props.reservationId} mode={props.mode} onClose={onClose} /></QueryClientProvider>);
}

describe("APK inplannen", () => {
  it("shows the car and when its APK runs out, and keeps the garage's page out of sight until it is asked for", async () => {
    renderDialog();
    expect(await screen.findByText("PEUGEOT BOXER")).toBeInTheDocument();
    expect(screen.getByText(/APK verloopt op 20-11-2026/)).toBeInTheDocument();
    expect(screen.queryByTestId("apk-planner-frame")).not.toBeInTheDocument();
  });

  it("starts a request for this rental", async () => {
    renderDialog();
    await userEvent.click(await screen.findByTestId("button-apk-request"));
    expect(openNewRequest).toHaveBeenCalledWith({ type: "apk", reservationId: 77 });
  });

  it("opens the garage's agenda next to the car's details and the one thing to tick, and can close it again", async () => {
    renderDialog();
    await userEvent.click(await screen.findByTestId("button-apk-planner"));
    const frame = screen.getByTestId("apk-planner-frame") as HTMLIFrameElement;
    expect(frame.src).toBe(PLANNER);
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(screen.getByText(/alleen APK aan/)).toBeInTheDocument();
    expect(screen.getAllByText("11-ZSZ-3").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("apk-copy-plate")).toBeInTheDocument();
    expect(screen.getByTestId("apk-planner-external")).toHaveAttribute("href", PLANNER);
    expect(screen.getByTestId("apk-planner-external")).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.queryByTestId("plan-self-note")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("button-apk-planner"));
    expect(screen.queryByTestId("apk-planner-frame")).not.toBeInTheDocument();
  });

  it("offers only the request when no agenda is set up", async () => {
    plannerUrl = "";
    renderDialog();
    await screen.findByTestId("button-apk-request");
    expect(screen.queryByTestId("button-apk-planner")).not.toBeInTheDocument();
  });

  it("goes back with Annuleren", async () => {
    const onClose = vi.fn();
    renderDialog(onClose);
    await userEvent.click(await screen.findByTestId("button-apk-back"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("onderhoud melden", () => {
  it("offers a report for this rental, or the garage's agenda, with the maintenance wording and no APK date", async () => {
    renderDialog(() => {}, { mode: "maintenance" });
    expect(await screen.findByText("PEUGEOT BOXER")).toBeInTheDocument();
    expect(screen.getByText("Onderhoud melden")).toBeInTheDocument();
    expect(screen.queryByText(/APK verloopt/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("button-apk-request"));
    expect(openNewRequest).toHaveBeenCalledWith({ type: "maintenance", reservationId: 77 });
  });

  it("warns that an appointment made in the agenda does not arrange another car", async () => {
    renderDialog(() => {}, { mode: "maintenance" });
    await userEvent.click(await screen.findByTestId("button-apk-planner"));
    expect(screen.getByText(/wat er aan de auto moet gebeuren/)).toBeInTheDocument();
    expect(screen.getByTestId("plan-self-note")).toHaveTextContent(/andere auto/);
    expect(screen.getByTestId("apk-planner-frame")).toBeInTheDocument();
  });

  it("works from the overview, without a rental: no car on the screen, the report form picks the car", async () => {
    renderDialog(() => {}, { mode: "maintenance", reservationId: null });
    await userEvent.click(await screen.findByTestId("button-apk-request"));
    expect(openNewRequest).toHaveBeenCalledWith({ type: "maintenance", reservationId: undefined });
    await userEvent.click(screen.getByTestId("button-apk-planner"));
    expect(screen.getByTestId("apk-planner-frame")).toBeInTheDocument();
    expect(screen.queryByTestId("apk-copy-plate")).not.toBeInTheDocument();
    expect(screen.queryByTestId("apk-vehicle")).not.toBeInTheDocument();
  });
});
