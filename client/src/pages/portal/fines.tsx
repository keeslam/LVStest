import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Receipt } from "lucide-react";
import type { PortalFineDto } from "@shared/fines";
import { portalQueryFn } from "@/lib/portal-api";
import { FineRow } from "@/components/portal/rows";
import { EmptyState, PageHeader } from "@/components/portal/ui";

export default function PortalFinesPage() {
  const { t } = useTranslation("portal");
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
            {data.map((f) => <FineRow key={f.id} fine={f} />)}
          </div>
        )}
    </div>
  );
}
