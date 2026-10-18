import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useFilePreview } from "@/components/documents/use-file-preview";
import { Users, UserPlus, Car, Receipt, History, FileText, MoreHorizontal, Pencil, Power } from "lucide-react";
import type { PortalDriverDto, PortalReservationDto } from "@shared/portal-types";
import type { PortalFineDto } from "@shared/fines";
import { portalFetch, portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DriverFormDialog } from "@/components/portal/driver-form-dialog";
import { AssignVehicleDialog } from "@/components/portal/change-driver-dialog";
import { DriverHistoryDialog, driverHistory } from "@/components/portal/driver-history-dialog";
import { Avatar, EmptyState, PageHeader, Pager, PORTAL_PAGE_SIZE, Plate, SearchBox, btnPrimary, btnSecondary, usePortalSearch, PortalLoading, PortalLoadError } from "@/components/portal/ui";
import { vehicleName } from "@shared/vehicle-name";

/** Only the last four characters of a licence number are shown in the list (data minimisation); the full number stays in the edit form. */
const maskLicence = (n: string) => (n.length <= 4 ? n : `•••• ${n.slice(-4)}`);

/** Cars a driver is on right now (booked or running). */
const carsOf = (reservations: PortalReservationDto[], driverId: number) =>
  reservations.filter((r) => r.driver?.id === driverId && (r.status === "booked" || r.status === "picked_up"));

/** The quick filters above the list. */
type DriverFilter = "active" | "driving" | "noCar" | "inactive";

/**
 * Drivers (Kees, 2026-10-18): some customers have 80-100 cars, so this is one compact list with
 * quick filters, search and pages instead of a card per driver. Every row shows who, which car and
 * the licence; editing is one click, the rarer actions sit under "Meer".
 */
export default function PortalDriversPage() {
  const { t } = useTranslation("portal");
  const preview = useFilePreview();
  const queryClient = useQueryClient();
  const { me } = usePortalAuth();
  const { openReservation, openList } = usePortalDialogs();
  const canAssign = Boolean(me?.settings.canManageDrivers) && me?.role === "admin";
  const [assigning, setAssigning] = useState<PortalDriverDto | null>(null);
  const [historyOf, setHistoryOf] = useState<PortalDriverDto | null>(null);
  const [editing, setEditing] = useState<PortalDriverDto | null>(null);
  const [filter, setFilter] = useState<DriverFilter>("active");
  const [page, setPage] = useState(0);
  const { data = [], isLoading, isError, refetch } = useQuery<PortalDriverDto[]>({ queryKey: ["portal", "/api/portal/drivers"], queryFn: portalQueryFn });
  const { data: reservations = [] } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn });
  const { data: fines = [] } = useQuery<PortalFineDto[]>({ queryKey: ["portal", "/api/portal/fines"], queryFn: portalQueryFn, enabled: Boolean(me?.settings.canViewFines) });
  const toggle = useMutation({
    mutationFn: (d: PortalDriverDto) => portalFetch("PATCH", `/api/portal/drivers/${d.id}`, { status: d.status === "active" ? "inactive" : "active" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal", "/api/portal/drivers"] }),
  });
  const { query, setQuery, q, hit } = usePortalSearch();

  /** Only the car the driver is in right now goes in the list; booked and finished ones live under "Historie". */
  const drivingNow = (driverId: number) => carsOf(reservations, driverId).filter((r) => r.status === "picked_up");
  const historyCount = (driverId: number) => { const h = driverHistory(reservations, driverId); return h.upcoming.length + h.past.length; };
  /** Fines still open for this driver. */
  const openFinesOf = (driverId: number) => fines.filter((f) => f.driver?.id === driverId && f.status !== "paid" && f.status !== "cancelled");

  const sorted = useMemo(() => [...data].sort((a, b) => a.displayName.localeCompare(b.displayName)), [data]);
  const matches: Record<DriverFilter, (d: PortalDriverDto) => boolean> = {
    active: (d) => d.status === "active",
    driving: (d) => d.status === "active" && drivingNow(d.id).length > 0,
    noCar: (d) => d.status === "active" && carsOf(reservations, d.id).length === 0,
    inactive: (d) => d.status !== "active",
  };
  const counts = Object.fromEntries((Object.keys(matches) as DriverFilter[]).map((f) => [f, sorted.filter(matches[f]).length])) as Record<DriverFilter, number>;

  if (isLoading) return <PortalLoading />;
  if (isError) return <PortalLoadError onRetry={() => refetch()} />;

  const addButton = <DriverFormDialog><Button className={btnPrimary} data-testid="button-add-driver"><UserPlus className="mr-1.5 h-4 w-4" />{t("actions.addDriver")}</Button></DriverFormDialog>;
  const active = counts.active;
  // A search looks through every driver, whatever the filter, so a name is always found.
  const listed = sorted
    .filter((d) => (q ? true : matches[filter](d)))
    .filter((d) => hit(d.displayName, d.firstName, d.lastName, d.email, d.phone, d.driverLicenseNumber, ...carsOf(reservations, d.id).map((r) => r.vehicle?.licensePlate)));
  const pages = Math.max(1, Math.ceil(listed.length / PORTAL_PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = listed.slice(current * PORTAL_PAGE_SIZE, (current + 1) * PORTAL_PAGE_SIZE);

  const chip = (f: DriverFilter) => (
    <button key={f} type="button" onClick={() => { setFilter(f); setPage(0); }} aria-pressed={!q && filter === f}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${!q && filter === f ? "border-[#1a1d62] bg-[#1a1d62] text-white" : "border-[#e6e8f0] bg-white text-[#1a1d62] hover:bg-[#eef0fb]"}`}
      data-testid={`driver-filter-${f}`}>
      {t(`drivers.filter.${f}`)} <span className="opacity-70">{counts[f]}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <PageHeader title={t("drivers.title")} subtitle={t("drivers.count", { active, total: data.length })} action={addButton} />
      {data.length > 0 && (
        <div className="space-y-2">
          <SearchBox value={query} onChange={(v) => { setQuery(v); setPage(0); }} placeholder={t("lists.searchDrivers")} />
          <div className="flex flex-wrap gap-1.5" data-testid="driver-filters">{(["active", "driving", "noCar", "inactive"] as DriverFilter[]).map(chip)}</div>
        </div>
      )}
      {listed.length === 0
        ? <EmptyState icon={<Users className="h-6 w-6" />} text={q || data.length > 0 ? t("lists.noMatch") : t("drivers.empty")} action={q || data.length > 0 ? undefined : addButton} />
        : (
          <div className="overflow-hidden rounded-xl border border-[#e6e8f0] bg-white shadow-sm" data-testid="drivers-list">
            <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_10rem_11rem] gap-3 border-b border-[#e6e8f0] bg-[#f8f9ff] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#64748b] md:grid">
              <span>{t("drivers.col.driver")}</span><span>{t("drivers.col.car")}</span><span>{t("drivers.col.license")}</span><span />
            </div>
            <div className="divide-y divide-[#f1f5f9]">
              {shown.map((d) => {
                const cars = drivingNow(d.id);
                const openFines = openFinesOf(d.id);
                const history = historyCount(d.id);
                return (
                  <div key={d.id} className={`px-3 py-2.5 md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_10rem_11rem] md:items-center md:gap-3 md:px-4 ${d.status !== "active" ? "opacity-70" : ""}`} data-testid={`portal-driver-${d.id}`}>
                    {/* Who: name, status, how to reach them. */}
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={d.displayName} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-[#0f172a]">{d.displayName}</span>
                          {d.status !== "active" && <span className="shrink-0 rounded-full bg-[#f1efe8] px-1.5 py-0.5 text-[10px] font-medium text-[#444441]">{t("drivers.inactive")}</span>}
                        </div>
                        <div className="truncate text-xs text-[#64748b]">{[d.email, d.phone].filter(Boolean).join(" · ") || <span className="italic text-[#94a3b8]">{t("drivers.noContact")}</span>}</div>
                      </div>
                    </div>
                    {/* Which car right now; click the plate to open that reservation. */}
                    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 md:mt-0" data-testid={`driver-cars-${d.id}`}>
                      {cars.length === 0
                        ? (canAssign && d.status === "active" && carsOf(reservations, d.id).length === 0
                          ? <button type="button" onClick={() => setAssigning(d)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#cbd5e1] px-2 py-0.5 text-xs text-[#1a1d62] hover:bg-[#eef0fb]" data-testid={`button-assign-car-${d.id}`}><Car className="h-3.5 w-3.5" />{t("drivers.assignToCar")}</button>
                          : <span className="inline-flex items-center gap-1 text-xs text-[#94a3b8]"><Car className="h-3.5 w-3.5" />{t("drivers.noCar")}</span>)
                        : cars.map((r) => (
                          <button key={r.id} type="button" onClick={() => openReservation(r.id)} className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-[#eef0fb] py-0.5 pl-1 pr-2.5 text-xs text-[#1a1d62] hover:bg-[#dfe3f7]" title={`${r.vehicle?.brand ?? ""} ${r.vehicle?.model ?? ""}`.trim()}>
                            {r.vehicle?.licensePlate ? <Plate value={r.vehicle.licensePlate} /> : `#${r.id}`}
                            <span className="truncate max-w-[8rem]">{r.vehicle ? vehicleName(r.vehicle.brand, r.vehicle.model) : ""}</span>
                          </button>
                        ))}
                      {/* View only: opens the fines list filtered on this driver. */}
                      {openFines.length > 0 && (
                        <button type="button" onClick={() => openList("fines", { query: d.displayName })} title={t("drivers.viewFines")} className="inline-flex items-center gap-1 rounded-full bg-[#fde8e8] px-2 py-0.5 text-xs font-medium text-[#a32d2d] hover:bg-[#f9d5d5]" data-testid={`driver-fines-${d.id}`}>
                          <Receipt className="h-3.5 w-3.5" />{t("drivers.openFines", { count: openFines.length })}
                        </button>
                      )}
                    </div>
                    {/* On a phone the licence and the buttons share one line; from md they are two grid cells. */}
                    <div className="mt-1.5 flex items-center justify-between gap-2 md:contents">
                    {/* Licence: masked, with its expiry. */}
                    <div className="min-w-0 text-xs text-[#64748b]" title={d.driverLicenseNumber ? t("drivers.maskedHint") : undefined}>
                      {d.driverLicenseNumber
                        ? <>{maskLicence(d.driverLicenseNumber)}<span className="block text-[11px]">{d.licenseExpiry ? `${t("fields.licenseExpiry")} ${d.licenseExpiry}` : t("drivers.noExpiry")}</span></>
                        : <span className="italic text-[#94a3b8]">{t("drivers.noLicense")}</span>}
                    </div>
                    <div className="flex shrink-0 justify-end gap-1">
                      <Button size="sm" variant="outline" className={btnSecondary} onClick={() => setEditing(d)} data-testid={`button-edit-driver-${d.id}`}><Pencil className="mr-1 h-4 w-4" />{t("actions.edit")}</Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className={btnSecondary} aria-label={t("drivers.more", { name: d.displayName })} data-testid={`button-driver-more-${d.id}`}><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {history > 0 && <DropdownMenuItem onSelect={() => setHistoryOf(d)} data-testid={`button-driver-history-${d.id}`}><History className="mr-2 h-4 w-4" />{t("drivers.history", { count: history })}</DropdownMenuItem>}
                          {d.hasLicenseFile && <DropdownMenuItem onSelect={() => preview.open(`/api/portal/drivers/${d.id}/license`, `${t("actions.viewLicense")} · ${d.displayName}`)}><FileText className="mr-2 h-4 w-4" />{t("actions.viewLicense")}</DropdownMenuItem>}
                          <DropdownMenuItem onSelect={() => toggle.mutate(d)} data-testid={`button-driver-toggle-${d.id}`}><Power className="mr-2 h-4 w-4" />{d.status === "active" ? t("actions.deactivate") : t("actions.activate")}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Pager page={current} pages={pages} onPage={setPage} testId="drivers-pager" />
          </div>
        )}
      {/* One edit dialog for the whole list, opened from the row. */}
      {editing && <DriverFormDialog driver={editing} open onOpenChange={(o) => { if (!o) setEditing(null); }} />}
      {assigning && <AssignVehicleDialog driver={assigning} open onOpenChange={(o) => { if (!o) setAssigning(null); }} />}
      {historyOf && <DriverHistoryDialog driver={historyOf} reservations={reservations} open onOpenChange={(o) => { if (!o) setHistoryOf(null); }} />}
      {preview.dialog}
    </div>
  );
}
