import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useFilePreview } from "@/components/documents/use-file-preview";
import { Users, UserPlus, Mail, Phone, IdCard, FileText, Car, Receipt, History } from "lucide-react";
import type { PortalDriverDto, PortalReservationDto } from "@shared/portal-types";
import type { PortalFineDto } from "@shared/fines";
import { portalFetch, portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { Button } from "@/components/ui/button";
import { DriverFormDialog } from "@/components/portal/driver-form-dialog";
import { AssignVehicleDialog } from "@/components/portal/change-driver-dialog";
import { DriverHistoryDialog, driverHistory } from "@/components/portal/driver-history-dialog";
import { Avatar, EmptyState, PageHeader, Plate, SearchBox, btnPrimary, btnSecondary, usePortalSearch } from "@/components/portal/ui";

/** Cars a driver is on right now (booked or running). */
const carsOf = (reservations: PortalReservationDto[], driverId: number) =>
  reservations.filter((r) => r.driver?.id === driverId && (r.status === "booked" || r.status === "picked_up"));

export default function PortalDriversPage() {
  const { t } = useTranslation("portal");
  const preview = useFilePreview();
  const queryClient = useQueryClient();
  const { me } = usePortalAuth();
  const { openReservation, openList } = usePortalDialogs();
  const canAssign = Boolean(me?.settings.canManageDrivers) && me?.role === "admin";
  const [assigning, setAssigning] = useState<PortalDriverDto | null>(null);
  const [historyOf, setHistoryOf] = useState<PortalDriverDto | null>(null);
  /** Only the car the driver is in right now goes on the card; booked and finished ones live under "Historie". */
  const drivingNow = (driverId: number) => carsOf(reservations, driverId).filter((r) => r.status === "picked_up");
  const historyCount = (driverId: number) => { const h = driverHistory(reservations, driverId); return h.upcoming.length + h.past.length; };
  const { data = [], isLoading } = useQuery<PortalDriverDto[]>({ queryKey: ["portal", "/api/portal/drivers"], queryFn: portalQueryFn });
  const { data: reservations = [] } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn });
  const { data: fines = [] } = useQuery<PortalFineDto[]>({ queryKey: ["portal", "/api/portal/fines"], queryFn: portalQueryFn, enabled: Boolean(me?.settings.canViewFines) });
  /** Fines still open for this driver. */
  const openFinesOf = (driverId: number) => fines.filter((f) => f.driver?.id === driverId && f.status !== "paid" && f.status !== "cancelled");
  const toggle = useMutation({
    mutationFn: (d: PortalDriverDto) => portalFetch("PATCH", `/api/portal/drivers/${d.id}`, { status: d.status === "active" ? "inactive" : "active" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal", "/api/portal/drivers"] }),
  });
  const { query, setQuery, q, hit } = usePortalSearch();
  if (isLoading) return null;
  const addButton = <DriverFormDialog><Button className={btnPrimary} data-testid="button-add-driver"><UserPlus className="mr-1.5 h-4 w-4" />{t("actions.addDriver")}</Button></DriverFormDialog>;
  const active = data.filter((d) => d.status === "active").length;
  const shown = data.filter((d) => hit(d.displayName, d.firstName, d.lastName, d.email, d.phone, d.driverLicenseNumber, ...carsOf(reservations, d.id).map((r) => r.vehicle?.licensePlate)));

  return (
    <div className="space-y-4">
      <PageHeader title={t("drivers.title")} subtitle={t("drivers.count", { active, total: data.length })} action={addButton} />
      {data.length > 0 && <SearchBox value={query} onChange={setQuery} placeholder={t("lists.searchDrivers")} />}
      {shown.length === 0
        ? <EmptyState icon={<Users className="h-6 w-6" />} text={q ? t("lists.noMatch") : t("drivers.empty")} action={q ? undefined : addButton} />
        : (
          <div className="grid gap-2 sm:grid-cols-2">
            {shown.map((d) => (
              <div key={d.id} className={`rounded-xl border border-[#e6e8f0] bg-white p-4 shadow-sm ${d.status !== "active" ? "opacity-70" : ""}`} data-testid={`portal-driver-${d.id}`}>
                <div className="flex items-start gap-3">
                  <Avatar name={d.displayName} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-[#0f172a]">{d.displayName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.status === "active" ? "bg-[#e1f5ee] text-[#085041]" : "bg-[#f1efe8] text-[#444441]"}`}>{t(`drivers.${d.status === "active" ? "active" : "inactive"}`)}</span>
                    </div>
                    <dl className="mt-1.5 space-y-0.5 text-xs text-[#64748b] sm:text-sm">
                      <div className="flex items-center gap-1.5" title={t("fields.email")}><Mail className="h-3.5 w-3.5 shrink-0" />{d.email ? <span className="truncate">{d.email}</span> : <span className="italic text-[#94a3b8]">{t("drivers.notGiven")}</span>}</div>
                      <div className="flex items-center gap-1.5" title={t("fields.phone")}><Phone className="h-3.5 w-3.5 shrink-0" />{d.phone || <span className="italic text-[#94a3b8]">{t("drivers.notGiven")}</span>}</div>
                      <div className="flex items-center gap-1.5" title={t("fields.licenseNumber")}><IdCard className="h-3.5 w-3.5 shrink-0" />
                        {d.driverLicenseNumber
                          ? <span>{d.driverLicenseNumber}{d.licenseExpiry ? ` · ${t("fields.licenseExpiry")} ${d.licenseExpiry}` : ` · ${t("drivers.noExpiry")}`}</span>
                          : <span className="italic text-[#94a3b8]">{t("drivers.noLicense")}</span>}
                      </div>
                    </dl>
                    {/* The car this driver is in right now; click the plate to open that reservation. */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid={`driver-cars-${d.id}`}>
                      {drivingNow(d.id).length === 0
                        ? <span className="inline-flex items-center gap-1 text-xs text-[#94a3b8]"><Car className="h-3.5 w-3.5" />{t("drivers.noCar")}</span>
                        : drivingNow(d.id).map((r) => (
                          <button key={r.id} type="button" onClick={() => openReservation(r.id)} className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0fb] py-0.5 pl-1 pr-2.5 text-xs text-[#1a1d62] hover:bg-[#dfe3f7]" title={`${r.vehicle?.brand ?? ""} ${r.vehicle?.model ?? ""}`.trim()}>
                            {r.vehicle?.licensePlate ? <Plate value={r.vehicle.licensePlate} /> : `#${r.id}`}
                            <span className="truncate max-w-[9rem]">{r.vehicle ? `${r.vehicle.brand} ${r.vehicle.model}` : ""}</span>
                          </button>
                        ))}
                      {/* View only: opens the fines list filtered on this driver. */}
                      {openFinesOf(d.id).length > 0 && (
                        <button type="button" onClick={() => openList("fines", { query: d.displayName })} title={t("drivers.viewFines")} className="inline-flex items-center gap-1 rounded-full bg-[#fde8e8] px-2.5 py-0.5 text-xs font-medium text-[#a32d2d] hover:bg-[#f9d5d5]" data-testid={`driver-fines-${d.id}`}>
                          <Receipt className="h-3.5 w-3.5" />{t("drivers.openFines", { count: openFinesOf(d.id).length })}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {canAssign && d.status === "active" && carsOf(reservations, d.id).length === 0 && <Button size="sm" variant="outline" className={btnSecondary} onClick={() => setAssigning(d)} data-testid={`button-assign-car-${d.id}`}><Car className="mr-1 h-4 w-4" />{t("drivers.assignToCar")}</Button>}
                  {historyCount(d.id) > 0 && <Button size="sm" variant="outline" className={btnSecondary} onClick={() => setHistoryOf(d)} data-testid={`button-driver-history-${d.id}`}><History className="mr-1 h-4 w-4" />{t("drivers.history", { count: historyCount(d.id) })}</Button>}
                  {d.hasLicenseFile && <Button size="sm" variant="ghost" onClick={() => preview.open(`/api/portal/drivers/${d.id}/license`, `${t("actions.viewLicense")} · ${d.displayName}`)}><FileText className="mr-1 h-4 w-4" />{t("actions.viewLicense")}</Button>}
                  <DriverFormDialog driver={d}><Button size="sm" variant="outline" className={btnSecondary}>{t("actions.edit")}</Button></DriverFormDialog>
                  <Button size="sm" variant="outline" className={btnSecondary} onClick={() => toggle.mutate(d)}>{d.status === "active" ? t("actions.deactivate") : t("actions.activate")}</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      {assigning && <AssignVehicleDialog driver={assigning} open onOpenChange={(o) => { if (!o) setAssigning(null); }} />}
      {historyOf && <DriverHistoryDialog driver={historyOf} reservations={reservations} open onOpenChange={(o) => { if (!o) setHistoryOf(null); }} />}
      {preview.dialog}
    </div>
  );
}
