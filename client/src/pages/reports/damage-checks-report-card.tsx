/**
 * Rapporten fase 5, onderdeel 14: damage checks on Rapporten > Kantoor.
 * Pickup and return checks per day (office day of the check), with the return checks that have at
 * least one damage marker as the red tile. Needs the report permission and the damage-check
 * permission, like GET /api/interactive-damage-checks. Follows the vehicle filter.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  DAMAGE_CHECK_REPORT_TILES,
  type DamageCheckReportRow, type DamageCheckReportSort, type DamageCheckReportSummary, type DamageCheckReportTile,
} from "@shared/reports/damage-checks-report";
import { UserPermission } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportTiles, type ReportTile } from "@/components/reports/kit/report-tiles";
import { ReportMonthChart } from "@/components/reports/kit/report-month-chart";
import { ReportBreakdownTable } from "@/components/reports/kit/report-breakdown-table";
import { ReportDetailDialog, type ReportColumn } from "@/components/reports/kit/report-detail-dialog";
import { useHasPermission } from "@/hooks/use-has-permission";
import { formatLicensePlate } from "@/lib/format-utils";
import { formatDateNl } from "@/lib/format-date-nl";
import { csvDateTime } from "@/lib/csv";

const ENDPOINT = "/api/reports/damage-checks";

const TILE_TONE: Partial<Record<DamageCheckReportTile, ReportTile<DamageCheckReportTile>["tone"]>> = {
  withDamage: "red",
};

const n0 = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 0 });

export function DamageChecksReportCard({ from, to, vehicleId }: { from?: string; to?: string; vehicleId?: string }) {
  const { t } = useTranslation("reports");
  const allowedReports = useHasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS);
  const allowedSource = useHasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS);
  const allowed = allowedReports && allowedSource;
  const [openTile, setOpenTile] = useState<DamageCheckReportTile | null>(null);
  const [shownTile, setShownTile] = useState<DamageCheckReportTile>("all");

  const params = useMemo<Record<string, string>>(
    () => ({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(vehicleId && vehicleId !== "all" ? { vehicleId } : {}),
    }),
    [from, to, vehicleId],
  );
  const { data, isLoading, isError } = useQuery<DamageCheckReportSummary>({
    queryKey: [`${ENDPOINT}/summary`, params],
    enabled: allowed,
  });

  const tileLabel = (id: string) => t(`officeReports.damage.tiles.${id}`);

  const columns = useMemo<Array<ReportColumn<DamageCheckReportRow, DamageCheckReportSort>>>(() => {
    const label = (id: string) => t(`officeReports.damage.columns.${id}`);
    const typeLabel = (type: string) => t(`officeReports.damage.checkType.${type}`, { defaultValue: type });
    const yesNo = (v: boolean) => t(v ? "officeReports.damage.yes" : "officeReports.damage.no");
    const day = (v: string | null) => (v ? formatDateNl(v, "short") : "");
    const plate = (r: DamageCheckReportRow) => (r.licensePlate ? formatLicensePlate(r.licensePlate) : "");
    const reservation = (r: DamageCheckReportRow) => (r.reservationId === null ? "" : `#${r.reservationId}`);
    return [
      { id: "checkDate", label: label("checkDate"), sortKey: "checkDate", cell: (r) => day(r.checkDate), csv: (r) => csvDateTime(r.checkDate) },
      { id: "checkType", label: label("checkType"), sortKey: "checkType", cell: (r) => typeLabel(r.checkType), csv: (r) => typeLabel(r.checkType) },
      { id: "licensePlate", label: label("licensePlate"), sortKey: "licensePlate", cell: plate, csv: plate },
      { id: "customer", label: label("customer"), sortKey: "customer", cell: (r) => r.customerName ?? "", csv: (r) => r.customerName ?? "" },
      { id: "reservation", label: label("reservation"), cell: reservation, csv: reservation },
      { id: "completedBy", label: label("completedBy"), cell: (r) => r.completedBy ?? "", csv: (r) => r.completedBy ?? "" },
      { id: "damage", label: label("damage"), cell: (r) => yesNo(r.hasDamage), csv: (r) => yesNo(r.hasDamage) },
    ];
  }, [t]);

  if (!allowed) return null;

  const tiles: Array<ReportTile<DamageCheckReportTile>> = DAMAGE_CHECK_REPORT_TILES.map((id) => ({
    id,
    label: tileLabel(id),
    value: n0(data?.tiles?.[id]?.count ?? 0),
    tone: TILE_TONE[id],
  }));
  const series = [
    { key: "pickup" as const, label: tileLabel("pickup"), color: "#3b82f6" },
    { key: "return" as const, label: tileLabel("return"), color: "#16a34a" },
    { key: "withDamage" as const, label: tileLabel("withDamage"), color: "#dc2626" },
  ];

  return (
    <Card data-testid="card-damage-checks-report">
      <CardHeader>
        <CardTitle>{t("officeReports.damage.title")}</CardTitle>
        <CardDescription>{t("officeReports.damage.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="damage-checks-loading">{t("reportKit.loading")}</p>
        ) : isError || !data ? (
          <p className="text-sm text-destructive" data-testid="damage-checks-error">{t("reportKit.loadFailed")}</p>
        ) : (
          <>
            <ReportTiles
              tiles={tiles}
              testIdPrefix="damage-checks"
              onOpen={(id) => { setShownTile(id); setOpenTile(id); }}
            />
            <p className="text-sm text-muted-foreground" data-testid="damage-checks-note">{t("officeReports.damage.withDamageNote")}</p>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t("officeReports.damage.byMonth")}</h4>
              <ReportMonthChart data={data.byMonth ?? []} series={series} testId="damage-checks-month-chart" />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <ReportBreakdownTable
                title={t("officeReports.damage.byVehicle")}
                rows={data.byVehicle ?? []}
                nullLabel={t("officeReports.damage.unknownVehicle")}
                hideAmount
                testId="damage-checks-by-vehicle"
              />
              <ReportBreakdownTable
                title={t("officeReports.damage.byCustomer")}
                rows={data.byCustomer ?? []}
                nullLabel={t("officeReports.damage.noReservation")}
                hideAmount
                testId="damage-checks-by-customer"
              />
            </div>
          </>
        )}
      </CardContent>
      <ReportDetailDialog<DamageCheckReportRow, DamageCheckReportSort>
        open={openTile !== null}
        onOpenChange={(o) => { if (!o) setOpenTile(null); }}
        title={tileLabel(shownTile)}
        description={t("officeReports.damage.title")}
        endpoint={ENDPOINT}
        params={params}
        tile={shownTile}
        columns={columns}
        defaultSort={{ key: "checkDate", dir: "desc" }}
        rowKey={(r) => r.id}
        csvSubject={t("officeReports.damage.csvSubject")}
        reportName="damage-checks"
        testId="damage-checks-report"
      />
    </Card>
  );
}
