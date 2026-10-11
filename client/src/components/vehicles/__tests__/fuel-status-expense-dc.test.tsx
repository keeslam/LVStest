/**
 * Besluit B-41 D1 (package DC): a fuel amount typed at "Brandstofstatus bijwerken"
 * also becomes an expense on the vehicle.
 *
 *  - the success toast names the amount that was booked (nl and en);
 *  - the expense lists are invalidated (the socket broadcast is not the only path);
 *  - an amount of zero is refused before anything is sent (the server answers 400
 *    FUEL_COST_INVALID for it);
 *  - a server refusal is shown by its stable code, in the user's language;
 *  - the fuel card on the vehicle screen shows "laatste tankbedrag" (amount + date).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FuelStatusUpdateDialog } from "@/components/vehicles/fuel-status-update-dialog";
import i18n from "@/i18n";

const { toastSpy, invalidateExpenseData } = vi.hoisted(() => ({ toastSpy: vi.fn(), invalidateExpenseData: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
  toast: toastSpy,
}));

vi.mock("@/lib/cache-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cache-utils")>()),
  invalidateExpenseData: (...args: unknown[]) => invalidateExpenseData(...args),
  invalidateVehicleData: vi.fn(),
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let answer: () => Response;
let sent: FormData[];

beforeEach(() => {
  sent = [];
  toastSpy.mockClear();
  invalidateExpenseData.mockClear();
  answer = () => json({ id: 5, fuelExpense: { id: 9, amount: 45.5 } });
  vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PATCH") sent.push(init.body as FormData);
    return answer();
  }));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await i18n.changeLanguage("nl");
});

async function openDialog() {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <FuelStatusUpdateDialog vehicleId={5} />
    </QueryClientProvider>,
  );
  await user.click(screen.getByTestId("button-update-fuel-status"));
  await screen.findByRole("dialog");
  return user;
}

const flat = (text: unknown) => String(text).replace(/\u00a0/g, " ");

describe("fuel dialog and the booked expense", () => {
  it("names the booked amount in the success toast (nl)", async () => {
    const user = await openDialog();
    await user.type(screen.getByTestId("input-fuel-cost"), "45,50");
    await user.click(screen.getByTestId("button-submit-fuel-update"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const toast = toastSpy.mock.calls[0][0];
    expect(flat(toast.description)).toBe("Brandstofstatus bijgewerkt; kostenpost van € 45,50 geboekt");
  });

  it("names the booked amount in the success toast (en)", async () => {
    await i18n.changeLanguage("en");
    const user = await openDialog();
    await user.type(screen.getByTestId("input-fuel-cost"), "45.50");
    await user.click(screen.getByTestId("button-submit-fuel-update"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(flat(toastSpy.mock.calls[0][0].description)).toMatch(/expense of .*45[.,]50.* booked/i);
  });

  it("keeps the plain success text when nothing was booked (no amount typed)", async () => {
    answer = () => json({ id: 5 });
    const user = await openDialog();
    await user.click(screen.getByTestId("select-fuel-level"));
    await user.click(await screen.findByRole("option", { name: "Vol" }));
    await user.click(screen.getByTestId("button-submit-fuel-update"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(toastSpy.mock.calls[0][0].description).toBe("Brandstofstatus succesvol bijgewerkt");
  });

  it("invalidates the expense lists after a booked amount", async () => {
    const user = await openDialog();
    await user.type(screen.getByTestId("input-fuel-cost"), "45,50");
    await user.click(screen.getByTestId("button-submit-fuel-update"));
    await waitFor(() => expect(invalidateExpenseData).toHaveBeenCalled());
    expect(invalidateExpenseData).toHaveBeenCalledWith(9, 5);
  });

  it.each(["0", "0,00"])("refuses %s before sending: the server would answer FUEL_COST_INVALID", async (typed) => {
    const user = await openDialog();
    await user.type(screen.getByTestId("input-fuel-cost"), typed);
    await user.click(screen.getByTestId("button-submit-fuel-update"));
    expect(await screen.findByText(/geldig bedrag/i)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("shows a server refusal by its code, in Dutch", async () => {
    answer = () => json({ code: "FUEL_COST_INVALID", message: "The fuel cost must be a positive amount" }, 400);
    const user = await openDialog();
    await user.type(screen.getByTestId("input-fuel-cost"), "45,50");
    await user.click(screen.getByTestId("button-submit-fuel-update"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const toast = toastSpy.mock.calls[0][0];
    expect(toast.variant).toBe("destructive");
    expect(toast.description).toMatch(/bedrag/i);
    expect(toast.description).not.toMatch(/must be/i);
  });

  it("explains FUEL_EXPENSE_FAILED: nothing was saved", async () => {
    answer = () => json({ code: "FUEL_EXPENSE_FAILED", message: "The fuel expense could not be booked" }, 500);
    const user = await openDialog();
    await user.type(screen.getByTestId("input-fuel-cost"), "45,50");
    await user.click(screen.getByTestId("button-submit-fuel-update"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(toastSpy.mock.calls[0][0].description).toMatch(/niets opgeslagen/i);
  });
});
