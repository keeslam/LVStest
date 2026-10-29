import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import type { OnlineAppointmentDto } from "@shared/online-appointments";
import { apiRequest } from "@/lib/queryClient";
import { formatDateNl } from "@/lib/format-date-nl";
import { cn, displayLicensePlate } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 50;
const HEAD_CLS = "h-9 px-3 py-2";
const CELL_CLS = "px-3 py-2 align-top";

interface AppointmentPage { items: OnlineAppointmentDto[]; total: number }

const STATUS_CLASS: Record<string, string> = {
  pending: "border-transparent bg-amber-100 text-amber-800",
  review: "border-transparent bg-amber-100 text-amber-800",
  confirmed: "border-transparent bg-green-100 text-green-800",
  cancelled: "",
  dismissed: "",
};

/**
 * Tab "Online afspraken" of the inbox log: every "Afspraak Aanvraag" mail the poller took out of the inbox, with what
 * became of it. Read only; acting on them happens in the maintenance calendar.
 */
export function OnlineAppointmentsLogPanel({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation("expenses");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search);

  const query = useInfiniteQuery({
    queryKey: ["/api/online-appointments/log", q],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageParam) });
      if (q.trim()) params.set("q", q.trim());
      return (await apiRequest("GET", `/api/online-appointments/log?${params}`)).json() as Promise<AppointmentPage>;
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, page) => n + page.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages.at(-1)?.total ?? rows.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-shrink-0 flex-wrap items-end gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("invoiceInbox.log.appointments.searchPlaceholder")}
          aria-label={t("invoiceInbox.log.searchLabel")}
          className="max-w-md"
          data-testid="input-online-appointments-log-search"
        />
        <Button asChild variant="outline" size="sm">
          <Link href="/maintenance?onlineAppointments=1" data-testid="link-online-appointments-log-calendar">
            {t("invoiceInbox.log.appointments.toCalendar")}<ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border" data-testid="invoice-inbox-log-table-scroll">
        {query.isPending ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("invoiceInbox.log.loading")}</p>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("invoiceInbox.log.empty.appointments")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(HEAD_CLS, "w-[128px]")}>{t("invoiceInbox.columns.received")}</TableHead>
                <TableHead className={cn(HEAD_CLS, "w-[128px]")}>{t("invoiceInbox.log.appointments.columns.appointment")}</TableHead>
                <TableHead className={cn(HEAD_CLS, "w-[180px]")}>{t("invoiceInbox.log.appointments.columns.vehicle")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("invoiceInbox.log.appointments.columns.work")}</TableHead>
                <TableHead className={cn(HEAD_CLS, "w-[180px]")}>{t("invoiceInbox.log.appointments.columns.customer")}</TableHead>
                <TableHead className={cn(HEAD_CLS, "w-[160px]")}>{t("invoiceInbox.log.appointments.columns.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id} data-testid={`row-online-appointments-log-${a.id}`}>
                  <TableCell className={cn(CELL_CLS, "whitespace-nowrap")}>{formatDateNl(a.receivedAt, "dd-MM-yyyy HH:mm")}</TableCell>
                  <TableCell className={cn(CELL_CLS, "whitespace-nowrap")}>{a.date ? `${a.date.split("-").reverse().join("-")} ${a.time}` : "-"}</TableCell>
                  <TableCell className={CELL_CLS}>
                    {a.plate ? `${displayLicensePlate(a.plate)} ${[a.brand, a.model].filter(Boolean).join(" ")}` : "-"}
                  </TableCell>
                  <TableCell className={CELL_CLS}><span className="block max-w-[18rem] truncate" title={a.workItems.join(", ")}>{a.workItems.join(", ") || "-"}</span></TableCell>
                  <TableCell className={CELL_CLS}><span className="block max-w-[170px] truncate">{a.customerLabel || a.customerName || "-"}</span></TableCell>
                  <TableCell className={CELL_CLS}>
                    <Badge variant="outline" className={STATUS_CLASS[a.status]}>{t(`invoiceInbox.log.appointments.statuses.${a.status}`)}</Badge>
                    {a.handledBy && <div className="mt-1 text-xs text-muted-foreground">{a.handledBy}</div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 pt-2">
        <span className="text-xs text-muted-foreground">{t("invoiceInbox.log.shown", { shown: rows.length, total })}</span>
        {query.hasNextPage && (
          <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} data-testid="button-online-appointments-log-more">
            {t("invoiceInbox.log.loadMore")}
          </Button>
        )}
      </div>
    </div>
  );
}
