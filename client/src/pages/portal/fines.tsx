import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import type { PortalFineDto } from "@shared/fines";
import { portalQueryFn } from "@/lib/portal-api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function PortalFinesPage() {
  const { t } = useTranslation("portal");
  const { data = [], isLoading } = useQuery<PortalFineDto[]>({ queryKey: ["portal", "/api/portal/fines"], queryFn: portalQueryFn });
  if (isLoading) return null;
  return (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold">{t("fines.title")}</h1>
      {data.length === 0 && <p className="text-sm text-muted-foreground">{t("fines.empty")}</p>}
      {data.map((f) => (
        <Link key={f.id} href={`/bekeuringen/${f.id}`} className="block">
          <Card className="hover:bg-muted/40 transition-colors">
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{f.description} <span className="ml-2 font-mono text-sm text-muted-foreground">{f.licensePlate}</span></div>
                <div className="text-sm text-muted-foreground">{new Date(f.offenceAt).toLocaleString()}{f.driver ? ` · ${f.driver.displayName}` : ""}</div>
              </div>
              <div className="flex items-center gap-3">
                <span>€ {f.totalAmount}</span>
                <Badge variant="outline">{t(`fines.status.${f.status}`, { defaultValue: f.status })}</Badge>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
