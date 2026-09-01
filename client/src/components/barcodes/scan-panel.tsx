import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Truck, CalendarRange, User, RotateCcw, CalendarPlus, ShieldCheck, FileCheck, LogOut, LogIn, Receipt, Wrench, ChevronDown, ChevronUp, History, Car, FileUp, Undo2, Check, Play, Fuel, Gauge } from "lucide-react";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { formatDate, formatLicensePlate } from "@/lib/format-utils";
import { isTrueValue } from "@/lib/utils";
import { BarcodeSvg } from "@/components/barcodes/barcode-svg";
import { CameraScannerDialog } from "@/components/barcodes/camera-scanner-dialog";
import { ReservationAddDialog } from "@/components/reservations/reservation-add-dialog";
import { PickupDialog, ReturnDialog } from "@/components/reservations/pickup-return-dialogs";
import { ScheduleMaintenanceDialog } from "@/components/maintenance/schedule-maintenance-dialog";
import { ExpenseAddDialog } from "@/components/expenses/expense-add-dialog";
import { InlineDocumentUpload } from "@/components/documents/inline-document-upload";
import { FuelStatusUpdateDialog } from "@/components/vehicles/fuel-status-update-dialog";
import { MileageUpdateDialog } from "@/components/vehicles/mileage-update-dialog";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Vehicle, Reservation, ScanEvent } from "@shared/schema";

// The lookup endpoint projects reservations down to only what this panel
// renders (see server/routes.ts GET /api/barcodes/:code) to avoid leaking
// full customer PII to a vehicle-permission-gated endpoint.
type ScanReservation = {
  id: number;
  status: string;
  startDate: string;
  endDate: string | null;
  customer: { name: string } | null;
};

// Same projection shape as ScanReservation above — no customer/driver PII, just
// enough to show and advance the transport from the scan card.
type ScanTransport = {
  id: number;
  status: string;
  transportType: string;
  scheduledDate: string;
  originCity: string | null;
  destinationCity: string | null;
};

// Open maintenance block for the scanned vehicle (projection, no PII).
type ScanMaintenance = {
  id: number;
  startDate: string;
  endDate: string | null;
  maintenanceStatus: string | null;
  maintenanceCategory: string | null;
};

type LookupResult =
  | { type: "vehicle"; vehicle: Vehicle; activeReservation: ScanReservation | null; upcomingReservation: ScanReservation | null; activeTransport: ScanTransport | null; activeMaintenance: ScanMaintenance | null; scannedSpareKey?: boolean }
  | { type: "reservation"; reservation: ScanReservation; vehicle: Vehicle | null };

// Square, touch-friendly tiles for the scan card's action row: icon above
// label, easy to hit on tablets at the key cabinet.
const ACTION_TILE_CLASS =
  "h-auto w-full flex-col gap-2 py-4 px-2 text-sm font-medium whitespace-normal text-center [&_svg]:size-8";

interface ScanPanelProps {
  /** Whether this panel instance is the currently-visible one (mounted-but-hidden
   * dialogs/pages should pass false so focus/reset effects don't fight each other). */
  active?: boolean;
}

// Shared scan UI + lookup logic used by both the standalone /scan page and the
// ScanDialog. Keeping this framework-agnostic (no Dialog imports) lets each
// host wrap it in whatever chrome it needs.
export function ScanPanel({ active = true }: ScanPanelProps) {
  const { t } = useTranslation(["barcodes", "common"]);
  const { openVehicleDialog, openReservationDialog } = useGlobalDialog();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mileageOpen, setMileageOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [handoverReservation, setHandoverReservation] = useState<Reservation | null>(null);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // "Naar onderhoud" opens the real maintenance scheduler so the workshop
  // visit lands on the maintenance calendar as a trackable maintenance_block.
  // "Onderhoudsblok openen" reuses the same scheduler in edit mode with the
  // full block row (the scan payload only carries a projection).
  const [scheduleMaintenanceOpen, setScheduleMaintenanceOpen] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState<Reservation | null>(null);

  const openMaintenanceBlock = async (reservationId: number) => {
    try {
      const response = await fetch(`/api/reservations/${reservationId}`, { credentials: "include" });
      if (!response.ok) throw new Error();
      setEditingMaintenance(await response.json());
      setScheduleMaintenanceOpen(true);
    } catch {
      setError(t("scanPage.lookupError"));
    }
  };
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: recentScans } = useQuery<ScanEvent[]>({
    queryKey: ["/api/scan-events"],
    enabled: active,
  });

  // USB/Bluetooth scanners emulate a keyboard: focus the field when this panel
  // becomes active so a scan lands here without a click. Refocus after each
  // lookup for repeat scans.
  useEffect(() => {
    if (active) {
      inputRef.current?.focus();
    }
  }, [result, error, active]);

  // Reset stale state every time this panel becomes active again.
  useEffect(() => {
    if (active) {
      setResult(null);
      setError(null);
      setCode("");
    }
  }, [active]);

  const lookup = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/barcodes/${encodeURIComponent(trimmed)}`, { credentials: "include" });
      if (response.status === 404) {
        setError(t("scanPage.notFound", { code: trimmed }));
        return;
      }
      if (!response.ok) {
        setError(t("scanPage.lookupError"));
        return;
      }
      setResult(await response.json());
    } catch {
      setError(t("scanPage.lookupError"));
    } finally {
      setIsLoading(false);
      setCode("");
      invalidateByPrefix("/api/scan-events");
    }
  };

  // Scanners terminate with Enter; the form submit catches both scanner and
  // manual entry without a page reload.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookup(code);
  };

  // The scan card only holds the PII-projected reservation; the handover
  // dialogs need the full row, so fetch it when the user asks for one.
  const startHandover = async (reservationId: number, kind: "pickup" | "return") => {
    try {
      const response = await fetch(`/api/reservations/${reservationId}`, { credentials: "include" });
      if (!response.ok) throw new Error();
      const full = await response.json();
      setHandoverReservation(full);
      if (kind === "pickup") setPickupOpen(true); else setReturnOpen(true);
    } catch {
      setError(t("scanPage.lookupError"));
    }
  };

  const maintenanceMutation = useMutation({
    mutationFn: async (vars: { vehicleId: number; status: "ok" | "in_service" }) => {
      const response = await apiRequest("PATCH", `/api/vehicles/${vars.vehicleId}/maintenance-status`, { status: vars.status });
      return response.json();
    },
    onSuccess: (_data, vars) => {
      invalidateByPrefix("/api/vehicles");
      toast({ title: t(vars.status === "in_service" ? "scanPage.actions.maintenanceStarted" : "scanPage.actions.maintenanceEnded") });
      // refresh the card
      if (result?.type === "vehicle" && result.vehicle.barcode) lookup(result.vehicle.barcode);
    },
    onError: (error: Error) => toast({ title: t("scanPage.actions.maintenanceError"), description: error.message, variant: "destructive" }),
  });

  const transportMutation = useMutation({
    mutationFn: async (vars: { id: number; status: string }) => {
      const response = await apiRequest("PATCH", `/api/transports/${vars.id}`, { status: vars.status });
      return response.json();
    },
    onSuccess: (_data, vars) => {
      invalidateByPrefix("/api/transports");
      toast({ title: t(vars.status === "in_progress" ? "scanPage.transport.started" : "scanPage.transport.completed") });
      // refresh the card
      if (result?.type === "vehicle" && result.vehicle.barcode) lookup(result.vehicle.barcode);
    },
    onError: (error: Error) => toast({ title: t("scanPage.transport.error"), description: error.message, variant: "destructive" }),
  });

  const statusBadge = (vehicle: Vehicle) => {
    const status = vehicle.availabilityStatus || "available";
    const variant = status === "available" ? "default" : status === "rented" ? "destructive" : "secondary";
    return <Badge variant={variant}>{t(`scanPage.status.${status}`, { defaultValue: status })}</Badge>;
  };

  const reservationCard = (reservation: ScanReservation, headingKey: string) => (
    <div className="border rounded-md p-4 space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">{t(headingKey)}</h3>
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-primary" />
        <span>{reservation.customer?.name || "-"}</span>
        <Badge variant="outline">{t(`scanPage.reservationStatus.${reservation.status}`, { defaultValue: reservation.status })}</Badge>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarRange className="h-4 w-4" />
        <span>
          {formatDate(reservation.startDate)} — {reservation.endDate ? formatDate(reservation.endDate) : t("scanPage.openEnded")}
        </span>
      </div>
      <Button size="sm" onClick={() => openReservationDialog(reservation.id)} data-testid={`button-open-reservation-${reservation.id}`}>
        {t("scanPage.openReservationButton")}
      </Button>
    </div>
  );

  return (
    <>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("scanPage.inputPlaceholder")}
          aria-label={t("scanPage.inputPlaceholder")}
          autoComplete="off"
          autoFocus
          className="text-lg"
          data-testid="input-barcode-scan"
        />
        <Button type="submit" disabled={isLoading || !code.trim()}>
          {isLoading ? t("scanPage.scanning") : t("scanPage.searchButton")}
        </Button>
        <Button type="button" variant="outline" onClick={() => setCameraOpen(true)} title={t("scanPage.cameraButton")} aria-label={t("scanPage.cameraButton")}>
          <Camera className="h-4 w-4" />
        </Button>
      </form>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-md p-4" role="alert" data-testid="scan-error">
          {error}
        </div>
      )}

      {result?.type === "vehicle" && (
        <Card data-testid="scan-result-vehicle">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary" />
                {result.vehicle.brand} {result.vehicle.model}
              </span>
              <span className="flex items-center gap-2">
                {result.scannedSpareKey && (
                  <Badge className="bg-amber-100 text-amber-800">{t("scanPage.spareKeyBadge")}</Badge>
                )}
                {statusBadge(result.vehicle)}
              </span>
            </CardTitle>
            <CardDescription>
              {t("scanPage.licensePlateLabel")}: {formatLicensePlate(result.vehicle.licensePlate)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.vehicle.barcode && <BarcodeSvg value={result.vehicle.barcode} height={40} />}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm border rounded-md p-3">
              <div>
                <div className="text-muted-foreground flex items-center gap-1">
                  <FileCheck className="h-3.5 w-3.5" />
                  {t("scanPage.apkLabel")}
                </div>
                <div className="font-medium">
                  {result.vehicle.apkDate ? formatDate(result.vehicle.apkDate) : t("scanPage.notAvailable")}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t("scanPage.warrantyLabel")}
                </div>
                <div className="font-medium">
                  {result.vehicle.warrantyEndDate ? formatDate(result.vehicle.warrantyEndDate) : t("scanPage.notAvailable")}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground flex items-center gap-1">
                  <Gauge className="h-3.5 w-3.5" />
                  {t("scanPage.mileageLabel")}
                </div>
                <div className="font-medium" data-testid="text-scan-mileage">
                  {result.vehicle.currentMileage != null ? `${result.vehicle.currentMileage.toLocaleString()} km` : t("scanPage.notAvailable")}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground flex items-center gap-1">
                  <Fuel className="h-3.5 w-3.5" />
                  {t("scanPage.fuelLabel")}
                </div>
                <div className="font-medium" data-testid="text-scan-fuel">
                  {result.vehicle.currentFuelLevel || t("scanPage.notAvailable")}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">{t("scanPage.registrationLabel")}</div>
                <div>
                  {isTrueValue(result.vehicle.registeredTo) ? (
                    <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50">{t("scanPage.opnaamBadge")}</Badge>
                  ) : isTrueValue(result.vehicle.company) ? (
                    <Badge className="bg-green-50 text-green-700 hover:bg-green-50">{t("scanPage.companyBadge")}</Badge>
                  ) : (
                    <span className="font-medium">{t("scanPage.notAvailable")}</span>
                  )}
                </div>
              </div>
            </div>

            {result.activeReservation
              ? reservationCard(result.activeReservation, "scanPage.activeReservation")
              : result.upcomingReservation
                ? reservationCard(result.upcomingReservation, "scanPage.upcomingReservation")
                : <p className="text-muted-foreground text-sm">{t("scanPage.noReservation")}</p>}

            {(result.activeMaintenance || (result.vehicle.maintenanceStatus && result.vehicle.maintenanceStatus !== "ok")) && (
              <div className="border border-amber-200 bg-amber-50 rounded-md p-4 space-y-2">
                <h3 className="text-sm font-medium text-amber-800 flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  {t("scanPage.maintenance.heading")}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-sm text-amber-900">
                  {result.vehicle.maintenanceStatus && result.vehicle.maintenanceStatus !== "ok" && (
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                      {t(`scanPage.maintenance.vehicleStatus.${result.vehicle.maintenanceStatus}`, { defaultValue: result.vehicle.maintenanceStatus })}
                    </Badge>
                  )}
                  {result.activeMaintenance && (
                    <>
                      {result.activeMaintenance.maintenanceStatus && (
                        <Badge variant="outline" className="border-amber-300 text-amber-800">
                          {t(`scanPage.maintenance.blockStatus.${result.activeMaintenance.maintenanceStatus}`, { defaultValue: result.activeMaintenance.maintenanceStatus })}
                        </Badge>
                      )}
                      <span>
                        {formatDate(result.activeMaintenance.startDate)}
                        {result.activeMaintenance.endDate ? ` — ${formatDate(result.activeMaintenance.endDate)}` : ""}
                      </span>
                    </>
                  )}
                </div>
                {result.activeMaintenance && (
                  <Button size="sm" variant="outline" className="border-amber-300" onClick={() => openMaintenanceBlock(result.activeMaintenance!.id)} data-testid="button-scan-open-maintenance">
                    {t("scanPage.maintenance.openButton")}
                  </Button>
                )}
              </div>
            )}

            {result.activeTransport && (
              <div className="border rounded-md p-4 space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">{t("scanPage.transport.heading")}</h3>
                <div className="flex items-center gap-2 text-sm">
                  <Truck className="h-4 w-4 text-primary" />
                  <span>{result.activeTransport.originCity || "?"} → {result.activeTransport.destinationCity || "?"}</span>
                  <Badge variant="outline">{t(`scanPage.transport.status.${result.activeTransport.status}`, { defaultValue: result.activeTransport.status })}</Badge>
                </div>
                <Button size="sm" onClick={() => transportMutation.mutate({ id: result.activeTransport!.id, status: result.activeTransport!.status === "scheduled" ? "in_progress" : "completed" })} disabled={transportMutation.isPending} data-testid="button-scan-transport-advance">
                  {result.activeTransport.status === "scheduled" ? (
                    <Play className="h-4 w-4 mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  {result.activeTransport.status === "scheduled" ? t("scanPage.transport.start") : t("scanPage.transport.complete")}
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t">
              <Button className={ACTION_TILE_CLASS} onClick={() => openVehicleDialog(result.vehicle.id)} data-testid="button-open-vehicle">
                <Car />
                {t("scanPage.openVehicleButton")}
              </Button>
              {!result.activeReservation && !result.upcomingReservation && (
                <ReservationAddDialog initialVehicleId={String(result.vehicle.id)}>
                  <Button variant="outline" className={ACTION_TILE_CLASS} data-testid="button-make-reservation">
                    <CalendarPlus />
                    {t("scanPage.makeReservationButton")}
                  </Button>
                </ReservationAddDialog>
              )}
              {result.activeReservation?.status === "picked_up" && (
                <Button variant="default" className={ACTION_TILE_CLASS} onClick={() => startHandover(result.activeReservation!.id, "return")} data-testid="button-scan-return">
                  <LogIn />
                  {t("scanPage.actions.startReturn")}
                </Button>
              )}
              {result.activeReservation && result.activeReservation.status !== "picked_up" && (
                <Button variant="default" className={ACTION_TILE_CLASS} onClick={() => startHandover(result.activeReservation!.id, "pickup")} data-testid="button-scan-pickup">
                  <LogOut />
                  {t("scanPage.actions.startPickup")}
                </Button>
              )}
              {!result.activeReservation && result.upcomingReservation && (
                <Button variant="default" className={ACTION_TILE_CLASS} onClick={() => startHandover(result.upcomingReservation!.id, "pickup")} data-testid="button-scan-pickup">
                  <LogOut />
                  {t("scanPage.actions.startPickup")}
                </Button>
              )}
              <ExpenseAddDialog vehicleId={result.vehicle.id}>
                <Button variant="outline" className={ACTION_TILE_CLASS} data-testid="button-scan-expense">
                  <Receipt />
                  {t("scanPage.actions.addExpense")}
                </Button>
              </ExpenseAddDialog>
              <InlineDocumentUpload vehicleId={result.vehicle.id} reservationId={result.activeReservation?.id}>
                <Button variant="outline" className={ACTION_TILE_CLASS} data-testid="button-scan-upload">
                  <FileUp />
                  {t("scanPage.actions.uploadDocument")}
                </Button>
              </InlineDocumentUpload>
              <FuelStatusUpdateDialog
                key={`fuel-${result.vehicle.id}-${result.vehicle.currentFuelLevel ?? ""}`}
                vehicleId={result.vehicle.id}
                currentFuelLevel={result.vehicle.currentFuelLevel || undefined}
                onSuccess={() => { if (result.vehicle.barcode) lookup(result.vehicle.barcode); }}
              >
                <Button variant="outline" className={ACTION_TILE_CLASS} data-testid="button-scan-fuel">
                  <Fuel />
                  {t("scanPage.actions.updateFuel")}
                </Button>
              </FuelStatusUpdateDialog>
              <Button variant="outline" className={ACTION_TILE_CLASS} onClick={() => setMileageOpen(true)} data-testid="button-scan-mileage">
                <Gauge />
                {t("scanPage.actions.updateMileage")}
              </Button>
              {(result.vehicle.maintenanceStatus === "ok" || !result.vehicle.maintenanceStatus) ? (
                <Button variant="outline" className={ACTION_TILE_CLASS} onClick={() => { setEditingMaintenance(null); setScheduleMaintenanceOpen(true); }} data-testid="button-scan-maintenance-start">
                  <Wrench />
                  {t("scanPage.actions.startMaintenance")}
                </Button>
              ) : (
                <Button variant="outline" className={ACTION_TILE_CLASS} onClick={() => maintenanceMutation.mutate({ vehicleId: result.vehicle.id, status: "ok" })} disabled={maintenanceMutation.isPending} data-testid="button-scan-maintenance-end">
                  <Undo2 />
                  {t("scanPage.actions.endMaintenance")}
                </Button>
              )}
              <Button variant="outline" className={ACTION_TILE_CLASS} onClick={() => { setResult(null); inputRef.current?.focus(); }}>
                <RotateCcw />
                {t("scanPage.scanAgain")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result?.type === "reservation" && (
        <Card data-testid="scan-result-reservation">
          <CardHeader>
            <CardTitle>{t("scanPage.reservationFound")}</CardTitle>
            {result.vehicle && (
              <CardDescription>
                {result.vehicle.brand} {result.vehicle.model} ({formatLicensePlate(result.vehicle.licensePlate)})
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {reservationCard(result.reservation, "scanPage.reservationFound")}
            {result.vehicle && (
              <Button variant="outline" onClick={() => openVehicleDialog(result.vehicle!.id)}>
                {t("scanPage.openVehicleButton")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <CameraScannerDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onScan={lookup}
      />

      <div className="border rounded-md">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-between px-4 py-2 h-auto"
          onClick={() => setHistoryOpen((open) => !open)}
          data-testid="button-toggle-scan-history"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <History className="h-4 w-4" />
            {t("scanPage.history.title")}
          </span>
          {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        {historyOpen && (
          <div className="px-4 pb-3 space-y-1" data-testid="scan-history-list">
            {!recentScans || recentScans.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">{t("scanPage.history.empty")}</p>
            ) : (
              recentScans.map((scan) => (
                <div key={scan.id} className="flex items-center gap-3 py-1 text-sm border-t first:border-t-0">
                  <span className="text-muted-foreground tabular-nums">
                    {scan.createdAt ? format(new Date(scan.createdAt), "HH:mm") : "—"}
                  </span>
                  <span className="font-mono">{scan.code}</span>
                  <span className="text-muted-foreground">
                    {scan.licensePlate ? formatLicensePlate(scan.licensePlate) : t("scanPage.history.noMatch")}
                  </span>
                  {scan.scannedBy && <span className="ml-auto text-xs text-muted-foreground">{scan.scannedBy}</span>}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {handoverReservation && (
        <>
          <PickupDialog open={pickupOpen} onOpenChange={setPickupOpen} reservation={handoverReservation}
            onSuccess={() => { setPickupOpen(false); if (result?.type === "vehicle" && result.vehicle.barcode) lookup(result.vehicle.barcode); }} />
          <ReturnDialog open={returnOpen} onOpenChange={setReturnOpen} reservation={handoverReservation}
            onSuccess={() => { setReturnOpen(false); if (result?.type === "vehicle" && result.vehicle.barcode) lookup(result.vehicle.barcode); }} />
        </>
      )}

      {result?.type === "vehicle" && (
        <MileageUpdateDialog
          vehicleId={result.vehicle.id}
          currentMileage={result.vehicle.currentMileage}
          open={mileageOpen}
          onOpenChange={setMileageOpen}
          onSuccess={() => { if (result.vehicle.barcode) lookup(result.vehicle.barcode); }}
        />
      )}

      {result?.type === "vehicle" && (
        <ScheduleMaintenanceDialog
          open={scheduleMaintenanceOpen}
          onOpenChange={(open) => {
            setScheduleMaintenanceOpen(open);
            if (!open) setEditingMaintenance(null);
          }}
          editingReservation={editingMaintenance ?? undefined}
          initialVehicleId={result.vehicle.id}
          initialDate={format(new Date(), "yyyy-MM-dd")}
          onSuccess={() => {
            setScheduleMaintenanceOpen(false);
            setEditingMaintenance(null);
            invalidateByPrefix("/api/vehicles");
            invalidateByPrefix("/api/reservations");
            if (result.vehicle.barcode) lookup(result.vehicle.barcode);
          }}
        />
      )}
    </>
  );
}
