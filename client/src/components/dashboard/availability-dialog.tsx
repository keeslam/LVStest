/**
 * Punt 14 (Kees, 2026-10-20) — "Beschikbaarheid" from the dashboard's quick
 * actions: which cars are free for a period, grouped by type, and when the
 * busy ones are free again. Read-only; "Reserveren" opens the booking form
 * with the car and the period filled in. Free means exactly what booking uses
 * (GET /api/vehicles/availability-board).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReservationAddDialog } from "@/components/reservations/reservation-add-dialog";
import { RequiresPermission } from "@/components/ui/requires-permission";
import { formatFuelLevel, formatLicensePlate, formatVehicleType } from "@/lib/format-utils";
import { officeToday } from "@/lib/office-date";
import { formatDutchDate } from "@shared/booking-warnings";
import { UserPermission } from "@shared/schema";

interface AvailabilityRow {
  id: number;
  licensePlate: string;
  brand: string;
  model: string;
  vehicleType: string | null;
  currentMileage: number | null;
  currentFuelLevel: string | null;
  apkDate: string | null;
  apkExpiresInPeriod: boolean;
  freeKmPerDay: number | null;
  maintenancePlanned: boolean;
  freeFrom?: string | null;
  freeUntil?: string;
}

interface AvailabilityBoard { startDate: string; endDate: string; free: AvailabilityRow[]; busy: AvailabilityRow[] }

function plusDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function AvailabilityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("dashboard");
  const today = officeToday();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(plusDays(today, 3));
  const [type, setType] = useState("all");
  const [reserve, setReserve] = useState<AvailabilityRow | null>(null);

  const validPeriod = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= startDate;
  const url = `/api/vehicles/availability-board?startDate=${startDate}&endDate=${endDate}`;
  const { data, isLoading, isError } = useQuery<AvailabilityBoard>({ queryKey: [url], enabled: open && validPeriod });
  // The type is filtered here, on the full answer, so choosing a type never empties the list of types.
  const types = useMemo(() => {
    const set = new Set<string>();
    for (const r of [...(data?.free ?? []), ...(data?.busy ?? [])]) if (r.vehicleType) set.add(r.vehicleType);
    return Array.from(set).sort((a, b) => formatVehicleType(a).localeCompare(formatVehicleType(b)));
  }, [data]);

  const ofType = (r: AvailabilityRow) => type === "all" || (r.vehicleType ?? "").toLowerCase() === type.toLowerCase();
  const free = (data?.free ?? []).filter(ofType);
  const busy = (data?.busy ?? []).filter(ofType);
  const groups = useMemo(() => {
    const map = new Map<string, AvailabilityRow[]>();
    for (const r of free) {
      const key = r.vehicleType || t("availabilityDialog.noType");
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return Array.from(map.entries()).sort((a, b) => formatVehicleType(a[0]).localeCompare(formatVehicleType(b[0])));
  }, [free, t]);

  const details = (r: AvailabilityRow) => (
    <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
      {r.currentMileage != null && <span>{r.currentMileage.toLocaleString("nl-NL")} km</span>}
      {r.currentFuelLevel && <span>{t("availabilityDialog.fuel", { level: formatFuelLevel(r.currentFuelLevel) })}</span>}
      {r.freeKmPerDay != null && <span>{t("availabilityDialog.freeKm", { km: r.freeKmPerDay })}</span>}
    </div>
  );
  const badges = (r: AvailabilityRow) => (
    <>
      {r.apkExpiresInPeriod && (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100" data-testid={`badge-apk-${r.id}`}>
          {t(r.apkDate && r.apkDate.slice(0, 10) < today ? "availabilityDialog.apkExpiredBadge" : "availabilityDialog.apkBadge", { date: formatDutchDate(r.apkDate?.slice(0, 10)) })}
        </Badge>
      )}
      {r.maintenancePlanned && (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1" data-testid={`badge-maintenance-${r.id}`}>
          <Wrench className="h-3 w-3" />
          {t("availabilityDialog.maintenanceBadge")}
        </Badge>
      )}
    </>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-availability">
          <DialogHeader>
            <DialogTitle>{t("availabilityDialog.title")}</DialogTitle>
            <DialogDescription>{t("availabilityDialog.description")}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="avail-start">{t("availabilityDialog.from")}</Label>
              <Input id="avail-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-availability-start" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="avail-end">{t("availabilityDialog.until")}</Label>
              <Input id="avail-end" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-availability-end" />
            </div>
            <div className="space-y-1">
              <Label>{t("availabilityDialog.type")}</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger data-testid="select-availability-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("availabilityDialog.allTypes")}</SelectItem>
                  {types.map((ty) => <SelectItem key={ty} value={ty}>{formatVehicleType(ty)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!validPeriod ? (
            <p className="text-sm text-red-600">{t("availabilityDialog.invalidPeriod")}</p>
          ) : isLoading ? (
            <p className="text-sm text-gray-500">{t("availabilityDialog.loading")}</p>
          ) : isError ? (
            <p className="text-sm text-red-600">{t("availabilityDialog.loadFailed")}</p>
          ) : (
            <div className="space-y-5">
              <section data-testid="availability-free">
                <h3 className="font-semibold text-green-700">
                  {t("availabilityDialog.freeTitle", { count: free.length, from: formatDutchDate(startDate), until: formatDutchDate(endDate) })}
                </h3>
                {free.length === 0 ? (
                  <p className="text-sm text-gray-500 mt-1">{t("availabilityDialog.noneFree")}</p>
                ) : groups.map(([groupType, rows]) => (
                  <div key={groupType} className="mt-3">
                    <p className="text-sm font-medium text-gray-700">{formatVehicleType(groupType)} <span className="text-gray-400">({rows.length})</span></p>
                    <ul className="mt-1 divide-y rounded-md border">
                      {rows.map((r) => (
                        <li key={r.id} className="flex items-center gap-3 p-2" data-testid={`availability-free-${r.id}`}>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{formatLicensePlate(r.licensePlate)}</span>
                              <span className="text-sm text-gray-600 truncate">{r.brand} {r.model}</span>
                              {badges(r)}
                            </div>
                            {details(r)}
                          </div>
                          <RequiresPermission anyOf={[UserPermission.MANAGE_RESERVATIONS]}>
                            <Button size="sm" variant="outline" onClick={() => setReserve(r)} data-testid={`button-availability-reserve-${r.id}`}>
                              {t("availabilityDialog.reserve")}
                            </Button>
                          </RequiresPermission>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>

              {busy.length > 0 && (
                <section data-testid="availability-busy">
                  <h3 className="font-semibold text-gray-700">{t("availabilityDialog.busyTitle", { count: busy.length })}</h3>
                  <ul className="mt-2 divide-y rounded-md border">
                    {busy.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 p-2" data-testid={`availability-busy-${r.id}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{formatLicensePlate(r.licensePlate)}</span>
                            <span className="text-sm text-gray-600 truncate">{r.brand} {r.model}</span>
                            {r.vehicleType && <span className="text-xs text-gray-400">{formatVehicleType(r.vehicleType)}</span>}
                            {badges(r)}
                          </div>
                          {details(r)}
                        </div>
                        <span className="text-sm whitespace-nowrap text-gray-700" data-testid={`availability-busy-when-${r.id}`}>
                          {r.freeUntil
                            ? t("availabilityDialog.freeUntil", { date: formatDutchDate(r.freeUntil) })
                            : r.freeFrom
                              ? t("availabilityDialog.freeFrom", { date: formatDutchDate(r.freeFrom) })
                              : t("availabilityDialog.freeFromUnknown")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {reserve && (
        <ReservationAddDialog
          open={!!reserve}
          onOpenChange={(o) => { if (!o) setReserve(null); }}
          initialVehicleId={String(reserve.id)}
          initialStartDate={startDate}
          initialEndDate={endDate}
          onSuccess={() => setReserve(null)}
        />
      )}
    </>
  );
}
