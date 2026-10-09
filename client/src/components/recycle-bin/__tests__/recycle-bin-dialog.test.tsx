/**
 * Sub-project C, task 6 (besluit B-36; spec
 * docs/superpowers/specs/2026-10-09-terugdraaien-prullenbak-design.md §4):
 * ONE recycle-bin dialog that takes a `kind` and shows that kind's title,
 * description, empty text and row badge. It asks the server for its own kind
 * only (`GET /api/deleted-records?type=<kind>`), prints the relatedCounts as
 * words instead of raw keys, and translates a refused restore by its stable
 * `code`, never by the English message.
 *
 * Replaces client/src/components/vehicles/__tests__/recycle-bin-types.test.tsx
 * (B-15: all kinds listed, labelled, restorable; the single-type view).
 *
 * Runs in the jsdom project (plan §8.8), real i18n (setup-jsdom.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "i18next";
import { DELETED_RECORD_KINDS, type DeletedRecordKind } from "@shared/schema";
import { queryKeyUrl } from "@/lib/query-key-url";
import { Toaster } from "@/components/ui/toaster";
import nlBin from "@/locales/nl/recycleBin.json";
import enBin from "@/locales/en/recycleBin.json";
import { RecycleBinDialog, describeCounts } from "@/components/recycle-bin/recycle-bin-dialog";

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

const ALL_ROWS: Row[] = [
  row({ id: 1, entityType: "vehicle", label: "AB-123-C Volkswagen Crafter", relatedCounts: { reservations: 2, documents: 1 } }),
  row({ id: 2, entityType: "customer", label: "Jansen Verhuur BV", relatedCounts: { drivers: 1, portal_customer_settings: 1 } }),
  row({ id: 3, entityType: "reservation", label: "Reservering #3387 — AB-123-C 2030-02-01" }),
  row({ id: 4, entityType: "maintenance_block", label: "Onderhoud #3390 — AB-123-C 2030-03-01" }),
  row({ id: 5, entityType: "transport", label: "Transport #44 — AB-123-C 2030-02-01", relatedCounts: { spareReservations: 1 } }),
  row({ id: 6, entityType: "fine", label: "Boete AB-123-C", relatedCounts: { requests: 0 } }),
  row({ id: 7, entityType: "customer", label: "Oud Bedrijf", restoredAt: "2026-09-05T10:00:00.000Z", restoredBy: "anna" }),
];

let requestedUrls: string[];
let postedUrls: string[];
let restoreResponse: () => Response;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  requestedUrls = [];
  postedUrls = [];
  restoreResponse = () => jsonResponse({ success: true, message: "Jansen Verhuur BV is teruggezet." });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST" && /\/api\/deleted-records\/\d+\/restore$/.test(url)) {
        postedUrls.push(url);
        return restoreResponse();
      }
      if (method === "GET" && url.startsWith("/api/deleted-records")) {
        requestedUrls.push(url);
        // The server filters on ?type=; the stub does the same.
        const type = new URL(url, "http://localhost").searchParams.get("type");
        return jsonResponse(type ? ALL_ROWS.filter((r) => r.entityType === type) : ALL_ROWS);
      }
      return jsonResponse([]);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderBin(kind: DeletedRecordKind, props: { onRestored?: () => void; rows?: Row[] } = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        // The default query function builds its URL with this very rule.
        queryFn: async ({ queryKey }) => (await fetch(queryKeyUrl(queryKey as readonly unknown[]))).json(),
      },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <RecycleBinDialog kind={kind} open onOpenChange={() => {}} onRestored={props.onRestored} />
      <Toaster />
    </QueryClientProvider>,
  );
}

const KIND_FACTS: Record<DeletedRecordKind, { title: string; empty: string; badge: string; rowId: number; label: string }> = {
  vehicle: { title: "Verwijderde voertuigen", empty: "Geen verwijderde voertuigen.", badge: "Voertuig", rowId: 1, label: "AB-123-C Volkswagen Crafter" },
  customer: { title: "Verwijderde klanten", empty: "Geen verwijderde klanten.", badge: "Klant", rowId: 2, label: "Jansen Verhuur BV" },
  reservation: { title: "Verwijderde reserveringen", empty: "Geen verwijderde reserveringen.", badge: "Reservering", rowId: 3, label: "Reservering #3387" },
  maintenance_block: { title: "Verwijderd onderhoud", empty: "Geen verwijderd onderhoud.", badge: "Onderhoud", rowId: 4, label: "Onderhoud #3390" },
  transport: { title: "Verwijderde transporten", empty: "Geen verwijderde transporten.", badge: "Transport", rowId: 5, label: "Transport #44" },
  fine: { title: "Verwijderde bekeuringen", empty: "Geen verwijderde bekeuringen.", badge: "Boete", rowId: 6, label: "Boete AB-123-C" },
};

describe("RecycleBinDialog - one dialog, one kind per screen", () => {
  it.each(DELETED_RECORD_KINDS)("%s: asks the server for its own kind, shows its title and only its rows with the right badge", async (kind) => {
    const facts = KIND_FACTS[kind];
    renderBin(kind);

    const rowEl = await screen.findByTestId(`deleted-record-${facts.rowId}`);
    expect(screen.getByRole("heading", { name: facts.title })).toBeInTheDocument();
    expect(rowEl).toHaveTextContent(facts.label);
    expect(screen.getByTestId(`deleted-record-type-${facts.rowId}`)).toHaveTextContent(facts.badge);
    expect(screen.getByTestId(`button-restore-${facts.rowId}`)).toBeEnabled();

    // Server-side filter, not a client-side one.
    expect(requestedUrls).toContain(`/api/deleted-records?type=${kind}`);
    // No other kind's rows (the customer kind has two rows of its own).
    const ownIds = ALL_ROWS.filter((r) => r.entityType === kind).map((r) => r.id);
    for (const other of ALL_ROWS.filter((r) => !ownIds.includes(r.id))) {
      expect(screen.queryByTestId(`deleted-record-${other.id}`)).toBeNull();
    }
  });

  it.each(DELETED_RECORD_KINDS)("%s: says so in its own words when the bin is empty", async (kind) => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));
    renderBin(kind);

    expect(await screen.findByTestId("text-recycle-bin-empty")).toHaveTextContent(KIND_FACTS[kind].empty);
  });

  it("the maintenance bin is called Onderhoud, not Reservering", async () => {
    renderBin("maintenance_block");

    expect(await screen.findByTestId("deleted-record-type-4")).toHaveTextContent("Onderhoud");
    expect(screen.getByTestId("dialog-recycle-bin")).toHaveAttribute("data-kind", "maintenance_block");
    expect(screen.queryByText("Reservering", { exact: true })).toBeNull();
  });

  it("a restored row keeps its place with the badge and a disabled restore button", async () => {
    renderBin("customer");

    const restored = await screen.findByTestId("deleted-record-7");
    expect(restored).toHaveTextContent("Teruggezet");
    expect(restored).toHaveTextContent("anna");
    expect(screen.getByTestId("button-restore-7")).toBeDisabled();
    expect(screen.getByTestId("button-restore-2")).toBeEnabled();
  });

  it("does not show another kind's rows even if the cache handed it a mixed list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(ALL_ROWS)));
    renderBin("reservation");

    expect(await screen.findByTestId("deleted-record-3")).toBeInTheDocument();
    expect(screen.queryByTestId("deleted-record-1")).toBeNull();
    expect(screen.queryByTestId("deleted-record-4")).toBeNull();
    expect(screen.queryByTestId("deleted-record-5")).toBeNull();
  });

  it("searches the label and the name of whoever deleted it", async () => {
    const user = userEvent.setup();
    renderBin("customer");
    await screen.findByTestId("deleted-record-2");

    await user.type(screen.getByTestId("input-deleted-search"), "oud bedrijf");
    expect(screen.queryByTestId("deleted-record-2")).toBeNull();
    expect(screen.getByTestId("deleted-record-7")).toBeInTheDocument();

    await user.clear(screen.getByTestId("input-deleted-search"));
    await user.type(screen.getByTestId("input-deleted-search"), "zzz");
    expect(await screen.findByTestId("text-recycle-bin-empty")).toHaveTextContent("Niets gevonden");
  });

  it("prints the related counts as words, never as raw keys", async () => {
    renderBin("vehicle");

    const record = await screen.findByTestId("deleted-record-1");
    expect(record).toHaveTextContent("Bevat: 2 reserveringen, 1 document");
    expect(record).not.toHaveTextContent("reservations");
  });
});

describe("RecycleBinDialog - restoring", () => {
  it("posts the restore, tells the person in Dutch and calls onRestored", async () => {
    const user = userEvent.setup();
    const onRestored = vi.fn();
    renderBin("customer", { onRestored });

    await user.click(await screen.findByTestId("button-restore-2"));

    await waitFor(() => expect(postedUrls).toEqual(["/api/deleted-records/2/restore"]));
    expect(await screen.findByText("Jansen Verhuur BV is teruggezet.")).toBeInTheDocument();
    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
  });

  it("a refused restore is shown by its code in Dutch - the English server text never reaches the screen", async () => {
    const user = userEvent.setup();
    restoreResponse = () =>
      jsonResponse(
        { code: "RESERVATION_CONFLICT", message: "Deze reservering kan niet terug: the vehicle was booked." },
        409,
      );
    renderBin("reservation");

    await user.click(await screen.findByTestId("button-restore-3"));

    expect(
      await screen.findByText("Deze reservering kan niet terug: het voertuig is in de tussentijd geboekt voor die periode."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/the vehicle was booked/)).toBeNull();
    expect(screen.getByText("Terugzetten mislukt")).toBeInTheDocument();
  });

  it("a refused debtor number names the customer who holds it, from the structured field", async () => {
    const user = userEvent.setup();
    restoreResponse = () =>
      jsonResponse(
        {
          code: "DEBTOR_NUMBER_TAKEN",
          message: "Another customer (Bakkerij De Wit) already uses this debtor number.",
          conflictingCustomerName: "Bakkerij De Wit",
        },
        409,
      );
    renderBin("customer");

    await user.click(await screen.findByTestId("button-restore-2"));

    expect(await screen.findByText("Dit debiteurnummer is al in gebruik bij klant Bakkerij De Wit.")).toBeInTheDocument();
    // The English server text is never shown, and the name is not parsed out of it.
    expect(screen.queryByText(/Another customer/)).toBeNull();
  });

  it("a refused debtor number without a name still reads as a whole Dutch sentence", async () => {
    const user = userEvent.setup();
    restoreResponse = () =>
      jsonResponse({ code: "DEBTOR_NUMBER_TAKEN", message: "Another customer already uses this debtor number." }, 409);
    renderBin("customer");

    await user.click(await screen.findByTestId("button-restore-2"));

    expect(await screen.findByText("Een andere klant gebruikt dit debiteurnummer al.")).toBeInTheDocument();
    expect(screen.queryByText(/{{name}}/)).toBeNull();
  });

  it("an unknown refusal falls back to one generic Dutch sentence", async () => {
    const user = userEvent.setup();
    restoreResponse = () => jsonResponse({ code: "SOMETHING_NEW", message: "Server says no." }, 409);
    renderBin("transport");

    await user.click(await screen.findByTestId("button-restore-5"));

    expect(await screen.findByText("Dit record kon niet worden teruggezet.")).toBeInTheDocument();
    expect(screen.queryByText(/Server says no/)).toBeNull();
  });
});

describe("describeCounts", () => {
  const t = i18n.getFixedT("nl", "recycleBin");

  it("uses singular and plural words and joins them", () => {
    expect(describeCounts({ reservations: 1, documents: 5, expenses: 2 }, t)).toBe("1 reservering, 5 documenten, 2 kostenposten");
  });

  it("leaves zero counts out and says so when nothing is left", () => {
    expect(describeCounts({ requests: 0, documents: 0 }, t)).toBe("geen gekoppelde gegevens");
    expect(describeCounts(null, t)).toBe("geen gekoppelde gegevens");
    expect(describeCounts({}, t)).toBe("geen gekoppelde gegevens");
  });

  it("names the cascade tables too, and folds cleared links (table.column) into one part", () => {
    expect(
      describeCounts({ drivers: 2, portal_customer_settings: 1, "fines.customer_id": 1, "vehicle_transports.customer_id": 2 }, t),
    ).toBe("2 bestuurders, 1 portaalinstelling, 3 verwijzingen in andere gegevens losgekoppeld");
  });

  it("a key nobody translated yet prints as readable words, not as the raw key", () => {
    expect(describeCounts({ some_new_table: 3, fooBarBaz: 1 }, t)).toBe("3 some new table, 1 foo bar baz");
  });

  it("speaks English with the English locale", () => {
    const en = i18n.getFixedT("en", "recycleBin");
    expect(describeCounts({ reservations: 2, documents: 1 }, en)).toBe("2 reservations, 1 document");
    expect(describeCounts({}, en)).toBe("no linked records");
  });
});

describe("recycleBin locales", () => {
  const keysOf = (value: unknown, prefix = ""): string[] =>
    Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      child && typeof child === "object" ? keysOf(child, `${prefix}${key}.`) : [`${prefix}${key}`],
    );

  it("nl and en carry exactly the same keys", () => {
    expect(keysOf(enBin).sort()).toEqual(keysOf(nlBin).sort());
  });

  it("every kind has an opener label, title, description, empty text and badge in both languages", () => {
    for (const bin of [nlBin, enBin] as Array<typeof nlBin>) {
      for (const kind of DELETED_RECORD_KINDS) {
        const texts = (bin.kinds as Record<string, Record<string, string>>)[kind];
        for (const key of ["openButton", "title", "description", "empty", "badge"]) {
          expect(texts?.[key], `${kind}.${key}`).toBeTruthy();
        }
      }
    }
  });

  it("every code the restore route can answer has a Dutch sentence and an English one", () => {
    const codes = [
      "NOT_FOUND", "ALREADY_RESTORED", "UNSUPPORTED_TYPE", "EMPTY_SNAPSHOT", "ID_TAKEN",
      "LICENSE_PLATE_TAKEN", "BARCODE_TAKEN", "RESERVATION_CONFLICT", "DEBTOR_NUMBER_TAKEN",
    ];
    for (const bin of [nlBin, enBin] as Array<typeof nlBin>) {
      for (const code of codes) expect((bin.restoreErrors as Record<string, string>)[code], code).toBeTruthy();
    }
  });
});
