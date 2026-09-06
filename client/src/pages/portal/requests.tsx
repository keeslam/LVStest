import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Inbox, Plus, ChevronRight, MessageSquare } from "lucide-react";
import type { PortalRequestDto } from "@shared/portal-requests";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Button } from "@/components/ui/button";
import { EmptyState, ListCard, PageHeader, StatusBadge, btnPrimary, toneFor } from "@/components/portal/ui";

export default function PortalRequestsPage() {
  const { t } = useTranslation("portal");
  const { openRequest, openNewRequest } = usePortalDialogs();
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
            {data.map((r) => (
              <ListCard key={r.id} tone={toneFor("request", r.status)} onClick={() => openRequest(r.id)} testId={`portal-request-${r.id}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-[#0f172a]">{t(`requests.type.${r.type}`)}</span>
                    <span className="text-xs text-[#64748b]">#{r.id} · {new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-1 truncate text-xs text-[#64748b] sm:text-sm">{r.message.split("\n")[0].slice(0, 100)}</div>
                  {r.staffReply && <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#0f6e56]"><MessageSquare className="h-3.5 w-3.5" />{t("requests.replied")}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge kind="request" status={r.status} label={t(`requests.status.${r.status}`)} />
                  <ChevronRight className="hidden h-4 w-4 text-[#94a3b8] sm:block" />
                </div>
              </ListCard>
            ))}
          </div>
        )}
    </div>
  );
}
