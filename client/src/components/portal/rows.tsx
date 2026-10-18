import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { portalFetch, portalQueryFn, PortalApiError } from "@/lib/portal-api";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, ChevronRight, MessageSquare, FileText, ShieldCheck, Eye, Download, CheckCircle2, PenLine, FileSignature, Clock } from "lucide-react";
import { PORTAL_ME_KEY } from "@/hooks/use-portal-auth";
import type { PortalMe } from "@shared/portal-types";
import { SignContractDialog } from "./sign-contract-dialog";
import type { PortalFineDto } from "@shared/fines";
import type { PortalRequestDto } from "@shared/portal-requests";
import type { PortalDocumentDto, PortalReservationDto } from "@shared/portal-types";
import { vehicleName } from "@shared/vehicle-name";
import { formatLicensePlate } from "@shared/license-plate";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ListCard, Plate, StatusBadge, btnSecondary, toneFor, DriverChip } from "./ui";
import { formatPortalCurrency, formatPortalDate, formatPortalDateTime, formatPortalDateTimeMedium } from "@/lib/portal-format";

/** Rows shared by the list pages and the list dialogs, so both look the same. */

export function FineRow({ fine: f }: { fine: PortalFineDto }) {
  const { t } = useTranslation("portal");
  const { openFine } = usePortalDialogs();
  return (
    <ListCard tone={toneFor("fine", f.status)} onClick={() => openFine(f.id)} testId={`portal-fine-${f.id}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-semibold text-[#0f172a]">{f.description}</span>
          <Plate value={f.licensePlate} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748b] sm:text-sm">
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatPortalDateTimeMedium(f.offenceAt)}</span>
          {f.driver && <DriverChip name={f.driver.displayName} />}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
        <span className="text-base font-bold text-[#0f172a]">{formatPortalCurrency(f.totalAmount)}</span>
        <ChevronRight className="hidden h-4 w-4 text-[#94a3b8] sm:block" />
      </div>
    </ListCard>
  );
}

export function RequestRow({ request: r }: { request: PortalRequestDto }) {
  const { t } = useTranslation("portal");
  const { openRequest } = usePortalDialogs();
  return (
    <ListCard tone={toneFor("request", r.status)} onClick={() => openRequest(r.id)} testId={`portal-request-${r.id}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-[#0f172a]">{t(`requests.type.${r.type}`)}</span>
          <span className="text-xs text-[#64748b]">#{r.id} · {formatPortalDate(r.createdAt)}</span>
        </div>
        <div className="mt-1 truncate text-xs text-[#64748b] sm:text-sm">{r.type === "booking" && (r.payload as { vehicleLabel?: string }).vehicleLabel ? `${(r.payload as { vehicleLabel?: string }).vehicleLabel} · ` : ""}{r.message.split("\n")[0].slice(0, 100)}</div>
        {r.staffReply && <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#0f6e56]"><MessageSquare className="h-3.5 w-3.5" />{t("requests.replied")}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge kind="request" status={r.status} label={t(`requests.status.${r.status}`)} />
        <ChevronRight className="hidden h-4 w-4 text-[#94a3b8] sm:block" />
      </div>
    </ListCard>
  );
}

export function DocumentRow({ document: d, showReservationLink = true }: { document: PortalDocumentDto; showReservationLink?: boolean }) {
  const { t } = useTranslation("portal");
  const { openDocument, openReservation } = usePortalDialogs();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: reservations = [] } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn });
  const [confirming, setConfirming] = useState(false);
  const [signing, setSigning] = useState(false);
  // Read from the cache the auth provider fills, so the row also renders outside it (tests, previews).
  const { data: me } = useQuery<PortalMe | null>({ queryKey: PORTAL_ME_KEY, enabled: false });
  const sign = d.signing;
  const canSign = sign?.status === "to_sign" && me?.role === "admin";
  // The document is named after the car it is about, not after its file name or an internal reservation number.
  const reservation = d.reservationId ? reservations.find((r) => r.id === d.reservationId) : undefined;
  const label = reservation?.vehicle ? `${vehicleName(reservation.vehicle.brand, reservation.vehicle.model)} ${formatLicensePlate(reservation.vehicle.licensePlate)}` : d.reservationId ? t("documents.reservation", { id: d.reservationId }) : "";
  const ack = useMutation({
    mutationFn: () => portalFetch("POST", `/api/portal/documents/${d.id}/ack`),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["portal"] }); toast({ title: t("documents.ackDone") }); },
    onError: (e) => toast({ title: e instanceof PortalApiError ? e.message : t("errors.PORTAL_SERVER_ERROR"), variant: "destructive" }),
  });
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e6e8f0] bg-white px-4 py-3 shadow-sm" data-testid={`portal-document-${d.id}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${d.kind === "contract" ? "bg-[#eef0fb] text-[#1a1d62]" : "bg-[#faeeda] text-[#854f0b]"}`}>
          {d.kind === "contract" ? <FileText className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <div className="line-clamp-2 text-sm font-semibold text-[#0f172a]" title={d.fileName}>{sign?.status === "signed_copy" ? t("documents.signedContract") : t(`documents.${d.kind}`)}{label ? ` · ${label}` : ""}</div>
          <div className="truncate text-xs text-[#64748b]">{reservation?.contractNumber ? `${t("documents.contractNo", { nr: reservation.contractNumber })} · ` : ""}{formatPortalDate(d.uploadDate)}</div>
          {showReservationLink && d.reservationId && <button type="button" className="text-xs text-[#2a2f9c] underline" onClick={() => openReservation(d.reservationId!)}>{t("documents.openReservation")}</button>}
          {sign?.status === "signed" && <div className="mt-1 flex w-fit items-center gap-1 rounded-full bg-[#e1f5ee] px-2 py-0.5 text-xs font-medium text-[#085041]" data-testid={`document-signed-${d.id}`}><FileSignature className="h-3.5 w-3.5" />{t("documents.signedBy", { name: sign.signedBy, date: sign.signedAt ? formatPortalDateTime(sign.signedAt) : "" })}</div>}
          {sign?.status === "superseded" && <div className="mt-1 text-xs text-[#64748b]" data-testid={`document-superseded-${d.id}`}>{t("documents.superseded")}</div>}
          {sign?.status === "to_sign" && (canSign
            ? <button type="button" onClick={() => setSigning(true)} className="mt-1 flex w-fit items-center gap-1 rounded-full bg-[#f5a623] px-3 py-1 text-xs font-semibold text-[#1a1d62] hover:bg-[#f9bf55]" data-testid={`button-sign-${d.id}`}><PenLine className="h-3.5 w-3.5" />{t("documents.signAction")}</button>
            : <div className="mt-1 flex w-fit items-center gap-1 rounded-full bg-[#faeeda] px-2 py-0.5 text-xs font-medium text-[#854f0b]" data-testid={`document-awaiting-${d.id}`}><Clock className="h-3.5 w-3.5" />{t("documents.awaitingSignature")}</div>)}
          {/* "Gezien en akkoord" stays for contracts without portal signing (uploaded ones, older types). */}
          {d.kind === "contract" && !sign && (
            d.ack
              ? <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#e1f5ee] px-2 py-0.5 text-xs font-medium text-[#085041]" data-testid={`document-ack-${d.id}`}><CheckCircle2 className="h-3.5 w-3.5" />{t("documents.ackedBy", { name: d.ack.by, date: formatPortalDateTime(d.ack.at) })}</div>
              : <button type="button" onClick={() => setConfirming(true)} disabled={ack.isPending} className="mt-1 inline-flex items-center gap-1 rounded-full border border-[#1d9e75] px-2 py-0.5 text-xs font-medium text-[#085041] hover:bg-[#e1f5ee]" data-testid={`button-ack-${d.id}`}><CheckCircle2 className="h-3.5 w-3.5" />{t("documents.ack")}</button>
          )}
        </div>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent data-testid={`ack-dialog-${d.id}`}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("documents.ackConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("documents.ackConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => ack.mutate()} data-testid={`button-ack-confirm-${d.id}`}>{t("documents.ackConfirmAction")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {canSign && <SignContractDialog document={signing ? d : null} onClose={() => setSigning(false)} />}
      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="outline" className={btnSecondary} onClick={() => openDocument(d)} data-testid={`button-open-document-${d.id}`} aria-label={t("documents.open")}><Eye className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">{t("documents.open")}</span></Button>
        {/* target=_blank: never navigate the iframe itself away */}
        <Button asChild size="sm" variant="ghost" aria-label={t("actions.download")}>
          <a href={`/api/portal/documents/${d.id}/download`} target="_blank" rel="noopener"><Download className="h-4 w-4" /></a>
        </Button>
      </div>
    </div>
  );
}
