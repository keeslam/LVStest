/**
 * Audit remediation P5, A-6-4 (shared with A-4-5) - the history of a record
 * showed the audit log's codes ("reservation.pickup", "customer.create") as if
 * they were text for people. They are worded now; a code nobody has worded yet
 * still shows as it is rather than disappearing.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import i18n from "@/i18n";
import nlCommon from "@/locales/nl/common.json";
import enCommon from "@/locales/en/common.json";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecordHistory } from "@/components/audit/record-history";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [] }, isLoading: false }),
}));

function entry(id: number, action: string) {
  return {
    id,
    username: "balie",
    action,
    resourceType: "reservation",
    resourceId: "3200",
    details: null,
    status: "success",
    createdAt: "2026-10-09T13:05:00.000Z",
  };
}

const logs = [
  entry(1, "reservation.pickup"),
  entry(2, "reservation.return"),
  entry(3, "reservation.revert"),
  entry(4, "reservation.status"),
  entry(5, "reservation.cancel"),
  entry(6, "reservation.create"),
  entry(7, "reservation.update"),
  entry(8, "customer.create"),
  entry(9, "vehicle.restore"),
  entry(10, "document.upload"),
  entry(11, "frobnicator.explode"),
  entry(12, "reservation.contract"),
  entry(13, "vehicle.mileage"),
  entry(14, "customer.purge"),
  entry(15, "reservation.assign-spare"),
  entry(16, "reservation.brand-new-step"),
  entry(17, "vehicle.fuel-status"),
  entry(18, "fine.purge"),
  entry(19, "document.email"),
  entry(20, "document.regenerate"),
  entry(21, "fine.letter"),
  entry(22, "fine.link"),
  entry(23, "fine.unlink"),
  entry(24, "fine.reactivate"),
  entry(25, "fine.status"),
  entry(26, "expense.with-receipt"),
  entry(27, "maintenance_block.purge"),
  entry(28, "maintenance_block.create"),
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ logs, total: logs.length }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }),
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderHistory() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RecordHistory resourceType="reservation" resourceId={3200} />
    </QueryClientProvider>,
  );
}

describe("A-6-4 - audit codes are worded in the record history", () => {
  it("shows Dutch words for the handover steps and the usual changes", async () => {
    renderHistory();
    const text = async (id: number) => (await screen.findByTestId(`record-history-entry-${id}`)).textContent ?? "";
    expect(await text(1)).toContain("Ophalen");
    expect(await text(2)).toContain("Inleveren");
    expect(await text(3)).toContain("Overdracht teruggedraaid");
    expect(await text(4)).toContain("Status gewijzigd");
    // No route writes reservation.cancel (cancelling is reservation.status); it reads as an unworded sub-action.
    expect(await text(5)).toContain("Reservering: cancel");
    expect(await text(6)).toContain("Reservering aangemaakt");
    expect(await text(7)).toContain("Reservering gewijzigd");
    expect(await text(8)).toContain("Klant aangemaakt");
    expect(await text(9)).toContain("Voertuig hersteld");
    expect(await text(10)).toContain("Document geüpload");
  });

  it("words the sub-actions the middleware writes after the id (A-6-4, round 1)", async () => {
    renderHistory();
    const text = async (id: number) => (await screen.findByTestId(`record-history-entry-${id}`)).textContent ?? "";
    expect(await text(12)).toContain("Contract gemaakt");
    expect(await text(13)).toContain("Kilometerstand gewijzigd");
    expect(await text(14)).toContain("Klant definitief verwijderd");
    expect(await text(15)).toContain("Vervangend voertuig toegewezen");
    expect(await text(17)).toContain("Brandstofstatus gewijzigd");
    expect(await text(18)).toContain("Boete definitief verwijderd");
  });

  // Final wave A, item 5: the codes the reviews found still reading "Document: email", "Boete: link" and
  // the raw "maintenance_block.purge" (an underscore entity type is not a resource the label knew).
  it("words the document, fine and expense actions and the underscore entity types", async () => {
    renderHistory();
    const text = async (id: number) => (await screen.findByTestId(`record-history-entry-${id}`)).textContent ?? "";
    expect(await text(19)).toContain("Document gemaild");
    expect(await text(20)).toContain("Document opnieuw gemaakt");
    expect(await text(21)).toContain("Boetebrief geüpload");
    expect(await text(22)).toContain("Boete gekoppeld aan een klant");
    expect(await text(23)).toContain("Koppeling van de boete losgemaakt");
    expect(await text(24)).toContain("Boete weer actief gemaakt");
    expect(await text(25)).toContain("Status van de boete gewijzigd");
    expect(await text(26)).toContain("Kostenpost met bon opgeslagen");
    expect(await text(27)).toContain("Onderhoudsplanning definitief verwijderd");
    expect(await text(28)).toContain("Onderhoudsplanning aangemaakt");
    const list = await screen.findByTestId("record-history-list");
    for (const code of ["document.email", "fine.link", "maintenance_block.purge", "expense.with-receipt"]) {
      expect(list.textContent, code).not.toContain(code);
    }
  });

  it("words them in English too, and nl and en carry the same recordHistory keys", async () => {
    await i18n.changeLanguage("en");
    try {
      renderHistory();
      const text = async (id: number) => (await screen.findByTestId(`record-history-entry-${id}`)).textContent ?? "";
      expect(await text(19)).toContain("Document emailed");
      expect(await text(22)).toContain("Fine linked to a customer");
      expect(await text(27)).toContain("Maintenance block permanently deleted");
      const list = await screen.findByTestId("record-history-list");
      expect(list.textContent).not.toMatch(/\.(email|link|purge|regenerate)\b/);
    } finally {
      await i18n.changeLanguage("nl");
    }
    const keysOf = (value: unknown, prefix = ""): string[] =>
      Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
        child && typeof child === "object" ? keysOf(child, `${prefix}${key}.`) : [`${prefix}${key}`],
      );
    expect(keysOf((enCommon as any).recordHistory).sort()).toEqual(keysOf((nlCommon as any).recordHistory).sort());
  });

  it("reads a known resource with an unworded sub-action as \"Reservering: <sub>\", not as the bare code", async () => {
    renderHistory();
    const row = await screen.findByTestId("record-history-entry-16");
    expect(row).toHaveTextContent("Reservering: brand-new-step");
    expect(row.querySelector("[title=\"reservation.brand-new-step\"]")?.textContent).toBe("Reservering: brand-new-step");
  });

  it("never shows the raw code for a known action", async () => {
    renderHistory();
    const list = await screen.findByTestId("record-history-list");
    for (const code of ["reservation.pickup", "reservation.return", "reservation.revert", "customer.create", "vehicle.restore"]) {
      expect(list.textContent, code).not.toContain(code);
    }
  });

  it("keeps an unknown code visible, so nothing is hidden", async () => {
    renderHistory();
    expect(await screen.findByTestId("record-history-entry-11")).toHaveTextContent("frobnicator.explode");
  });
});
