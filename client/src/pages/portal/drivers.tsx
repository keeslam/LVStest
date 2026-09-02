import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalDriverDto } from "@shared/portal-types";
import { portalFetch, portalQueryFn } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DriverFormDialog } from "@/components/portal/driver-form-dialog";

export default function PortalDriversPage() {
  const { t } = useTranslation("portal");
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery<PortalDriverDto[]>({ queryKey: ["portal", "/api/portal/drivers"], queryFn: portalQueryFn });
  const toggle = useMutation({
    mutationFn: (d: PortalDriverDto) => portalFetch("PATCH", `/api/portal/drivers/${d.id}`, { status: d.status === "active" ? "inactive" : "active" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal", "/api/portal/drivers"] }),
  });
  if (isLoading) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("drivers.title")}</h1>
        <DriverFormDialog><Button size="sm">{t("actions.addDriver")}</Button></DriverFormDialog>
      </div>
      {data.length === 0 && <p className="text-sm text-muted-foreground">{t("drivers.empty")}</p>}
      {data.map((d) => (
        <Card key={d.id}>
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">
                {d.displayName}
                <Badge variant={d.status === "active" ? "default" : "secondary"} className="ml-2">{t(`drivers.${d.status === "active" ? "active" : "inactive"}`)}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">{[d.email, d.phone, d.driverLicenseNumber].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="flex gap-2">
              {d.hasLicenseFile && <Button asChild size="sm" variant="ghost"><a href={`/api/portal/drivers/${d.id}/license`} target="_blank" rel="noopener">{t("actions.viewLicense")}</a></Button>}
              <DriverFormDialog driver={d}><Button size="sm" variant="outline">{t("actions.edit")}</Button></DriverFormDialog>
              <Button size="sm" variant="outline" onClick={() => toggle.mutate(d)}>{d.status === "active" ? t("actions.deactivate") : t("actions.activate")}</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
