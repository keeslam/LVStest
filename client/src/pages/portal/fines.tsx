import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Receipt } from "lucide-react";
import type { PortalFineDto } from "@shared/fines";
import { portalQueryFn } from "@/lib/portal-api";
import { FineRow } from "@/components/portal/rows";
import { EmptyState, PageHeader, SearchBox, usePortalSearch } from "@/components/portal/ui";

export default function PortalFinesPage() {
  const { t } = useTranslation("portal");
  const { data = [], isLoading } = useQuery<PortalFineDto[]>({ queryKey: ["portal", "/api/portal/fines"], queryFn: portalQueryFn });
  const { query, setQuery, q, hit } = usePortalSearch();
  if (isLoading) return null;
  const open = data.filter((f) => f.status !== "paid" && f.status !== "cancelled");
  const shown = data.filter((f) => hit(f.description, f.licensePlate, f.driver?.displayName, f.reference, f.totalAmount, t(`fines.status.${f.status}`)));
  const total = open.reduce((sum, f) => sum + Number(f.totalAmount), 0);

  return (
    <div className="space-y-4">
      <PageHeader title={t("fines.title")} subtitle={open.length > 0 ? t("fines.openSummary", { count: open.length, amount: total.toFixed(2) }) : undefined} />
      {data.length > 0 && <SearchBox value={query} onChange={setQuery} placeholder={t("lists.searchFines")} />}
      {shown.length === 0
        ? <EmptyState icon={<Receipt className="h-6 w-6" />} text={q ? t("lists.noMatch") : t("fines.empty")} />
        : (
          <div className="space-y-2">
            {shown.map((f) => <FineRow key={f.id} fine={f} />)}
          </div>
        )}
    </div>
  );
}
