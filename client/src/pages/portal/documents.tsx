import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalDocumentDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Eye } from "lucide-react";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";

export default function PortalDocumentsPage() {
  const { t } = useTranslation("portal");
  const { openDocument } = usePortalDialogs();
  const { data = [], isLoading } = useQuery<PortalDocumentDto[]>({ queryKey: ["portal", "/api/portal/documents"], queryFn: portalQueryFn });
  if (isLoading) return null;
  const groups = new Map<number | null, PortalDocumentDto[]>();
  for (const d of data) groups.set(d.reservationId, [...(groups.get(d.reservationId) ?? []), d]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t("documents.title")}</h1>
      {data.length === 0 && <p className="text-sm text-muted-foreground">{t("documents.empty")}</p>}
      {[...groups.entries()].map(([reservationId, docs]) => (
        <Card key={reservationId ?? "none"}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("documents.reservation", { id: reservationId })}</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
            <ul className="divide-y">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs">{t(`documents.${d.kind}`)}</span>
                    {d.fileName}
                    <span className="ml-2 text-muted-foreground">{new Date(d.uploadDate).toLocaleDateString()}</span>
                  </span>
                  <span className="flex gap-1">
                    <Button size="sm" onClick={() => openDocument(d)} data-testid={`button-open-document-${d.id}`}><Eye className="mr-1 h-4 w-4" />{t("documents.open")}</Button>
                    {/* target=_blank: never navigate the iframe itself away */}
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/portal/documents/${d.id}/download`} target="_blank" rel="noopener"><Download className="mr-1 h-4 w-4" />{t("actions.download")}</a>
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
