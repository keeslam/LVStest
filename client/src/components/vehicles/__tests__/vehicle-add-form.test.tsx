/**
 * PHASE 57 / WAVE 13 item 1 — "Voertuig toevoegen" could not add a vehicle.
 *
 * The add form defaulted fourteen `yyyy-MM-dd` columns to `""`, and four of
 * them (`dateIn`, `dateOut`, `damageCheckDate`, `damageCheckAttachmentDate`)
 * have no input anywhere on the form. `optionalYmd` rejected `""`, so zod
 * failed on fields nobody could see or fill, the button's
 * `if (!isValid) return` swallowed the verdict, and the employee got no
 * window, no toast and no vehicle. Editing worked because an existing row
 * carries `null`, not `""`.
 *
 * Two things are asserted here, both in the jsdom project (plan §8.8):
 *   1. the form a user can actually see submits — a create call leaves;
 *   2. a form that is genuinely invalid says so out loud instead of doing
 *      nothing at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { Toaster } from "@/components/ui/toaster";
import { VehicleForm } from "@/components/vehicles/vehicle-form";

let createCalls: Array<{ url: string; body: any }>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  createCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/vehicles" && method === "POST") {
        createCalls.push({ url, body: init?.body ? JSON.parse(init.body) : {} });
        return jsonResponse({ id: 4242, licensePlate: "AB-123-C" }, 201);
      }
      return jsonResponse([]);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderAddForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: async () => [], retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <VehicleForm redirectToList={false} />
        <Toaster />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("Voertuig toevoegen — the add form submits", () => {
  it("creates the vehicle from the fields a user can actually see", async () => {
    const user = userEvent.setup();
    renderAddForm();

    await user.type(screen.getByTestId("input-vehicle-license-plate"), "AB123C");
    await user.type(screen.getByTestId("input-vehicle-brand"), "Volkswagen");
    await user.type(screen.getByTestId("input-vehicle-model"), "Crafter");

    await user.click(screen.getByTestId("button-submit-vehicle"));

    await waitFor(() => expect(createCalls).toHaveLength(1));
    const body = createCalls[0].body;
    expect(body.licensePlate).toBe("AB-123-C");
    expect(body.brand).toBe("Volkswagen");
    expect(body.model).toBe("Crafter");
    // The four invisible date columns travel as "no date", never as "".
    for (const field of ["dateIn", "dateOut", "damageCheckDate", "damageCheckAttachmentDate"]) {
      expect(body[field] ?? null, field).toBeNull();
    }
  });

  it("says what is wrong instead of silently doing nothing", async () => {
    const user = userEvent.setup();
    renderAddForm();

    // Brand and model left empty on purpose: this form really is invalid.
    await user.type(screen.getByTestId("input-vehicle-license-plate"), "AB123C");
    await user.click(screen.getByTestId("button-submit-vehicle"));

    const message = await screen.findByTestId("vehicle-form-invalid");
    expect(message).toBeInTheDocument();
    expect(createCalls).toHaveLength(0);
  });
});
