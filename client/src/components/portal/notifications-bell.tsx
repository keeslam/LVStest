import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Bell, CheckCheck, Receipt, Wrench, ShieldAlert, Inbox, MessageSquare, Car } from "lucide-react";
import type { PortalNotificationDto } from "@shared/portal-types";
import { portalFetch, portalQueryFn } from "@/lib/portal-api";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchBox, usePortalSearch } from "./ui";

const UNREAD_KEY = ["portal", "/api/portal/notifications/unread-count"];
const LIST_KEY = ["portal", "/api/portal/notifications"];

function iconFor(type: string) {
  if (type.startsWith("apk")) return <ShieldAlert className="h-4 w-4" />;
  if (type.startsWith("maintenance")) return <Wrench className="h-4 w-4" />;
  if (type === "replacement_ready") return <Car className="h-4 w-4" />;
  if (type.startsWith("service")) return <Wrench className="h-4 w-4" />;
  if (type.startsWith("fine")) return <Receipt className="h-4 w-4" />;
  if (type === "request_message") return <MessageSquare className="h-4 w-4" />;
  return <Inbox className="h-4 w-4" />;
}
const toneFor = (type: string) => type === "maintenance_cancelled" || type.startsWith("apk_expired") || type === "service_due" || type === "request_rejected" ? "bg-[#fcebeb] text-[#791f1f]"
  : type === "maintenance_out" || type === "replacement_ready" ? "bg-[#e1f5ee] text-[#085041]"
  : type.startsWith("maintenance") ? "bg-[#faeeda] text-[#633806]"
  : type.startsWith("apk") || type.startsWith("service") ? "bg-[#faeeda] text-[#633806]"
  : type.startsWith("fine") ? "bg-[#fcebeb] text-[#791f1f]" : "bg-[#e6f1fb] text-[#0c447c]";

/**
 * Bell in the portal header: unread count, and a dialog with everything Lam
 * Groep wants the customer to know (replies, approvals, fines, APK, service).
 * Clicking a notification marks it read and opens the thing it is about.
 */
export function NotificationsBell({ dark = false }: { dark?: boolean }) {
  const { t } = useTranslation("portal");
  const queryClient = useQueryClient();
  const { openRequest, openReservation, openFine } = usePortalDialogs();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const { query, setQuery, q, hit } = usePortalSearch();
  const { data: unread } = useQuery<{ count: number }>({ queryKey: UNREAD_KEY, queryFn: portalQueryFn, refetchInterval: 60_000 });
  const { data: items = [] } = useQuery<PortalNotificationDto[]>({ queryKey: LIST_KEY, queryFn: portalQueryFn, enabled: open });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: UNREAD_KEY }); queryClient.invalidateQueries({ queryKey: LIST_KEY }); };
  const markRead = useMutation({ mutationFn: (ids?: number[]) => portalFetch("POST", "/api/portal/notifications/read", ids ? { ids } : {}), onSuccess: refresh });

  const follow = (n: PortalNotificationDto) => {
    if (!n.isRead) markRead.mutate([n.id]);
    setOpen(false);
    const link = n.link ?? "";
    if (link.startsWith("/voertuigen")) { navigate(link); return; }
    const m = link.match(/^\/(aanvragen|reserveringen|bekeuringen)\/(\d+)/);
    if (!m) return;
    const id = Number(m[2]);
    if (m[1] === "aanvragen") openRequest(id); else if (m[1] === "reserveringen") openReservation(id); else openFine(id);
  };
  const count = unread?.count ?? 0;
  const shown = items.filter((n) => hit(n.title, n.description));

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("notifications.title")} data-testid="portal-bell"
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full ${dark ? "text-[#dfe2ff] hover:bg-white/10 hover:text-white" : "text-[#334155] hover:bg-[#eef0fb]"}`}>
        <Bell className="h-5 w-5" />
        {count > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#f5a623] px-1 text-[11px] font-bold text-[#1a1d62]" data-testid="portal-bell-count">{count > 99 ? "99+" : count}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col" data-testid="portal-notifications-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-6">
              <span>{t("notifications.title")}{count > 0 && <span className="ml-2 rounded-full bg-[#f5a623] px-2 py-0.5 text-xs font-semibold text-[#1a1d62]">{count}</span>}</span>
              {count > 0 && <Button size="sm" variant="ghost" onClick={() => markRead.mutate(undefined)} data-testid="portal-bell-read-all"><CheckCheck className="mr-1 h-4 w-4" />{t("notifications.markAll")}</Button>}
            </DialogTitle>
          </DialogHeader>
          {items.length > 5 && <SearchBox value={query} onChange={setQuery} placeholder={t("notifications.search")} testId="portal-bell-search" />}
          <div className="min-h-0 flex-1 space-y-2 overflow-auto">
            {shown.length === 0 && <p className="py-8 text-center text-sm text-[#64748b]">{q ? t("lists.noMatch") : t("notifications.empty")}</p>}
            {shown.map((n) => (
              <button key={n.id} type="button" onClick={() => follow(n)} data-testid={`portal-notification-${n.id}`}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-[#f8f9ff] ${n.isRead ? "border-[#e6e8f0] bg-white" : "border-[#c7cbf5] bg-[#eef0fb]"}`}>
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${toneFor(n.type)}`}>{iconFor(n.type)}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${n.isRead ? "" : "font-semibold"} text-[#0f172a]`}>{n.title}</span>
                  <span className="block text-xs text-[#64748b]">{n.description}</span>
                  <span className="mt-0.5 block text-[11px] text-[#94a3b8]">{new Date(n.createdAt).toLocaleString()}</span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
