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
 *     English message.
 *
 * Runs against the app's own query client (`@/lib/queryClient`) so the real
 * `invalidateByPrefix` is what refreshes the list. jsdom project, real i18n.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { DELETED_RECORD_KINDS, type DeletedRecordKind } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
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
    expect(confirm).toHaveTextContent("3 klanten");
    await user.click(within(confirm).getByTestId("button-confirm-purge"));

    await waitFor(() => expect(calls).toEqual([{ method: "POST", url: "/api/deleted-records/purge", body: { entityType: "customer", all: true } }]));
    expect(await screen.findByTestId("text-recycle-bin-empty")).toBeInTheDocument();
  });

  it("each kind speaks of its own things in the confirm", async () => {
    const nouns: Record<DeletedRecordKind, string> = {
      vehicle: "voertuig", customer: "klant", reservation: "reservering",
      maintenance_block: "onderhoudsplanning", transport: "transport", fine: "boete",
    };
    const user = userEvent.setup();
    for (const kind of ["vehicle", "reservation", "maintenance_block"] as DeletedRecordKind[]) {
      serverRows = SEED_ROWS();
      queryClient.clear();
      const view = renderBin(kind);
      await user.click(await screen.findByTestId("button-purge-all"));
      expect(await screen.findByTestId("dialog-confirm-purge")).toHaveTextContent(`1 ${nouns[kind]}`);
      view.unmount();
    }
  });

  it("a bin at the list cap does not claim to know the count: the confirm says 'all' and the minimum", async () => {
    serverRows = Array.from({ length: 200 }, (_, i) => row({ id: 1000 + i, entityType: "fine", label: `Boete ${i}` }));
    const user = userEvent.setup();
    renderBin("fine");
    await user.click(await screen.findByTestId("button-purge-all"));
    const confirm = await screen.findByTestId("dialog-confirm-purge");
    expect(confirm).toHaveTextContent("Alle boetes");
    expect(confirm).toHaveTextContent("200");
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
      for (const code of ["NOT_FOUND", "PURGE_FAILED", "FILE_REMOVAL_FAILED"]) {
        expect((bin.purge.errors as Record<string, string>)[code], code).toBeTruthy();
      }
    }
  });
});
