/**
 * B-05 (OPT-014, BUG-027) — "Verouderde documenten na een wijziging: markeren
 * als verouderd plus een knop 'opnieuw genereren'."
 *
 * Wave 6 implemented the server half (`documents.is_stale`, `stale_reason`,
 * `version`, `POST /api/documents/:id/regenerate`). This is the half the
 * decision was actually about: what the employee sees, and the fact that a new
 * version is *their* action.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReservationDocumentsDialog } from "@/components/reservations/reservation-documents-dialog";
import {
  StaleDocumentBadge,
  RegenerateDocumentButton,
  canRegenerateDocument,
} from "@/components/documents/stale-document";

const baseDocument = {
  id: 501,
  vehicleId: 42,
  reservationId: 3339,
  documentType: "Contract (Unsigned)",
  fileName: "contract-3339-v1.pdf",
  filePath: "uploads/documents/contract-3339-v1.pdf",
  fileSize: 1024,
  contentType: "application/pdf",
  uploadDate: new Date("2026-03-09T10:00:00.000Z"),
  notes: null,
  version: 1,
  isStale: false,
  staleReason: null,
  staleSince: null,
  createdBy: "medewerker",
  updatedBy: null,
  createdByUser: null,
  updatedByUser: null,
} as any;

function withClient(ui: React.ReactElement, queryFn?: () => Promise<unknown>) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn, retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ ...baseDocument, id: 502, version: 2, fileName: "contract-3339-v2.pdf" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("B-05 — the 'verouderd' marker", () => {
  it("marks a stale document and names the reason", () => {
    withClient(
      <StaleDocumentBadge
        document={{ isStale: true, staleReason: "Reservatiedatums gewijzigd", version: 1 }}
      />,
    );

    const badge = screen.getByTestId("document-stale-badge");
    expect(badge).toHaveTextContent("Verouderd");
    expect(badge.getAttribute("title")).toMatch(/Reservatiedatums gewijzigd/);
  });

  it("says nothing at all about a first version that is still current", () => {
    withClient(<StaleDocumentBadge document={{ isStale: false, staleReason: null, version: 1 }} />);

    expect(screen.queryByTestId("document-stale-badge")).toBeNull();
    expect(screen.queryByTestId("document-version")).toBeNull();
  });

  it("shows the version of a current document once there is more than one", () => {
    withClient(<StaleDocumentBadge document={{ isStale: false, staleReason: null, version: 3 }} />);

    expect(screen.getByTestId("document-version")).toHaveTextContent("versie 3");
  });
});

describe("B-05 — 'opnieuw genereren' is the employee's decision", () => {
  it("is offered for a generated contract and posts to the regenerate endpoint", async () => {
    const user = userEvent.setup();
    withClient(<RegenerateDocumentButton document={baseDocument} />);

    await user.click(screen.getByTestId("button-regenerate-document-501"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/documents/501/regenerate");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("is not offered for an uploaded document — there is nothing to reproduce it from", () => {
    withClient(
      <RegenerateDocumentButton
        document={{ ...baseDocument, documentType: "APK Inspection" }}
      />,
    );

    expect(screen.queryByTestId("button-regenerate-document-501")).toBeNull();
    expect(canRegenerateDocument({ documentType: "APK Inspection", reservationId: 3339 })).toBe(false);
    expect(canRegenerateDocument({ documentType: "Contract (Unsigned)", reservationId: null })).toBe(false);
    expect(canRegenerateDocument({ documentType: "Contract (Unsigned)", reservationId: 3339 })).toBe(true);
  });

  it("never fires by itself: nothing is posted until the button is clicked", async () => {
    withClient(<RegenerateDocumentButton document={baseDocument} />);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("B-05 — the reservation dossier shows both", () => {
  it("puts the badge and the button on a stale contract in the documents dialog", async () => {
    const stale = {
      ...baseDocument,
      isStale: true,
      staleReason: "Voertuig gewijzigd na het genereren",
      version: 1,
    };

    withClient(
      <ReservationDocumentsDialog
        open
        onOpenChange={() => {}}
        reservationId={3339}
        vehicleId={42}
      />,
      async () => [stale],
    );

    await waitFor(() => expect(screen.getByText("contract-3339-v1.pdf")).toBeInTheDocument());
    expect(screen.getByTestId("document-stale-badge")).toHaveTextContent("Verouderd");
    expect(screen.getByTestId("button-regenerate-document-501")).toBeInTheDocument();
  });

  it("leaves an up-to-date document unmarked", async () => {
    withClient(
      <ReservationDocumentsDialog
        open
        onOpenChange={() => {}}
        reservationId={3339}
        vehicleId={42}
      />,
      async () => [baseDocument],
    );

    await waitFor(() => expect(screen.getByText("contract-3339-v1.pdf")).toBeInTheDocument());
    expect(screen.queryByTestId("document-stale-badge")).toBeNull();
  });
});
