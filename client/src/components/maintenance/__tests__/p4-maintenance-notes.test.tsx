/**
 * Audit 2026-10-09, module 7, finding A-7-4 (package P4): a maintenance block
 * stores "type: description" in its notes (the shape is parsed back by the edit
 * dialogs and the portal request, so it stays), and the type word is English
 * ("breakdown"). Screens must show it translated, and the legacy imported title
 * "Vehicle maintenance block" must not turn into "Vehicle Maintenance Block".
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserRole } from "@shared/schema";
import i18n from "@/i18n";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [], hidePrices: false },
    isLoading: false,
  }),
}));

import { formatMaintenanceNotes, formatMaintenanceType } from "@/lib/format-utils";
import { MaintenanceListDialog } from "@/components/maintenance/maintenance-list-dialog";

describe("formatMaintenanceNotes", () => {
  it("translates the stored type word and keeps the description", () => {
    expect(formatMaintenanceNotes("breakdown: lekke band")).toBe("Pech: lekke band");
    expect(formatMaintenanceNotes("oil_change: ")).toBe("Olieverversing");
  });

  it("shows only the first line (the second line holds the free notes)", () => {
    expect(formatMaintenanceNotes("brake_service: voorremmen\nklant wacht")).toBe("Remmenonderhoud: voorremmen");
  });

  it("leaves a description that merely contains a colon alone", () => {
    expect(formatMaintenanceNotes("Bellen met garage: dinsdag")).toBe("Bellen met garage: dinsdag");
  });

  it("gives the legacy imported title a Dutch name", () => {
    expect(formatMaintenanceNotes("Vehicle maintenance block")).toBe("Onderhoudsblok");
    expect(formatMaintenanceType("Vehicle maintenance block")).toBe("Onderhoudsblok");
  });

  it("is empty for no notes", () => {
    expect(formatMaintenanceNotes(null)).toBe("");
    expect(formatMaintenanceNotes("")).toBe("");
  });

  it("speaks English when the language is English", async () => {
    await i18n.changeLanguage("en");
    try {
      expect(formatMaintenanceNotes("breakdown: flat tyre")).toBe("Breakdown: flat tyre");
      expect(formatMaintenanceNotes("Vehicle maintenance block")).toBe("Maintenance block");
    } finally {
      await i18n.changeLanguage("nl");
    }
  });
});

const BLOCKS = [
  {
    id: 7, type: "maintenance_block", status: "booked", maintenanceStatus: "scheduled",
    vehicleId: 1, startDate: "2026-11-03", endDate: "2026-11-03", maintenanceDuration: 1,
    notes: "breakdown: lekke band", createdBy: "kees",
    vehicle: { id: 1, brand: "Audi", model: "A4", licensePlate: "11AAA1" },
  },
  {
    id: 8, type: "maintenance_block", status: "booked", maintenanceStatus: "scheduled",
    vehicleId: 2, startDate: "2026-11-04", endDate: "2026-11-04", maintenanceDuration: 1,
    notes: "Vehicle maintenance block", createdBy: "import",
    vehicle: { id: 2, brand: "Fiat", model: "Doblo", licensePlate: "22BBB2" },
  },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => json([])));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the maintenance overview shows the type translated", () => {
  it("lists 'Pech: lekke band' and 'Onderhoudsblok', never the stored English words", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity, queryFn: async () => [] } },
    });
    client.setQueryData(["/api/vehicles/apk-expiring"], []);
    client.setQueryData(["/api/vehicles/warranty-expiring"], []);
    // BUG-205 phase B: the list asks for the maintenance blocks only.
    client.setQueryData(["/api/reservations", { type: "maintenance_block" }], BLOCKS);
    client.setQueryData(["/api/placeholder-reservations/needing-assignment"], []);
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <MaintenanceListDialog open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("tab", { name: /^Gepland/ }));

    const row7 = await screen.findByTestId("row-maintenance-7");
    expect(within(row7).getByText("Pech: lekke band")).toBeInTheDocument();
    expect(within(row7).queryByText(/breakdown/)).toBeNull();
    expect(within(screen.getByTestId("row-maintenance-8")).getByText("Onderhoudsblok")).toBeInTheDocument();
  });
});
