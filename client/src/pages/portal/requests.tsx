import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Inbox, Plus } from "lucide-react";
import type { PortalRequestDto } from "@shared/portal-requests";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Button } from "@/components/ui/button";
import { RequestRow } from "@/components/portal/rows";
import { AvailableVehicles } from "@/components/portal/vehicle-cards";
import { EmptyState, FilterChips, PageHeader, SearchBox, btnPrimary, usePortalPages, usePortalSearch, PortalLoading, PortalLoadError } from "@/components/portal/ui";

type RequestFilter = "open" | "closed" | "all";
const isOpen = (r: PortalRequestDto) => r.status === "new" || r.status === "in_progress";

export default function PortalRequestsPage() {
  const { t } = useTranslation("portal");
  const { openNewRequest } = usePortalDialogs();
  const { data = [], isLoading, isError, refetch } = useQuery<PortalRequestDto[]>({ queryKey: ["portal", "/api/portal/requests"], queryFn: portalQueryFn });
  const { query, setQuery, q, hit } = usePortalSearch();
  const [filter, setFilter] = useState<RequestFilter>("open");
  const open = data.filter(isOpen);
  const inFilter = (r: PortalRequestDto) => filter === "all" || (filter === "open" ? isOpen(r) : !isOpen(r));
  // A search looks through every request, whatever the filter.
  const listed = data.filter((r) => (q ? true : inFilter(r))).filter((r) => hit(t(`requests.type.${r.type}`), r.message, r.id, t(`requests.status.${r.status}`), r.staffReply));
  // Kees, 2026-10-18: customers with 80-100 cars get the list a page at a time.
  const { shown, pager } = usePortalPages(listed, `${filter}|${q}`, "requests-pager");
  if (isLoading) return <PortalLoading />;
  if (isError) return <PortalLoadError onRetry={() => refetch()} />;
  const newButton = <Button className={btnPrimary} onClick={() => openNewRequest()} data-testid="button-new-request"><Plus className="mr-1.5 h-4 w-4" />{t("requests.new")}</Button>;

  return (
    <div className="space-y-4">
      <PageHeader title={t("requests.title")} subtitle={t("requests.subtitle")} action={newButton} />
      <AvailableVehicles />
      {data.length > 0 && (
        <div className="space-y-2">
          <SearchBox value={query} onChange={setQuery} placeholder={t("lists.searchRequests")} />
          <FilterChips testIdPrefix="requests" value={filter} onChange={setFilter} options={[
            { key: "open", label: t("lists.filter.open"), count: open.length },
            { key: "closed", label: t("lists.filter.closed"), count: data.length - open.length },
            { key: "all", label: t("lists.filter.all"), count: data.length },
          ]} />
        </div>
      )}
      {listed.length === 0
        ? <EmptyState icon={<Inbox className="h-6 w-6" />} text={q || data.length > 0 ? t("lists.noMatch") : t("requests.empty")} action={q || data.length > 0 ? undefined : newButton} />
        : (
          <div className="space-y-2">
            {shown.map((r) => <RequestRow key={r.id} request={r} />)}
            {pager}
          </div>
        )}
    </div>
  );
}
