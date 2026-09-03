import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import type { PortalRequestDto } from "@shared/portal-requests";
import { portalQueryFn } from "@/lib/portal-api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function PortalRequestsPage() {
  const { t } = useTranslation("portal");
  const { data = [], isLoading } = useQuery<PortalRequestDto[]>({ queryKey: ["portal", "/api/portal/requests"], queryFn: portalQueryFn });
  if (isLoading) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("requests.title")}</h1>
        <Link href="/aanvragen/nieuw"><Button size="sm" data-testid="button-new-request">{t("requests.new")}</Button></Link>
      </div>
      {data.length === 0 && <p className="text-sm text-muted-foreground">{t("requests.empty")}</p>}
      {data.map((r) => (
        <Link key={r.id} href={`/aanvragen/${r.id}`} className="block">
          <Card className="hover:bg-muted/40 transition-colors">
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{t(`requests.type.${r.type}`)}</div>
                <div className="text-sm text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()} · {r.message.split("\n")[0].slice(0, 80)}</div>
              </div>
              <Badge variant={r.status === "done" ? "default" : r.status === "rejected" ? "destructive" : "outline"}>{t(`requests.status.${r.status}`)}</Badge>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
