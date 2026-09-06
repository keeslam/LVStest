import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Inbox, Plus } from "lucide-react";
import type { PortalRequestDto } from "@shared/portal-requests";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Button } from "@/components/ui/button";
import { RequestRow } from "@/components/portal/rows";
import { EmptyState, PageHeader, btnPrimary } from "@/components/portal/ui";

export default function PortalRequestsPage() {
  const { t } = useTranslation("portal");
  const { openNewRequest } = usePortalDialogs();
  const { data = [], isLoading } = useQuery<PortalRequestDto[]>({ queryKey: ["portal", "/api/portal/requests"], queryFn: portalQueryFn });
  if (isLoading) return null;
  const newButton = <Button className={btnPrimary} onClick={() => openNewRequest()} data-testid="button-new-request"><Plus className="mr-1.5 h-4 w-4" />{t("requests.new")}</Button>;

  return (
    <div className="space-y-4">
      <PageHeader title={t("requests.title")} subtitle={t("requests.subtitle")} action={newButton} />
      {data.length === 0
        ? <EmptyState icon={<Inbox className="h-6 w-6" />} text={t("requests.empty")} action={newButton} />
        : (
          <div className="space-y-2">
            {data.map((r) => <RequestRow key={r.id} request={r} />)}
          </div>
        )}
    </div>
  );
}
