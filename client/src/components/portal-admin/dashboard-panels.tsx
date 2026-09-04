import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { AlertCircle, Bell, CalendarClock, Users, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import type { PortalDashboard } from "@shared/portal-types";
import { apiRequest } from "@/lib/queryClient";
import { formatLicensePlate } from "@/lib/format-utils";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RequestStatusBadge } from "./requests-table";
import { ago } from "./customers-overview-table";

export const DASHBOARD_KEY = ["/api/portal-admin/dashboard"];
export const DASHBOARD_WINDOW_DAYS = 14;

// ---- shared bits ---------------------------------------------------------------

function Panel({ title, icon, action, children, testId }: { title: ReactNode; icon: ReactNode; action?: ReactNode; children: ReactNode; testId: string }) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 py-3 border-b">
        <CardTitle className="flex items-center gap-2 text-base font-medium">{icon}{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

function Row({ onClick, children, testId, unread }: { onClick: () => void; children: ReactNode; testId?: string; unread?: boolean }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId}
      className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm border-b last:border-b-0 hover:bg-muted/50 ${unread ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}>
      {children}
    </button>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-sm text-muted-foreground text-center">{children}</p>;
}

function dayLabel(iso: string, t: (k: string) => string): string {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return t("admin.dashboard.upcoming.today");
  if (diff === 1) return t("admin.dashboard.upcoming.tomorrow");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "2-digit" });
}

// ---- tiles ----------------------------------------------------------------------

function Tile({ label, value, sub, accent, onClick, testId }: { label: string; value: number; sub?: string; accent: string; onClick: () => void; testId: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId}
      className={`rounded-lg border bg-card p-4 text-left hover:bg-muted/40 border-l-4 ${accent}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold">{value}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </button>
  );
}

export function DashboardTiles({ counts, canViewFines }: { counts: PortalDashboard["counts"]; canViewFines: boolean }) {
  const { t } = useTranslation("portal");
  const { openPortalListDialog } = useGlobalDialog();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label={t("admin.dashboard.tiles.newRequests")} value={counts.newRequests} accent={counts.newRequests > 0 ? "border-l-amber-500" : "border-l-transparent"}
        sub={counts.inProgressRequests > 0 ? t("admin.dashboard.tiles.inProgress", { n: counts.inProgressRequests }) : undefined}
        onClick={() => openPortalListDialog("requests")} testId="tile-new-requests" />
      {canViewFines && (
        <Tile label={t("admin.dashboard.tiles.unlinkedFines")} value={counts.unlinkedFines} accent={counts.unlinkedFines > 0 ? "border-l-red-500" : "border-l-transparent"}
          onClick={() => openPortalListDialog("fines")} testId="tile-unlinked-fines" />
      )}
      <Tile label={t("admin.dashboard.tiles.onlineNow")} value={counts.onlineNow} accent={counts.onlineNow > 0 ? "border-l-green-600" : "border-l-transparent"}
        sub={t("admin.dashboard.tiles.vehiclesOnline", { n: counts.vehiclesOnline })}
        onClick={() => openPortalListDialog("customers")} testId="tile-online-now" />
      <Tile label={t("admin.dashboard.tiles.invites")} value={counts.pendingInvites + counts.expiredInvites} accent="border-l-transparent"
        sub={counts.expiredInvites > 0 ? t("admin.dashboard.tiles.expired", { n: counts.expiredInvites }) : undefined}
        onClick={() => openPortalListDialog("accounts")} testId="tile-invites" />
    </div>
  );
}

// ---- attention ------------------------------------------------------------------

export function AttentionPanel({ attention, canViewFines }: { attention: PortalDashboard["attention"]; canViewFines: boolean }) {
  const { t } = useTranslation("portal");
  const { openPortalRequestDialog, openFineDialog, openPortalListDialog } = useGlobalDialog();
  const fines = canViewFines ? attention.fines : [];
  const empty = attention.requests.length === 0 && fines.length === 0;
  return (
    <Panel title={t("admin.dashboard.attention.title")} icon={<AlertCircle className="h-4 w-4 text-amber-600" />} testId="panel-attention"
      action={<div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => openPortalListDialog("requests")}>{t("admin.dashboard.attention.allRequests")}</Button>
        {canViewFines && <Button size="sm" variant="ghost" onClick={() => openPortalListDialog("fines")}>{t("admin.dashboard.attention.allFines")}</Button>}
      </div>}>
      {empty ? <Empty>{t("admin.dashboard.attention.empty")}</Empty> : (<>
        {attention.requests.map((r) => (
          <Row key={`r${r.id}`} onClick={() => openPortalRequestDialog(r.id)} testId={`attention-request-${r.id}`}>
            <div className="min-w-0">
              <div className="truncate">{t(`admin.requests.type.${r.type}`, { defaultValue: r.type })} · {r.customerName}</div>
              <div className="truncate text-xs text-muted-foreground">#{r.id}{r.reservationLabel ? ` · ${r.reservationLabel}` : ""} · {ago(r.createdAt, t)}</div>
            </div>
            <RequestStatusBadge status={r.status} />
          </Row>
        ))}
        {fines.map((f) => (
          <Row key={`f${f.id}`} onClick={() => openFineDialog(f.id)} testId={`attention-fine-${f.id}`}>
            <div className="min-w-0">
              <div className="truncate">{t("admin.dashboard.attention.fine", { plate: formatLicensePlate(f.licensePlate) })}</div>
              <div className="truncate text-xs text-muted-foreground">{f.description} · {new Date(f.offenceAt).toLocaleDateString()} · € {f.totalAmount}</div>
            </div>
            <Badge variant="destructive">{t("admin.dashboard.attention.unlinked")}</Badge>
          </Row>
        ))}
      </>)}
    </Panel>
  );
}

// ---- notifications --------------------------------------------------------------

export function NotificationsPanel({ notifications, unread }: { notifications: PortalDashboard["notifications"]; unread: number }) {
  const { t } = useTranslation("portal");
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { openPortalRequestDialog, openFineDialog } = useGlobalDialog();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
    queryClient.invalidateQueries({ queryKey: ["/api/portal-admin/unread-count"] });
  };
  const markAll = useMutation({ mutationFn: () => apiRequest("POST", "/api/portal-admin/notifications/mark-read"), onSuccess: refresh });
  const markOne = useMutation({ mutationFn: (id: number) => apiRequest("POST", `/api/portal-admin/notifications/${id}/read`), onSuccess: refresh });

  const follow = (n: PortalDashboard["notifications"][number]) => {
    if (!n.isRead) markOne.mutate(n.id);
    const params = new URLSearchParams(n.link.split("?")[1] ?? "");
    const request = params.get("request"); const fine = params.get("fine");
    if (request) return openPortalRequestDialog(Number(request));
    if (fine) return openFineDialog(Number(fine));
    if (n.link && !n.link.startsWith("/portal-admin")) navigate(n.link);
  };

  return (
    <Panel title={<>{t("admin.dashboard.notifications.title")}{unread > 0 && <Badge className="ml-1">{t("admin.dashboard.notifications.unread", { n: unread })}</Badge>}</>}
      icon={<Bell className="h-4 w-4 text-blue-600" />} testId="panel-notifications"
      action={unread > 0 && <Button size="sm" variant="ghost" onClick={() => markAll.mutate()} data-testid="button-mark-all-read">{t("admin.dashboard.notifications.markAll")}</Button>}>
      {notifications.length === 0 ? <Empty>{t("admin.dashboard.notifications.empty")}</Empty> : notifications.map((n) => (
        <Row key={n.id} onClick={() => follow(n)} unread={!n.isRead} testId={`notification-${n.id}`}>
          <div className="min-w-0">
            <div className={`truncate ${n.isRead ? "" : "font-medium"}`}>{n.title}</div>
            <div className="truncate text-xs text-muted-foreground">{n.description}</div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{ago(n.createdAt, t)}</span>
        </Row>
      ))}
    </Panel>
  );
}

// ---- upcoming -------------------------------------------------------------------

function reservationStatusBadge(status: string, label: string) {
  const cls = status === "picked_up" ? "bg-orange-100 text-orange-800 hover:bg-orange-100" : "bg-blue-100 text-blue-800 hover:bg-blue-100";
  return <Badge className={cls}>{label}</Badge>;
}

export function UpcomingPanel({ upcoming }: { upcoming: PortalDashboard["upcoming"] }) {
  const { t } = useTranslation("portal");
  const { openReservationDialog } = useGlobalDialog();
  return (
    <Panel title={<div><div>{t("admin.dashboard.upcoming.title")}</div><div className="text-xs font-normal text-muted-foreground">{t("admin.dashboard.upcoming.subtitle", { days: DASHBOARD_WINDOW_DAYS })}</div></div>}
      icon={<CalendarClock className="h-4 w-4 text-purple-600" />} testId="panel-upcoming">
      {upcoming.length === 0 ? <Empty>{t("admin.dashboard.upcoming.empty", { days: DASHBOARD_WINDOW_DAYS })}</Empty> : upcoming.map((u) => (
        <Row key={`${u.reservationId}-${u.kind}`} onClick={() => openReservationDialog(u.reservationId)} testId={`upcoming-${u.kind}-${u.reservationId}`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-16 shrink-0 text-xs text-muted-foreground">{dayLabel(u.date, t)}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                {u.kind === "pickup" ? <ArrowUpFromLine className="h-3.5 w-3.5 text-blue-600" /> : <ArrowDownToLine className="h-3.5 w-3.5 text-green-700" />}
                <span className="font-medium">{t(`admin.dashboard.upcoming.${u.kind}`)}</span>
                {u.vehicle && <span className="font-mono">{formatLicensePlate(u.vehicle.licensePlate)}</span>}
                {u.viaPortal && <span className="text-xs text-muted-foreground">({t("admin.dashboard.upcoming.viaPortal")})</span>}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {u.customerName}{u.vehicle ? ` · ${u.vehicle.brand} ${u.vehicle.model}` : ""}{u.driverName ? ` · ${u.driverName}` : ""}
              </div>
            </div>
          </div>
          {reservationStatusBadge(u.status, t(`reservations.status.${u.status}`, { defaultValue: u.status }))}
        </Row>
      ))}
    </Panel>
  );
}

// ---- customers ------------------------------------------------------------------

interface OverviewRow {
  customerId: number; customerName: string; portalEnabled: boolean;
  accountsTotal: number; accountsActive: number; accountsBlocked: number; onlineNow: number;
  pendingInvites: number; expiredInvites: number; lastLoginAt: string | null; lastActivityAt: string | null;
}
const CUSTOMERS_LIMIT = 8;

export function CustomersPanel() {
  const { t } = useTranslation("portal");
  const { openCustomerDialog, openPortalListDialog } = useGlobalDialog();
  const [search, setSearch] = useState("");
  const { data = [] } = useQuery<OverviewRow[]>({
    queryKey: ["/api/portal-admin/customers-overview"],
    queryFn: async () => (await apiRequest("GET", "/api/portal-admin/customers-overview")).json(),
    refetchInterval: 60_000,
  });
  const q = search.trim().toLowerCase();
  const rows = data.filter((r) => !q || r.customerName.toLowerCase().includes(q));
  const shown = rows.slice(0, CUSTOMERS_LIMIT);

  return (
    <Panel title={t("admin.dashboard.customers.title")} icon={<Users className="h-4 w-4 text-teal-600" />} testId="panel-customers"
      action={<div className="flex items-center gap-1">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.customers.search")} className="h-8 w-36" data-testid="input-dashboard-customer-search" />
        <Button size="sm" variant="ghost" onClick={() => openPortalListDialog("customers")}>{t("admin.dashboard.customers.all")}</Button>
      </div>}>
      {shown.length === 0 ? <Empty>{t("admin.customers.empty")}</Empty> : (<>
        {shown.map((r) => {
          const last = r.lastActivityAt ?? r.lastLoginAt;
          const bits = [t("admin.dashboard.customers.accounts", { active: r.accountsActive, total: r.accountsTotal })];
          if (r.pendingInvites > 0) bits.push(t("admin.dashboard.customers.invites", { n: r.pendingInvites }));
          if (r.expiredInvites > 0) bits.push(t("admin.dashboard.customers.expired"));
          if (last) bits.push(t("admin.dashboard.customers.last", { when: ago(last, t) }));
          return (
            <Row key={r.customerId} onClick={() => openCustomerDialog(r.customerId, "portal")} testId={`dashboard-customer-${r.customerId}`}>
              <div className="min-w-0">
                <div className="truncate font-medium">{r.customerName}</div>
                <div className="truncate text-xs text-muted-foreground">{bits.join(" · ")}</div>
              </div>
              {!r.portalEnabled ? <Badge variant="destructive">{t("admin.dashboard.customers.portalOff")}</Badge>
                : r.onlineNow > 0 ? <Badge className="bg-green-600 hover:bg-green-600">{t("admin.customers.online", { n: r.onlineNow })}</Badge>
                : <span className="text-muted-foreground">—</span>}
            </Row>
          );
        })}
        {rows.length > shown.length && (
          <button type="button" className="w-full px-4 py-2 text-xs text-muted-foreground hover:underline" onClick={() => openPortalListDialog("customers")}>
            {t("admin.dashboard.customers.more", { n: rows.length - shown.length })}
          </button>
        )}
      </>)}
    </Panel>
  );
}
