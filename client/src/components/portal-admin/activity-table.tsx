import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Preview, PreviewFooter, TableSearch, textMatches } from "./preview";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ActivityRow {
  id: number; action: string; entity: string | null; entityId: number | null; details: Record<string, unknown> | null;
  ip: string | null; createdAt: string; userName: string | null; customerName: string | null;
}

export function ActivityTable({ customerId, limit = 50, preview }: { customerId?: number; limit?: number; preview?: Preview }) {
  const { t } = useTranslation("portal");
  const [search, setSearch] = useState("");
  const params = new URLSearchParams({ limit: String(limit), ...(customerId ? { customerId: String(customerId) } : {}) });
  const { data = [] } = useQuery<ActivityRow[]>({
    queryKey: ["/api/portal-admin/activity", { customerId, limit }],
    queryFn: async () => (await apiRequest("GET", `/api/portal-admin/activity?${params}`)).json(),
  });
  const filtered = data.filter((r) => textMatches(search, r.action, r.userName, r.customerName, r.entity && `${r.entity} #${r.entityId}`, r.details && JSON.stringify(r.details), r.ip));
  const rows = preview ? filtered.slice(0, preview.limit) : filtered;
  if (data.length === 0) return <p className="text-sm text-muted-foreground">{t("admin.activity.empty")}</p>;
  return (
    <div className="space-y-3">
    {!preview && <TableSearch value={search} onChange={setSearch} testId="activity-search" />}
    {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.activity.empty")}</p> : (
    <Table>
      <TableHeader><TableRow>
        <TableHead>{t("admin.activity.columns.when")}</TableHead>
        {!customerId && <TableHead>{t("admin.activity.columns.customer")}</TableHead>}
        <TableHead>{t("admin.activity.columns.user")}</TableHead>
        <TableHead>{t("admin.activity.columns.action")}</TableHead>
        <TableHead>{t("admin.activity.columns.details")}</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</TableCell>
            {!customerId && <TableCell>{r.customerName}</TableCell>}
            <TableCell>{r.userName ?? "—"}</TableCell>
            <TableCell><code className="text-xs">{r.action}</code></TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {[r.entity && `${r.entity} #${r.entityId}`, r.details && JSON.stringify(r.details), r.ip].filter(Boolean).join(" · ")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    )}
    {preview && filtered.length > 0 && <PreviewFooter shown={rows.length} total={filtered.length} onShowAll={preview.onShowAll} />}
    </div>
  );
}
