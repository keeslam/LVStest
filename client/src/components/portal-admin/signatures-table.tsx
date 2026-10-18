import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Eye, FileSignature, Clock, CheckCircle2 } from "lucide-react";
import type { AwaitingSignatureRow, SignedDocumentRow } from "@shared/contract-signing";
import { apiRequest } from "@/lib/queryClient";
import { formatDateTime, formatLicensePlate } from "@/lib/format-utils";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableSearch, textMatches } from "./preview";

export const SIGNATURES_KEY = ["/api/portal-admin/signatures"];

/** Marks a signed document as seen and refreshes the dashboard; shared by this list and the attention panel. */
export function useMarkSignatureSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/portal-admin/signatures/${id}/seen`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SIGNATURES_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/portal-admin/dashboard"] });
    },
  });
}

/**
 * Kees, 2026-10-18: what customers signed and sent back through the portal (contracts and damage
 * forms), and what still waits for their signature. Opening a row opens the reservation, where the
 * signed PDF and its audit trail are.
 */
export function SignaturesTable() {
  const { t } = useTranslation("portal");
  const { openReservationDialog, closePortalListDialog } = useGlobalDialog();
  // The reservation opens in its own dialog; this list closes first so it does not cover it.
  const openReservation = (id: number) => { closePortalListDialog(); openReservationDialog(id); };
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery<{ signed: SignedDocumentRow[]; awaiting: AwaitingSignatureRow[] }>({ queryKey: SIGNATURES_KEY });
  const seen = useMarkSignatureSeen();
  const kind = (k: string) => t(`admin.signatures.kind.${k}`);
  const signed = (data?.signed ?? []).filter((r) => textMatches(q, r.customerName, r.licensePlate, r.signerName, kind(r.documentKind), r.reservationId));
  const awaiting = (data?.awaiting ?? []).filter((r) => textMatches(q, r.customerName, r.licensePlate, kind(r.documentKind), r.reservationId));

  const open = (row: SignedDocumentRow) => {
    if (!row.seenAt) seen.mutate(row.id);
    openReservation(row.reservationId);
  };

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">{t("loading")}</p>;
  return (
    <div className="space-y-5" data-testid="signatures-table">
      <TableSearch value={q} onChange={setQ} testId="signatures-search" />

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><FileSignature className="h-4 w-4 text-emerald-700" />{t("admin.signatures.signedTitle")} <span className="font-normal text-muted-foreground">({signed.length})</span></h3>
        {signed.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.signatures.signedEmpty")}</p> : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("admin.signatures.col.signedAt")}</TableHead>
                <TableHead>{t("admin.signatures.col.customer")}</TableHead>
                <TableHead>{t("admin.signatures.col.document")}</TableHead>
                <TableHead>{t("admin.signatures.col.plate")}</TableHead>
                <TableHead>{t("admin.signatures.col.signer")}</TableHead>
                <TableHead>{t("admin.signatures.col.status")}</TableHead>
                <TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {signed.map((r) => (
                  <TableRow key={r.id} data-testid={`signed-row-${r.id}`} className={r.seenAt ? "" : "bg-emerald-50/60 dark:bg-emerald-950/20"}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.signedAt)}</TableCell>
                    <TableCell>{r.customerName}</TableCell>
                    <TableCell>{kind(r.documentKind)}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.licensePlate ? formatLicensePlate(r.licensePlate) : `#${r.reservationId}`}</TableCell>
                    <TableCell>{r.signerName}</TableCell>
                    <TableCell>
                      {r.seenAt
                        ? <span className="text-xs text-muted-foreground" title={formatDateTime(r.seenAt)}>{t("admin.signatures.seenBy", { name: r.seenBy ?? "" })}</span>
                        : <Badge className="bg-emerald-600 hover:bg-emerald-600">{t("admin.signatures.new")}</Badge>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {!r.seenAt && (
                        <Button size="sm" variant="ghost" onClick={() => seen.mutate(r.id)} data-testid={`button-signature-seen-${r.id}`}>
                          <CheckCircle2 className="mr-1 h-4 w-4" />{t("admin.signatures.markSeen")}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => open(r)} data-testid={`button-signature-open-${r.id}`}>
                        <Eye className="mr-1 h-4 w-4" />{t("admin.signatures.open")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-amber-700" />{t("admin.signatures.awaitingTitle")} <span className="font-normal text-muted-foreground">({awaiting.length})</span></h3>
        <p className="text-xs text-muted-foreground">{t("admin.signatures.awaitingHint")}</p>
        {awaiting.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.signatures.awaitingEmpty")}</p> : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("admin.signatures.col.since")}</TableHead>
                <TableHead>{t("admin.signatures.col.customer")}</TableHead>
                <TableHead>{t("admin.signatures.col.document")}</TableHead>
                <TableHead>{t("admin.signatures.col.plate")}</TableHead>
                <TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {awaiting.map((r) => (
                  <TableRow key={r.documentId} data-testid={`awaiting-row-${r.documentId}`}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.since)}</TableCell>
                    <TableCell>{r.customerName}</TableCell>
                    <TableCell>{kind(r.documentKind)}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.licensePlate ? formatLicensePlate(r.licensePlate) : `#${r.reservationId}`}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openReservation(r.reservationId)} data-testid={`button-awaiting-open-${r.documentId}`}>
                        <Eye className="mr-1 h-4 w-4" />{t("admin.signatures.open")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
