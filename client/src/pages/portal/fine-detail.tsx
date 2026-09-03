import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import type { PortalFineDto } from "@shared/fines";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PortalFineDetailPage() {
  const { t } = useTranslation("portal");
  const { id } = useParams<{ id: string }>();
  const { me } = usePortalAuth();
  const { data: f } = useQuery<PortalFineDto>({ queryKey: ["portal", `/api/portal/fines/${id}`], queryFn: portalQueryFn });
  if (!f) return null;
  const row = (label: string, value: string | null | undefined) => value ? (
    <div className="grid grid-cols-3 gap-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="col-span-2">{value}</dd></div>
  ) : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("fines.detailTitle")} #{f.id}</h1>
        <Link href="/bekeuringen"><Button variant="ghost" size="sm">←</Button></Link>
      </div>
      <Card>
        <CardContent className="p-4 space-y-3">
          <dl className="space-y-1">
            {row(t("fines.fields.plate"), f.licensePlate)}
            {row(t("fines.fields.offenceAt"), new Date(f.offenceAt).toLocaleString())}
            {row(t("fines.fields.description"), f.description)}
            {row(t("fines.fields.reference"), f.reference)}
            {row(t("fines.fields.driver"), f.driver?.displayName)}
            {row(t("fines.fields.amount"), `€ ${f.amount}`)}
            {row(t("fines.fields.adminFee"), `€ ${f.adminFee}`)}
            {row(t("fines.fields.total"), `€ ${f.totalAmount}`)}
            {row(t("fines.fields.status"), t(`fines.status.${f.status}`, { defaultValue: f.status }))}
            {row(t("fines.fields.note"), f.customerNote)}
          </dl>
          <div className="flex flex-wrap gap-2">
            {f.hasLetter && <Button asChild size="sm" variant="outline"><a href={`/api/portal/fines/${f.id}/letter`} target="_blank" rel="noopener">{t("fines.letter")}</a></Button>}
            {me?.settings.canSubmitRequests && <Link href={`/aanvragen/nieuw?type=fine_question&fineId=${f.id}`}><Button size="sm">{t("fines.ask")}</Button></Link>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
