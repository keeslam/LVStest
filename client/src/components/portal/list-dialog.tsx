import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Car, CalendarDays, Inbox, Receipt, FileText, Plus, Loader2, Search } from "lucide-react";
import type { PortalReservationDto, PortalDocumentDto } from "@shared/portal-types";
import type { PortalFineDto } from "@shared/fines";
import type { PortalRequestDto } from "@shared/portal-requests";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReservationCard } from "./reservation-card";
import { FineRow, RequestRow, DocumentRow } from "./rows";
import { EmptyState, btnPrimary } from "./ui";

export type PortalListKind = "current" | "upcoming" | "requests" | "fines" | "documents";

const ICONS: Record<PortalListKind, React.ReactNode> = {
  current: <Car className="h-5 w-5" />, upcoming: <CalendarDays className="h-5 w-5" />,
  requests: <Inbox className="h-5 w-5" />, fines: <Receipt className="h-5 w-5" />, documents: <FileText className="h-5 w-5" />,
};
const ICON_TONE: Record<PortalListKind, string> = {
  current: "bg-[#1d9e75]", upcoming: "bg-[#378add]", requests: "bg-[#ef9f27]", fines: "bg-[#e24b4a]", documents: "bg-[#1a1d62]",
};

/** One dashboard tile, opened: only that slice of data, in a dialog. Rows open their own detail dialog on top. */
export function PortalListDialog({ kind, onClose }: { kind: PortalListKind | null; onClose: () => void }) {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { openNewRequest } = usePortalDialogs();
  const open = kind !== null;
  const wantsReservations = kind === "current" || kind === "upcoming";
  const { data: reservations = [], isLoading: l1 } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn, enabled: open && wantsReservations });
  const { data: fines = [], isLoading: l2 } = useQuery<PortalFineDto[]>({ queryKey: ["portal", "/api/portal/fines"], queryFn: portalQueryFn, enabled: open && kind === "fines" });
  const { data: requests = [], isLoading: l3 } = useQuery<PortalRequestDto[]>({ queryKey: ["portal", "/api/portal/requests"], queryFn: portalQueryFn, enabled: open && kind === "requests" });
  const { data: documents = [], isLoading: l4 } = useQuery<PortalDocumentDto[]>({ queryKey: ["portal", "/api/portal/documents"], queryFn: portalQueryFn, enabled: open && kind === "documents" });
  const loading = l1 || l2 || l3 || l4;
  const [query, setQuery] = useState("");
  useEffect(() => { setQuery(""); }, [kind]);
  const q = query.trim().toLowerCase();
  const hit = (...parts: Array<string | number | null | undefined>) => !q || parts.filter(Boolean).join(" ").toLowerCase().includes(q);

  let items: React.ReactNode[] = [];
  let empty = "";
  let action: React.ReactNode = null;
  if (kind === "current" || kind === "upcoming") {
    const list = reservations.filter((r) => (kind === "current" ? r.status === "picked_up" : r.status === "booked"))
      .filter((r) => hit(r.vehicle?.brand, r.vehicle?.model, r.vehicle?.licensePlate, r.driver?.displayName, r.contractNumber, r.startDate, r.endDate));
    items = list.map((r) => <ReservationCard key={r.id} reservation={r} showPrice={Boolean(me?.settings.showPrices)} />);
    empty = t(kind === "current" ? "overview.noneCurrent" : "overview.noneUpcoming");
  } else if (kind === "fines") {
    const list = fines.filter((f) => f.status !== "paid" && f.status !== "cancelled").filter((f) => hit(f.description, f.licensePlate, f.driver?.displayName, f.reference, f.totalAmount));
    items = list.map((f) => <FineRow key={f.id} fine={f} />);
    empty = t("fines.noneOpen");
  } else if (kind === "requests") {
    const list = requests.filter((r) => r.status === "new" || r.status === "in_progress").filter((r) => hit(t("requests.type." + r.type), r.message, r.id));
    items = list.map((r) => <RequestRow key={r.id} request={r} />);
    empty = t("requests.noneOpen");
    action = <Button size="sm" className={btnPrimary} onClick={() => openNewRequest()}><Plus className="mr-1 h-4 w-4" />{t("requests.new")}</Button>;
  } else if (kind === "documents") {
    items = documents.filter((d) => hit(d.fileName, d.reservationId, t("documents." + d.kind))).map((d) => <DocumentRow key={d.id} document={d} />);
    empty = t("documents.empty");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col" data-testid={`portal-list-dialog-${kind ?? ""}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {kind && <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-white ${ICON_TONE[kind]}`}>{ICONS[kind]}</span>}
            <span>{kind ? t(`lists.${kind}`) : ""}{!loading && items.length > 0 && <span className="ml-2 rounded-full bg-[#eef0fb] px-2 py-0.5 text-xs font-medium text-[#1a1d62]">{items.length}</span>}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("lists.search")} className="pl-9" data-testid="portal-list-search" />
        </div>
        <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1 pb-1">
          {loading ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
            : items.length === 0 ? <EmptyState icon={kind ? ICONS[kind] : null} text={q ? t("lists.noMatch") : empty} action={q ? null : action} />
            : items}
        </div>
        {action && items.length > 0 && <div className="flex justify-end border-t pt-3">{action}</div>}
      </DialogContent>
    </Dialog>
  );
}
