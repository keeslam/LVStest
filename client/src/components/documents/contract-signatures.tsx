/**
 * Contracts signed in the customer portal, as the office sees them (Kees, 2026-10-18).
 *
 * The signed PDF is a normal "Contract (Signed)" document on the reservation; these pieces add what
 * makes it evidence: who signed, when, from which address and browser, and a fresh check (done by
 * the server on every look) that the original and the signed file are still the files that were signed.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileSignature, ShieldCheck, ShieldAlert, FileQuestion, ExternalLink } from "lucide-react";
import type { ContractSignatureDto, SignatureIntegrity } from "@shared/contract-signing";
import { formatDateTime } from "@/lib/format-utils";

/** Only well-formed rows: a screen must never fall over on an answer it did not expect. */
const isSignature = (row: unknown): row is ContractSignatureDto =>
  Boolean(row && typeof row === "object" && "signedSha256" in row && (row as ContractSignatureDto).integrity);

export function useReservationSignatures(reservationId: number | null | undefined) {
  return useQuery<ContractSignatureDto[], Error, ContractSignatureDto[]>({
    queryKey: [`/api/contract-signatures/reservation/${reservationId}`],
    enabled: Boolean(reservationId),
    select: (rows) => (Array.isArray(rows) ? rows.filter(isSignature) : []),
  });
}

/** "Digitaal getekend" on the signed PDF, "Getekend in portaal" on the original it was signed from. */
export function ContractSignatureBadge({ documentId, signatures }: { documentId: number; signatures: ContractSignatureDto[] | undefined }) {
  const { t } = useTranslation("documents");
  const signature = signatures?.filter(isSignature).find((s) => s.signedDocumentId === documentId || s.documentId === documentId);
  if (!signature) return null;
  const isSignedCopy = signature.signedDocumentId === documentId;
  const broken = (isSignedCopy ? signature.integrity.signed : signature.integrity.original) !== "intact";
  return (
    <span
      role="status"
      data-testid={`document-signature-badge-${documentId}`}
      title={t("signatures.badgeTitle", { name: signature.signerName, date: formatDateTime(signature.signedAt) })}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${broken ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}
    >
      {broken ? <ShieldAlert className="h-3 w-3" aria-hidden="true" /> : <FileSignature className="h-3 w-3" aria-hidden="true" />}
      {broken ? t("signatures.badgeChanged") : isSignedCopy ? t("signatures.badgeSigned") : t("signatures.badgeOriginal")}
    </span>
  );
}

function IntegrityLine({ label, state }: { label: string; state: SignatureIntegrity }) {
  const { t } = useTranslation("documents");
  const style = state === "intact" ? "text-emerald-700" : state === "changed" ? "text-red-700 font-semibold" : "text-gray-500";
  const Icon = state === "intact" ? ShieldCheck : state === "changed" ? ShieldAlert : FileQuestion;
  return (
    <div className={`flex items-center gap-1 ${style}`} data-testid={`signature-integrity-${state}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}: {t(`signatures.integrity.${state}`)}
    </div>
  );
}

/** The audit trail of every portal signature on a reservation; renders nothing when there is none. */
export function ContractSignaturesPanel({ reservationId }: { reservationId: number }) {
  const { t } = useTranslation("documents");
  const { data: signatures } = useReservationSignatures(reservationId);
  if (!signatures?.length) return null;
  return (
    <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-3" data-testid="contract-signatures-panel">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
        <FileSignature className="h-4 w-4" />{t("signatures.panelTitle")}
      </div>
      {signatures.map((s) => (
        <div key={s.id} className="space-y-1 rounded border border-emerald-100 bg-white p-2 text-xs text-gray-700" data-testid={`contract-signature-${s.id}`}>
          <div className="text-sm font-medium text-gray-900">{t("signatures.signedBy", { name: s.signerName, email: s.signerEmail, date: formatDateTime(s.signedAt) })}</div>
          <dl className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[auto_1fr]">
            <dt className="text-gray-500">{t("signatures.document")}</dt><dd className="break-all">{s.originalFileName}{s.originalVersion ? ` (${t("signatures.version", { version: s.originalVersion })})` : ""}</dd>
            <dt className="text-gray-500">{t("signatures.ip")}</dt><dd>{s.ip ?? "-"}</dd>
            <dt className="text-gray-500">{t("signatures.browser")}</dt><dd className="break-all">{s.userAgent ?? "-"}</dd>
            <dt className="text-gray-500">{t("signatures.hashOriginal")}</dt><dd className="break-all font-mono">{s.originalSha256}</dd>
            <dt className="text-gray-500">{t("signatures.hashSigned")}</dt><dd className="break-all font-mono">{s.signedSha256}</dd>
          </dl>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
            <IntegrityLine label={t("signatures.original")} state={s.integrity.original} />
            <IntegrityLine label={t("signatures.signedFile")} state={s.integrity.signed} />
            {s.signedDocumentId && (
              <a href={`/api/documents/view/${s.signedDocumentId}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-blue-700 underline" data-testid={`open-signed-${s.id}`}>
                <ExternalLink className="h-3.5 w-3.5" />{t("signatures.openSigned")}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
