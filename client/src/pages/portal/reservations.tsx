import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarDays } from "lucide-react";
import type { PortalReservationDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { ReservationCard } from "@/components/portal/reservation-card";
import { EmptyState, PageHeader, SearchBox, usePortalSearch } from "@/components/portal/ui";

const FILTERS = ["active", "upcoming", "past", "all"] as const;
type Filter = typeof FILTERS[number];

export default function PortalReservationsPage() {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const [filter, setFilter] = useState<Filter>("active");
  const { query, setQuery, q, hit } = usePortalSearch();
  const { data = [], isLoading } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn });
  if (isLoading) return null;
  const matches = (r: PortalReservationDto) =>
    filter === "all" ? true : filter === "active" ? r.status === "picked_up" : filter === "upcoming" ? r.status === "booked" : !["picked_up", "booked"].includes(r.status);
  const shown = data.filter(matches).filter((r) => hit(r.vehicle?.brand, r.vehicle?.model, r.vehicle?.licensePlate, r.driver?.displayName, r.contractNumber, r.startDate, r.endDate));

  return (
    <div className="space-y-4">
      <PageHeader title={t("reservations.title")} subtitle={t("reservations.count", { count: data.length })} />
      <SearchBox value={query} onChange={setQuery} placeholder={t("lists.search")} />
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("reservations.title")}>
        {FILTERS.map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${filter === f ? "bg-[#1a1d62] font-medium text-white" : "bg-white text-[#334155] ring-1 ring-[#e6e8f0] hover:bg-[#eef0fb]"}`}
            data-testid={`filter-${f}`}>
            {t(`reservations.filters.${f}`)} <span className="opacity-70">({data.filter((r) => f === "all" ? true : f === "active" ? r.status === "picked_up" : f === "upcoming" ? r.status === "booked" : !["picked_up", "booked"].includes(r.status)).length})</span>
          </button>
        ))}
      </div>
      {shown.length === 0
        ? <EmptyState icon={<CalendarDays className="h-6 w-6" />} text={data.length === 0 ? t("reservations.empty") : q ? t("lists.noMatch") : t("reservations.emptyFilter")} />
        : <div className="space-y-2">{shown.map((r) => <ReservationCard key={r.id} reservation={r} showPrice={Boolean(me?.settings.showPrices)} />)}</div>}
    </div>
  );
}
