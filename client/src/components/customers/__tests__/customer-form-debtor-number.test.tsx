/**
 * B-35 (task-4-brief.md) — the client half of "debtor number unique when
 * filled, also against the recycle bin". The server (Task 3) answers 409
 * with `{ field: "debtorNumber", code, conflictingCustomerName }`
 * (task-3-report.md); this proves the form turns that into a field error
 * under the "Debiteurnummer" input, in Dutch, while the existing generic
 * toast keeps firing unchanged — and that the message disappears the moment
 * the value changes. A plain 400 (the pre-existing behaviour) is untouched.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { Toaster } from "@/components/ui/toaster";
import { CustomerForm } from "@/components/customers/customer-form";

let postCalls: number;
let nextResponse: { status: number; body: unknown };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  postCalls = 0;
  nextResponse = { status: 201, body: { id: 1, name: "Test" } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/customers" && method === "POST") {
        postCalls += 1;
        return jsonResponse(nextResponse.body, nextResponse.status);
      }
      // DuplicateWarning's own lookup — never exercised here (email/phone
      // are left blank, so isWorthChecking() keeps its query disabled).
      return jsonResponse([]);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: async () => [], retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <CustomerForm redirectToList={false} />
        <Toaster />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, debtorNumber: string) {
  await user.type(screen.getByLabelText("Volledige naam"), "E2E Klant");
  if (debtorNumber) {
    await user.type(screen.getByTestId("input-debtor-number"), debtorNumber);
  }
  await user.click(screen.getByRole("button", { name: "Klant toevoegen" }));
}

describe("B-35 — debiteurnummer-conflict onder het veld", () => {
  it("toont de melding onder Debiteurnummer bij DEBTOR_NUMBER_TAKEN, zonder rode toast erbij", async () => {
    nextResponse = {
      status: 409,
      body: {
        message: "Another customer (Jansen BV) already uses this debtor number.",
        field: "debtorNumber",
        code: "DEBTOR_NUMBER_TAKEN",
        conflictingCustomerId: 99,
        conflictingCustomerName: "Jansen BV",
      },
    };
    const user = userEvent.setup();
    renderForm();
    await fillAndSubmit(user, "E2E-DEB-1");

    expect(await screen.findByText("Dit debiteurnummer is al in gebruik bij klant Jansen BV.")).toBeInTheDocument();
    // A-4-4 (audit 2026-10-09): the field message is the whole answer. The extra red toast with the
    // English server sentence ("Another customer (...) already uses this debtor number") is gone.
    // The field message and the toast would come from the same error handler: let React finish what that
    // handler queued before asserting the toast is absent.
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText(/Kon klant niet aanmaken/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Another customer/)).not.toBeInTheDocument();
    expect(postCalls).toBe(1);
  });

  it("toont de prullenbak-melding onder Debiteurnummer bij DEBTOR_NUMBER_IN_RECYCLE_BIN", async () => {
    nextResponse = {
      status: 409,
      body: {
        message: "This debtor number is held by Jansen BV in the recycle bin.",
        field: "debtorNumber",
        code: "DEBTOR_NUMBER_IN_RECYCLE_BIN",
        deletedRecordId: 42,
        conflictingCustomerName: "Jansen BV",
      },
    };
    const user = userEvent.setup();
    renderForm();
    await fillAndSubmit(user, "E2E-DEB-1");

    expect(
      await screen.findByText(
        "Dit debiteurnummer hoort bij klant Jansen BV in de prullenbak. Zet die klant terug of verwijder hem definitief uit de prullenbak.",
      ),
    ).toBeInTheDocument();
  });

  it("laat het oude gedrag staan bij een gewone 400 (geen veldfout)", async () => {
    nextResponse = { status: 400, body: { message: "Invalid customer data" } };
    const user = userEvent.setup();
    renderForm();
    await fillAndSubmit(user, "");

    expect(await screen.findByText(/Kon klant niet aanmaken/)).toBeInTheDocument();
    expect(screen.queryByText(/in gebruik bij klant/)).not.toBeInTheDocument();
    expect(screen.queryByText(/in de prullenbak/)).not.toBeInTheDocument();
  });

  it("crasht niet en toont alleen de algemene toast bij een 409 zonder code (task-4-review.md Minor 1)", async () => {
    // The DB-constraint fallback shape from task-3-report.md's "slips past
    // the pre-check" case: a 409 with `field` but no `code`. Neither lookup
    // in DEBTOR_NUMBER_CONFLICT_ERROR_KEYS matches `undefined`, so this must
    // fall through to the generic toast, same as any other unrecognised error
    // — not crash, and not leak the raw JSON body as the message.
    nextResponse = {
      status: 409,
      body: { message: "Debtor number already exists.", field: "debtorNumber" },
    };
    const user = userEvent.setup();
    renderForm();
    await fillAndSubmit(user, "E2E-DEB-1");

    expect(await screen.findByText(/Kon klant niet aanmaken/)).toBeInTheDocument();
    expect(screen.queryByText(/in gebruik bij klant/)).not.toBeInTheDocument();
    expect(screen.queryByText(/in de prullenbak/)).not.toBeInTheDocument();
  });

  it("springt terug naar Basisgegevens en toont de melding als de 409 binnenkomt vanaf een ander tabblad (review P6)", async () => {
    nextResponse = {
      status: 409,
      body: {
        message: "Another customer (Jansen BV) already uses this debtor number.",
        field: "debtorNumber",
        code: "DEBTOR_NUMBER_TAKEN",
        conflictingCustomerId: 99,
        conflictingCustomerName: "Jansen BV",
      },
    };
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Volledige naam"), "E2E Klant");
    await user.type(screen.getByTestId("input-debtor-number"), "E2E-DEB-1");
    await user.click(screen.getByRole("tab", { name: "Contact" }));
    expect(screen.getByRole("tab", { name: "Contact" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByTestId("input-debtor-number")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Klant toevoegen" }));

    expect(await screen.findByText("Dit debiteurnummer is al in gebruik bij klant Jansen BV.")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Basisgegevens" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getByTestId("input-debtor-number")).toHaveFocus());
  });

  it("wist de veldfout zodra de waarde verandert", async () => {
    nextResponse = {
      status: 409,
      body: {
        message: "Another customer (Jansen BV) already uses this debtor number.",
        field: "debtorNumber",
        code: "DEBTOR_NUMBER_TAKEN",
        conflictingCustomerId: 99,
        conflictingCustomerName: "Jansen BV",
      },
    };
    const user = userEvent.setup();
    renderForm();
    await fillAndSubmit(user, "E2E-DEB-1");
    expect(await screen.findByText("Dit debiteurnummer is al in gebruik bij klant Jansen BV.")).toBeInTheDocument();

    await user.type(screen.getByTestId("input-debtor-number"), "2");
    await waitFor(() =>
      expect(screen.queryByText("Dit debiteurnummer is al in gebruik bij klant Jansen BV.")).not.toBeInTheDocument(),
    );
  });
});
