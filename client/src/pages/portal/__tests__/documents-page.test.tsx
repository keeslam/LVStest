/**
 * Kees, 2026-10-18: a customer with 40-50 cars must still get a calm documents page: what to sign on
 * top, then one compact list with search and pages; old versions hidden unless asked for.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PortalDocumentDto, PortalReservationDto } from "@shared/portal-types";

let role: "admin" | "driver" = "admin";
vi.mock("@/hooks/use-portal-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-portal-auth")>()),
  usePortalAuth: () => ({ me: { role, fullName: "Jan Klant", settings: { canViewContracts: true } } }),
}));
const openDocument = vi.fn();
vi.mock("@/hooks/use-portal-dialogs", () => ({ usePortalDialogs: () => ({ openDocument, openReservation: () => {}, openFine: () => {}, openList: () => {} }) }));

import PortalDocumentsPage, { DOCUMENTS_PAGE_SIZE } from "@/pages/portal/documents";

const plate = (i: number) => `${String(i).padStart(2, "0")}ABC1`;
const reservations: PortalReservationDto[] = Array.from({ length: 45 }, (_, i) => ({
  id: 1000 + i, status: "picked_up", type: "standard", startDate: "2026-09-01", endDate: null, startTime: null, endTime: null,
  actualPickupDate: null, actualReturnDate: null, pickupMileage: null, returnMileage: null, contractNumber: String(5000 + i),
  vehicle: { id: i, licensePlate: plate(i), brand: "PEUGEOT", model: "BOXER", apkDate: null }, driver: null, replacementForReservationId: null, handover: null,
} as unknown as PortalReservationDto));
const doc = (id: number, reservationId: number, signing: PortalDocumentDto["signing"], kind: PortalDocumentDto["kind"] = "contract", day = 1): PortalDocumentDto => ({
  id, reservationId, documentType: kind === "contract" ? "Contract (Unsigned)" : "Damage Check (Pickup)", kind,
  fileName: `doc-${id}.pdf`, uploadDate: `2026-09-${String(day).padStart(2, "0")}T10:00:00.000Z`, ack: null, signing,
});
// 45 signed contracts, 3 damage checks to sign, 2 old versions.
const documents: PortalDocumentDto[] = [
  ...reservations.map((r, i) => doc(i + 1, r.id, { status: "signed", signedBy: "Jan", signedAt: "2026-09-10T10:00:00.000Z" }, "contract", (i % 28) + 1)),
  doc(101, 1000, { status: "to_sign" }, "damage_check", 29), doc(102, 1001, { status: "to_sign" }, "damage_check", 29), doc(103, 1002, { status: "to_sign" }, "damage_check", 29),
  doc(201, 1003, { status: "superseded" }), doc(202, 1004, { status: "superseded" }),
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["portal", "/api/portal/documents"], documents);
  qc.setQueryData(["portal", "/api/portal/reservations"], reservations);
  return render(<QueryClientProvider client={qc}><PortalDocumentsPage /></QueryClientProvider>);
}

beforeEach(() => { role = "admin"; openDocument.mockClear(); });

describe("de documentenpagina met veel auto's", () => {
  it("puts only what still has to be signed on top", () => {
    renderPage();
    const toSign = screen.getByTestId("documents-to-sign");
    expect(within(toSign).getAllByTestId(/^to-sign-/)).toHaveLength(3);
    expect(within(toSign).getByTestId("to-sign-101")).toHaveTextContent("Schadecheck · 00-ABC-1");
    expect(within(toSign).getByTestId("button-sign-101")).toBeInTheDocument();
  });

  it("shows the archive a page at a time, without old versions", async () => {
    renderPage();
    const archive = screen.getByTestId("documents-archive");
    expect(within(archive).getAllByTestId(/^portal-document-/)).toHaveLength(DOCUMENTS_PAGE_SIZE);
    expect(screen.getByTestId("documents-pager")).toHaveTextContent("Pagina 1 van 3"); // 48 of 50 rows: old versions hidden
    expect(screen.queryByTestId("portal-document-201")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("pager-next"));
    expect(screen.getByTestId("documents-pager")).toHaveTextContent("Pagina 2 van 3");
    await userEvent.click(screen.getByTestId("checkbox-show-old"));
    expect(screen.getByTestId("documents-pager")).toHaveTextContent("Pagina 1 van 3");
  });

  it("finds a car by its plate, typed with or without dashes", async () => {
    renderPage();
    await userEvent.type(screen.getByTestId("portal-search"), "07abc1");
    const rows = within(screen.getByTestId("documents-archive")).getAllByTestId(/^portal-document-/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("07-ABC-1");
    expect(screen.queryByTestId("documents-pager")).not.toBeInTheDocument();
  });

  it("a driver gets no sign list, only the status", () => {
    role = "driver";
    renderPage();
    expect(screen.queryByTestId("documents-to-sign")).not.toBeInTheDocument();
    expect(screen.getByTestId("doc-status-101")).toHaveTextContent("Wacht op handtekening");
  });
});
