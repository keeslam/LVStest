/**
 * Signing a contract in the portal (Kees, 2026-10-18): who sees the sign button, what the dialog
 * demands before it sends, and what it sends (the fingerprint of the file shown, never more).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const portalFetch = vi.fn();
vi.mock("@/lib/portal-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/portal-api")>();
  return { ...actual, portalFetch: (...args: unknown[]) => portalFetch(...args), portalQueryFn: ({ queryKey }: { queryKey: readonly unknown[] }) => portalFetch("GET", String(queryKey[1])) };
});
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/hooks/use-portal-dialogs", () => ({ usePortalDialogs: () => ({ openDocument: () => {}, openReservation: () => {}, openFine: () => {}, openList: () => {} }) }));

import { PortalApiError } from "@/lib/portal-api";
import { PORTAL_ME_KEY } from "@/hooks/use-portal-auth";
import { DocumentRow } from "@/components/portal/rows";
import { SignContractDialog } from "@/components/portal/sign-contract-dialog";
import type { PortalDocumentDto } from "@shared/portal-types";

const SHA = "a".repeat(64);
const doc = (signing: PortalDocumentDto["signing"], extra: Partial<PortalDocumentDto> = {}): PortalDocumentDto => ({
  id: 41, reservationId: 7, documentType: "Contract (Unsigned)", kind: "contract", fileName: "contract.pdf",
  uploadDate: "2026-10-18T10:00:00.000Z", ack: null, signing, ...extra,
});

function setup(role: "admin" | "driver" | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["portal", "/api/portal/reservations"], []);
  if (role) qc.setQueryData(PORTAL_ME_KEY, { role, fullName: "Jan Klant", settings: { canViewContracts: true } });
  return { qc, wrap: (ui: React.ReactNode) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>) };
}

/** jsdom has no canvas: give the pad a context that draws nothing and a fixed PNG. */
beforeEach(() => {
  portalFetch.mockReset();
  toast.mockReset();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {} })) as any;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==");
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
});

describe("the document row", () => {
  it("offers 'Tekenen' to an administrator for a contract that is ready", () => {
    setup("admin").wrap(<DocumentRow document={doc({ status: "to_sign" })} />);
    expect(screen.getByTestId("button-sign-41")).toHaveTextContent("Tekenen");
    // Signing replaces the old "gezien en akkoord" for these contracts.
    expect(screen.queryByTestId("button-ack-41")).not.toBeInTheDocument();
  });

  it("shows a driver that it waits for an administrator, without a sign button", () => {
    setup("driver").wrap(<DocumentRow document={doc({ status: "to_sign" })} />);
    expect(screen.queryByTestId("button-sign-41")).not.toBeInTheDocument();
    expect(screen.getByTestId("document-awaiting-41")).toBeInTheDocument();
  });

  it("shows who signed and when, and names the signed copy", () => {
    const { wrap } = setup("admin");
    wrap(<>
      <DocumentRow document={doc({ status: "signed", signedBy: "Jan Klant", signedAt: "2026-10-18T12:30:00.000Z" })} />
      <DocumentRow document={doc({ status: "signed_copy" }, { id: 42, documentType: "Contract (Signed)" })} />
      <DocumentRow document={doc({ status: "superseded" }, { id: 43 })} />
    </>);
    expect(screen.getByTestId("document-signed-41")).toHaveTextContent("Getekend door Jan Klant");
    expect(screen.getByTestId("portal-document-42")).toHaveTextContent("Getekend contract");
    expect(screen.getByTestId("document-superseded-43")).toBeInTheDocument();
    expect(screen.queryByTestId("button-sign-41")).not.toBeInTheDocument();
  });
});

describe("the sign dialog", () => {
  const info = { documentId: 41, status: "to_sign", sha256: SHA, canSign: true, signerName: "Jan Klant" };

  function draw() {
    const pad = screen.getByTestId("signature-pad");
    pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 100 } as DOMRect);
    fireEvent.pointerDown(pad, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(pad, { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(pad, { pointerId: 1 });
  }

  it("sends only after name, signature and agreement, with the fingerprint of the file shown", async () => {
    portalFetch.mockImplementation(async (method: string, url: string) => (method === "GET" ? info : { signedDocumentId: 99 }));
    const onClose = vi.fn();
    setup("admin").wrap(<SignContractDialog document={doc({ status: "to_sign" })} onClose={onClose} />);
    const submit = await screen.findByTestId("button-sign-submit");
    expect(screen.getByTestId("input-sign-name")).toHaveValue("Jan Klant");
    expect(submit).toBeDisabled();

    draw();
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByTestId("checkbox-sign-agree"));
    expect(submit).toBeEnabled();

    await userEvent.clear(screen.getByTestId("input-sign-name"));
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByTestId("input-sign-name"), "Jan K. Klant");
    await userEvent.click(submit);

    await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("POST", "/api/portal/documents/41/sign", {
      name: "Jan K. Klant", agree: true, signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==", documentSha256: SHA,
    }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("'Opnieuw' clears the signature, so sending is blocked again", async () => {
    portalFetch.mockResolvedValue(info);
    setup("admin").wrap(<SignContractDialog document={doc({ status: "to_sign" })} onClose={() => {}} />);
    const submit = await screen.findByTestId("button-sign-submit");
    draw();
    await userEvent.click(screen.getByTestId("checkbox-sign-agree"));
    expect(submit).toBeEnabled();
    await userEvent.click(screen.getByTestId("button-clear-signature"));
    expect(submit).toBeDisabled();
  });

  it("explains a changed contract in plain words", async () => {
    portalFetch.mockImplementation(async (method: string) => {
      if (method === "GET") return info;
      throw new PortalApiError(409, "PORTAL_DOCUMENT_CHANGED", "changed");
    });
    setup("admin").wrap(<SignContractDialog document={doc({ status: "to_sign" })} onClose={() => {}} />);
    const submit = await screen.findByTestId("button-sign-submit");
    draw();
    await userEvent.click(screen.getByTestId("checkbox-sign-agree"));
    await userEvent.click(submit);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/Het document is net gewijzigd/), variant: "destructive" })));
  });

  it("speaks of a damage form when that is what is signed", async () => {
    portalFetch.mockResolvedValue(info);
    setup("admin").wrap(<SignContractDialog document={doc({ status: "to_sign" }, { kind: "damage_check", documentType: "Damage Check (Unsigned)" })} onClose={() => {}} />);
    await screen.findByTestId("button-sign-submit");
    expect(screen.getByTestId("sign-contract-dialog")).toHaveTextContent("Schadecheck tekenen");
    expect(screen.getByTestId("sign-contract-dialog")).toHaveTextContent("akkoord met de staat van de auto");
  });

  it("says only an administrator can sign when the server says so", async () => {
    portalFetch.mockResolvedValue({ ...info, canSign: false });
    setup("driver").wrap(<SignContractDialog document={doc({ status: "to_sign" })} onClose={() => {}} />);
    expect(await screen.findByTestId("sign-not-allowed")).toHaveTextContent(/Alleen een beheerder/);
    expect(screen.queryByTestId("button-sign-submit")).not.toBeInTheDocument();
  });
});
