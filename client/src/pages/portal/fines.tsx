import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Receipt, ChevronRight, CalendarDays } from "lucide-react";
import type { PortalFineDto } from "@shared/fines";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Avatar, EmptyState, ListCard, PageHeader, Plate, StatusBadge, toneFor } from "@/components/portal/ui";

export default function PortalFinesPage() {
  const { t } = useTranslation("portal");
  const { openFine } = usePortalDialogs();
  const { data = [], isLoading } = useQuery<PortalFineDto[]>({ queryKey: ["portal", "/api/portal/fines"], queryFn: portalQueryFn });
  if (isLoading) return null;
  const open = data.filter((f) => f.status !== "paid" && f.status !== "cancelled");
  const total = open.reduce((sum, f) => sum + Number(f.totalAmount), 0);

  return (
    <div className="space-y-4">
      <PageHeader title={t("fines.title")} subtitle={open.length > 0 ? t("fines.openSummary", { count: open.length, amount: total.toFixed(2) }) : undefined} />
      {data.length === 0
        ? <EmptyState icon={<Receipt className="h-6 w-6" />} text={t("fines.empty")} />
        : (
          <div className="space-y-2">
            {data.map((f) => (
              <ListCard key={f.id} tone={toneFor("fine", f.status)} onClick={() => openFine(f.id)} testId={`portal-fine-${f.id}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-semibold text-[#0f172a]">{f.description}</span>
                    <Plate value={f.licensePlate} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748b] sm:text-sm">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{new Date(f.offenceAt).toLocaleString()}</span>
                    {f.driver && <span className="inline-flex items-center gap-1.5"><Avatar name={f.driver.displayName} />{f.driver.displayName}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-base font-bold text-[#0f172a]">€ {f.totalAmount}</span>
                  <StatusBadge kind="fine" status={f.status} label={t(`fines.status.${f.status}`, { defaultValue: f.status })} />
                  <ChevronRight className="hidden h-4 w-4 text-[#94a3b8] sm:block" />
                </div>
              </ListCard>
            ))}
          </div>
        )}
    </div>
  );
}
