/**
 * Sub-project C, task 7 (besluit B-38; spec
 * docs/superpowers/specs/2026-10-09-terugdraaien-prullenbak-design.md §5):
 * emptying a bin from the recycle-bin dialog.
 *
 *   - every row has a checkbox (`checkbox-deleted-record-${id}`) and its own
 *     `button-purge-${id}`; the toolbar has `button-purge-selected` (disabled until a
 *     row is ticked) and `button-purge-all`;
 *   - nothing is deleted without ONE confirmation dialog (`dialog-confirm-purge`) that
 *     names the count and the kind, and says it cannot be undone;
 *   - one row goes through `DELETE /api/deleted-records/:id`, a selection through
 *     `POST /api/deleted-records/purge { ids }`, the whole bin through
 *     `{ entityType: kind, all: true }`;
 *   - afterwards the bin list (and the screens it feeds) is invalidated, so the rows
 *     are gone without a reload;
 *   - what the server answers is shown by its stable `code`, in Dutch, never by the
 *     English message (including FISCAL_DATA_PRESENT: a reservation with fiscal
 *     assessments is never purged);
 *   - "empty the bin" says it empties everything of the kind, also rows the list does not
 *     show; a restore and a purge refresh the same screens.
 *
 * Runs against the app's own query client (`@/lib/queryClient`) so the real
 * `invalidateByPrefix` is what refreshes the list. jsdom project, real i18n.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { DELETED_RECORD_KINDS, type DeletedRecordKind } from "@shared/schema";
import { invalidateByPrefix, queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import nlBin from "@/locales/nl/recycleBin.json";
import enBin from "@/locales/en/recycleBin.json";
import { RecycleBinDialog } from "@/components/recycle-bin/recycle-bin-dialog";

interface Row {
  id: number;
  entityType: string;
  entityId: number;
  label: string;
  relatedCounts: Record<string, number> | null;
  deletedAt: string;
  deletedBy: string | null;
  restoredAt: string | null;
  restoredBy: string | null;
}

const row = (over: Partial<Row> & { id: number; entityType: string; label: string }): Row => ({
  entityId: 100 + over.id,
  relatedCounts: {},
  deletedAt: "2026-09-01T10:00:00.000Z",
  deletedBy: "kees",
  restoredAt: null,
  restoredBy: null,
  ...over,
});

const SEED_ROWS = (): Row[] => [
  row({ id: 1, entityType: "vehicle", label: "AB-123-C Volkswagen Crafter" }),
  row({ id: 2, entityType: "customer", label: "Jansen Verhuur BV" }),
  row({ id: 3, entityType: "customer", label: "Pieters Transport" }),
  row({ id: 4, entityType: "customer", label: "Oud Bedrijf", restoredAt: "2026-09-05T10:00:00.000Z", restoredBy: "anna" }),
  row({ id: 5, entityType: "reservation", label: "Reservering #3387 — AB-123-C 2030-02-01" }),
  row({ id: 6, entityType: "maintenance_block", label: "Onderhoud #3390 — AB-123-C 2030-03-01" }),
];

interface Call { method: string; url: string; body: any }
let serverRows: Row[];
let calls: Call[];
let purgeAnswer: (call: Call) => Response;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A server that really removes what it is told to, so the refreshed list can be checked. */
function defaultPurgeAnswer(call: Call): Response {
  if (call.method === "DELETE") {
    const id = Number(call.url.split("/").pop());
    const before = serverRows.length;
    serverRows = serverRows.filter((r) => r.id !== id);
    return before === serverRows.length
      ? jsonResponse({ code: "NOT_FOUND", message: "That deleted record no longer exists.", purged: 0, failed: [{ id, code: "NOT_FOUND", message: "x" }] }, 404)
      : jsonResponse({ purged: 1, failed: [] });
  }
  const ids: number[] = call.body.all ? serverRows.filter((r) => r.entityType === call.body.entityType).map((r) => r.id) : call.body.ids;
  serverRows = serverRows.filter((r) => !ids.includes(r.id));
  return jsonResponse({ purged: ids.length, failed: [] });
}

beforeEach(() => {
  queryClient.clear();
  serverRows = SEED_ROWS();
  calls = [];
  purgeAnswer = defaultPurgeAnswer;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET" && url.startsWith("/api/deleted-records")) {
        const type = new URL(url, "http://localhost").searchParams.get("type");
        return jsonResponse(type ? serverRows.filter((r) => r.entityType === type) : serverRows);
      }
      if ((method === "DELETE" && /^\/api\/deleted-records\/\d+$/.test(url)) || (method === "POST" && url === "/api/deleted-records/purge")) {
        const call: Call = { method, url, body: init?.body ? JSON.parse(init.body) : null };
        calls.push(call);
        return purgeAnswer(call);
      }
      return jsonResponse([]);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  queryClient.clear();
});

function renderBin(kind: DeletedRecordKind, props: { onPurged?: () => void } = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <RecycleBinDialog kind={kind} open onOpenChange={() => {}} onPurged={props.onPurged} />
      <Toaster />
    </QueryClientProvider>,
  );
}

describe("RecycleBinDialog - the controls for emptying a bin", () => {
  it("gives every row a checkbox and its own purge button, and the toolbar a selected and an all button", async () => {
    renderBin("customer");
    for (const id of [2, 3, 4]) {
      await screen.findByTestId(`deleted-record-${id}`);
      expect(screen.getByTestId(`checkbox-deleted-record-${id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`button-purge-${id}`)).toBeEnabled();
    }
    expect(screen.getByTestId("button-purge-selected")).toBeDisabled();
    expect(screen.getByTestId("button-purge-all")).toBeEnabled();
  });

  it("a restored row can be purged too (only its bin entry is removed)", async () => {
    renderBin("customer");
    await screen.findByTestId("deleted-record-4");
    expect(screen.getByTestId("button-restore-4")).toBeDisabled();
    expect(screen.getByTestId("button-purge-4")).toBeEnabled();
    expect(screen.getByTestId("checkbox-deleted-record-4")).toBeEnabled();
  });

  it("ticking rows enables the selected button and shows how many", async () => {
    const user = userEvent.setup();
    renderBin("customer");
    await user.click(await screen.findByTestId("checkbox-deleted-record-2"));
    expect(screen.getByTestId("button-purge-selected")).toBeEnabled();
    expect(screen.getByTestId("button-purge-selected")).toHaveTextContent("(1)");
    await user.click(screen.getByTestId("checkbox-deleted-record-3"));
    expect(screen.getByTestId("button-purge-selected")).toHaveTextContent("(2)");
    await user.click(screen.getByTestId("checkbox-deleted-record-2"));
    expect(screen.getByTestId("button-purge-selected")).toHaveTextContent("(1)");
  });

  it("the select-all box ticks every row that is shown - only those the search leaves - and clears them again", async () => {
    const user = userEvent.setup();
    renderBin("customer");
    await screen.findByTestId("deleted-record-2");

    await user.type(screen.getByTestId("input-deleted-search"), "jansen");
    await user.click(screen.getByTestId("checkbox-deleted-select-all"));
    expect(screen.getByTestId("checkbox-deleted-record-2")).toBeChecked();
    expect(screen.getByTestId("button-purge-selected")).toHaveTextContent("(1)");

    await user.clear(screen.getByTestId("input-deleted-search"));
    // Row 3 was never shown while the search was on, so it was never ticked.
    expect(screen.getByTestId("checkbox-deleted-record-3")).not.toBeChecked();
    await user.click(screen.getByTestId("checkbox-deleted-select-all")); // some ticked -> tick all
    expect(screen.getByTestId("button-purge-selected")).toHaveTextContent("(3)");
    await user.click(screen.getByTestId("checkbox-deleted-select-all")); // all ticked -> none
    expect(screen.getByTestId("button-purge-selected")).toBeDisabled();
  });

  it("an empty bin has nothing to empty: both bulk buttons are disabled", async () => {
    serverRows = [];
    renderBin("customer");
    await screen.findByTestId("text-recycle-bin-empty");
    expect(screen.getByTestId("button-purge-selected")).toBeDisabled();
    expect(screen.getByTestId("button-purge-all")).toBeDisabled();
  });
});

describe("RecycleBinDialog - one confirmation before anything is deleted", () => {
  it("one row: the confirm names the record and says it cannot be undone; cancel sends nothing", async () => {
    const user = userEvent.setup();
    renderBin("customer");
    await user.click(await screen.findByTestId("button-purge-2"));

    const confirm = await screen.findByTestId("dialog-confirm-purge");
    expect(confirm).toHaveTextContent("Jansen Verhuur BV");
    expect(confirm).toHaveTextContent("niet ongedaan");
    expect(calls).toHaveLength(0);

    await user.click(within(confirm).getByTestId("button-cancel-purge"));
    await waitFor(() => expect(screen.queryByTestId("dialog-confirm-purge")).toBeNull());
    expect(calls).toHaveLength(0);
    expect(screen.getByTestId("deleted-record-2")).toBeInTheDocument();
  });

  it("one row: confirming sends DELETE for that id, tells the person in Dutch and the row is gone from the list", async () => {
    const user = userEvent.setup();
    const onPurged = vi.fn();
    renderBin("customer", { onPurged });
    await user.click(await screen.findByTestId("button-purge-2"));
    await user.click(await screen.findByTestId("button-confirm-purge"));

    await waitFor(() => expect(calls).toEqual([{ method: "DELETE", url: "/api/deleted-records/2", body: null }]));
    expect(await screen.findByText("1 regel definitief verwijderd.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("deleted-record-2")).toBeNull());
    expect(screen.getByTestId("deleted-record-3")).toBeInTheDocument();
    expect(screen.queryByTestId("dialog-confirm-purge")).toBeNull();
    expect(onPurged).toHaveBeenCalledTimes(1);
  });

  it("a selection: the confirm names the count and the kind; confirming sends the chosen ids and clears the selection", async () => {
    const user = userEvent.setup();
    renderBin("customer");
    await user.click(await screen.findByTestId("checkbox-deleted-record-2"));
    await user.click(screen.getByTestId("checkbox-deleted-record-4"));
    await user.click(screen.getByTestId("button-purge-selected"));

    const confirm = await screen.findByTestId("dialog-confirm-purge");
    expect(confirm).toHaveTextContent("2 klanten");
    expect(confirm).toHaveTextContent("niet ongedaan");
    expect(calls).toHaveLength(0);

    await user.click(within(confirm).getByTestId("button-confirm-purge"));
    await waitFor(() => expect(calls).toEqual([{ method: "POST", url: "/api/deleted-records/purge", body: { ids: [2, 4] } }]));
    expect(await screen.findByText("2 regels definitief verwijderd.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("deleted-record-2")).toBeNull());
    expect(screen.queryByTestId("deleted-record-4")).toBeNull();
    expect(screen.getByTestId("deleted-record-3")).toBeInTheDocument();
    expect(screen.getByTestId("button-purge-selected")).toBeDisabled();
  });

  it("the whole bin: the confirm names the number of records and the kind; the request carries the kind, not a list", async () => {
    const user = userEvent.setup();
    renderBin("customer");
    await user.click(await screen.findByTestId("button-purge-all"));

    const confirm = await screen.findByTestId("dialog-confirm-purge");
    // Everything of the kind goes, also what this list does not show; the count is only the list's.
    expect(confirm).toHaveTextContent("Alles in deze prullenbak wordt definitief verwijderd");
    expect(confirm).toHaveTextContent("alle klanten");
    expect(confirm).toHaveTextContent("ook de regels die niet in de lijst staan");
    expect(confirm).toHaveTextContent("3 in de lijst");
    expect(confirm).toHaveTextContent("niet ongedaan");
    await user.click(within(confirm).getByTestId("button-confirm-purge"));

    await waitFor(() => expect(calls).toEqual([{ method: "POST", url: "/api/deleted-records/purge", body: { entityType: "customer", all: true } }]));
    expect(await screen.findByTestId("text-recycle-bin-empty")).toBeInTheDocument();
  });

  it("each kind speaks of its own things in the confirm", async () => {
    const nouns: Record<DeletedRecordKind, string> = {
      vehicle: "voertuigen", customer: "klanten", reservation: "reserveringen",
      maintenance_block: "onderhoudsplanningen", transport: "transporten", fine: "boetes",
    };
    const user = userEvent.setup();
    for (const kind of ["vehicle", "reservation", "maintenance_block"] as DeletedRecordKind[]) {
      serverRows = SEED_ROWS();
      queryClient.clear();
      const view = renderBin(kind);
      await user.click(await screen.findByTestId("button-purge-all"));
      expect(await screen.findByTestId("dialog-confirm-purge")).toHaveTextContent(`alle ${nouns[kind]}`);
      view.unmount();
    }
  });

  it("a bin at the list cap does not claim to know the count: the confirm says 'all' and the list's maximum", async () => {
    serverRows = Array.from({ length: 200 }, (_, i) => row({ id: 1000 + i, entityType: "fine", label: `Boete ${i}` }));
    const user = userEvent.setup();
    renderBin("fine");
    await user.click(await screen.findByTestId("button-purge-all"));
    const confirm = await screen.findByTestId("dialog-confirm-purge");
    expect(confirm).toHaveTextContent("alle boetes");
    expect(confirm).toHaveTextContent("ook de regels die niet in de lijst staan");
    expect(confirm).toHaveTextContent("maximaal 200");
  });

  it("the kinds that take documents along say which: contracts and damage checks go, the vehicle's documents stay", async () => {
    const user = userEvent.setup();
    for (const kind of ["reservation", "maintenance_block"] as DeletedRecordKind[]) {
      serverRows = SEED_ROWS();
      queryClient.clear();
      const view = renderBin(kind);
      await user.click(await screen.findByTestId("button-purge-all"));
      const confirm = await screen.findByTestId("dialog-confirm-purge");
      expect(confirm).toHaveTextContent("contracten");
      expect(confirm).toHaveTextContent("schadecontroles");
      expect(confirm).toHaveTextContent("Documenten van het voertuig");
      expect(confirm).toHaveTextContent("blijven staan");
      view.unmount();
    }
  });

  // Final wave, item 18: the server refuses to purge a reservation that has fiscal assessments (they are
  // immutable records), so "empty the bin" cannot honestly say it removes everything.
  it("the reservation and maintenance bins say up front that reservations with fiscal assessments are skipped and stay", async () => {
    const user = userEvent.setup();
    for (const kind of ["reservation", "maintenance_block"] as DeletedRecordKind[]) {
      serverRows = SEED_ROWS();
      queryClient.clear();
      const view = renderBin(kind);
      await user.click(await screen.findByTestId("button-purge-all"));
      const confirm = await screen.findByTestId("dialog-confirm-purge");
      expect(confirm, kind).toHaveTextContent("fiscale beoordelingen");
      expect(confirm, kind).toHaveTextContent("overgeslagen");
      expect(confirm, kind).toHaveTextContent("blijft in de prullenbak staan");
      view.unmount();
    }
  });

  it("the other bins do not mention fiscal assessments", async () => {
    const user = userEvent.setup();
    for (const kind of ["vehicle", "customer"] as DeletedRecordKind[]) {
      serverRows = SEED_ROWS();
      queryClient.clear();
      const view = renderBin(kind);
      await user.click(await screen.findByTestId("button-purge-all"));
      expect(await screen.findByTestId("dialog-confirm-purge"), kind).not.toHaveTextContent("fiscale");
      view.unmount();
    }
  });

  it("has the sentence in English too", () => {
    for (const kind of ["reservation", "maintenance_block"]) {
      expect((enBin as any).kinds[kind].purgeNote, kind).toMatch(/fiscal assessments is skipped and stays in the bin/);
    }
  });
});

describe("RecycleBinDialog - what the server answers", () => {
  it("a purge where a file could not be removed is told in Dutch by its code, never by the English text", async () => {
    purgeAnswer = (call) => {
      serverRows = serverRows.filter((r) => r.id !== Number(call.url.split("/").pop()));
      return jsonResponse({
        purged: 1,
        failed: [{ id: 2, code: "FILE_REMOVAL_FAILED", message: "The record was removed, but one or more of its files could not be." }],
      });
    };
    const user = userEvent.setup();
    renderBin("customer");
    await user.click(await screen.findByTestId("button-purge-2"));
    await user.click(await screen.findByTestId("button-confirm-purge"));

    expect(await screen.findByText("Het record is verwijderd, maar een of meer bestanden konden niet van de schijf worden gehaald.")).toBeInTheDocument();
    expect(screen.getByText("Niet alles is gelukt")).toBeInTheDocument();
    expect(screen.queryByText(/could not be/)).toBeNull();
    await waitFor(() => expect(screen.queryByTestId("deleted-record-2")).toBeNull());
  });

  it("a record that was already gone (404 NOT_FOUND) is explained and the list is refreshed", async () => {
    purgeAnswer = (call) => {
      serverRows = serverRows.filter((r) => r.id !== Number(call.url.split("/").pop()));
      return jsonResponse({ code: "NOT_FOUND", message: "That deleted record no longer exists.", purged: 0, failed: [{ id: 2, code: "NOT_FOUND", message: "x" }] }, 404);
    };
    const user = userEvent.setup();
    renderBin("customer");
    await user.click(await screen.findByTestId("button-purge-2"));
    await user.click(await screen.findByTestId("button-confirm-purge"));

    expect(await screen.findByText("Dit record stond al niet meer in de prullenbak.")).toBeInTheDocument();
    expect(screen.queryByText(/no longer exists/)).toBeNull();
    await waitFor(() => expect(screen.queryByTestId("deleted-record-2")).toBeNull());
  });

  it("a failed purge keeps the row and says so in Dutch; an unknown failure falls back to one generic sentence", async () => {
    purgeAnswer = () => jsonResponse({ code: "PURGE_FAILED", message: "This record could not be removed.", purged: 0, failed: [{ id: 3, code: "PURGE_FAILED", message: "x" }] }, 500);
    const user = userEvent.setup();
    renderBin("customer");
    await user.click(await screen.findByTestId("button-purge-3"));
    await user.click(await screen.findByTestId("button-confirm-purge"));
    expect(await screen.findByText("Dit record kon niet worden verwijderd en staat nog in de prullenbak.")).toBeInTheDocument();
    expect(screen.getByTestId("deleted-record-3")).toBeInTheDocument();

    purgeAnswer = () => jsonResponse({ code: "SOMETHING_NEW", message: "Server says no." }, 403);
    // The buttons come back once the failed request has refreshed the list.
    await waitFor(() => expect(screen.getByTestId("button-purge-3")).toBeEnabled());
    await user.click(screen.getByTestId("button-purge-3"));
    await user.click(await screen.findByTestId("button-confirm-purge"));
    expect(await screen.findByText("Het verwijderen is niet gelukt.")).toBeInTheDocument();
    expect(screen.queryByText(/Server says no/)).toBeNull();
  });

  it("a reservation with fiscal assessments is refused: said in Dutch by its code, the row stays, the rest of a selection goes", async () => {
    serverRows = [
      row({ id: 5, entityType: "reservation", label: "Reservering #3387 - AB-123-C 2030-02-01" }),
      row({ id: 7, entityType: "reservation", label: "Reservering #3391 - AB-123-C 2030-04-01" }),
    ];
    purgeAnswer = (call) => {
      serverRows = serverRows.filter((r) => !call.body.ids.includes(r.id) || r.id === 5);
      return jsonResponse({
        purged: 1,
        failed: [{ id: 5, code: "FISCAL_DATA_PRESENT", message: "This reservation has fiscal assessments or review cases, which are kept; it cannot be purged." }],
      });
    };
    const user = userEvent.setup();
    renderBin("reservation");
    await user.click(await screen.findByTestId("checkbox-deleted-select-all"));
    await user.click(screen.getByTestId("button-purge-selected"));
    await user.click(await screen.findByTestId("button-confirm-purge"));

    expect(await screen.findByText("Deze reservering heeft fiscale beoordelingen; die blijven bewaard, dus kan ze niet definitief worden verwijderd.", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Niet alles is gelukt")).toBeInTheDocument();
    expect(screen.getByText("1 regel definitief verwijderd.", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/fiscal assessments or review cases/)).toBeNull();
    await waitFor(() => expect(screen.queryByTestId("deleted-record-7")).toBeNull());
    expect(screen.getByTestId("deleted-record-5")).toBeInTheDocument();
  });

  it("the single-record route's refusal (an error status carrying the code) reads the same", async () => {
    serverRows = [row({ id: 5, entityType: "reservation", label: "Reservering #3387 - AB-123-C 2030-02-01" })];
    purgeAnswer = () => jsonResponse({
      code: "FISCAL_DATA_PRESENT", message: "This reservation has fiscal assessments or review cases, which are kept; it cannot be purged.",
      purged: 0, failed: [{ id: 5, code: "FISCAL_DATA_PRESENT", message: "x" }],
    }, 409);
    const user = userEvent.setup();
    renderBin("reservation");
    await user.click(await screen.findByTestId("button-purge-5"));
    await user.click(await screen.findByTestId("button-confirm-purge"));

    expect(await screen.findByText("Deze reservering heeft fiscale beoordelingen; die blijven bewaard, dus kan ze niet definitief worden verwijderd.")).toBeInTheDocument();
    expect(screen.getByText("Verwijderen mislukt")).toBeInTheDocument();
    expect(screen.queryByText(/fiscal assessments or review cases/)).toBeNull();
    expect(screen.getByTestId("deleted-record-5")).toBeInTheDocument();
  });

  it("a bulk answer with several kinds of trouble lists each sentence once", async () => {
    purgeAnswer = () => jsonResponse({
      purged: 1,
      failed: [
        { id: 2, code: "NOT_FOUND", message: "x" },
        { id: 3, code: "PURGE_FAILED", message: "x" },
        { id: 4, code: "NOT_FOUND", message: "x" },
      ],
    });
    const user = userEvent.setup();
    renderBin("customer");
    await user.click(await screen.findByTestId("button-purge-all"));
    await user.click(await screen.findByTestId("button-confirm-purge"));

    expect(await screen.findByText("1 regel definitief verwijderd.", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText("Dit record stond al niet meer in de prullenbak.", { exact: false })).toHaveLength(1);
    expect(screen.getByText("Dit record kon niet worden verwijderd en staat nog in de prullenbak.", { exact: false })).toBeInTheDocument();
  });
});

describe("RecycleBinDialog - a restore and a purge refresh the same screens", () => {
  // Documents too: purging a reservation deletes its contracts and damage checks and detaches the rest,
  // so a document list that was open behind the bin must not keep showing them.
  const FED_BY_THE_BIN = ["/api/vehicles", "/api/reservations", "/api/fines", "/api/transports", "/api/customers", "/api/documents"];
  /** A screen no bin feeds. */
  const UNRELATED = "/api/notifications";

  /**
   * Seeds one cached query per screen (plus one that no bin feeds) and returns how to see which
   * were invalidated. Invalidations are batched at module level, so one a previous test left
   * pending is flushed first: it must not pass for this test's.
   */
  async function seedScreens() {
    await invalidateByPrefix("/api/__nothing__");
    for (const key of [...FED_BY_THE_BIN, UNRELATED]) queryClient.setQueryData([key], []);
    return (key: string) => queryClient.getQueryState([key])?.isInvalidated === true;
  }

  it("a purge invalidates every screen the bin feeds and leaves the others alone", async () => {
    const user = userEvent.setup();
    renderBin("customer");
    await screen.findByTestId("deleted-record-2");
    const invalidated = await seedScreens();
    await user.click(screen.getByTestId("button-purge-2"));
    await user.click(await screen.findByTestId("button-confirm-purge"));

    await waitFor(() => expect(invalidated("/api/customers")).toBe(true));
    for (const key of FED_BY_THE_BIN) expect(invalidated(key), key).toBe(true);
    expect(invalidated(UNRELATED)).toBe(false);
  });

  it("a restore invalidates exactly the same screens", async () => {
    const user = userEvent.setup();
    renderBin("customer");
    await screen.findByTestId("deleted-record-2");
    const invalidated = await seedScreens();
    await user.click(screen.getByTestId("button-restore-2"));

    await waitFor(() => expect(invalidated("/api/customers")).toBe(true));
    for (const key of FED_BY_THE_BIN) expect(invalidated(key), key).toBe(true);
    expect(invalidated(UNRELATED)).toBe(false);
  });
});

describe("recycleBin locales - the purge texts", () => {
  const keysOf = (value: unknown, prefix = ""): string[] =>
    Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      child && typeof child === "object" ? keysOf(child, `${prefix}${key}.`) : [`${prefix}${key}`],
    );

  it("nl and en carry the same keys", () => {
    expect(keysOf(enBin).sort()).toEqual(keysOf(nlBin).sort());
  });

  it("every kind names its things (singular, plural) and what a purge takes with it, in both languages", () => {
    for (const bin of [nlBin, enBin] as Array<typeof nlBin>) {
      for (const kind of DELETED_RECORD_KINDS) {
        const texts = (bin.kinds as Record<string, Record<string, string>>)[kind];
        for (const key of ["noun_one", "noun_other", "purgeNote"]) expect(texts?.[key], `${kind}.${key}`).toBeTruthy();
      }
    }
  });

  it("every code the purge routes can answer has a Dutch sentence and an English one", () => {
    for (const bin of [nlBin, enBin] as Array<typeof nlBin>) {
      for (const code of ["NOT_FOUND", "PURGE_FAILED", "FILE_REMOVAL_FAILED", "FISCAL_DATA_PRESENT"]) {
        expect((bin.purge.errors as Record<string, string>)[code], code).toBeTruthy();
      }
    }
  });
});
