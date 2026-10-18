import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarDays } from "lucide-react";
import type { PortalReservationDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { csvDate, csvNumber } from "@/lib/csv";
import { vehicleName } from "@shared/vehicle-name";
import { formatLicensePlate } from "@shared/license-plate";
import { PortalExportButton } from "@/components/portal/export-button";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { ReservationCard } from "@/components/portal/reservation-card";
import { EmptyState, PageHeader, SearchBox, usePortalPages, usePortalSearch, PortalLoading, PortalLoadError } from "@/components/portal/ui";

const FILTERS = ["active", "upcoming", "past", "all"] as const;
type Filter = typeof FILTERS[number];

const inFilter = (f: Filter, r: PortalReservationDto) =>
  f === "all" ? true : f === "active" ? r.status === "picked_up" : f === "upcoming" ? r.status === "booked" : !["picked_up", "booked"].includes(r.status);

export default function PortalReservationsPage() {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const [filter, setFilter] = useState<Filter>("active");
  const { query, setQuery, q, hit } = usePortalSearch();
  const { data = [], isLoading, isError, refetch } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn });
  const listed = data.filter((r) => inFilter(filter, r)).filter((r) => hit(r.vehicle?.brand, r.vehicle?.model, r.vehicle?.licensePlate, r.driver?.displayName, r.contractNumber, r.startDate, r.endDate));
  // Kees, 2026-10-18: customers with 80-100 cars get the list a page at a time.
  const { shown, pager } = usePortalPages(listed, `${filter}|${q}`, "reservations-pager");
  // The export takes the whole filtered list, every page; the price only when the customer sees prices.
  const showPrice = Boolean(me?.settings.showPrices);
  const exportRows = () => ({
    header: [t("export.col.reservation"), t("export.col.contract"), t("export.col.status"), t("export.col.plate"), t("export.col.car"), t("export.col.driver"), t("export.col.start"), t("export.col.end"), ...(showPrice ? [t("export.col.price")] : [])],
    rows: listed.map((r) => [
      r.id, r.contractNumber ?? "", t(`reservations.status.${r.status}`, { defaultValue: r.status }), formatLicensePlate(r.vehicle?.licensePlate),
      r.vehicle ? vehicleName(r.vehicle.brand, r.vehicle.model) : "", r.driver?.displayName ?? "", csvDate(r.startDate), csvDate(r.endDate),
      ...(showPrice ? [csvNumber(r.totalPrice)] : []),
    ]),
  });
  if (isLoading) return <PortalLoading />;
  if (isError) return <PortalLoadError onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <PageHeader title={t("reservations.title")} subtitle={t("reservations.count", { count: data.length })} action={data.length > 0 ? <PortalExportButton list="reservations" rows={exportRows} /> : undefined} />
      <SearchBox value={query} onChange={setQuery} placeholder={t("lists.search")} />
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("reservations.title")}>
        {FILTERS.map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${filter === f ? "bg-[#1a1d62] font-medium text-white" : "bg-white text-[#334155] ring-1 ring-[#e6e8f0] hover:bg-[#eef0fb]"}`}
            data-testid={`filter-${f}`}>
            {t(`reservations.filters.${f}`)} <span className="opacity-70">({data.filter((r) => inFilter(f, r)).length})</span>
          </button>
        ))}
      </div>
      {listed.length === 0
        ? <EmptyState icon={<CalendarDays className="h-6 w-6" />} text={data.length === 0 ? t("reservations.empty") : q ? t("lists.noMatch") : t("reservations.emptyFilter")} />
        : <div className="space-y-2">{shown.map((r) => <ReservationCard key={r.id} reservation={r} showPrice={Boolean(me?.settings.showPrices)} />)}{pager}</div>}
    </div>
  );
}
