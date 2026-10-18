import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileText, ShieldCheck, PenLine, Eye, Download, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import type { PortalDocumentDto, PortalReservationDto } from "@shared/portal-types";
import { vehicleName } from "@shared/vehicle-name";
import { formatLicensePlate } from "@shared/license-plate";
import { portalFetch, portalQueryFn, PortalApiError } from "@/lib/portal-api";
import { formatPortalDate, formatPortalDateTime } from "@/lib/portal-format";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SignContractDialog } from "@/components/portal/sign-contract-dialog";
import { EmptyState, PageHeader, Section, SearchBox, usePortalSearch, PortalLoading, PortalLoadError, btnPrimary, btnSecondary } from "@/components/portal/ui";

/** Rows per page of the archive; a customer with 40-50 cars still gets a calm page. */
export const DOCUMENTS_PAGE_SIZE = 20;
/** The to-sign list shows this many before "Toon alle". */
const TO_SIGN_PREVIEW = 8;

/**
 * Contracts and damage checks (Kees, 2026-10-18): what the customer still has to sign on top, as a
 * short task list, and below it every document in one compact, searchable list with pages. Older
 * versions that a newer one replaced are hidden unless asked for.
 */
export default function PortalDocumentsPage() {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { openDocument } = usePortalDialogs();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data = [], isLoading, isError, refetch } = useQuery<PortalDocumentDto[]>({ queryKey: ["portal", "/api/portal/documents"], queryFn: portalQueryFn });
  const { data: reservations = [] } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn });
  const { query, setQuery, q, hit } = usePortalSearch();
  const [showOld, setShowOld] = useState(false);
  const [page, setPage] = useState(0);
  const [allToSign, setAllToSign] = useState(false);
  const [signing, setSigning] = useState<PortalDocumentDto | null>(null);
  const [acking, setAcking] = useState<PortalDocumentDto | null>(null);
  const isAdmin = me?.role === "admin";

  const byId = useMemo(() => new Map(reservations.map((r) => [r.id, r])), [reservations]);
  const vehicleOf = (d: PortalDocumentDto) => {
    const r = d.reservationId ? byId.get(d.reservationId) : undefined;
    return {
      plate: r?.vehicle ? formatLicensePlate(r.vehicle.licensePlate) : null,
      car: r?.vehicle ? vehicleName(r.vehicle.brand, r.vehicle.model) : null,
      contractNumber: r?.contractNumber ?? null,
    };
  };
  const kindLabel = (d: PortalDocumentDto) => (d.signing?.status === "signed_copy"
    ? t(d.kind === "damage_check" ? "documents.signedDamageCheck" : "documents.signedContract")
    : t(`documents.${d.kind}`));

  const ack = useMutation({
    mutationFn: (id: number) => portalFetch("POST", `/api/portal/documents/${id}/ack`),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["portal"] }); toast({ title: t("documents.ackDone") }); },
    onError: (e) => toast({ title: e instanceof PortalApiError ? e.message : t("errors.PORTAL_SERVER_ERROR"), variant: "destructive" }),
  });

  const sorted = useMemo(() => [...data].sort((a, b) => b.uploadDate.localeCompare(a.uploadDate)), [data]);
  const toSign = sorted.filter((d) => d.signing?.status === "to_sign");
  const archive = sorted
    .filter((d) => showOld || d.signing?.status !== "superseded")
    .filter((d) => { const v = vehicleOf(d); return hit(kindLabel(d), v.plate, v.car, v.contractNumber, d.reservationId, d.fileName, formatPortalDate(d.uploadDate)); });
  const pages = Math.max(1, Math.ceil(archive.length / DOCUMENTS_PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = archive.slice(current * DOCUMENTS_PAGE_SIZE, (current + 1) * DOCUMENTS_PAGE_SIZE);

  if (isLoading) return <PortalLoading />;
  if (isError) return <PortalLoadError onRetry={() => refetch()} />;

  const status = (d: PortalDocumentDto, tagged = true) => {
    const s = d.signing;
    const pill = (cls: string, text: string, testId: string) => <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`} data-testid={tagged ? testId : undefined}>{text}</span>;
    if (s?.status === "to_sign") return isAdmin
      ? pill("bg-[#faeeda] text-[#854f0b]", t("documents.list.status.toSign"), `doc-status-${d.id}`)
      : pill("bg-[#faeeda] text-[#854f0b]", t("documents.awaitingSignature"), `doc-status-${d.id}`);
    if (s?.status === "signed") return pill("bg-[#e1f5ee] text-[#085041]", t("documents.list.status.signed", { date: s.signedAt ? formatPortalDate(s.signedAt) : "" }), `doc-status-${d.id}`);
    if (s?.status === "signed_copy") return pill("bg-[#e1f5ee] text-[#085041]", t("documents.list.status.signedCopy"), `doc-status-${d.id}`);
    if (s?.status === "superseded") return pill("bg-[#f1f5f9] text-[#64748b]", t("documents.list.status.superseded"), `doc-status-${d.id}`);
    if (d.ack) return pill("bg-[#e1f5ee] text-[#085041]", t("documents.ackedBy", { name: d.ack.by, date: formatPortalDateTime(d.ack.at) }), `doc-status-${d.id}`);
    if (d.kind === "contract") return (
      <button type="button" onClick={() => setAcking(d)} className="inline-flex items-center gap-1 rounded-full border border-[#1d9e75] px-2 py-0.5 text-xs font-medium text-[#085041] hover:bg-[#e1f5ee]" data-testid={tagged ? `button-ack-${d.id}` : undefined}>
        <CheckCircle2 className="h-3.5 w-3.5" />{t("documents.ack")}
      </button>
    );
    return null;
  };
  const icon = (d: PortalDocumentDto) => (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${d.kind === "contract" ? "bg-[#eef0fb] text-[#1a1d62]" : "bg-[#faeeda] text-[#854f0b]"}`}>
      {d.kind === "contract" ? <FileText className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
    </span>
  );
  const openButton = (d: PortalDocumentDto) => (
    <Button size="sm" variant="outline" className={btnSecondary} onClick={() => openDocument(d)} data-testid={`button-open-document-${d.id}`} aria-label={t("documents.open")}>
      <Eye className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">{t("documents.open")}</span>
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("documents.title")} subtitle={t("documents.subtitle")} />

      {isAdmin && toSign.length > 0 && (
        <Section title={t("documents.list.toSignTitle")} count={toSign.length}>
          <div className="divide-y divide-[#f1f5f9] overflow-hidden rounded-xl border border-[#f5a623]/60 bg-white shadow-sm" data-testid="documents-to-sign">
            {(allToSign ? toSign : toSign.slice(0, TO_SIGN_PREVIEW)).map((d) => {
              const v = vehicleOf(d);
              return (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap sm:px-4" data-testid={`to-sign-${d.id}`}>
                  <div className="flex min-w-0 basis-full items-center gap-3 sm:basis-auto sm:flex-1">
                    {icon(d)}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#0f172a]">{kindLabel(d)}{v.plate ? ` · ${v.plate}` : ""}</div>
                      <div className="truncate text-xs text-[#64748b]">{[v.car, v.contractNumber ? t("documents.contractNo", { nr: v.contractNumber }) : null, formatPortalDate(d.uploadDate)].filter(Boolean).join(" · ")}</div>
                    </div>
                  </div>
                  <div className="ml-auto flex shrink-0 gap-1">
                    {openButton(d)}
                    <Button size="sm" className={btnPrimary} onClick={() => setSigning(d)} data-testid={`button-sign-${d.id}`}><PenLine className="mr-1 h-4 w-4" />{t("documents.signAction")}</Button>
                  </div>
                </div>
              );
            })}
          </div>
          {!allToSign && toSign.length > TO_SIGN_PREVIEW && (
            <button type="button" className="text-xs font-medium text-[#2a2f9c] underline" onClick={() => setAllToSign(true)} data-testid="button-show-all-to-sign">{t("documents.list.showAllToSign", { n: toSign.length })}</button>
          )}
        </Section>
      )}

      <Section title={t("documents.list.allTitle")} count={archive.length}>
        {data.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="sm:w-96"><SearchBox value={query} onChange={(v) => { setQuery(v); setPage(0); }} placeholder={t("documents.list.search")} /></div>
            <label className="flex items-center gap-2 text-xs text-[#64748b]">
              <Checkbox checked={showOld} onCheckedChange={(v) => { setShowOld(v === true); setPage(0); }} data-testid="checkbox-show-old" />{t("documents.list.showOld")}
            </label>
          </div>
        )}
        {archive.length === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} text={q ? t("lists.noMatch") : t("documents.empty")} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#e6e8f0] bg-white shadow-sm" data-testid="documents-archive">
            <div className="hidden grid-cols-[6.5rem_minmax(0,1fr)_11rem_15rem] gap-3 border-b border-[#e6e8f0] bg-[#f8f9ff] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#64748b] sm:grid">
              <span>{t("documents.list.col.date")}</span><span>{t("documents.list.col.document")}</span><span>{t("documents.list.col.status")}</span><span />
            </div>
            <div className="divide-y divide-[#f1f5f9]">
              {shown.map((d) => {
                const v = vehicleOf(d);
                return (
                  <div key={d.id} className="px-3 py-2 sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)_11rem_15rem] sm:items-center sm:gap-3 sm:px-4" data-testid={`portal-document-${d.id}`}>
                    <span className="hidden text-sm text-[#0f172a] sm:block">{formatPortalDate(d.uploadDate)}</span>
                    <div className="flex min-w-0 items-center gap-2">
                      {icon(d)}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[#0f172a]" title={d.fileName}>{kindLabel(d)}{v.plate ? ` · ${v.plate}` : ""}</div>
                        {(v.car || v.contractNumber) && <div className="truncate text-xs text-[#64748b]">{[v.car, v.contractNumber ? t("documents.contractNo", { nr: v.contractNumber }) : null].filter(Boolean).join(" · ")}</div>}
                      </div>
                    </div>
                    <div className="hidden sm:block">{status(d)}</div>
                    <div className="mt-1 flex items-center justify-between gap-2 sm:mt-0 sm:justify-end">
                      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-[#64748b] sm:hidden">{formatPortalDate(d.uploadDate)}{status(d, false)}</div>
                      <div className="flex shrink-0 gap-1">
                      {d.signing?.status === "to_sign" && isAdmin && (
                        <Button size="sm" className={btnPrimary} onClick={() => setSigning(d)} aria-label={t("documents.signAction")}><PenLine className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">{t("documents.signAction")}</span></Button>
                      )}
                      {openButton(d)}
                      {/* target=_blank: never navigate the iframe itself away */}
                      <Button asChild size="sm" variant="ghost" aria-label={t("actions.download")}>
                        <a href={`/api/portal/documents/${d.id}/download`} target="_blank" rel="noopener"><Download className="h-4 w-4" /></a>
                      </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between gap-2 border-t border-[#e6e8f0] px-3 py-2 text-xs text-[#64748b] sm:px-4" data-testid="documents-pager">
                <Button size="sm" variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)} data-testid="pager-prev"><ChevronLeft className="mr-1 h-4 w-4" />{t("documents.list.prev")}</Button>
                <span>{t("documents.list.page", { page: current + 1, pages })}</span>
                <Button size="sm" variant="ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} data-testid="pager-next">{t("documents.list.next")}<ChevronRight className="ml-1 h-4 w-4" /></Button>
              </div>
            )}
          </div>
        )}
      </Section>

      <SignContractDialog document={signing} onClose={() => setSigning(null)} />
      <AlertDialog open={acking !== null} onOpenChange={(o) => !o && setAcking(null)}>
        <AlertDialogContent data-testid="ack-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("documents.ackConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("documents.ackConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (acking) ack.mutate(acking.id); setAcking(null); }} data-testid="button-ack-confirm">{t("documents.ackConfirmAction")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
