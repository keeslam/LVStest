import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import type { PortalRequestDto } from "@shared/portal-requests";
import { portalQueryFn } from "@/lib/portal-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function PortalRequestDetailPage() {
  const { t } = useTranslation("portal");
  const { id } = useParams<{ id: string }>();
  const { data: r } = useQuery<PortalRequestDto>({ queryKey: ["portal", `/api/portal/requests/${id}`], queryFn: portalQueryFn });
  if (!r) return null;
  const p = r.payload as Record<string, string>;
  const row = (label: string, value: string | null | undefined) => value ? (
    <div className="grid grid-cols-3 gap-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="col-span-2">{value}</dd></div>
  ) : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          {t("requests.detailTitle")} #{r.id}
          <Badge variant={r.status === "done" ? "default" : r.status === "rejected" ? "destructive" : "outline"}>{t(`requests.status.${r.status}`)}</Badge>
        </h1>
        <Link href="/aanvragen"><Button variant="ghost" size="sm">←</Button></Link>
      </div>
      <Card>
        <CardContent className="p-4 space-y-3">
          <dl className="space-y-1">
            {row(t("requests.chooseType"), t(`requests.type.${r.type}`))}
            {row(t("fields.period"), new Date(r.createdAt).toLocaleString())}
            {r.reservationId ? row(t("requests.form.reservation"), `#${r.reservationId}`) : null}
            {r.fineId ? row(t("requests.form.fine"), `#${r.fineId}`) : null}
            {r.type === "extension" ? row(t("requests.form.newEndDate"), p.newEndDate) : null}
            {r.type === "early_return" ? row(t("requests.form.returnDate"), p.returnDate) : null}
            {r.type === "damage" ? <>{row(t("requests.form.location"), p.location)}{row(t("requests.form.occurredAt"), p.occurredAt)}</> : null}
            {r.type === "other" ? row(t("requests.form.subject"), p.subject) : null}
          </dl>
          <p className="whitespace-pre-wrap rounded-md bg-muted p-2 text-sm">{r.message}</p>
          {r.attachments.length > 0 && (
            <div className="text-sm">
              <div className="font-medium">{t("requests.attachments")}</div>
              <ul className="list-disc pl-5">
                {r.attachments.map((a) => <li key={a.id}><a className="underline" href={`/api/portal/requests/${r.id}/attachments/${a.id}`} target="_blank" rel="noopener">{a.fileName}</a></li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("requests.reply")}</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0 text-sm">
          {r.staffReply
            ? <><p className="whitespace-pre-wrap rounded-md border p-2" data-testid="portal-request-reply">{r.staffReply}</p>{r.repliedAt && <p className="mt-1 text-muted-foreground">{new Date(r.repliedAt).toLocaleString()}</p>}</>
            : <p className="text-muted-foreground">{t("requests.noReply")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
