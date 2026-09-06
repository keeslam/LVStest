import { useState } from "react";
import { type Preview, PreviewFooter, TableSearch, textMatches } from "./preview";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalRequestDto } from "@shared/portal-requests";
import { PortalRequestType, PortalRequestStatus } from "@shared/portal-requests";
import { apiRequest } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = { new: "default", in_progress: "secondary", done: "outline", rejected: "destructive" };

export function RequestStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("portal");
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{t(`admin.requests.status.${status}`, { defaultValue: status })}</Badge>;
}

export function RequestsTable({ customerId, preview, types }: { customerId?: number; preview?: Preview; types?: string[] }) {
  const { t } = useTranslation("portal");
  const { openPortalRequestDialog } = useGlobalDialog();
  const [status, setStatus] = useState("");
  const [type, setType] = useState(types?.length === 1 ? types[0] : "");
  const [search, setSearch] = useState("");
  const filters = { status: status || undefined, type: type || undefined, customerId };
  const { data = [] } = useQuery<PortalRequestDto[]>({
    queryKey: ["/api/portal-requests", filters],
    queryFn: async () => {
      const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
      return (await apiRequest("GET", `/api/portal-requests?${q}`)).json();
    },
  });
  const typeScoped = types && types.length > 0 ? data.filter((r) => types.includes(r.type)) : data;
  const filtered = typeScoped.filter((r) => textMatches(search, r.id, t(`admin.requests.type.${r.type}`), r.message, r.submittedBy, r.customerName, r.reservationLabel, t(`admin.requests.status.${r.status}`)));
  const rows = preview ? filtered.slice(0, preview.limit) : filtered;
  return (
    <div className="space-y-3">
      {!preview && <div className="flex flex-wrap gap-2">
        <TableSearch value={search} onChange={setSearch} testId="requests-search" />
        <select className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-request-status">
          <option value="">{t("admin.requests.filters.allStatuses")}</option>
          {Object.values(PortalRequestStatus).map((s) => <option key={s} value={s}>{t(`admin.requests.status.${s}`)}</option>)}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t("admin.requests.filters.allTypes")}</option>
          {Object.values(PortalRequestType).map((s) => <option key={s} value={s}>{t(`admin.requests.type.${s}`)}</option>)}
        </select>
      </div>}
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.requests.empty")}</p> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("admin.requests.columns.date")}</TableHead>
            <TableHead>{t("admin.requests.columns.type")}</TableHead>
            {!customerId && <TableHead>{t("admin.requests.columns.customer")}</TableHead>}
            <TableHead>{t("admin.requests.columns.submitter")}</TableHead>
            <TableHead>{t("admin.requests.columns.message")}</TableHead>
            <TableHead>{t("admin.requests.columns.status")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openPortalRequestDialog(r.id)} data-testid={`row-request-${r.id}`}>
                <TableCell className="whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</TableCell>
                <TableCell>{t(`admin.requests.type.${r.type}`)}</TableCell>
                {!customerId && <TableCell>{r.customerName}</TableCell>}
                <TableCell>{r.submittedBy ?? "—"}</TableCell>
                <TableCell className="max-w-md truncate">{r.message}</TableCell>
                <TableCell><RequestStatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {preview && filtered.length > 0 && <PreviewFooter shown={rows.length} total={filtered.length} onShowAll={preview.onShowAll} />}
    </div>
  );
}
