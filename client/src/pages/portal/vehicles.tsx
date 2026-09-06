import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Car } from "lucide-react";
import type { PortalMyVehicleDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { VehicleCard } from "@/components/portal/vehicle-card";
import { EmptyState, MoreFooter, SearchBox, Section, usePortalSearch } from "@/components/portal/ui";

const ROWS = 5;

/** The customer's vehicles on the road; ?block=<id> (from a notification) puts that vehicle first. */
export default function PortalVehiclesPage() {
  const { t } = useTranslation("portal");
  const { openList } = usePortalDialogs();
  const focusBlock = Number(new URLSearchParams(useSearch()).get("block") ?? 0);
  const { data: items = [], isLoading } = useQuery<PortalMyVehicleDto[]>({ queryKey: ["portal", "/api/portal/vehicles/mine"], queryFn: portalQueryFn });
  const { query, setQuery, hit } = usePortalSearch();
  const list = items
    .filter((v) => hit(v.vehicle.licensePlate, v.vehicle.brand, v.vehicle.model, v.driver?.displayName))
    .sort((a, b) => Number(b.maintenance?.blockId === focusBlock) - Number(a.maintenance?.blockId === focusBlock));
  return (
    <div className="space-y-4" data-testid="portal-vehicles">
      <Section title={t("vehicles.mine")} count={items.length}>
        {items.length > 1 && <div className="mb-3"><SearchBox value={query} onChange={setQuery} placeholder={t("vehicles.mineSearch")} testId="vehicles-search" /></div>}
        {!isLoading && list.length === 0
          ? <EmptyState icon={<Car className="h-6 w-6" />} text={t("vehicles.none")} />
          : <div className="space-y-3">{list.slice(0, query ? list.length : ROWS).map((v) => <VehicleCard key={v.reservationId} item={v} />)}</div>}
        {!query && list.length > ROWS && <MoreFooter shown={ROWS} total={list.length} onMore={() => openList("vehicles")} testId="more-vehicles" />}
      </Section>
    </div>
  );
}
