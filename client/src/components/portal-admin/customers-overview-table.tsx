import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface OverviewRow {
  customerId: number; customerName: string; portalEnabled: boolean;
  accountsTotal: number; accountsActive: number; accountsBlocked: number; onlineNow: number;
  pendingInvites: number; expiredInvites: number;
  lastLoginAt: string | null; lastActivityAt: string | null; lastActivityAction: string | null; lastActivityUser: string | null;
}

const KEY = ["/api/portal-admin/customers-overview"];

function ago(iso: string | null, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (!iso) return "—";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return t("admin.customers.justNow");
  if (minutes < 60) return t("admin.customers.minutesAgo", { n: minutes });
  if (minutes < 60 * 24) return t("admin.customers.hoursAgo", { n: Math.round(minutes / 60) });
  return new Date(iso).toLocaleDateString();
}

export function CustomersOverviewTable() {
  const { t } = useTranslation("portal");
  const { openCustomerDialog } = useGlobalDialog();
  const [search, setSearch] = useState("");
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const { data = [] } = useQuery<OverviewRow[]>({
    queryKey: KEY,
    queryFn: async () => (await apiRequest("GET", KEY[0])).json(),
    refetchInterval: 60_000,
  });

  const q = search.trim().toLowerCase();
  const rows = data.filter((r) =>
    (!q || r.customerName.toLowerCase().includes(q)) &&
    (!onlyOnline || r.onlineNow > 0) &&
    (!onlyPending || r.pendingInvites + r.expiredInvites > 0),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder={t("admin.customers.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Button size="sm" variant={onlyOnline ? "default" : "outline"} onClick={() => setOnlyOnline(!onlyOnline)}>{t("admin.customers.onlyOnline")}</Button>
        <Button size="sm" variant={onlyPending ? "default" : "outline"} onClick={() => setOnlyPending(!onlyPending)}>{t("admin.customers.onlyPending")}</Button>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.customers.empty")}</p> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("admin.customers.columns.customer")}</TableHead>
            <TableHead>{t("admin.customers.columns.portal")}</TableHead>
            <TableHead>{t("admin.customers.columns.accounts")}</TableHead>
            <TableHead>{t("admin.customers.columns.online")}</TableHead>
            <TableHead>{t("admin.customers.columns.invites")}</TableHead>
            <TableHead>{t("admin.customers.columns.lastLogin")}</TableHead>
            <TableHead>{t("admin.customers.columns.lastActivity")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.customerId} className="cursor-pointer hover:bg-muted/40" onClick={() => openCustomerDialog(r.customerId, "portal")} data-testid={`row-portal-customer-${r.customerId}`}>
                <TableCell className="font-medium">{r.customerName}</TableCell>
                <TableCell>{r.portalEnabled ? <Badge>{t("admin.customers.on")}</Badge> : <Badge variant="destructive">{t("admin.customers.off")}</Badge>}</TableCell>
                <TableCell>
                  {r.accountsActive}/{r.accountsTotal}
                  {r.accountsBlocked > 0 && <span className="ml-1 text-xs text-destructive">({r.accountsBlocked} {t("admin.customers.blocked")})</span>}
                </TableCell>
                <TableCell>
                  {r.onlineNow > 0
                    ? <Badge className="bg-green-600 hover:bg-green-600">{t("admin.customers.online", { n: r.onlineNow })}</Badge>
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  {r.pendingInvites > 0 && <Badge variant="secondary">{t("admin.customers.pending", { n: r.pendingInvites })}</Badge>}
                  {r.expiredInvites > 0 && <Badge variant="outline" className="ml-1 text-destructive">{t("admin.customers.expired", { n: r.expiredInvites })}</Badge>}
                  {r.pendingInvites + r.expiredInvites === 0 && <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap">{ago(r.lastLoginAt, t)}</TableCell>
                <TableCell className="text-sm">
                  {r.lastActivityAt
                    ? <><code className="text-xs">{r.lastActivityAction}</code> · {r.lastActivityUser ?? "—"} · <span className="text-muted-foreground">{ago(r.lastActivityAt, t)}</span></>
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
