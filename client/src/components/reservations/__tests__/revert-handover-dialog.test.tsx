/**
 * Sub-project C, Task 4 (besluiten B-30, B-39; spec
 * docs/superpowers/specs/2026-10-09-terugdraaien-prullenbak-design.md §2.4):
 * the ONE dialog every reversal goes through.
 *
 * It loads `GET /api/reservations/:id/revert-preview`, says in plain Dutch what
 * will happen (status, emptied fields, odometer "van X naar Y" or why it stays,
 * documents that become vervallen, warnings), asks for a tick when the odometer
 * would go DOWN, and only then lets `POST /api/reservations/:id/revert` run -
 * carrying the `planHash` of the plan the person looked at.
 *
 * The client branches on the stable `code` of a refusal, never on the English
 * `message` (constraints.md): the stubbed server below answers with English
 * messages on purpose and the tests prove none of them reaches the screen.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { REVERT_CODES, type RevertPlan } from "@shared/revert-codes";
import nlReservations from "@/locales/nl/reservations.json";
import enReservations from "@/locales/en/reservations.json";
import { RevertHandoverDialog } from "@/components/reservations/revert-handover-dialog";

const RESERVATION_ID = 4711;
const PREVIEW_URL = `/api/reservations/${RESERVATION_ID}/revert-preview`;
const REVERT_URL = `/api/reservations/${RESERVATION_ID}/revert`;

function plan(over: Partial<RevertPlan> = {}): RevertPlan {
  return {
    fromStatus: "picked_up",
    toStatus: "booked",
    clears: [
      "actualPickupDate",
      "pickupMileage",
      "fuelLevelPickup",
      "contractNumber",
      "vehicleMileageBeforePickup",
      "vehicleFuelBeforePickup",
    ],
    vehicle: {
      current: { mileage: 61250, fuel: "3/4" },
      restoreTo: { mileage: 61000, fuel: "full" },
    },
    documentsToMarkStale: [{ id: 77, documentType: "Contract (Unsigned)" }],
    requiresMileageConfirmation: true,
    warnings: [],
    planHash: "hash-1",
    ...over,
  };
}

let previewPlan: RevertPlan;
let previewStatus: number;
let previewRequests: number;
let postCalls: Array<Record<string, unknown>>;
let postResponse: () => Response;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  previewPlan = plan();
  previewStatus = 200;
  previewRequests = 0;
  postCalls = [];
  postResponse = () => jsonResponse({ plan: previewPlan, reservation: { id: RESERVATION_ID, status: "booked" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.endsWith(PREVIEW_URL) && method === "GET") {
        previewRequests += 1;
        return previewStatus === 200
          ? jsonResponse(previewPlan)
          : jsonResponse({ message: "Reservation not found" }, previewStatus);
      }
      if (url.endsWith(REVERT_URL) && method === "POST") {
        postCalls.push(init?.body ? JSON.parse(init.body) : {});
        return postResponse();
      }
      return jsonResponse([]);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderDialog(props: { onReverted?: (result: unknown) => void; onOpenChange?: (open: boolean) => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RevertHandoverDialog
        reservationId={RESERVATION_ID}
        open
        onOpenChange={props.onOpenChange ?? (() => {})}
        onReverted={props.onReverted}
      />
    </QueryClientProvider>,
  );
}

describe("RevertHandoverDialog - de voorvertoning in gewoon Nederlands", () => {
  it("noemt de statusovergang, de gewiste velden, de kilometerstand van X naar Y en de vervallen documenten", async () => {
    renderDialog();

    const dialog = await screen.findByTestId("dialog-revert-handover");
    expect(await screen.findByTestId("revert-status")).toHaveTextContent("Opgehaald");
    expect(screen.getByTestId("revert-status")).toHaveTextContent("Geboekt");

    // Cleared fields in words; the bookkeeping columns (vehicle*Before*) are not listed.
    const clears = screen.getByTestId("revert-clears");
    expect(clears).toHaveTextContent("Contractnummer");
    expect(clears).toHaveTextContent("Kilometerstand bij ophalen");
    expect(clears).toHaveTextContent("Brandstofniveau bij ophalen");
    expect(clears).toHaveTextContent("Daadwerkelijke ophaaldatum");
    expect(clears).not.toHaveTextContent("vehicleMileageBeforePickup");

    // "van X naar Y" with Dutch thousands separators, and the fuel in words.
    const vehicle = screen.getByTestId("revert-vehicle");
    expect(vehicle).toHaveTextContent("van 61.250 km naar 61.000 km");
    expect(vehicle).toHaveTextContent("naar Vol");

    // Documents are marked vervallen, never deleted - and the text says so.
    const documents = screen.getByTestId("revert-documents");
    expect(documents).toHaveTextContent("vervallen");
    expect(documents).toHaveTextContent("Niet-ondertekend contract");

    // Nothing has been written: this is the question, not the action.
    expect(postCalls).toHaveLength(0);
    expect(dialog).toBeInTheDocument();
  });

  it("laat zien waarom de kilometerstand van het voertuig blijft staan", async () => {
    previewPlan = plan({
      vehicle: { current: { mileage: 61250, fuel: "3/4" }, restoreTo: null, reason: "later_handover" },
      requiresMileageConfirmation: false,
      warnings: ["later_handover"],
    });
    renderDialog();

    const vehicle = await screen.findByTestId("revert-vehicle");
    expect(vehicle).toHaveTextContent("blijven zoals ze zijn");
    expect(vehicle).toHaveTextContent("andere overdracht");
    // The reason is in the vehicle block; the same code is not repeated as a warning.
    expect(screen.queryByTestId("revert-warnings")).not.toBeInTheDocument();
  });

  it("legt uit dat er geen opgeslagen stand is", async () => {
    previewPlan = plan({
      vehicle: { current: { mileage: 61250, fuel: null }, restoreTo: null, reason: "no_reading_stored" },
      requiresMileageConfirmation: false,
      warnings: ["no_reading_stored"],
    });
    renderDialog();

    expect(await screen.findByTestId("revert-vehicle")).toHaveTextContent("niet bewaard");
  });

  it("zet bij een annulering de waarschuwing dat gesloten koppelingen niet heropenen en noemt het een annulering", async () => {
    previewPlan = plan({
      fromStatus: "cancelled",
      toStatus: "picked_up",
      clears: [],
      vehicle: { current: { mileage: 61000, fuel: "full" }, restoreTo: null },
      documentsToMarkStale: [],
      requiresMileageConfirmation: false,
      warnings: ["cascade_not_reopened"],
    });
    renderDialog();

    expect(await screen.findByRole("heading", { name: "Annulering terugdraaien" })).toBeInTheDocument();
    expect(screen.getByTestId("revert-status")).toHaveTextContent("Geannuleerd");
    expect(screen.getByTestId("revert-status")).toHaveTextContent("Opgehaald");
    expect(screen.getByTestId("revert-warnings")).toHaveTextContent("niet opnieuw geopend");
    expect(screen.queryByTestId("revert-clears")).not.toBeInTheDocument();
    expect(screen.queryByTestId("revert-documents")).not.toBeInTheDocument();
  });

  it.each([
    ["VEHICLE_NOT_FREE", "niet meer vrij"],
    ["VEHICLE_NOT_FOR_RENTAL", "Niet voor verhuur"],
    ["VEHICLE_NOT_FOUND", "niet meer te vinden"],
    ["INVALID_STATUS_TRANSITION", "geen overdracht of annulering"],
  ])("toont een geblokkeerd plan (%s) in het Nederlands en laat niet bevestigen", async (code, dutchFragment) => {
    previewPlan = plan({
      fromStatus: "cancelled",
      toStatus: "picked_up",
      clears: [],
      vehicle: { current: { mileage: 61000, fuel: "full" }, restoreTo: null },
      documentsToMarkStale: [],
      requiresMileageConfirmation: false,
      warnings: ["cascade_not_reopened"],
      blocked: { code, message: "The English sentence the server logs: nothing of this reaches the screen" },
    });
    renderDialog();

    const blocked = await screen.findByTestId("revert-blocked");
    expect(blocked).toHaveTextContent(dutchFragment);
    // The English server sentence is data for logs, not for the screen.
    expect(screen.queryByText(/English sentence/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("button-confirm-revert")).toBeDisabled();
  });

  it("valt voor een onbekende blokkadecode terug op een algemene Nederlandse zin", async () => {
    previewPlan = plan({
      requiresMileageConfirmation: false,
      blocked: { code: "SOMETHING_NEW", message: "Something new and English" },
    });
    renderDialog();

    expect(await screen.findByTestId("revert-blocked")).toHaveTextContent("nu niet mogelijk");
    expect(screen.queryByText(/Something new/)).not.toBeInTheDocument();
    expect(screen.getByTestId("button-confirm-revert")).toBeDisabled();
  });

  it("zegt in het Nederlands dat de voorvertoning niet geladen kon worden, zonder rode melding of Engelse tekst", async () => {
    previewStatus = 404;
    renderDialog();

    expect(await screen.findByTestId("revert-error")).toHaveTextContent("bestaat niet meer");
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-confirm-revert")).not.toBeInTheDocument();
  });
});

describe("RevertHandoverDialog - bevestigen", () => {
  it("houdt bevestigen uit tot het vinkje voor de lagere kilometerstand staat en stuurt vlag en planHash mee", async () => {
    const user = userEvent.setup();
    const onReverted = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ onReverted, onOpenChange });

    const confirm = await screen.findByTestId("button-confirm-revert");
    const checkbox = screen.getByTestId("checkbox-confirm-mileage-decrease");
    expect(confirm).toBeDisabled();
    // The sentence next to the tick carries both numbers.
    expect(screen.getByLabelText(/61\.250 km naar 61\.000 km/)).toBeInTheDocument();

    await user.click(checkbox);
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() => expect(postCalls).toHaveLength(1));
    expect(postCalls[0]).toEqual({ confirmMileageDecrease: true, planHash: "hash-1" });
    await waitFor(() => expect(onReverted).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("toont geen vinkje als de kilometerstand niet omlaag gaat en bevestigt meteen, zonder de vlag", async () => {
    const user = userEvent.setup();
    previewPlan = plan({
      vehicle: { current: { mileage: 61000, fuel: "full" }, restoreTo: { mileage: 61000, fuel: "full" } },
      requiresMileageConfirmation: false,
      planHash: "hash-2",
    });
    renderDialog();

    const confirm = await screen.findByTestId("button-confirm-revert");
    expect(screen.queryByTestId("checkbox-confirm-mileage-decrease")).not.toBeInTheDocument();
    expect(screen.getByTestId("revert-vehicle")).toHaveTextContent("blijft 61.000 km");
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    await waitFor(() => expect(postCalls).toHaveLength(1));
    expect(postCalls[0]).toEqual({ confirmMileageDecrease: false, planHash: "hash-2" });
  });
});

describe("RevertHandoverDialog - weigeringen van de server, op `code`", () => {
  async function confirmWithTick(user: ReturnType<typeof userEvent.setup>) {
    const confirm = await screen.findByTestId("button-confirm-revert");
    await user.click(screen.getByTestId("checkbox-confirm-mileage-decrease"));
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
  }

  it("MILEAGE_DECREASE_CONFIRMATION_REQUIRED: Nederlandse zin met beide getallen", async () => {
    const user = userEvent.setup();
    postResponse = () =>
      jsonResponse(
        {
          message: "Restoring the mileage lowers the odometer; confirmation required",
          code: "MILEAGE_DECREASE_CONFIRMATION_REQUIRED",
          currentMileage: 61250,
          restoreToMileage: 61000,
          plan: previewPlan,
        },
        409,
      );
    renderDialog();
    await confirmWithTick(user);

    const error = await screen.findByTestId("revert-error");
    expect(error).toHaveTextContent("61.250 km naar 61.000 km");
    expect(error).toHaveTextContent("Vink de bevestiging aan");
    expect(screen.queryByText(/odometer/i)).not.toBeInTheDocument();
  });

  it("REVERT_PLAN_CHANGED: Nederlandse zin, de voorvertoning wordt opnieuw geladen en het vinkje moet opnieuw", async () => {
    const user = userEvent.setup();
    const fresh = plan({
      vehicle: { current: { mileage: 61300, fuel: "3/4" }, restoreTo: { mileage: 61000, fuel: "full" } },
      planHash: "hash-new",
    });
    postResponse = () => {
      // From now on the preview route answers with the new plan, as the real one would.
      previewPlan = fresh;
      return jsonResponse({ message: "The reservation changed since the preview", code: "REVERT_PLAN_CHANGED", plan: fresh }, 409);
    };
    renderDialog();
    await screen.findByTestId("button-confirm-revert");
    const requestsBefore = previewRequests;
    expect(requestsBefore).toBe(1);
    await confirmWithTick(user);

    expect(await screen.findByTestId("revert-error")).toHaveTextContent("intussen gewijzigd");
    expect(screen.queryByText(/changed since/i)).not.toBeInTheDocument();
    // The preview was asked for again, not only taken from the refusal.
    await waitFor(() => expect(previewRequests).toBeGreaterThan(requestsBefore));
    // The refreshed overview, and a fresh tick is needed again.
    await waitFor(() => expect(screen.getByTestId("revert-vehicle")).toHaveTextContent("61.300 km naar 61.000 km"));
    expect(screen.getByTestId("button-confirm-revert")).toBeDisabled();

    // Confirming the NEW plan sends the NEW hash.
    postResponse = () => jsonResponse({ plan: fresh, reservation: { id: RESERVATION_ID, status: "booked" } });
    await user.click(screen.getByTestId("checkbox-confirm-mileage-decrease"));
    await user.click(screen.getByTestId("button-confirm-revert"));
    await waitFor(() => expect(postCalls).toHaveLength(2));
    expect(postCalls[1]).toEqual({ confirmMileageDecrease: true, planHash: "hash-new" });
  });

  it("REVERT_PLAN_CHANGED zonder plan in de weigering: de voorvertoning wordt alsnog opnieuw geladen", async () => {
    const user = userEvent.setup();
    const fresh = plan({ planHash: "hash-reloaded" });
    postResponse = () => {
      previewPlan = fresh;
      return jsonResponse({ message: "The reservation changed since the preview", code: "REVERT_PLAN_CHANGED" }, 409);
    };
    renderDialog();
    await screen.findByTestId("button-confirm-revert");
    const requestsBefore = previewRequests;
    await confirmWithTick(user);

    expect(await screen.findByTestId("revert-error")).toHaveTextContent("intussen gewijzigd");
    await waitFor(() => expect(previewRequests).toBeGreaterThan(requestsBefore));

    // The reloaded plan is what the next confirmation sends.
    postResponse = () => jsonResponse({ plan: fresh, reservation: { id: RESERVATION_ID, status: "booked" } });
    await user.click(await screen.findByTestId("checkbox-confirm-mileage-decrease"));
    await user.click(screen.getByTestId("button-confirm-revert"));
    await waitFor(() => expect(postCalls).toHaveLength(2));
    expect(postCalls[1]).toEqual({ confirmMileageDecrease: true, planHash: "hash-reloaded" });
  });

  it("de vier overige weigeringen hebben elk een eigen Nederlandse zin, op code", async () => {
    const user = userEvent.setup();
    previewPlan = plan({ requiresMileageConfirmation: false });
    renderDialog();
    const confirm = await screen.findByTestId("button-confirm-revert");

    const cases: Array<[string, number, string]> = [
      ["VEHICLE_NOT_FREE", 409, "niet meer vrij"],
      ["VEHICLE_NOT_FOR_RENTAL", 409, "Niet voor verhuur"],
      ["VEHICLE_NOT_FOUND", 409, "niet meer te vinden"],
      ["INVALID_STATUS_TRANSITION", 400, "niets om terug te draaien"],
    ];
    for (const [code, status, dutchFragment] of cases) {
      postResponse = () => jsonResponse({ message: `English ${code} sentence`, code, plan: previewPlan }, status);
      await user.click(confirm);
      await waitFor(() => expect(screen.getByTestId("revert-error")).toHaveTextContent(dutchFragment));
      expect(screen.queryByText(/English .* sentence/)).not.toBeInTheDocument();
    }
  });

  it("403 zonder code en een onbekende fout krijgen een eigen Nederlandse zin", async () => {
    const user = userEvent.setup();
    previewPlan = plan({ requiresMileageConfirmation: false });
    postResponse = () => jsonResponse({ message: "Not authorized. One of these permissions required: revert_handover" }, 403);
    renderDialog();
    await user.click(await screen.findByTestId("button-confirm-revert"));
    expect(await screen.findByTestId("revert-error")).toHaveTextContent("geen recht");
    expect(screen.queryByText(/Not authorized/)).not.toBeInTheDocument();

    postResponse = () => jsonResponse({ message: "Internal server error" }, 500);
    await user.click(screen.getByTestId("button-confirm-revert"));
    await waitFor(() => expect(screen.getByTestId("revert-error")).toHaveTextContent("mislukt"));
    expect(screen.queryByText(/Internal server error/)).not.toBeInTheDocument();
  });
});

describe("RevertHandoverDialog - elke weigeringscode heeft een zin", () => {
  // USE_REVERT_ROUTE answers PATCH /:id/status, never this dialog's own routes.
  const shownByDialog = Object.values(REVERT_CODES).filter((code) => code !== REVERT_CODES.USE_REVERT_ROUTE);
  // The codes that can also arrive as `plan.blocked.code` in the preview.
  const blockingCodes = [
    REVERT_CODES.VEHICLE_NOT_FREE,
    REVERT_CODES.VEHICLE_NOT_FOR_RENTAL,
    REVERT_CODES.VEHICLE_NOT_FOUND,
    REVERT_CODES.INVALID_STATUS_TRANSITION,
  ];

  it.each([
    ["nl", nlReservations],
    ["en", enReservations],
  ])("%s: elke code van shared/revert-codes.ts heeft een zin bij de weigeringen", (_lang, resource) => {
    const errors = (resource as any).revertHandover.errors as Record<string, string>;
    for (const code of shownByDialog) {
      expect(errors[code], `errors.${code}`).toEqual(expect.any(String));
      expect(errors[code].length).toBeGreaterThan(10);
    }
  });

  it.each([
    ["nl", nlReservations],
    ["en", enReservations],
  ])("%s: elke blokkadecode heeft een zin bij de geblokkeerde voorvertoning", (_lang, resource) => {
    const blocked = (resource as any).revertHandover.blocked as Record<string, string>;
    for (const code of blockingCodes) {
      expect(blocked[code], `blocked.${code}`).toEqual(expect.any(String));
      expect(blocked[code].length).toBeGreaterThan(10);
    }
  });
});

describe("RevertHandoverDialog - teksten in nl en en", () => {
  function leafKeys(node: unknown, prefix = ""): string[] {
    if (node && typeof node === "object") {
      return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
        leafKeys(value, prefix ? `${prefix}.${key}` : key),
      );
    }
    return [prefix];
  }

  it("heeft in beide talen dezelfde sleutels onder revertHandover", () => {
    const nl = leafKeys((nlReservations as any).revertHandover).sort();
    const en = leafKeys((enReservations as any).revertHandover).sort();
    expect(nl.length).toBeGreaterThan(20);
    expect(en).toEqual(nl);
  });

  it("gebruikt in beide talen dezelfde {{placeholders}} per sleutel", () => {
    const placeholders = (text: string) => (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((p) => p.replace(/\s/g, "")).sort();
    const collect = (node: unknown, prefix = "", out: Record<string, string[]> = {}) => {
      if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          collect(value, prefix ? `${prefix}.${key}` : key, out);
        }
      } else if (typeof node === "string") {
        out[prefix] = placeholders(node);
      }
      return out;
    };
    expect(collect((enReservations as any).revertHandover)).toEqual(collect((nlReservations as any).revertHandover));
  });
});
