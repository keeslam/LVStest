import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Bell, ArrowRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useCanViewPortal } from "@/hooks/use-portal-accounts";

interface Unread { count: number; newRequests: number }

/**
 * Top-bar chip (desktop only) that appears when customers did something in
 * the portal: new requests and unread portal notifications, with a shortcut to
 * the Klantenportaal page. Hidden there and when there is nothing to show.
 */
export function PortalAlertChip() {
  const { t } = useTranslation("portal");
  const [location] = useLocation();
  const canView = useCanViewPortal();
  const { data } = useQuery<Unread>({
    queryKey: ["/api/portal-admin/unread-count"],
    queryFn: async () => (await apiRequest("GET", "/api/portal-admin/unread-count")).json(),
    enabled: canView,
    refetchInterval: 5 * 60 * 1000,
  });
  if (!canView || !data || data.count === 0 || location.startsWith("/portal-admin")) return null;
  const notifications = Math.max(0, data.count - data.newRequests);
  const parts = [
    data.newRequests > 0 ? t("admin.alert.requests", { count: data.newRequests }) : null,
    notifications > 0 ? t("admin.alert.notifications", { count: notifications }) : null,
  ].filter(Boolean);

  return (
    <Link href="/portal-admin" className="ml-4 hidden items-center gap-2 rounded-full border border-amber-300 bg-amber-50 py-1 pl-3 pr-2 text-sm text-amber-900 hover:bg-amber-100 md:inline-flex" data-testid="portal-alert-chip">
      <Bell className="h-4 w-4" />
      <span>{parts.join(" · ")}</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-900 px-2 py-0.5 text-xs font-medium text-white">
        {t("admin.alert.open")}<ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}
