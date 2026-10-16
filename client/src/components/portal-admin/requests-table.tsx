import { formatDateTime } from "@/lib/format-utils";
import { useMemo, useState } from "react";
import { type Preview, PreviewFooter, TableSearch, textMatches } from "./preview";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalRequestDto } from "@shared/portal-requests";
import { PortalRequestType, PortalRequestStatus } from "@shared/portal-requests";
import { apiRequest } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = { new: "default", in_progress: "secondary", done: "outline", rejected: "destructive" };
/** Sorteervolgorde van de status: van "moet nog" naar "klaar", niet alfabetisch. */
const STATUS_ORDER: string[] = Object.values(PortalRequestStatus);

export function RequestStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("portal");
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{t(`admin.requests.status.${status}`, { defaultValue: status })}</Badge>;
}

export type RequestSortKey = "date" | "type" | "customer" | "submitter" | "message" | "status";
export interface RequestSort { key: RequestSortKey; dir: "asc" | "desc" }

/**
 * Sorteert de aanvragen op één kolom. Tekstkolommen op de getoonde tekst
 * (dus de vertaalde typenaam), de status op volgorde Nieuw, In behandeling,
 * Afgehandeld, Afgewezen. Gelijke waarden houden hun onderlinge volgorde.
 */
export function sortRequests(rows: PortalRequestDto[], sort: RequestSort, typeLabel: (type: string) => string): PortalRequestDto[] {
  const text = (v: string | null | undefined) => (v ?? "").toLocaleLowerCase();
  const compare = (a: PortalRequestDto, b: PortalRequestDto): number => {
    switch (sort.key) {
      case "date": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "type": return text(typeLabel(a.type)).localeCompare(text(typeLabel(b.type)), "nl");
      case "customer": return text(a.customerName).localeCompare(text(b.customerName), "nl");
      case "submitter": return text(a.submittedBy).localeCompare(text(b.submittedBy), "nl");
      case "message": return text(a.message).localeCompare(text(b.message), "nl");
      case "status": return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    }
  };
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const c = compare(a.row, b.row);
      return c ? c * (sort.dir === "asc" ? 1 : -1) : a.index - b.index;
    })
    .map(({ row }) => row);
}

function SortableHead({ label, sortKey, sort, onSort }: { label: string; sortKey: RequestSortKey; sort: RequestSort; onSort: (key: RequestSortKey) => void }) {
  const { t } = useTranslation("portal");
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 -ml-1 rounded px-1 py-0.5 hover:bg-muted hover:text-foreground"
        title={t("admin.requests.sort.title", { column: label })}
        data-testid={`sort-request-${sortKey}`}
      >
        {label}
        <Icon className={active ? "h-3.5 w-3.5" : "h-3.5 w-3.5 opacity-50"} />
      </button>
    </TableHead>
  );
}

export function RequestsTable({ customerId, preview, types }: { customerId?: number; preview?: Preview; types?: string[] }) {
  const { t } = useTranslation("portal");
  const { openPortalRequestDialog } = useGlobalDialog();
  const [status, setStatus] = useState("");
  const [type, setType] = useState(types?.length === 1 ? types[0] : "");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<RequestSort>({ key: "date", dir: "desc" });
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
  const sorted = useMemo(() => sortRequests(filtered, sort, (ty) => t(`admin.requests.type.${ty}`)), [filtered, sort, t]);
  const rows = preview ? sorted.slice(0, preview.limit) : sorted;

  // Nogmaals op dezelfde kolom klikken draait de richting om; een andere kolom begint
  // oplopend, behalve de datum (nieuwste eerst is daar het gewone gebruik).
  const toggleSort = (key: RequestSortKey) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" }));
  const head = (key: RequestSortKey, label: string) => <SortableHead label={label} sortKey={key} sort={sort} onSort={toggleSort} />;

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
          {(types && types.length > 0 ? types : Object.values(PortalRequestType)).map((s) => <option key={s} value={s}>{t(`admin.requests.type.${s}`)}</option>)}
        </select>
      </div>}
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.requests.empty")}</p> : (
        <Table>
          <TableHeader><TableRow>
            {head("date", t("admin.requests.columns.date"))}
            {head("type", t("admin.requests.columns.type"))}
            {!customerId && head("customer", t("admin.requests.columns.customer"))}
            {head("submitter", t("admin.requests.columns.submitter"))}
            {head("message", t("admin.requests.columns.message"))}
            {head("status", t("admin.requests.columns.status"))}
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openPortalRequestDialog(r.id)} data-testid={`row-request-${r.id}`}>
                <TableCell className="whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
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
      {preview && sorted.length > 0 && <PreviewFooter shown={rows.length} total={sorted.length} onShowAll={preview.onShowAll} />}
    </div>
  );
}
