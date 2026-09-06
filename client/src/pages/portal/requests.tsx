import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Inbox, Plus } from "lucide-react";
import type { PortalRequestDto } from "@shared/portal-requests";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Button } from "@/components/ui/button";
import { RequestRow } from "@/components/portal/rows";
import { EmptyState, PageHeader, SearchBox, btnPrimary, usePortalSearch } from "@/components/portal/ui";

export default function PortalRequestsPage() {
  const { t } = useTranslation("portal");
  const { openNewRequest } = usePortalDialogs();
  const { data = [], isLoading } = useQuery<PortalRequestDto[]>({ queryKey: ["portal", "/api/portal/requests"], queryFn: portalQueryFn });
  const { query, setQuery, q, hit } = usePortalSearch();
  if (isLoading) return null;
  const shown = data.filter((r) => hit(t(`requests.type.${r.type}`), r.message, r.id, t(`requests.status.${r.status}`), r.staffReply));
  const newButton = <Button className={btnPrimary} onClick={() => openNewRequest()} data-testid="button-new-request"><Plus className="mr-1.5 h-4 w-4" />{t("requests.new")}</Button>;

  return (
    <div className="space-y-4">
      <PageHeader title={t("requests.title")} subtitle={t("requests.subtitle")} action={newButton} />
      {data.length > 0 && <SearchBox value={query} onChange={setQuery} placeholder={t("lists.searchRequests")} />}
      {shown.length === 0
        ? <EmptyState icon={<Inbox className="h-6 w-6" />} text={q ? t("lists.noMatch") : t("requests.empty")} action={q ? undefined : newButton} />
        : (
          <div className="space-y-2">
            {shown.map((r) => <RequestRow key={r.id} request={r} />)}
          </div>
        )}
    </div>
  );
}
