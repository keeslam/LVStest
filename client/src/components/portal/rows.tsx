import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { portalFetch, PortalApiError } from "@/lib/portal-api";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, ChevronRight, MessageSquare, FileText, ShieldCheck, Eye, Download, CheckCircle2 } from "lucide-react";
import type { PortalFineDto } from "@shared/fines";
import type { PortalRequestDto } from "@shared/portal-requests";
import type { PortalDocumentDto } from "@shared/portal-types";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Button } from "@/components/ui/button";
import { ListCard, Plate, StatusBadge, btnSecondary, toneFor, DriverChip } from "./ui";

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
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{new Date(f.offenceAt).toLocaleString()}</span>
          {f.driver && <DriverChip name={f.driver.displayName} />}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
        <span className="text-base font-bold text-[#0f172a]">€ {f.totalAmount}</span>
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
          <span className="text-xs text-[#64748b]">#{r.id} · {new Date(r.createdAt).toLocaleDateString()}</span>
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
          <div className="truncate text-sm font-semibold text-[#0f172a]">{t(`documents.${d.kind}`)}{d.reservationId ? ` · ${t("documents.reservation", { id: d.reservationId })}` : ""}</div>
          <div className="truncate text-xs text-[#64748b]">{d.fileName} · {new Date(d.uploadDate).toLocaleDateString()}</div>
          {showReservationLink && d.reservationId && <button type="button" className="text-xs text-[#2a2f9c] underline" onClick={() => openReservation(d.reservationId!)}>{t("documents.openReservation")}</button>}
          {d.kind === "contract" && (
            d.ack
              ? <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#e1f5ee] px-2 py-0.5 text-xs font-medium text-[#085041]" data-testid={`document-ack-${d.id}`}><CheckCircle2 className="h-3.5 w-3.5" />{t("documents.ackedBy", { name: d.ack.by, date: new Date(d.ack.at).toLocaleString() })}</div>
              : <button type="button" onClick={() => { if (window.confirm(t("documents.ackConfirm"))) ack.mutate(); }} disabled={ack.isPending} className="mt-1 inline-flex items-center gap-1 rounded-full border border-[#1d9e75] px-2 py-0.5 text-xs font-medium text-[#085041] hover:bg-[#e1f5ee]" data-testid={`button-ack-${d.id}`}><CheckCircle2 className="h-3.5 w-3.5" />{t("documents.ack")}</button>
          )}
        </div>
      </div>
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
