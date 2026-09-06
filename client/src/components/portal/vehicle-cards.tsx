import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Car, Fuel, Tag } from "lucide-react";
import type { PortalVehicleDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Button } from "@/components/ui/button";
import { EmptyState, Plate, SearchBox, Section, btnPrimary, usePortalSearch } from "./ui";

const money = (v: string | null | undefined) => (v ? `€ ${Number(v).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : null);

/**
 * The vehicles Lam Groep offers online, as far as this customer may rent them
 * (the server already left out anything on the customer's blacklist). Each
 * card opens a rental request with the vehicle filled in.
 */
export function AvailableVehicles() {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { openNewRequest } = usePortalDialogs();
  const { query, setQuery, q, hit } = usePortalSearch();
  const { data = [], isLoading } = useQuery<PortalVehicleDto[]>({ queryKey: ["portal", "/api/portal/vehicles"], queryFn: portalQueryFn, enabled: Boolean(me?.settings.canBook) });
  if (!me?.settings.canBook || isLoading) return null;
  const shown = data.filter((v) => hit(v.brand, v.model, v.licensePlate, v.vehicleType, v.fuel, v.description));

  return (
    <Section title={t("vehicles.title")} count={data.length}>
      <p className="text-sm text-[#64748b]" data-testid="portal-available-vehicles">{t("vehicles.subtitle", { count: data.length })}</p>
      {data.length > 0 && <SearchBox value={query} onChange={setQuery} placeholder={t("vehicles.search")} />}
      {shown.length === 0
        ? <EmptyState icon={<Car className="h-6 w-6" />} text={q ? t("lists.noMatch") : t("vehicles.empty")} />
        : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((v) => (
                <div key={v.id} className="flex flex-col rounded-xl border border-[#e6e8f0] bg-white p-4 shadow-sm" data-testid={`portal-vehicle-${v.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-[#0f172a]">{v.brand} {v.model}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#64748b]">
                        <Plate value={v.licensePlate} />
                        {v.vehicleType && <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" />{v.vehicleType}</span>}
                        {v.fuel && <span className="inline-flex items-center gap-1"><Fuel className="h-3 w-3" />{v.fuel}</span>}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#e1f5ee] px-2 py-0.5 text-xs font-medium text-[#085041]">{t("vehicles.available")}</span>
                  </div>
                  {v.description && <p className="mt-2 text-sm text-[#334155]">{v.description}</p>}
                  {(v.dailyPrice || v.monthlyPrice) && (
                    <div className="mt-2 flex flex-wrap gap-x-3 text-sm text-[#0f172a]">
                      {money(v.dailyPrice) && <span><span className="font-semibold">{money(v.dailyPrice)}</span> <span className="text-[#64748b]">{t("vehicles.perDay")}</span></span>}
                      {money(v.monthlyPrice) && <span><span className="font-semibold">{money(v.monthlyPrice)}</span> <span className="text-[#64748b]">{t("vehicles.perMonth")}</span></span>}
                    </div>
                  )}
                  <div className="mt-3 flex-1" />
                  <Button size="sm" className={`${btnPrimary} w-full`} onClick={() => openNewRequest({ type: "booking", vehicleId: v.id })} data-testid={`button-book-${v.id}`}>
                    {t("vehicles.request")}
                  </Button>
                </div>
            ))}
          </div>
        )}
    </Section>
  );
}
