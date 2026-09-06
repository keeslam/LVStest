import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Download, Eye, FileText, ShieldCheck } from "lucide-react";
import type { PortalDocumentDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Section, btnSecondary } from "@/components/portal/ui";

export default function PortalDocumentsPage() {
  const { t } = useTranslation("portal");
  const { openDocument, openReservation } = usePortalDialogs();
  const { data = [], isLoading } = useQuery<PortalDocumentDto[]>({ queryKey: ["portal", "/api/portal/documents"], queryFn: portalQueryFn });
  if (isLoading) return null;
  const groups = new Map<number | null, PortalDocumentDto[]>();
  for (const d of data) groups.set(d.reservationId, [...(groups.get(d.reservationId) ?? []), d]);

  return (
    <div className="space-y-5">
      <PageHeader title={t("documents.title")} subtitle={t("documents.subtitle")} />
      {data.length === 0 && <EmptyState icon={<FileText className="h-6 w-6" />} text={t("documents.empty")} />}
      {[...groups.entries()].map(([reservationId, docs]) => (
        <Section key={reservationId ?? "none"} title={reservationId ? t("documents.reservation", { id: reservationId }) : t("documents.other")} count={docs.length}>
          <div className="grid gap-2 sm:grid-cols-2">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#e6e8f0] bg-white px-4 py-3 shadow-sm" data-testid={`portal-document-${d.id}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${d.kind === "contract" ? "bg-[#eef0fb] text-[#1a1d62]" : "bg-[#faeeda] text-[#854f0b]"}`}>
                    {d.kind === "contract" ? <FileText className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[#0f172a]">{t(`documents.${d.kind}`)}</div>
                    <div className="truncate text-xs text-[#64748b]">{d.fileName} · {new Date(d.uploadDate).toLocaleDateString()}</div>
                    {reservationId && <button type="button" className="text-xs text-[#2a2f9c] underline" onClick={() => openReservation(reservationId)}>{t("documents.openReservation")}</button>}
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
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}
