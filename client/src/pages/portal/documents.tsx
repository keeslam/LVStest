import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import type { PortalDocumentDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { DocumentRow } from "@/components/portal/rows";
import { EmptyState, PageHeader, Section } from "@/components/portal/ui";

export default function PortalDocumentsPage() {
  const { t } = useTranslation("portal");
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
            {docs.map((d) => <DocumentRow key={d.id} document={d} />)}
          </div>
        </Section>
      ))}
    </div>
  );
}
