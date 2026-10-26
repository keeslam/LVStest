/**
 * Onderhoudsanalyse, tab Merken en typen: a chart per brand (Wat/Hoe), the brands table with the
 * rating (only with enough lines and cars, as before), a click on a brand shows its types, and for
 * an admin the cost per km per km band (brands, or the types of the chosen brand). A bar, a type or
 * a km-band cell opens the cost lines behind it.
 *
 * Task 6 (Kees, 2026-10-26): a brand in the window filter switches the tab to the types of that brand
 * (chart, table, km table); a click on a type name sets the type filter, and brand + type show the
 * profile card. The rating always compares with the whole fleet; a km cell without a rate shows "–".
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  KM_BAND_KEYS, MAINTENANCE_NULL_KEY, RATING_GOOD_FACTOR,
  type KmBand, type MaintenanceBrands, type MaintenanceGroupLine, type MaintenanceKmBandLine, type MaintenanceProfile,
} from "@shared/maintenance-analysis";
import { Button } from "@/components/ui/button";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { compactSections, DrillLineButton } from "@/components/reports/kit/report-breakdown-table";
import { useReportPrint, type PrintSection } from "@/components/reports/kit/report-print";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { tablePrintSection } from "../legacy/table-print";
import { ANALYSIS_ENDPOINT, brandText, countText, nameKey, typeText, useAnalysis, useAnalysisParams, useMoneyText } from "./analysis-context";
import { ProfileCard, rateText, useProfilePrintSections } from "./profile-card";
import { AnalysisChart, type AnalysisMetric } from "./analysis-chart";
import { useAnalysisDrill } from "./analysis-rows";
import { AnalysisPanel } from "./analysis-panel";
import { AnalysisCsvButton } from "./analysis-csv";

type BrandLine = MaintenanceBrands["brands"][number];
type ModelLine = MaintenanceBrands["models"][number];
type Rating = "excellent" | "good" | "average" | "insufficient";
/** A km band, or MAINTENANCE_NULL_KEY for "Onbekende km". */
type KmCellKey = KmBand | typeof MAINTENANCE_NULL_KEY;
interface KmRow {
  id: string;
  level: MaintenanceKmBandLine["level"];
  brand: string | null;
  model: string | null;
  name: string;
  cells: Partial<Record<KmCellKey, MaintenanceKmBandLine>>;
}

// Stable empty lists: a fresh [] on every render would rerun each memo that depends on it.
const NO_BRANDS: BrandLine[] = [];
const NO_MODELS: ModelLine[] = [];
const NO_KM_LINES: MaintenanceKmBandLine[] = [];

/** The rating of a group against the average per car per month of the whole fleet (MaintenanceBrands.fleetPerVehicleMonth). */
export function ratingOf(line: MaintenanceGroupLine, overall: number | null | undefined): Rating {
  if (!line.rated || line.perVehicleMonth == null || overall == null || overall <= 0) return "insufficient";
  if (line.perVehicleMonth < overall) return "excellent";
  if (line.perVehicleMonth < overall * RATING_GOOD_FACTOR) return "good";
  return "average";
}

const RATING_CLASS: Record<Rating, string> = {
  excellent: "text-green-600",
  good: "text-blue-600",
  average: "text-orange-600",
  insufficient: "text-muted-foreground",
};

export function BrandsTab() {
  const { t } = useTranslation("reports");
  const k = (key: string, opts?: Record<string, unknown>) => t(`maintenanceAnalysis.${key}`, opts);
  const params = useAnalysisParams();
  const { isAdmin, extra, setExtra } = useAnalysis();
  const money = useMoneyText();
  const drill = useAnalysisDrill();
  const chartRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [brandView, setBrandView] = useState<ReportTableView<BrandLine> | null>(null);
  const [modelView, setModelView] = useState<ReportTableView<ModelLine> | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<MaintenanceBrands>({ queryKey: [`${ANALYSIS_ENDPOINT}/brands`, params] });
  // The yardstick of the rating: the whole fleet, so a brand or type filter never changes a rating.
  const overall = data?.fleetPerVehicleMonth ?? null;
  // Brand + type in the filter: the profile of that type.
  const profileOn = extra.brand !== "" && extra.model !== "";
  const { data: profile } = useQuery<MaintenanceProfile>({ queryKey: [`${ANALYSIS_ENDPOINT}/profile`, params], enabled: profileOn });
  const profileSections = useProfilePrintSections(profileOn ? profile : undefined);

  const brands = data?.brands ?? NO_BRANDS;
  // A brand is known by its key: the name, or "__null" for a brand without a name ("Onbekend").
  // A brand in the filter wins: then the tab is about the types of that brand.
  const filterBrand = extra.brand !== "" ? extra.brand : null;
  const brand = filterBrand ?? (selected && brands.some((b) => nameKey(b.brand) === selected) ? selected : null);
  const brandLabel = brand === null ? "" : brandText(t, brand === MAINTENANCE_NULL_KEY ? null : brand);
  const models = useMemo(() => (data?.models ?? NO_MODELS).filter((m) => nameKey(m.brand) === brand), [data, brand]);
  const rowsTitle = k("rows.title");

  const metrics: AnalysisMetric[] = isAdmin ? ["amount", "perVehicleMonth", "perKm", "count"] : ["amount", "perVehicleMonth", "count"];
  // The chart: the brands, or the types of the chosen brand.
  const points = useMemo(() => (brand
    ? models.map((m) => ({
      key: m.key,
      label: typeText(t, m.brand, m.model),
      values: { amount: m.total, perVehicleMonth: m.perVehicleMonth, perKm: m.perKm ?? null, count: m.count },
    }))
    : brands.map((b) => ({
      key: nameKey(b.brand),
      label: brandText(t, b.brand),
      values: { amount: b.total, perVehicleMonth: b.perVehicleMonth, perKm: b.perKm ?? null, count: b.count },
    }))), [brand, models, brands, t]);
  const chartTitle = brand ? k("brands.chartTypesTitle", { brand: brandLabel }) : k("brands.chartTitle");
  const openPoint = (key: string) => {
    if (brand) {
      const m = models.find((x) => x.key === key);
      drill({ title: `${rowsTitle} · ${brandLabel} ${m ? typeText(t, m.brand, m.model) : ""}`.trim(), drill: "model", key });
    } else {
      drill({ title: `${rowsTitle} · ${brandText(t, key === MAINTENANCE_NULL_KEY ? null : key)}`, drill: "brand", key });
    }
  };

  const groupColumns = useMemo(() => {
    const c = (key: string) => t(`maintenanceAnalysis.columns.${key}`);
    const rating = (r: MaintenanceGroupLine) => t(`maintenanceAnalysis.rating.${ratingOf(r, overall)}`);
    const list: ReportTableColumn<MaintenanceGroupLine>[] = [
      { id: "vehicles", label: c("vehicles"), cell: (r) => countText(r.vehicles), text: (r) => countText(r.vehicles), sortValue: (r) => r.vehicles, align: "right" },
      { id: "vehiclesWithCosts", label: c("vehiclesWithCosts"), cell: (r) => countText(r.vehiclesWithCosts), text: (r) => countText(r.vehiclesWithCosts), sortValue: (r) => r.vehiclesWithCosts, align: "right" },
      { id: "count", label: c("count"), cell: (r) => countText(r.count), text: (r) => countText(r.count), sortValue: (r) => r.count, align: "right" },
      { id: "total", label: c("total"), cell: (r) => money(r.total), text: (r) => money(r.total), sortValue: (r) => r.total, align: "right" },
      { id: "perVehicleMonth", label: c("perVehicleMonth"), cell: (r) => money(r.perVehicleMonth), text: (r) => money(r.perVehicleMonth), sortValue: (r) => r.perVehicleMonth, align: "right" },
    ];
    if (isAdmin) {
      list.push({ id: "perKm", label: c("perKm"), cell: (r) => money(r.perKm, true), text: (r) => money(r.perKm, true), sortValue: (r) => r.perKm ?? null, align: "right" });
    }
    list.push({
      id: "rating", label: c("rating"),
      cell: (r) => <span className={`font-medium ${RATING_CLASS[ratingOf(r, overall)]}`}>{rating(r)}</span>,
      text: rating,
    });
    return list;
  }, [t, money, isAdmin, overall]);

  const brandColumns = useMemo<ReportTableColumn<BrandLine>[]>(() => [
    {
      id: "brand", label: t("maintenanceAnalysis.columns.brand"), interactive: true,
      cell: (r) => (
        <DrillLineButton testId={`ma-brands-row-${nameKey(r.brand)}`} onClick={() => setSelected((cur) => (cur === nameKey(r.brand) ? null : nameKey(r.brand)))}
          className={nameKey(r.brand) === brand ? "font-semibold text-primary" : "text-primary"}>
          {brandText(t, r.brand)}
        </DrillLineButton>
      ),
      text: (r) => brandText(t, r.brand), sortValue: (r) => brandText(t, r.brand),
    },
    ...(groupColumns as ReportTableColumn<BrandLine>[]),
  ], [t, groupColumns, brand]);

  // A click on the type name picks brand + type as the window filter (and so shows the profile).
  const modelColumns = useMemo<ReportTableColumn<ModelLine>[]>(() => [
    {
      id: "model", label: t("maintenanceAnalysis.columns.model"), interactive: true,
      cell: (r) => (
        <DrillLineButton testId={`ma-models-type-${r.key}`} onClick={() => setExtra({ brand: nameKey(r.brand), model: nameKey(r.model) })}
          className={nameKey(r.model) === extra.model ? "font-semibold text-primary" : "text-primary"}>
          {typeText(t, r.brand, r.model)}
        </DrillLineButton>
      ),
      text: (r) => typeText(t, r.brand, r.model), sortValue: (r) => typeText(t, r.brand, r.model),
    },
    ...(groupColumns as ReportTableColumn<ModelLine>[]),
  ], [t, groupColumns, setExtra, extra.model]);

  // The km-band matrix: the brands, or the types of the chosen brand. "Onbekende km" (band null)
  // holds the costs without a km reading, so a row adds up to the total of its brand or type.
  const kmRows = useMemo(() => {
    const lines = (data?.kmBands ?? NO_KM_LINES).filter((l) => (brand ? l.level === "model" && nameKey(l.brand) === brand : l.level === "brand"));
    const byRow = new Map<string, KmRow>();
    for (const l of lines) {
      const id = l.level === "model" ? `${nameKey(l.brand)}-${nameKey(l.model)}` : nameKey(l.brand);
      const name = l.level === "model" ? typeText(t, l.brand, l.model) : brandText(t, l.brand);
      const row = byRow.get(id) ?? { id, level: l.level, brand: l.brand, model: l.model, name, cells: {} };
      row.cells[l.band ?? MAINTENANCE_NULL_KEY] = l;
      byRow.set(id, row);
    }
    return [...byRow.values()].sort((a, b) => a.name.localeCompare(b.name, "nl"));
  }, [data, brand, t]);
  const kmColumns = useMemo<Array<{ key: KmCellKey; label: string }>>(() => [
    ...KM_BAND_KEYS.map((b) => ({ key: b as KmCellKey, label: b as string })),
    ...(kmRows.some((r) => r.cells[MAINTENANCE_NULL_KEY]) ? [{ key: MAINTENANCE_NULL_KEY as KmCellKey, label: t("maintenanceAnalysis.unknownKm") }] : []),
  ], [kmRows, t]);
  // A band shows the cost per km; no rate (no km, a rate of € 0,000, or "Onbekende km") is "–", never an amount.
  const kmCellText = (key: KmCellKey, cell: MaintenanceKmBandLine) => (key === MAINTENANCE_NULL_KEY ? "–" : rateText(money, cell.perKm));
  const showKm = isAdmin && Array.isArray(data?.kmBands);

  const kmSection: PrintSection | null = showKm ? {
    kind: "table",
    id: "ma-kmbands",
    title: k("brands.kmBandsTitle"),
    header: [brand ? t("maintenanceAnalysis.columns.model") : t("maintenanceAnalysis.columns.brand"), ...kmColumns.map((c) => c.label)],
    columnIds: ["name", ...kmColumns.map((c) => String(c.key))],
    allRows: () => ({ rows: kmRows.map((r) => [r.name, ...kmColumns.map((c) => (r.cells[c.key] ? kmCellText(c.key, r.cells[c.key]!) : ""))]), truncated: false, rowKeys: kmRows.map((r) => r.name) }),
  } : null;
  useReportPrint(data ? compactSections([
    { kind: "chart", title: chartTitle, getSvg: () => chartSvgFromRef(chartRef) },
    filterBrand ? null : tablePrintSection({ id: "ma-brands", title: k("brands.brandsTitle"), columns: brandColumns, rows: brands, view: brandView, rowKey: (r) => nameKey(r.brand) }),
    brand ? tablePrintSection({ id: "ma-models", title: k("brands.modelsTitle", { brand: brandLabel }), columns: modelColumns, rows: models, view: modelView, rowKey: (r) => r.key }) : null,
    kmSection,
    ...profileSections,
  ]) : null);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("reportKit.loading")}</p>;
  if (isError || !data) return <QueryErrorState error={error} onRetry={() => { void refetch(); }} />;

  return (
    <div className="space-y-4">
      {profileOn && profile && <ProfileCard profile={profile} />}

      <AnalysisPanel title={chartTitle} description={k("overview.clickHint")}>
        <AnalysisChart
          points={points}
          metrics={metrics}
          kinds={["bar", "line", "pie"]}
          defaultKind="bar"
          testId="ma-brand-chart"
          chartRef={chartRef}
          onPointClick={openPoint}
        />
      </AnalysisPanel>

      {!filterBrand && (
        <AnalysisPanel title={k("brands.brandsTitle")} description={k("brands.brandsDesc")}>
          <ReportTable
            rows={brands}
            columns={brandColumns}
            rowKey={(r) => nameKey(r.brand)}
            defaultSort={{ id: "total", dir: "desc" }}
            testId="ma-brands-table"
            onView={setBrandView}
            toolbar={<AnalysisCsvButton columns={brandColumns} rows={brands} view={brandView} name="onderhoud-merken" testId="button-ma-brands-csv" />}
          />
        </AnalysisPanel>
      )}

      {brand && (
        <AnalysisPanel title={k("brands.modelsTitle", { brand: brandLabel })} description={k("brands.typesDesc")} testId="ma-models">
          {!filterBrand && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)} data-testid="button-ma-models-close">
                <X className="mr-1 h-4 w-4" aria-hidden="true" />{k("brands.closeModels")}
              </Button>
            </div>
          )}
          <ReportTable
            rows={models}
            columns={modelColumns}
            rowKey={(r) => r.key}
            defaultSort={{ id: "total", dir: "desc" }}
            testId="ma-models-table"
            onView={setModelView}
            toolbar={<AnalysisCsvButton columns={modelColumns} rows={models} view={modelView} name="onderhoud-typen" testId="button-ma-models-csv" />}
            onRowClick={(r) => drill({ title: `${rowsTitle} · ${brandText(t, r.brand)} ${typeText(t, r.brand, r.model)}`, drill: "model", key: r.key })}
          />
        </AnalysisPanel>
      )}

      {showKm && (
        <AnalysisPanel title={k("brands.kmBandsTitle")} description={k("brands.kmBandsDesc")} testId="ma-kmbands">
          {kmRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("reportKit.noData")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">{brand ? t("maintenanceAnalysis.columns.model") : t("maintenanceAnalysis.columns.brand")}</th>
                    {kmColumns.map((c) => <th key={c.key} className="p-2 text-right">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {kmRows.map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="p-2 font-medium">{row.name}</td>
                      {kmColumns.map(({ key: band, label: bandLabel }) => {
                        const cell = row.cells[band];
                        if (!cell) return <td key={band} className="p-2 text-right text-muted-foreground">–</td>;
                        const name = row.level === "model" ? `${brandText(t, row.brand)} ${row.name}` : row.name;
                        return (
                          <td key={band} className="p-2 text-right">
                            <button
                              type="button"
                              className="text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              title={k("brands.kmCellTitle", { amount: money(cell.amount), km: countText(cell.km), vehicles: countText(cell.vehicles) })}
                              onClick={() => drill({
                                title: `${rowsTitle} · ${name} · ${bandLabel}`,
                                drill: "kmBand",
                                key: band,
                                extra: { brand: nameKey(row.brand), ...(row.level === "model" ? { model: nameKey(row.model) } : {}) },
                              })}
                              data-testid={`ma-kmband-${row.id}-${band}`}
                            >
                              {kmCellText(band, cell)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AnalysisPanel>
      )}
    </div>
  );
}
