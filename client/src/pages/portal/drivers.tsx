import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Users, UserPlus, Mail, Phone, IdCard, FileText } from "lucide-react";
import type { PortalDriverDto } from "@shared/portal-types";
import { portalFetch, portalQueryFn } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { DriverFormDialog } from "@/components/portal/driver-form-dialog";
import { Avatar, EmptyState, PageHeader, btnPrimary, btnSecondary } from "@/components/portal/ui";

export default function PortalDriversPage() {
  const { t } = useTranslation("portal");
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery<PortalDriverDto[]>({ queryKey: ["portal", "/api/portal/drivers"], queryFn: portalQueryFn });
  const toggle = useMutation({
    mutationFn: (d: PortalDriverDto) => portalFetch("PATCH", `/api/portal/drivers/${d.id}`, { status: d.status === "active" ? "inactive" : "active" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal", "/api/portal/drivers"] }),
  });
  if (isLoading) return null;
  const addButton = <DriverFormDialog><Button className={btnPrimary} data-testid="button-add-driver"><UserPlus className="mr-1.5 h-4 w-4" />{t("actions.addDriver")}</Button></DriverFormDialog>;
  const active = data.filter((d) => d.status === "active").length;

  return (
    <div className="space-y-4">
      <PageHeader title={t("drivers.title")} subtitle={t("drivers.count", { active, total: data.length })} action={addButton} />
      {data.length === 0
        ? <EmptyState icon={<Users className="h-6 w-6" />} text={t("drivers.empty")} action={addButton} />
        : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.map((d) => (
              <div key={d.id} className={`rounded-xl border border-[#e6e8f0] bg-white p-4 shadow-sm ${d.status !== "active" ? "opacity-70" : ""}`} data-testid={`portal-driver-${d.id}`}>
                <div className="flex items-start gap-3">
                  <Avatar name={d.displayName} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-[#0f172a]">{d.displayName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.status === "active" ? "bg-[#e1f5ee] text-[#085041]" : "bg-[#f1efe8] text-[#444441]"}`}>{t(`drivers.${d.status === "active" ? "active" : "inactive"}`)}</span>
                    </div>
                    <dl className="mt-1.5 space-y-0.5 text-xs text-[#64748b] sm:text-sm">
                      {d.email && <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{d.email}</span></div>}
                      {d.phone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" />{d.phone}</div>}
                      {d.driverLicenseNumber && <div className="flex items-center gap-1.5"><IdCard className="h-3.5 w-3.5 shrink-0" />{d.driverLicenseNumber}{d.licenseExpiry ? ` · ${t("fields.licenseExpiry")} ${d.licenseExpiry}` : ""}</div>}
                    </dl>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {d.hasLicenseFile && <Button asChild size="sm" variant="ghost"><a href={`/api/portal/drivers/${d.id}/license`} target="_blank" rel="noopener"><FileText className="mr-1 h-4 w-4" />{t("actions.viewLicense")}</a></Button>}
                  <DriverFormDialog driver={d}><Button size="sm" variant="outline" className={btnSecondary}>{t("actions.edit")}</Button></DriverFormDialog>
                  <Button size="sm" variant="outline" className={btnSecondary} onClick={() => toggle.mutate(d)}>{d.status === "active" ? t("actions.deactivate") : t("actions.activate")}</Button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
