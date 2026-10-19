import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Eye, FileText, Image as ImageIcon } from "lucide-react";
import type { CustomerUploadRow, FineAwaitingDriverRow } from "@shared/portal-types";
import { apiRequest } from "@/lib/queryClient";
import { formatDateTime, formatLicensePlate } from "@/lib/format-utils";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { useFilePreview } from "@/components/documents/use-file-preview";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableSearch, textMatches } from "./preview";

export const UPLOADS_KEY = ["/api/portal-admin/uploads"];

/**
 * Kees, 2026-10-19: documents customers uploaded to a reservation in the portal. Viewing one marks it
 * "gezien", like a signed contract; opening the row opens the reservation.
 */
export function UploadsTable() {
  const { t } = useTranslation("portal");
  const queryClient = useQueryClient();
  const preview = useFilePreview();
  const { openReservationDialog, closePortalListDialog } = useGlobalDialog();
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useQuery<CustomerUploadRow[]>({ queryKey: UPLOADS_KEY });
  const seen = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/portal-admin/uploads/${id}/seen`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UPLOADS_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/portal-admin/dashboard"] });
    },
  });
  const rows = data.filter((r) => textMatches(q, r.customerName, r.licensePlate, r.description, r.fileName, r.uploadedBy, r.reservationId));
  const view = (r: CustomerUploadRow) => {
    if (!r.seenAt) seen.mutate(r.id);
    preview.open(`/api/documents/view/${r.id}`, r.description);
  };
  const openReservation = (r: CustomerUploadRow) => {
    if (!r.seenAt) seen.mutate(r.id);
    closePortalListDialog();
    openReservationDialog(r.reservationId);
  };

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">{t("loading")}</p>;
  return (
    <div className="space-y-3" data-testid="uploads-table">
      <TableSearch value={q} onChange={setQ} testId="uploads-search" />
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.uploads.empty")}</p> : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("admin.uploads.col.uploadedAt")}</TableHead>
              <TableHead>{t("admin.uploads.col.customer")}</TableHead>
              <TableHead>{t("admin.uploads.col.plate")}</TableHead>
              <TableHead>{t("admin.uploads.col.description")}</TableHead>
              <TableHead>{t("admin.uploads.col.by")}</TableHead>
              <TableHead>{t("admin.uploads.col.status")}</TableHead>
              <TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-testid={`upload-row-${r.id}`} className={r.seenAt ? "" : "bg-sky-50/60 dark:bg-sky-950/20"}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(r.uploadedAt)}</TableCell>
                  <TableCell>{r.customerName}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <button type="button" className="underline-offset-2 hover:underline" onClick={() => openReservation(r)}>{r.licensePlate ? formatLicensePlate(r.licensePlate) : `#${r.reservationId}`}</button>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">{r.contentType.startsWith("image/") ? <ImageIcon className="h-4 w-4 shrink-0 text-sky-700" /> : <FileText className="h-4 w-4 shrink-0 text-red-600" />}{r.description}</span>
                    <span className="block text-xs text-muted-foreground">{r.fileName}</span>
                  </TableCell>
                  <TableCell className="text-xs">{r.uploadedBy}</TableCell>
                  <TableCell>
                    {r.seenAt
                      ? <span className="text-xs text-muted-foreground" title={formatDateTime(r.seenAt)}>{t("admin.signatures.seenBy", { name: r.seenBy ?? "" })}</span>
                      : <Badge className="bg-sky-600 hover:bg-sky-600">{t("admin.signatures.new")}</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => view(r)} data-testid={`button-view-upload-${r.id}`}><Eye className="mr-1 h-4 w-4" />{t("admin.uploads.view")}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {preview.dialog}
    </div>
  );
}

/**
 * Kees, 2026-10-19: fines on a car several drivers shared at that moment; the customer still has to say
 * who drove. Opening a row opens the fine, where the office can also set the driver itself.
 */
export function FinesAwaitingDriverTable() {
  const { t } = useTranslation("portal");
  const { openFineDialog, closePortalListDialog } = useGlobalDialog();
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useQuery<FineAwaitingDriverRow[]>({ queryKey: ["/api/portal-admin/fines-awaiting-driver"] });
  const rows = data.filter((r) => textMatches(q, r.customerName, r.licensePlate, r.description, ...r.drivers));
  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">{t("loading")}</p>;
  return (
    <div className="space-y-3" data-testid="fines-awaiting-driver-table">
      <p className="text-sm text-muted-foreground">{t("admin.whoDrove.help")}</p>
      <TableSearch value={q} onChange={setQ} testId="who-drove-search" />
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.whoDrove.empty")}</p> : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("admin.whoDrove.col.offenceAt")}</TableHead>
              <TableHead>{t("admin.whoDrove.col.customer")}</TableHead>
              <TableHead>{t("admin.whoDrove.col.plate")}</TableHead>
              <TableHead>{t("admin.whoDrove.col.description")}</TableHead>
              <TableHead>{t("admin.whoDrove.col.drivers")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => { closePortalListDialog(); openFineDialog(r.id); }} data-testid={`who-drove-row-${r.id}`}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(r.offenceAt)}</TableCell>
                  <TableCell>{r.customerName}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatLicensePlate(r.licensePlate)}</TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell>{r.drivers.join(", ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
