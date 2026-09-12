/**
 * OPT-001 — het werkdagscherm "Vandaag".
 *
 * What this screen replaces, measured in phase 21/22: five pages (`/`,
 * `/reservations` → "Vandaag" → the day dialog, `/delivery`, `/maintenance`,
 * `/portal-admin`), five clicks and ~20 MB of repeated downloads, every
 * morning, by every employee, to assemble a picture of one day. Here it is one
 * page and one request.
 *
 * What is on it is decided by `docs/audit/besluiten.md` **B-17** and by
 * nothing else. Under "Openstaande punten" stand exactly three things:
 *
 *   1. what must be picked up and returned today, with the button to do it;
 *   2. today's maintenance and transport, including the spares that still
 *      need a vehicle;
 *   3. the new portal requests waiting to be reviewed.
 *
 * A "te laat terug" list was considered and **rejected** by the owner: until
 * B-02's bulk close has cleared the historical rows it would be mostly noise.
 * It is therefore absent on purpose — not collapsed, not behind a tab.
 *
 * Every row acts where it stands, and always through the dialog that already
 * owns that action: the pickup and return dialogs (so B-16's "gaat de huur
 * eerder in?" and B-03's workshop refusal come along), the spare-assignment
 * dialog, the transport dialog, the portal request review. This screen adds no
 * second way to do anything.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarCheck,
  CheckCircle2,
  Inbox,
  LogIn,
  LogOut,
  RefreshCw,
  Truck,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { formatLicensePlate } from "@/lib/format-utils";
import { invalidateByPrefix } from "@/lib/queryClient";
import { useTodayBoard, localToday } from "@/hooks/use-today-board";
import {
  HandoverLauncher,
  type HandoverRequest,
} from "@/components/today/handover-launcher";
import { TransportLauncher } from "@/components/today/transport-launcher";
import type {
  TodayHandoverRow,
  TodayMaintenanceRow,
  TodayPortalRequestRow,
  TodaySpareRow,
  TodayTransportRow,
} from "@shared/today";

/** One row of the board: a line of text, and the button that does the thing. */
function WorkRow({
  testId,
  icon,
  title,
  subtitle,
  meta,
  actionLabel,
  onAction,
  actionTestId,
}: {
  testId: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string | null;
  meta?: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  actionTestId: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-md border p-3 hover:bg-gray-50"
      data-testid={testId}
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600">
        {icon}
      </div>
      <div className="min-w-0 flex-grow">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900">{title}</span>
          {meta}
        </div>
        {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
      </div>
      <Button size="sm" onClick={onAction} data-testid={actionTestId} className="flex-shrink-0">
        {actionLabel}
      </Button>
    </div>
  );
}

/** One of B-17's three groups. Never rendered when it holds nothing. */
function Group({
  testId,
  title,
  count,
  children,
}: {
  testId: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        <Badge variant="secondary">{count}</Badge>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">{children}</CardContent>
    </Card>
  );
}

function plate(value: string | null): string {
  return value ? formatLicensePlate(value) : "—";
}

export default function TodayPage() {
  const { t } = useTranslation("dashboard");
  const date = localToday();
  const { data: board, isLoading, error, refetch, isFetching } = useTodayBoard(date);
  const { openSpareAssignmentDialog, openPortalRequestDialog, openReservationDialog } =
    useGlobalDialog();

  const [handover, setHandover] = useState<HandoverRequest | null>(null);
  const [transportId, setTransportId] = useState<number | null>(null);

  // After a handover the board itself is stale, and so is everything the
  // handover touched. One prefix invalidation each, the way the rest of the
  // app does it.
  const refreshAfterAction = () => {
    invalidateByPrefix("/api/today");
    invalidateByPrefix("/api/reservations");
    invalidateByPrefix("/api/vehicles");
  };

  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-xl font-semibold" data-testid="today-title">
          {t("today.title")}
        </h2>
        <p className="text-sm text-gray-500" data-testid="today-date">
          {format(parseISO(date), "EEEE d MMMM yyyy", { locale: nl })}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => refetch()}
        disabled={isFetching}
        data-testid="button-today-refresh"
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        {t("today.refresh")}
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="today-loading">
        {heading}
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="space-y-6">
        {heading}
        <QueryErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  const handoverRow = (row: TodayHandoverRow) => {
    const isReturn = row.handover === "return";
    return (
      <WorkRow
        key={`${row.handover}-${row.id}`}
        testId={`today-${row.handover}-${row.id}`}
        icon={isReturn ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
        title={plate(row.licensePlate)}
        subtitle={
          [row.vehicleLabel, row.customerName].filter(Boolean).join(" · ") ||
          t("today.unknownCustomer")
        }
        meta={
          <>
            {(isReturn ? row.endTime : row.startTime) && (
              <Badge variant="outline" className="tabular-nums">
                {isReturn ? row.endTime : row.startTime}
              </Badge>
            )}
            {row.placeholderSpare && (
              <Badge variant="outline">{t("today.spareTbdBadge")}</Badge>
            )}
            {row.contractNumber && (
              <span className="text-xs text-gray-400">{row.contractNumber}</span>
            )}
          </>
        }
        actionLabel={isReturn ? t("today.startReturn") : t("today.startPickup")}
        actionTestId={`button-today-${row.handover}-${row.id}`}
        onAction={() => setHandover({ reservationId: row.id, kind: row.handover })}
      />
    );
  };

  const maintenanceRow = (row: TodayMaintenanceRow) => (
    <WorkRow
      key={`maintenance-${row.id}`}
      testId={`today-maintenance-${row.id}`}
      icon={<Wrench className="h-4 w-4" />}
      title={plate(row.licensePlate)}
      subtitle={
        [row.vehicleLabel, row.customerName].filter(Boolean).join(" · ") || undefined
      }
      meta={
        <Badge variant={row.maintenanceStatus === "in" ? "default" : "outline"}>
          {row.maintenanceStatus === "in"
            ? t("today.maintenanceIn")
            : t("today.maintenanceScheduled")}
        </Badge>
      }
      actionLabel={t("today.openMaintenance")}
      actionTestId={`button-today-maintenance-${row.id}`}
      onAction={() => openReservationDialog(row.id)}
    />
  );

  const transportRow = (row: TodayTransportRow) => (
    <WorkRow
      key={`transport-${row.id}`}
      testId={`today-transport-${row.id}`}
      icon={<Truck className="h-4 w-4" />}
      title={plate(row.licensePlate)}
      subtitle={[row.route, row.driverName, row.customerName].filter(Boolean).join(" · ") || undefined}
      meta={
        <>
          <Badge variant="outline">{t(`today.transportType.${row.transportType}`, { defaultValue: row.transportType })}</Badge>
          {row.spareTbd && (
            <Badge variant="destructive" data-testid={`today-transport-spare-tbd-${row.id}`}>
              {t("today.spareTbdBadge")}
            </Badge>
          )}
        </>
      }
      actionLabel={t("today.openTransport")}
      actionTestId={`button-today-transport-${row.id}`}
      onAction={() => setTransportId(row.id)}
    />
  );

  const spareRow = (row: TodaySpareRow) => (
    <WorkRow
      key={`spare-${row.id}`}
      testId={`today-spare-${row.id}`}
      icon={<ArrowRightLeft className="h-4 w-4" />}
      title={
        row.originalLicensePlate
          ? t("today.spareFor", { plate: formatLicensePlate(row.originalLicensePlate) })
          : t("today.spareTbdBadge")
      }
      subtitle={row.customerName ?? t("today.unknownCustomer")}
      meta={
        <Badge variant="destructive">{t("today.spareNeedsVehicle")}</Badge>
      }
      actionLabel={t("today.assignSpare")}
      actionTestId={`button-today-assign-spare-${row.id}`}
      onAction={() => openSpareAssignmentDialog(row.id)}
    />
  );

  const requestRow = (row: TodayPortalRequestRow) => (
    <WorkRow
      key={`request-${row.id}`}
      testId={`today-request-${row.id}`}
      icon={<Inbox className="h-4 w-4" />}
      title={row.customerName ?? t("today.unknownCustomer")}
      subtitle={row.message || row.reservationLabel || undefined}
      meta={
        <Badge variant="outline">
          {t(`today.requestType.${row.type}`, { defaultValue: row.type })}
        </Badge>
      }
      actionLabel={t("today.reviewRequest")}
      actionTestId={`button-today-review-request-${row.id}`}
      onAction={() => openPortalRequestDialog(row.id)}
    />
  );

  const { counts } = board;
  const group2Count = counts.maintenance + counts.transports + counts.spareAssignments;

  return (
    <div className="space-y-6">
      {heading}

      {counts.total === 0 ? (
        // "Empty state matters": one plain sentence, not three empty cards.
        <Card data-testid="today-empty-state">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-600" aria-hidden="true" />
            <p className="text-base font-medium">{t("today.emptyTitle")}</p>
            <p className="text-sm text-gray-500">{t("today.emptyDescription")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t("today.openItems")}
            </h3>
            <Badge variant="secondary" data-testid="today-open-count">
              {counts.total}
            </Badge>
          </div>

          {/* B-17 group 1 */}
          <Group
            testId="today-group-handovers"
            title={t("today.handoversTitle")}
            count={counts.pickups + counts.returns}
          >
            {counts.pickups > 0 && (
              <>
                <p className="flex items-center gap-2 pt-1 text-xs font-semibold uppercase text-gray-500">
                  <LogOut className="h-3 w-3" aria-hidden="true" />
                  {t("today.pickupsSubtitle", { count: counts.pickups })}
                </p>
                {board.pickups.map(handoverRow)}
              </>
            )}
            {counts.returns > 0 && (
              <>
                <p className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase text-gray-500">
                  <LogIn className="h-3 w-3" aria-hidden="true" />
                  {t("today.returnsSubtitle", { count: counts.returns })}
                </p>
                {board.returns.map(handoverRow)}
              </>
            )}
          </Group>

          {/* B-17 group 2 */}
          <Group
            testId="today-group-maintenance"
            title={t("today.maintenanceTitle")}
            count={group2Count}
          >
            {board.maintenance.map(maintenanceRow)}
            {board.transports.map(transportRow)}
            {counts.spareAssignments > 0 && (
              <>
                <p className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase text-gray-500">
                  <CalendarCheck className="h-3 w-3" aria-hidden="true" />
                  {t("today.sparesSubtitle", { count: counts.spareAssignments })}
                </p>
                {board.spareAssignments.map(spareRow)}
              </>
            )}
          </Group>

          {/* B-17 group 3 */}
          <Group
            testId="today-group-portal"
            title={t("today.portalTitle")}
            count={counts.portalRequests}
          >
            {board.portalRequests.map(requestRow)}
          </Group>
        </>
      )}

      <HandoverLauncher
        request={handover}
        onClose={() => setHandover(null)}
        onSuccess={refreshAfterAction}
      />
      <TransportLauncher transportId={transportId} onClose={() => setTransportId(null)} />
    </div>
  );
}
