/**
 * Punt 14 (Kees, 2026-10-20) — "Beschikbaarheid" from the dashboard's quick
 * actions: which cars are free for a period, and when the busy ones are free
 * again. Read-only; "Reserveren" opens the booking form with the car and the
 * period filled in. Free means exactly what booking uses
 * (GET /api/vehicles/availability-board).
 *
 * Kees found the first version (every car as a card, grouped per type)
 * "super onoverzichtelijk"; he chose a compact table: tabs Vrij / Bezet, a
 * search on plate, brand or model, one line per car and 15 per page.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

const PAGE_SIZE = 15;

function plusDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Plate without dashes, brand and model, lower case: what the search box looks in. */
function haystack(r: AvailabilityRow): string {
  return `${r.licensePlate.replace(/-/g, "")} ${r.brand} ${r.model}`.toLowerCase();
}

export function AvailabilityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("dashboard");
  const today = officeToday();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(plusDays(today, 3));
  const [type, setType] = useState("all");
  const [tab, setTab] = useState<"free" | "busy">("free");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reserve, setReserve] = useState<AvailabilityRow | null>(null);

  const validPeriod = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= startDate;
  const url = `/api/vehicles/availability-board?startDate=${startDate}&endDate=${endDate}`;
  const { data, isLoading, isError } = useQuery<AvailabilityBoard>({ queryKey: [url], enabled: open && validPeriod });

  // The type list comes from the full answer, so choosing a type never empties it.
  const types = useMemo(() => {
    const set = new Set<string>();
    for (const r of [...(data?.free ?? []), ...(data?.busy ?? [])]) if (r.vehicleType) set.add(r.vehicleType);
    return Array.from(set).sort((a, b) => formatVehicleType(a).localeCompare(formatVehicleType(b)));
  }, [data]);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase().replace(/-/g, "");
    return (r: AvailabilityRow) =>
      (type === "all" || (r.vehicleType ?? "").toLowerCase() === type.toLowerCase())
      && (!needle || haystack(r).includes(needle));
  }, [type, search]);
  const free = useMemo(() => (data?.free ?? []).filter(matches), [data, matches]);
  const busy = useMemo(() => (data?.busy ?? []).filter(matches), [data, matches]);
  const rows = tab === "free" ? free : busy;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const shown = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [tab, type, search, startDate, endDate]);

  const labels = (r: AvailabilityRow) => (
    <div className="flex flex-wrap gap-1">
      {r.apkExpiresInPeriod && (
        <Badge
          className="bg-red-100 text-red-700 hover:bg-red-100 px-1.5 py-0 text-[11px] font-medium whitespace-nowrap"
          title={formatDutchDate(r.apkDate?.slice(0, 10))}
          data-testid={`badge-apk-${r.id}`}
        >
          {r.apkDate && r.apkDate.slice(0, 10) < today
            ? t("availabilityDialog.apkExpiredShort")
            : t("availabilityDialog.apkBadge", { date: formatDutchDate(r.apkDate?.slice(0, 10)) })}
        </Badge>
      )}
      {r.maintenancePlanned && (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1 px-1.5 py-0 text-[11px] font-medium whitespace-nowrap" data-testid={`badge-maintenance-${r.id}`}>
          <Wrench className="h-3 w-3" />
          {t("availabilityDialog.maintenanceBadge")}
        </Badge>
      )}
    </div>
  );

  const tabButton = (value: "free" | "busy", count: number) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
      aria-pressed={tab === value}
      data-testid={`tab-availability-${value}`}
    >
      {t(value === "free" ? "availabilityDialog.tabFree" : "availabilityDialog.tabBusy", { count })}
    </button>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[min(95vw,90rem)] max-h-[90vh] overflow-y-auto" data-testid="dialog-availability">
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
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {tabButton("free", free.length)}
                {tabButton("busy", busy.length)}
                <div className="relative ml-auto w-full sm:w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
                  <Input
                    className="pl-8 h-9"
                    placeholder={t("availabilityDialog.searchPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label={t("availabilityDialog.searchPlaceholder")}
                    data-testid="input-availability-search"
                  />
                </div>
              </div>

              {rows.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  {t(tab === "free" ? "availabilityDialog.noneFree" : "availabilityDialog.noneBusy")}
                </p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table data-testid={`table-availability-${tab}`}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("availabilityDialog.colPlate")}</TableHead>
                        <TableHead>{t("availabilityDialog.colModel")}</TableHead>
                        <TableHead>{t("availabilityDialog.colType")}</TableHead>
                        <TableHead className="text-right">{t("availabilityDialog.colKm")}</TableHead>
                        <TableHead>{t("availabilityDialog.colFuel")}</TableHead>
                        <TableHead className="text-right">{t("availabilityDialog.colFreeKm")}</TableHead>
                        <TableHead>{t("availabilityDialog.colNotes")}</TableHead>
                        <TableHead className="text-right">{tab === "busy" ? t("availabilityDialog.colWhen") : ""}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shown.map((r) => (
                        <TableRow key={r.id} className="text-sm" data-testid={`availability-${tab}-${r.id}`}>
                          <TableCell className="py-1.5 font-medium whitespace-nowrap">{formatLicensePlate(r.licensePlate)}</TableCell>
                          <TableCell className="py-1.5 max-w-[12rem] lg:max-w-[22rem] truncate" title={`${r.brand} ${r.model}`}>{r.brand} {r.model}</TableCell>
                          <TableCell className="py-1.5 whitespace-nowrap text-gray-600">{r.vehicleType ? formatVehicleType(r.vehicleType) : "—"}</TableCell>
                          <TableCell className="py-1.5 text-right whitespace-nowrap">{r.currentMileage != null ? r.currentMileage.toLocaleString("nl-NL") : "—"}</TableCell>
                          <TableCell className="py-1.5 whitespace-nowrap">{r.currentFuelLevel ? formatFuelLevel(r.currentFuelLevel) : "—"}</TableCell>
                          <TableCell className="py-1.5 text-right whitespace-nowrap">{r.freeKmPerDay != null ? r.freeKmPerDay : "—"}</TableCell>
                          <TableCell className="py-1.5">{labels(r)}</TableCell>
                          <TableCell className="py-1.5 text-right whitespace-nowrap">
                            {tab === "free" ? (
                              <RequiresPermission anyOf={[UserPermission.MANAGE_RESERVATIONS]}>
                                <Button size="sm" variant="outline" className="h-7" onClick={() => setReserve(r)} data-testid={`button-availability-reserve-${r.id}`}>
                                  {t("availabilityDialog.reserve")}
                                </Button>
                              </RequiresPermission>
                            ) : (
                              <span data-testid={`availability-busy-when-${r.id}`}>
                                {r.freeUntil
                                  ? t("availabilityDialog.freeUntil", { date: formatDutchDate(r.freeUntil) })
                                  : r.freeFrom
                                    ? t("availabilityDialog.freeFrom", { date: formatDutchDate(r.freeFrom) })
                                    : t("availabilityDialog.freeFromUnknown")}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {pageCount > 1 && (
                <div className="flex items-center justify-end gap-2 text-sm" data-testid="availability-pager">
                  <span className="text-gray-500">{t("availabilityDialog.pageOf", { page: safePage, pages: pageCount })}</span>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label={t("availabilityDialog.prevPage")} data-testid="availability-prev-page">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} aria-label={t("availabilityDialog.nextPage")} data-testid="availability-next-page">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
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
