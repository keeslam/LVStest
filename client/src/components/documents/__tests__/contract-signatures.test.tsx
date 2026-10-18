/**
 * The office side of portal signatures (Kees, 2026-10-18): the badge on the documents and the audit
 * trail under them, including a loud warning when a file no longer matches its signature.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContractSignatureBadge, ContractSignaturesPanel } from "@/components/documents/contract-signatures";
import type { ContractSignatureDto } from "@shared/contract-signing";

const signature = (integrity: ContractSignatureDto["integrity"]): ContractSignatureDto => ({
  id: 3, documentKind: "contract", documentId: 41, signedDocumentId: 42, reservationId: 7, signerName: "Jan Klant", signerEmail: "jan@example.test",
  signedAt: "2026-10-18T12:30:00.000Z", ip: "203.0.113.9", userAgent: "Mozilla/5.0 Test", consentVersion: "2026-10-18",
  originalFileName: "contract.pdf", originalVersion: 2, originalSha256: "a".repeat(64), signedSha256: "b".repeat(64), integrity,
});

function withData(rows: ContractSignatureDto[], ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, queryFn: async () => rows } } });
  qc.setQueryData(["/api/contract-signatures/reservation/7"], rows);
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("portal signatures for the office", () => {
  it("marks the signed copy and the original", () => {
    const rows = [signature({ original: "intact", signed: "intact" })];
    withData(rows, <>
      <ContractSignatureBadge documentId={42} signatures={rows} />
      <ContractSignatureBadge documentId={41} signatures={rows} />
      <ContractSignatureBadge documentId={40} signatures={rows} />
    </>);
    expect(screen.getByTestId("document-signature-badge-42")).toHaveTextContent("Digitaal getekend");
    expect(screen.getByTestId("document-signature-badge-41")).toHaveTextContent("Getekend in portaal");
    expect(screen.queryByTestId("document-signature-badge-40")).not.toBeInTheDocument();
  });

  it("shows the audit trail: who, when, IP, browser, both fingerprints", () => {
    withData([signature({ original: "intact", signed: "intact" })], <ContractSignaturesPanel reservationId={7} />);
    const panel = screen.getByTestId("contract-signature-3");
    expect(panel).toHaveTextContent("Jan Klant (jan@example.test)");
    expect(panel).toHaveTextContent("203.0.113.9");
    expect(panel).toHaveTextContent("Mozilla/5.0 Test");
    expect(panel).toHaveTextContent("a".repeat(64));
    expect(panel).toHaveTextContent("b".repeat(64));
    expect(screen.getAllByTestId("signature-integrity-intact")).toHaveLength(2);
    expect(screen.getByTestId("open-signed-3")).toHaveAttribute("href", "/api/documents/view/42");
  });

  it("warns when a file changed after signing", () => {
    const rows = [signature({ original: "intact", signed: "changed" })];
    withData(rows, <><ContractSignaturesPanel reservationId={7} /><ContractSignatureBadge documentId={42} signatures={rows} /></>);
    expect(screen.getByTestId("signature-integrity-changed")).toHaveTextContent("GEWIJZIGD na tekenen");
    expect(screen.getByTestId("document-signature-badge-42")).toHaveTextContent("Bestand gewijzigd na tekenen");
  });

  it("renders nothing for a reservation without portal signatures", () => {
    const { container } = withData([], <ContractSignaturesPanel reservationId={7} />);
    expect(container).toBeEmptyDOMElement();
  });
});
