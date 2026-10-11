/**
 * Sub-project C, task 6 (besluiten B-36, B-38): every screen has its own bin
 * opener, wrapped in `RequiresPermission anyOf={[MANAGE_RECYCLE_BIN]}` - visible
 * but greyed out, naming the right, for everyone who lacks it (the old Voertuigen
 * and Boetes openers were hidden behind `role === admin`).
 *
 * The fines table is light enough to render for real; the five page-sized
 * screens (Voertuigen, Klanten, Reserveringen, Onderhoud, Transporten) are
 * proven end to end by the dialogs spec of the E2E suite (one registry entry
 * each, every profile without the right reads the disabled opener and its
 * tooltip) and, here, by a source check that nobody puts the old role gate back.
 *
 * Runs in the jsdom project (plan §8.8), real i18n (setup-jsdom.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeyUrl } from "@/lib/query-key-url";

let currentUser: { id: number; username: string; role: string; permissions: string[] };
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: currentUser, isLoading: false }),
}));
vi.mock("@/contexts/GlobalDialogContext", () => ({
  useGlobalDialog: () => ({
    openFineDialog: () => {}, openNewFineDialog: () => {}, openFineImportDialog: () => {}, openFineImportsDialog: () => {},
  }),
}));

import { FinesTable } from "@/components/fines/fines-table";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let requestedUrls: string[];

beforeEach(() => {
  requestedUrls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      requestedUrls.push(url);
      return jsonResponse([]);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderFines() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        queryFn: async ({ queryKey }) => (await fetch(queryKeyUrl(queryKey as readonly unknown[]))).json(),
      },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <FinesTable />
    </QueryClientProvider>,
  );
}

describe("fines table - the bin opener follows the right, not the role", () => {
  it("an account that manages fines but lacks 'Prullenbak beheren' sees the opener greyed out, with the reason", async () => {
    currentUser = { id: 2, username: "lena", role: "user", permissions: ["view_fines", "manage_fines"] };
    const user = userEvent.setup();
    renderFines();

    const opener = await screen.findByTestId("button-fines-bin");
    expect(opener).toHaveAttribute("aria-disabled", "true");
    expect(opener).toBeDisabled();

    // The tooltip sits on the wrapping span (a disabled button swallows pointer events).
    await user.hover(opener.parentElement as HTMLElement);
    expect((await screen.findAllByText(/Prullenbak beheren/)).length).toBeGreaterThan(0);

    // Nothing was fetched from the bin.
    expect(requestedUrls.some((url) => url.startsWith("/api/deleted-records"))).toBe(false);
  });

  it("a manager holding the right opens the fines bin: its own title, filtered to fines on the server", async () => {
    currentUser = { id: 3, username: "manager", role: "manager", permissions: ["view_fines", "manage_fines", "manage_recycle_bin"] };
    const user = userEvent.setup();
    renderFines();

    const opener = await screen.findByTestId("button-fines-bin");
    expect(opener).toBeEnabled();
    await user.click(opener);

    expect(await screen.findByRole("heading", { name: "Verwijderde bekeuringen" })).toBeInTheDocument();
    expect(await screen.findByTestId("text-recycle-bin-empty")).toHaveTextContent("Geen verwijderde bekeuringen.");
    expect(requestedUrls).toContain("/api/deleted-records?type=fine");
  });

  it("role admin passes without listing the right", async () => {
    currentUser = { id: 1, username: "kees", role: "admin", permissions: [] };
    renderFines();

    expect(await screen.findByTestId("button-fines-bin")).toBeEnabled();
  });

  it("holding the right is enough: an account without manage_fines still sees an enabled opener", async () => {
    currentUser = { id: 4, username: "bin-keeper", role: "user", permissions: ["view_fines", "manage_recycle_bin"] };
    renderFines();

    expect(await screen.findByTestId("button-fines-bin")).toBeEnabled();
    // The fines actions stay behind manage_fines.
    expect(screen.queryByTestId("button-new-fine")).toBeNull();
  });
});

describe("the eight openers are gated by the right, never by role admin", () => {
  const SOURCES: Array<{ file: string; opener: string; kind: string }> = [
    { file: "client/src/pages/vehicles/index.tsx", opener: "button-open-recycle-bin", kind: "vehicle" },
    { file: "client/src/pages/customers/index.tsx", opener: "button-open-recycle-bin-customers", kind: "customer" },
    { file: "client/src/pages/reservations/calendar.tsx", opener: "button-open-recycle-bin-reservations", kind: "reservation" },
    { file: "client/src/pages/maintenance/calendar.tsx", opener: "button-open-recycle-bin-maintenance", kind: "maintenance_block" },
    { file: "client/src/pages/delivery/dashboard.tsx", opener: "button-open-recycle-bin-transports", kind: "transport" },
    { file: "client/src/components/fines/fines-table.tsx", opener: "button-fines-bin", kind: "fine" },
    // Sub-project D (B-41 D8): the Kosten page and the Chauffeurs section of the customer details.
    { file: "client/src/pages/expenses/index.tsx", opener: "button-expenses-bin", kind: "expense" },
    { file: "client/src/components/customers/customer-details.tsx", opener: "button-drivers-bin", kind: "driver" },
  ];

  for (const { file, opener, kind } of SOURCES) {
    it(`${opener}: wrapped in RequiresPermission anyOf MANAGE_RECYCLE_BIN, opens the "${kind}" bin`, () => {
      const source = readFileSync(resolve(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
      const at = source.indexOf(`data-testid="${opener}"`);
      expect(at, `${opener} must exist in ${file}`).toBeGreaterThan(-1);
      // The wrapper opens a few lines above the button's own test id.
      const before = source.slice(Math.max(0, at - 500), at);
      expect(before).toContain("<RequiresPermission anyOf={[UserPermission.MANAGE_RECYCLE_BIN]}>");
      expect(source).toMatch(new RegExp(`<RecycleBinDialog\\s+kind="${kind}"`));
      // No role gate in front of the opener or the dialog.
      expect(before).not.toMatch(/isAdmin|UserRole\.ADMIN/);
      expect(source).not.toMatch(/\{isAdmin && <(DeletedVehicles|RecycleBin)Dialog/);
    });
  }
});
