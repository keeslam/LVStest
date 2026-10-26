/**
 * Onderhoudsanalyse, Merken en typen (Task 6, Kees 2026-10-26): the profile of one brand + type.
 * Figures (cars, age, km for an admin, per car per month against the whole fleet), the service
 * interval with the cars that stand out, the replacement hint, and small tables (categories,
 * repairs, build years, km bands for an admin, cheapest and most expensive cars, suppliers).
 * A row opens its cost lines; a plate opens the vehicle window. Each table has CSV; the tables
 * are printed with the tab (profilePrintSections, called by BrandsTab).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Lightbulb } from "lucide-react";
import { MAINTENANCE_NULL_KEY, type MaintenanceKmBandLine, type MaintenanceProfile, type MaintenanceProfileCar } from "@shared/maintenance-analysis";
import { ReportTable, type ReportTableColumn } from "@/components/reports/kit/report-table";
import type { PrintSection } from "@/components/reports/kit/report-print";
import { EntityLink } from "@/components/reports/entity-link";
import { formatExpenseCategory } from "@/lib/format-utils";
import { tablePrintSection } from "../legacy/table-print";
import { countText, typeText, useAnalysis, useMoneyText } from "./analysis-context";
import { useAnalysisDrill, type AnalysisDrill } from "./analysis-rows";
import { AnalysisPanel } from "./analysis-panel";
import { AnalysisCsvButton } from "./analysis-csv";

type Category = MaintenanceProfile["byCategory"][number];
type Repair = MaintenanceProfile["topRepairs"][number];
type Year = MaintenanceProfile["byYear"][number];
type Supplier = MaintenanceProfile["suppliers"][number];
type Outlier = MaintenanceProfile["interval"]["outliers"][number];

/** A per-km rate as text: "–" when there is none (no km, or it rounds to € 0,000). */
export function rateText(money: (n: number | null | undefined, perKm?: boolean) => string, perKm: number | null | undefined): string {
  if (perKm == null || !Number.isFinite(perKm) || Math.round(perKm * 1000) === 0) return "–";
  return money(perKm, true);
}

const oneDecimal = (n: number) => n.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ratioText = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 2 });

interface ProfileTable {
  id: string;
  title: string;
  // The rows differ per table; the columns are made for the same row type.
  columns: ReportTableColumn<any>[];
  rows: any[];
  rowKey: (r: any) => string | number;
  csv: string;
  open?: (r: any) => AnalysisDrill | null;
}

/** The tables of the profile, the same for the screen, CSV and print. */
function useProfileTables(profile: MaintenanceProfile | undefined): ProfileTable[] {
  const { t } = useTranslation("reports");
  const { isAdmin } = useAnalysis();
  const money = useMoneyText();
  return useMemo(() => {
    if (!profile) return [];
    const c = (key: string) => t(`maintenanceAnalysis.columns.${key}`);
    const p = (key: string) => t(`maintenanceAnalysis.profile.${key}`);
    const rowsTitle = t("maintenanceAnalysis.rows.title");
    const name = typeText(t, profile.brand, profile.model);
    const categoryName = (key: string, label: string) => formatExpenseCategory(key) || label;
    const amountCols = <R extends { count: number; amount: number }>(): ReportTableColumn<R>[] => [
      { id: "count", label: c("count"), cell: (r) => countText(r.count), text: (r) => countText(r.count), sortValue: (r) => r.count, align: "right" },
      { id: "amount", label: c("amount"), cell: (r) => money(r.amount), text: (r) => money(r.amount), sortValue: (r) => r.amount, align: "right" },
    ];
    const plateCol = <R extends { vehicleId: number; plate: string }>(): ReportTableColumn<R> => ({
      id: "plate", label: c("licensePlate"), interactive: true,
      cell: (r) => <EntityLink kind="vehicle" id={r.vehicleId} label={r.plate} />, text: (r) => r.plate, sortValue: (r) => r.plate,
    });
    const carCols: ReportTableColumn<MaintenanceProfileCar>[] = [
      plateCol<MaintenanceProfileCar>(),
      { id: "perMonth", label: c("perMonth"), cell: (r) => money(r.perMonth), text: (r) => money(r.perMonth), sortValue: (r) => r.perMonth, align: "right" },
      { id: "total", label: c("total"), cell: (r) => money(r.total), text: (r) => money(r.total), sortValue: (r) => r.total, align: "right" },
      { id: "count", label: c("count"), cell: (r) => countText(r.count), text: (r) => countText(r.count), sortValue: (r) => r.count, align: "right" },
    ];
    const carDrill = (r: { vehicleId: number; plate: string }): AnalysisDrill => ({ title: `${rowsTitle} · ${r.plate}`, drill: "vehicle", key: String(r.vehicleId) });
    const year = (r: Year) => (r.year == null ? t("maintenanceAnalysis.unknownYear") : String(r.year));

    const tables: ProfileTable[] = [
      {
        id: "categories", title: p("categoriesTitle"), csv: "onderhoud-profiel-categorieen", rowKey: (r: Category) => r.key, rows: profile.byCategory,
        columns: [
          { id: "category", label: c("category"), cell: (r: Category) => categoryName(r.key, r.label), text: (r: Category) => categoryName(r.key, r.label), sortValue: (r: Category) => categoryName(r.key, r.label) },
          ...amountCols<Category>(),
        ],
        open: (r: Category) => ({ title: `${rowsTitle} · ${name} · ${categoryName(r.key, r.label)}`, drill: "category", key: r.key }),
      },
      {
        id: "repairs", title: p("repairsTitle"), csv: "onderhoud-profiel-reparaties", rowKey: (r: Repair) => r.key, rows: profile.topRepairs,
        columns: [
          { id: "repair", label: c("repair"), cell: (r: Repair) => r.description ?? categoryName(r.category, r.label), text: (r: Repair) => r.description ?? categoryName(r.category, r.label), sortValue: (r: Repair) => r.label },
          { id: "category", label: c("category"), cell: (r: Repair) => categoryName(r.category, r.category), text: (r: Repair) => categoryName(r.category, r.category), sortValue: (r: Repair) => r.category },
          ...amountCols<Repair>(),
        ],
        open: (r: Repair) => ({ title: `${rowsTitle} · ${name} · ${r.description ?? categoryName(r.category, r.label)}`, drill: "repair", key: r.key }),
      },
      {
        id: "years", title: p("yearsTitle"), csv: "onderhoud-profiel-bouwjaren", rowKey: (r: Year) => r.year ?? MAINTENANCE_NULL_KEY, rows: profile.byYear,
        columns: [
          { id: "year", label: c("year"), cell: year, text: year, sortValue: (r: Year) => r.year ?? null },
          { id: "vehicles", label: c("vehicles"), cell: (r: Year) => countText(r.vehicles), text: (r: Year) => countText(r.vehicles), sortValue: (r: Year) => r.vehicles, align: "right" },
          { id: "perVehicleMonth", label: c("perVehicleMonth"), cell: (r: Year) => money(r.perVehicleMonth), text: (r: Year) => money(r.perVehicleMonth), sortValue: (r: Year) => r.perVehicleMonth, align: "right" },
        ],
        // A build year narrows the window filter for this drill; an unknown year cannot be filtered on.
        open: (r: Year) => (r.year == null ? null : { title: `${rowsTitle} · ${name} · ${r.year}`, extra: { yearFrom: String(r.year), yearTo: String(r.year) } }),
      },
    ];
    if (isAdmin && Array.isArray(profile.kmBands)) {
      const band = (r: MaintenanceKmBandLine) => r.band ?? t("maintenanceAnalysis.unknownKm");
      tables.push({
        id: "kmbands", title: p("kmBandsTitle"), csv: "onderhoud-profiel-kmklassen", rowKey: (r: MaintenanceKmBandLine) => r.band ?? MAINTENANCE_NULL_KEY, rows: profile.kmBands,
        columns: [
          { id: "band", label: c("kmBand"), cell: band, text: band },
          { id: "km", label: c("kmDriven"), cell: (r: MaintenanceKmBandLine) => (r.band === null ? "–" : countText(r.km)), text: (r: MaintenanceKmBandLine) => (r.band === null ? "–" : countText(r.km)), sortValue: (r: MaintenanceKmBandLine) => r.km, align: "right" },
          ...amountCols<MaintenanceKmBandLine>(),
          { id: "perKm", label: c("perKm"), cell: (r: MaintenanceKmBandLine) => rateText(money, r.perKm), text: (r: MaintenanceKmBandLine) => rateText(money, r.perKm), sortValue: (r: MaintenanceKmBandLine) => r.perKm, align: "right" },
        ],
        open: (r: MaintenanceKmBandLine) => ({ title: `${rowsTitle} · ${name} · ${band(r)}`, drill: "kmBand", key: r.band ?? MAINTENANCE_NULL_KEY }),
      });
    }
    tables.push(
      { id: "best", title: p("bestTitle"), csv: "onderhoud-profiel-goedkoopste", rowKey: (r: MaintenanceProfileCar) => r.vehicleId, rows: profile.best, columns: carCols, open: carDrill },
      { id: "worst", title: p("worstTitle"), csv: "onderhoud-profiel-duurste", rowKey: (r: MaintenanceProfileCar) => r.vehicleId, rows: profile.worst, columns: carCols, open: carDrill },
      {
        id: "suppliers", title: p("suppliersTitle"), csv: "onderhoud-profiel-leveranciers", rowKey: (r: Supplier) => r.key ?? MAINTENANCE_NULL_KEY, rows: profile.suppliers,
        columns: [
          { id: "supplier", label: c("supplier"), cell: (r: Supplier) => (r.key === null ? t("maintenanceAnalysis.unknownSupplier") : r.supplier), text: (r: Supplier) => (r.key === null ? t("maintenanceAnalysis.unknownSupplier") : r.supplier), sortValue: (r: Supplier) => r.supplier },
          { id: "count", label: c("count"), cell: (r: Supplier) => countText(r.count), text: (r: Supplier) => countText(r.count), sortValue: (r: Supplier) => r.count, align: "right" },
          { id: "total", label: c("total"), cell: (r: Supplier) => money(r.total), text: (r: Supplier) => money(r.total), sortValue: (r: Supplier) => r.total, align: "right" },
          { id: "avg", label: c("avg"), cell: (r: Supplier) => money(r.avg), text: (r: Supplier) => money(r.avg), sortValue: (r: Supplier) => r.avg, align: "right" },
        ],
        open: (r: Supplier) => ({ title: `${rowsTitle} · ${name} · ${r.key === null ? t("maintenanceAnalysis.unknownSupplier") : r.supplier}`, drill: "supplier", key: r.key ?? MAINTENANCE_NULL_KEY }),
      },
    );
    const months = (r: Outlier) => oneDecimal(r.months);
    const outlierCols: ReportTableColumn<Outlier>[] = [
      plateCol<Outlier>(),
      { id: "months", label: c("months"), cell: months, text: months, sortValue: (r) => r.months, align: "right" },
    ];
    if (isAdmin) {
      const km = (r: Outlier) => (r.km == null ? "–" : countText(r.km));
      outlierCols.push({ id: "km", label: c("kmDriven"), cell: km, text: km, sortValue: (r) => r.km ?? null, align: "right" });
    }
    tables.push({
      id: "outliers", title: p("outliersTitle"), csv: "onderhoud-profiel-interval", rowKey: (r: Outlier) => r.vehicleId, rows: profile.interval.outliers, columns: outlierCols,
      open: (r: Outlier) => ({ title: `${rowsTitle} · ${r.plate}`, drill: "vehicle", key: String(r.vehicleId), extra: { category: "maintenance" } }),
    });
    return tables;
  }, [profile, t, isAdmin, money]);
}

/** The text of the replacement hint for a car of this type. */
function hintText(t: TFunction, profile: MaintenanceProfile): string {
  return t("maintenanceAnalysis.profile.hintText", { type: typeText(t, profile.brand, profile.model) });
}

/** The profile tables for Afdrukken (with the hints as a table), in screen order. */
export function useProfilePrintSections(profile: MaintenanceProfile | undefined): PrintSection[] {
  const { t } = useTranslation("reports");
  const tables = useProfileTables(profile);
  return useMemo(() => {
    if (!profile) return [];
    const p = (key: string, opts?: Record<string, unknown>) => t(`maintenanceAnalysis.profile.${key}`, opts);
    const name = typeText(t, profile.brand, profile.model);
    const sections: PrintSection[] = tables.map((tb) => tablePrintSection({ id: `ma-profile-${tb.id}`, title: `${p("title", { name })} · ${tb.title}`, columns: tb.columns, rows: tb.rows, view: null }));
    if (profile.replaceHints.length > 0) {
      const columns: ReportTableColumn<MaintenanceProfile["replaceHints"][number]>[] = [
        { id: "plate", label: t("maintenanceAnalysis.columns.licensePlate"), cell: (r) => r.plate, text: (r) => r.plate },
        { id: "ratio12", label: t("maintenanceAnalysis.columns.ratio12"), cell: (r) => ratioText(r.ratio12), text: (r) => ratioText(r.ratio12) },
        { id: "ratio6", label: t("maintenanceAnalysis.columns.ratio6"), cell: (r) => ratioText(r.ratio6), text: (r) => ratioText(r.ratio6) },
        { id: "hint", label: p("hintsTitle"), cell: () => hintText(t, profile), text: () => hintText(t, profile) },
      ];
      sections.push(tablePrintSection({ id: "ma-profile-hints", title: `${p("title", { name })} · ${p("hintsTitle")}`, columns, rows: profile.replaceHints, view: null }));
    }
    return sections;
  }, [profile, tables, t]);
}

export function ProfileCard({ profile }: { profile: MaintenanceProfile }) {
  const { t } = useTranslation("reports");
  const p = (key: string, opts?: Record<string, unknown>) => t(`maintenanceAnalysis.profile.${key}`, opts);
  const { isAdmin } = useAnalysis();
  const money = useMoneyText();
  const drill = useAnalysisDrill();
  const tables = useProfileTables(profile);
  const name = typeText(t, profile.brand, profile.model);
  const tableOf = (id: string) => tables.find((tb) => tb.id === id);

  const figure = (testId: string, label: string, value: string) => (
    <div className="rounded-md border p-3" data-testid={testId}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );

  const renderTable = (tb: ProfileTable | undefined) => {
    if (!tb) return null;
    const open = tb.open;
    return (
      <div key={tb.id} className="min-w-0 space-y-1">
        <h4 className="text-sm font-medium">{tb.title}</h4>
        <ReportTable
          rows={tb.rows}
          columns={tb.columns}
          rowKey={tb.rowKey}
          testId={`ma-profile-${tb.id}-table`}
          toolbar={<AnalysisCsvButton columns={tb.columns} rows={tb.rows} view={null} name={tb.csv} testId={`button-ma-profile-${tb.id}-csv`} />}
          onRowClick={open ? (r) => { const d = open(r); if (d) drill(d); } : undefined}
        />
      </div>
    );
  };

  const interval = profile.interval;
  return (
    <AnalysisPanel title={p("title", { name })} description={p("desc")} testId="ma-profile">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {figure("ma-profile-vehicles", p("vehicles"), countText(profile.vehicles))}
        {figure("ma-profile-age", p("age"), profile.avgAgeYears == null ? "–" : p("ageValue", { years: oneDecimal(profile.avgAgeYears) }))}
        {isAdmin && "avgKm" in profile && figure("ma-profile-km", p("km"), countText(profile.avgKm ?? null))}
        {figure("ma-profile-per-month", p("perVehicleMonth"), money(profile.perVehicleMonth))}
        {figure("ma-profile-fleet", p("fleet"), money(profile.fleetPerVehicleMonth))}
      </div>

      <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3" data-testid="ma-profile-hints">
        <p className="flex items-center gap-1 text-sm font-medium"><Lightbulb className="h-4 w-4" aria-hidden="true" />{p("hintsTitle")}</p>
        {profile.replaceHints.length === 0 ? (
          <p className="text-sm text-muted-foreground">{p("hintNone")}</p>
        ) : (
          <>
            {profile.replaceHints.map((h) => (
              <div key={h.vehicleId} className="text-sm" data-testid={`ma-profile-hint-${h.vehicleId}`}>
                <span className="font-medium"><EntityLink kind="vehicle" id={h.vehicleId} label={h.plate} /></span>{" "}
                {hintText(t, profile)}{" "}
                <span className="text-muted-foreground">{p("hintRatio", { ratio12: ratioText(h.ratio12), ratio6: ratioText(h.ratio6) })}</span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{p("hintNote")}</p>
          </>
        )}
      </div>

      <div className="space-y-1" data-testid="ma-profile-interval">
        <h4 className="text-sm font-medium">{p("intervalTitle")}</h4>
        {interval.months == null ? (
          <p className="text-sm text-muted-foreground">{p("intervalNone")}</p>
        ) : (
          <p className="text-sm">
            {p("intervalText", { months: oneDecimal(interval.months), vehicles: countText(interval.vehicles) })}
            {isAdmin && interval.km != null && <> {p("intervalKm", { km: countText(interval.km) })}</>}
          </p>
        )}
      </div>
      {interval.outliers.length === 0
        ? (interval.months != null && <p className="text-sm text-muted-foreground">{p("outliersNone")}</p>)
        : renderTable(tableOf("outliers"))}

      <div className="grid gap-4 lg:grid-cols-2">
        {["categories", "repairs", "years", "kmbands", "best", "worst", "suppliers"].map((id) => renderTable(tableOf(id)))}
      </div>
    </AnalysisPanel>
  );
}
