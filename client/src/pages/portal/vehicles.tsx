import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Car } from "lucide-react";
import type { PortalMyVehicleDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { VehicleCard } from "@/components/portal/vehicle-card";
import { EmptyState, FilterChips, SearchBox, Section, daysUntil, usePortalPages, usePortalSearch } from "@/components/portal/ui";

type VehicleFilter = "all" | "apk" | "maintenance";
/** APK expired or due within 30 days. */
const apkSoon = (v: PortalMyVehicleDto) => { const d = daysUntil(v.vehicle.apkDate); return d !== null && d <= 30; };
/** Maintenance planned or a service due (soon). */
const needsService = (v: PortalMyVehicleDto) => Boolean(v.maintenance) || v.serviceDue !== null;

/**
 * The customer's vehicles on the road; ?block=<id> (from a notification) puts that vehicle first.
 * Kees, 2026-10-18: customers with 80-100 cars get quick filters and the list a page at a time.
 */
export default function PortalVehiclesPage() {
  const { t } = useTranslation("portal");
  const focusBlock = Number(new URLSearchParams(useSearch()).get("block") ?? 0);
  const { data: items = [], isLoading } = useQuery<PortalMyVehicleDto[]>({ queryKey: ["portal", "/api/portal/vehicles/mine"], queryFn: portalQueryFn });
  const { query, setQuery, q, hit } = usePortalSearch();
  const [filter, setFilter] = useState<VehicleFilter>("all");
  const inFilter = (v: PortalMyVehicleDto) => filter === "all" || (filter === "apk" ? apkSoon(v) : needsService(v));
  const list = items
    .filter((v) => (q ? true : inFilter(v)))
    .filter((v) => hit(v.vehicle.licensePlate, v.vehicle.brand, v.vehicle.model, v.driver?.displayName))
    .sort((a, b) => Number(b.maintenance?.blockId === focusBlock) - Number(a.maintenance?.blockId === focusBlock));
  const { shown, pager } = usePortalPages(list, `${filter}|${q}`, "vehicles-pager");
  return (
    <div className="space-y-4" data-testid="portal-vehicles">
      <Section title={t("vehicles.mine")} count={items.length}>
        {items.length > 1 && (
          <div className="mb-3 space-y-2">
            <SearchBox value={query} onChange={setQuery} placeholder={t("vehicles.mineSearch")} testId="vehicles-search" />
            <FilterChips testIdPrefix="vehicles" value={filter} onChange={setFilter} options={[
              { key: "all", label: t("lists.filter.all"), count: items.length },
              { key: "apk", label: t("vehicles.filter.apk"), count: items.filter(apkSoon).length },
              { key: "maintenance", label: t("vehicles.filter.maintenance"), count: items.filter(needsService).length },
            ]} />
          </div>
        )}
        {!isLoading && list.length === 0
          ? <EmptyState icon={<Car className="h-6 w-6" />} text={items.length > 0 ? t("lists.noMatch") : t("vehicles.none")} />
          : <div className="space-y-3">{shown.map((v) => <VehicleCard key={v.reservationId} item={v} />)}{pager}</div>}
      </Section>
    </div>
  );
}
