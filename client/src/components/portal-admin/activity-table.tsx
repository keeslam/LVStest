import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Preview, PreviewFooter, TableSearch, textMatches } from "./preview";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ActivityRow {
  id: number; action: string; entity: string | null; entityId: number | null; details: Record<string, unknown> | null;
  ip: string | null; createdAt: string; userName: string | null; customerName: string | null;
}

/** "something_new" for an action nobody wrote a label for yet: readable, not a code. */
function humanize(code: string): string {
  const words = code.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What happened, in words. */
export function activityLabel(t: TFunction, action: string): string {
  return t(`admin.activity.actions.${action}`, { defaultValue: humanize(action) });
}

/** The entity, the detail pairs and the address as one readable line. */
export function activityDetails(t: TFunction, r: Pick<ActivityRow, "entity" | "entityId" | "details" | "ip">): string {
  const value = (key: string, v: unknown): string => {
    if (typeof v === "boolean") return t(v ? "admin.activity.yes" : "admin.activity.no");
    if (key === "status") return t(`admin.requests.status.${String(v)}`, { defaultValue: String(v) });
    return v !== null && typeof v === "object" ? JSON.stringify(v) : String(v);
  };
  const entity = r.entity ? `${t(`admin.activity.entities.${r.entity}`, { defaultValue: humanize(r.entity) })}${r.entityId !== null ? ` #${r.entityId}` : ""}` : null;
  const pairs = r.details ? Object.entries(r.details).map(([k, v]) => `${t(`admin.activity.detailKeys.${k}`, { defaultValue: k })}: ${value(k, v)}`) : [];
  return [entity, ...pairs, r.ip].filter(Boolean).join(" · ");
}

export function ActivityTable({ customerId, limit = 50, preview }: { customerId?: number; limit?: number; preview?: Preview }) {
  const { t } = useTranslation("portal");
  const [search, setSearch] = useState("");
  const params = new URLSearchParams({ limit: String(limit), ...(customerId ? { customerId: String(customerId) } : {}) });
  const { data = [] } = useQuery<ActivityRow[]>({
    queryKey: ["/api/portal-admin/activity", { customerId, limit }],
    queryFn: async () => (await apiRequest("GET", `/api/portal-admin/activity?${params}`)).json(),
  });
  const filtered = data.filter((r) => textMatches(search, activityLabel(t, r.action), r.userName, r.customerName, activityDetails(t, r)));
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
            <TableCell>{activityLabel(t, r.action)}</TableCell>
            <TableCell className="text-xs text-muted-foreground" data-testid={`activity-details-${r.id}`}>{activityDetails(t, r)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    )}
    {preview && filtered.length > 0 && <PreviewFooter shown={rows.length} total={filtered.length} onShowAll={preview.onShowAll} />}
    </div>
  );
}
