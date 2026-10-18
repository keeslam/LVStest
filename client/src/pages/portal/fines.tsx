import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Receipt } from "lucide-react";
import type { PortalFineDto } from "@shared/fines";
import { portalQueryFn } from "@/lib/portal-api";
import { FineRow } from "@/components/portal/rows";
import { EmptyState, FilterChips, PageHeader, SearchBox, usePortalPages, usePortalSearch, PortalLoading, PortalLoadError } from "@/components/portal/ui";
import { formatPortalCurrency } from "@/lib/portal-format";

type FineFilter = "open" | "closed" | "all";
const isOpen = (f: PortalFineDto) => f.status !== "paid" && f.status !== "cancelled";

export default function PortalFinesPage() {
  const { t } = useTranslation("portal");
  const { data = [], isLoading, isError, refetch } = useQuery<PortalFineDto[]>({ queryKey: ["portal", "/api/portal/fines"], queryFn: portalQueryFn });
  const { query, setQuery, q, hit } = usePortalSearch();
  const [filter, setFilter] = useState<FineFilter>("open");
  const open = data.filter(isOpen);
  const inFilter = (f: PortalFineDto) => filter === "all" || (filter === "open" ? isOpen(f) : !isOpen(f));
  // A search looks through every fine, whatever the filter.
  const listed = data.filter((f) => (q ? true : inFilter(f))).filter((f) => hit(f.description, f.licensePlate, f.driver?.displayName, f.reference, f.totalAmount, t(`fines.status.${f.status}`)));
  // Kees, 2026-10-18: customers with 80-100 cars get the list a page at a time.
  const { shown, pager } = usePortalPages(listed, `${filter}|${q}`, "fines-pager");
  if (isLoading) return <PortalLoading />;
  if (isError) return <PortalLoadError onRetry={() => refetch()} />;
  const total = open.reduce((sum, f) => sum + Number(f.totalAmount), 0);

  return (
    <div className="space-y-4">
      <PageHeader title={t("fines.title")} subtitle={open.length > 0 ? t("fines.openSummary", { count: open.length, amount: formatPortalCurrency(total) }) : undefined} />
      {data.length > 0 && (
        <div className="space-y-2">
          <SearchBox value={query} onChange={setQuery} placeholder={t("lists.searchFines")} />
          <FilterChips testIdPrefix="fines" value={filter} onChange={setFilter} options={[
            { key: "open", label: t("lists.filter.open"), count: open.length },
            { key: "closed", label: t("lists.filter.closed"), count: data.length - open.length },
            { key: "all", label: t("lists.filter.all"), count: data.length },
          ]} />
        </div>
      )}
      {listed.length === 0
        ? <EmptyState icon={<Receipt className="h-6 w-6" />} text={q || data.length > 0 ? t("lists.noMatch") : t("fines.empty")} />
        : (
          <div className="space-y-2">
            {shown.map((f) => <FineRow key={f.id} fine={f} />)}
            {pager}
          </div>
        )}
    </div>
  );
}
