/**
 * Audit A-3-2 (package P1): the tank cost in "Brandstofstatus bijwerken" was a
 * type=number field. A Dutch "45,50" was read as empty by the browser, left out
 * of the request, and the toast still said "Gelukt". Now the field is text: a
 * comma or a dot is accepted and sent as 45.5, anything else shows a Dutch
 * error and sends nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FuelStatusUpdateDialog } from "@/components/vehicles/fuel-status-update-dialog";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let sent: FormData[];

beforeEach(() => {
  sent = [];
  vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PATCH") sent.push(init.body as FormData);
    return json({ id: 5 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

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

describe("fuel cost input", () => {
  it.each([["45,50", "45.5"], ["45.50", "45.5"], ["  12 ", "12"], ["1.234,50", "1234.5"], ["0,99", "0.99"]])(
    "sends %s as %s",
    async (typed, expected) => {
      const user = await openDialog();
      await user.type(screen.getByTestId("input-fuel-cost"), typed);
      await user.click(screen.getByTestId("button-submit-fuel-update"));
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0].get("cost")).toBe(expected);
    },
  );

  it("shows a Dutch error for anything else and sends nothing, instead of dropping the value", async () => {
    const user = await openDialog();
    await user.type(screen.getByTestId("input-fuel-cost"), "abc");
    await user.click(screen.getByTestId("button-submit-fuel-update"));

    expect(await screen.findByText(/geldig bedrag/i)).toBeInTheDocument();
    expect(screen.getByTestId("input-fuel-cost")).toHaveAttribute("aria-invalid", "true");
    expect(sent).toHaveLength(0);
    expect(screen.queryByText("Gelukt")).not.toBeInTheDocument();
  });

  it.each(["4,5,5", "-3", "45,555", "1e3", "€"])("also refuses %s", async (typed) => {
    const user = await openDialog();
    await user.type(screen.getByTestId("input-fuel-cost"), typed);
    await user.click(screen.getByTestId("button-submit-fuel-update"));
    expect(await screen.findByText(/geldig bedrag/i)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("clears the error once the value is corrected", async () => {
    const user = await openDialog();
    const field = screen.getByTestId("input-fuel-cost");
    await user.type(field, "abc");
    await user.click(screen.getByTestId("button-submit-fuel-update"));
    await screen.findByText(/geldig bedrag/i);
    await user.clear(field);
    await user.type(field, "45,50");
    await waitFor(() => expect(screen.queryByText(/geldig bedrag/i)).not.toBeInTheDocument());
    await user.click(screen.getByTestId("button-submit-fuel-update"));
    await waitFor(() => expect(sent).toHaveLength(1));
  });
});
