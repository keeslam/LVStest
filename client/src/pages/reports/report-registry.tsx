import { createContext, useContext, useMemo, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { UserPermission, type Vehicle } from "@shared/schema";
import { canUseReportSource, getDataSource, SAVED_REPORT_TABS, type ReportSourceUser } from "@shared/report-builder-config";
import { useAuth } from "@/hooks/use-auth";
import { ReportSection } from "@/components/reports/kit/report-section";
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/searchable-combobox";
import { formatExpenseCategory, formatLicensePlate } from "@/lib/format-utils";
import { MileageHistoryPanel } from "@/components/vehicles/mileage-history-panel";
import { FiscalReportTab } from "@/components/fiscal/fiscal-report-tab";
import { useReportFilters } from "./report-filters";
import { OverviewReport, OVERVIEW_TILE_REPORT } from "./overview-report";
import { useReportAccess } from "./use-report-access";
import { useSharedReportSelection } from "./use-report-selection";
import { ApkOverviewBadge, DeliveriesBadge, FinesBadge, InvoiceInboxItemsBadge, MaintenanceOutlookBadge, PortalRequestsBadge } from "./report-badges";
import { FinesReportCard } from "./fines-report-card";
import { ExtraCostsReportCard } from "./extra-costs-report-card";
import { TransportBillingReportCard } from "./transport-billing-report-card";
import { OccupancyReportCard } from "./occupancy-report-card";
import { MaintenanceOutlookCard } from "./maintenance-outlook-card";
import { WorkshopDowntimeCard } from "./workshop-downtime-card";
import { FleetMileageReportCard } from "./fleet-mileage-report-card";
import { CustomerValueReportCard } from "./customer-value-report-card";
import { PortalRequestsReportCard } from "./portal-requests-report-card";
import { WaitlistReportCard } from "./waitlist-report-card";
import { InvoiceInboxRunsReport, InvoiceInboxItemsReport } from "./invoice-inbox-report-card";
import { DeliveryReportCard } from "./delivery-report-card";
import { DamageChecksReportCard } from "./damage-checks-report-card";
import { SavedReportView, SAVED_REPORT_PREFIX, type SavedReport } from "./saved-report-view";
import { ExpensesByCategoryReport } from "./legacy/expenses-by-category-report";
import { ExpenseTrendReport } from "./legacy/expense-trend-report";
import { RecentExpensesReport } from "./legacy/recent-expenses-report";
import { VehicleUtilizationReport } from "./legacy/vehicle-utilization-report";
import { MaintenanceCostByVehicleReport } from "./legacy/maintenance-cost-by-vehicle-report";
import { ApkOverviewReport } from "./legacy/apk-overview-report";
import { WarrantyReport } from "./legacy/warranty-report";
import { CustomerImpactReport } from "./legacy/customer-impact-report";
import { CustomerCostCategoriesReport } from "./legacy/customer-cost-categories-report";
import { RecentCustomerReservationsReport } from "./legacy/recent-customer-reservations-report";
import { TransportsReport } from "./legacy/transports-report";
import { VehicleFinancialsReport } from "./legacy/vehicle-financials-report";

export type ReportTabId =
  | "overview" | "expenses" | "vehicles" | "customers" | "transports" | "financial" | "fiscal" | "portal" | "office";

export const REPORT_TABS: ReportTabId[] = [
  "overview", "expenses", "vehicles", "customers", "transports", "financial", "fiscal", "portal", "office",
];

export interface ReportAccess {
  isAdmin: boolean;
  has(perm: string): boolean;
  canViewFiscal: boolean;
}

export interface ReportDef {
  id: string;
  tab: ReportTabId;
  titleKey: string;
  visible(ctx: ReportAccess): boolean;
  Component: ComponentType;
  /** Small number in the list; may render null. */
  badge?: ComponentType<{ inline?: boolean }>;
  /** The report uses the category filter. */
  usesCategory?: boolean;
  /** A short line under the title, e.g. which filters do not apply. */
  noteKey?: string;
  /** The period of the filter bar does not apply; the print says so instead of naming a period. */
  ignoresPeriod?: boolean;
  /** The vehicle of the filter bar does not apply; the print leaves the vehicle line out. */
  ignoresVehicle?: boolean;
  /** A title as it is (a saved report keeps the name it was saved with); wins over titleKey. */
  title?: string;
  /** A report someone made in the report builder and saved on this tab. */
  saved?: boolean;
}

// ---- Rights, the same rules the cards and the old tabs used ----
const any = (ctx: ReportAccess, ...perms: string[]) => ctx.isAdmin || perms.some((p) => ctx.has(p));
const reports = (ctx: ReportAccess) => any(ctx, UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS);
const vehicles = (ctx: ReportAccess) => any(ctx, UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES);
const reservations = (ctx: ReportAccess) => any(ctx, UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS);
const customers = (ctx: ReportAccess) => any(ctx, UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS);
const portal = (ctx: ReportAccess) => any(ctx, UserPermission.VIEW_PORTAL, UserPermission.MANAGE_PORTAL);
// GET /api/transports accepts either family.
const transports = (ctx: ReportAccess) => vehicles(ctx) || reservations(ctx);
const expenses = (ctx: ReportAccess) => any(ctx, UserPermission.MANAGE_EXPENSES);

/** Fiscal check; it does not read the category filter and says so. */
function FiscalReport() {
  const { t } = useTranslation("reports");
  const { category } = useReportFilters();
  return (
    <div className="space-y-6">
      {category !== "all" && (
        <p className="text-sm text-muted-foreground" data-testid="category-filter-note">
          {t("reportsPage.filters.categoryNotApplicable", { category: formatExpenseCategory(category), scope: t("reportsPage.filters.categoryScopeTab") })}
        </p>
      )}
      <FiscalReportTab />
    </div>
  );
}

/** Km-historie of one vehicle (admin only, like GET /api/mileage-history). */
function MileageHistoryReport() {
  const { t } = useTranslation("reports");
  const { from, to } = useReportFilters();
  const [vehicleId, setVehicleId] = useState("");
  const { data: fleet = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"] });
  const options: ComboboxOption[] = useMemo(
    () => [...fleet]
      .sort((a, b) => a.licensePlate.localeCompare(b.licensePlate))
      .map((v) => ({ value: String(v.id), label: formatLicensePlate(v.licensePlate), description: `${v.brand} ${v.model}`, tags: [v.licensePlate] })),
    [fleet],
  );
  return (
    <ReportSection testId="card-report-mileage-history" title={t("reportsPage.vehiclesTab.mileageHistory.title")} description={t("reportsPage.vehiclesTab.mileageHistory.description")}>
        <div className="max-w-sm space-y-2">
          <label className="text-sm font-medium">{t("reportsPage.vehiclesTab.mileageHistory.vehicle")}</label>
          <SearchableCombobox
            options={options}
            value={vehicleId}
            onChange={setVehicleId}
            placeholder={t("reportsPage.vehiclesTab.mileageHistory.pickVehicle")}
            searchPlaceholder={t("reportsPage.filters.vehicleSearchPlaceholder")}
            emptyMessage={t("reportsPage.filters.noVehicleFound")}
            data-testid="select-report-mileage-vehicle"
          />
        </div>
        {vehicleId ? (
          <MileageHistoryPanel key={`${vehicleId}-${from}-${to}`} vehicleId={Number(vehicleId)} defaultFrom={from} defaultTo={to} />
        ) : (
          <p className="text-sm text-gray-500">{t("reportsPage.vehiclesTab.mileageHistory.noVehicle")}</p>
        )}
    </ReportSection>
  );
}

/** Overzicht: the key numbers; each tile opens its report. Shown when at least one tile is. */
function OverviewPane() {
  const access = useReportAccess();
  const { select } = useSharedReportSelection();
  const visible = visibleReports(access, useContext(ReportListContext)?.reports ?? REPORTS);
  const shown = new Set(visible.map((r) => r.id));
  return (
    <OverviewReport
      shown={shown}
      tabOf={(id) => REPORTS.find((r) => r.id === id)?.tab}
      onOpen={select}
    />
  );
}

/**
 * Every fixed report, in list order per tab. Each report sees only the rights its numbers
 * need; the file of a report states its rule.
 */
export const REPORTS: ReportDef[] = [
  // Overzicht (not in the tile list itself)
  { id: "overview", tab: "overview", titleKey: "reportsPage.tabs.overview",
    visible: (c) => Object.values(OVERVIEW_TILE_REPORT).some((id) => REPORTS.find((r) => r.id === id)?.visible(c)),
    Component: OverviewPane },
  // Kosten (all three read /api/expenses)
  { id: "expenses-by-category", tab: "expenses", titleKey: "reportsPage.operations.expensesByCategoryTitle", usesCategory: true,
    visible: (c) => reports(c) && expenses(c), Component: ExpensesByCategoryReport },
  { id: "expense-trend", tab: "expenses", titleKey: "reportsPage.operations.expenseTrendsTitle", usesCategory: true, ignoresPeriod: true,
    noteKey: "reportsPage.shell.notes.lastThreeMonths",
    visible: (c) => reports(c) && expenses(c), Component: ExpenseTrendReport },
  { id: "expenses-in-period", tab: "expenses", titleKey: "reportsPage.reports.expensesInPeriod", usesCategory: true,
    visible: (c) => reports(c) && expenses(c), Component: RecentExpensesReport },
  // Voertuigen
  { id: "vehicle-utilization", tab: "vehicles", titleKey: "reportsPage.common.vehicleUtilization",
    visible: (c) => reports(c) && vehicles(c) && reservations(c), Component: VehicleUtilizationReport },
  { id: "maintenance-cost-by-vehicle", tab: "vehicles", titleKey: "reportsPage.vehiclesTab.maintenanceCostsTitle", usesCategory: true,
    visible: (c) => reports(c) && vehicles(c) && expenses(c), Component: MaintenanceCostByVehicleReport },
  { id: "apk-overview", tab: "vehicles", titleKey: "reportsPage.vehiclesTab.apkOverviewTitle",
    visible: (c) => reports(c) && vehicles(c), Component: ApkOverviewReport, badge: ApkOverviewBadge, ignoresPeriod: true, ignoresVehicle: true },
  { id: "warranty", tab: "vehicles", titleKey: "reportsPage.vehiclesTab.warrantyOverviewTitle",
    visible: (c) => reports(c) && vehicles(c), Component: WarrantyReport, ignoresPeriod: true, ignoresVehicle: true },
  { id: "occupancy", tab: "vehicles", titleKey: "fleetReports.occupancy.title",
    visible: (c) => reports(c) && vehicles(c) && reservations(c), Component: OccupancyReportCard },
  { id: "maintenance-outlook", tab: "vehicles", titleKey: "fleetReports.outlook.title",
    visible: (c) => reports(c) && vehicles(c), Component: MaintenanceOutlookCard, badge: MaintenanceOutlookBadge, ignoresPeriod: true },
  { id: "workshop-downtime", tab: "vehicles", titleKey: "reportsPage.downtime.title",
    visible: (c) => reports(c) && vehicles(c), Component: WorkshopDowntimeCard },
  { id: "fleet-mileage", tab: "vehicles", titleKey: "fleetReports.mileage.title",
    visible: (c) => c.isAdmin, Component: FleetMileageReportCard },
  { id: "mileage-history", tab: "vehicles", titleKey: "reportsPage.vehiclesTab.mileageHistory.title",
    visible: (c) => c.isAdmin, Component: MileageHistoryReport },
  // Klanten. The customer reports are built from the customers' reservations; the cost columns
  // also need the expenses. Customer value is a money report: the report right only.
  { id: "customer-impact", tab: "customers", titleKey: "reportsPage.customersTab.impactTitle", usesCategory: true,
    visible: (c) => reports(c) && customers(c) && reservations(c), Component: CustomerImpactReport },
  { id: "customer-cost-categories", tab: "customers", titleKey: "reportsPage.customersTab.expenseCategoriesTitle", usesCategory: true,
    visible: (c) => reports(c) && customers(c) && reservations(c) && expenses(c), Component: CustomerCostCategoriesReport },
  { id: "customer-reservations", tab: "customers", titleKey: "reportsPage.reports.customerReservations",
    visible: (c) => reports(c) && customers(c) && reservations(c), Component: RecentCustomerReservationsReport },
  { id: "customer-value", tab: "customers", titleKey: "customerReports.value.title",
    visible: reports, Component: CustomerValueReportCard },
  // Transporten (the period and vehicle of the filter bar do not apply; the pane says so)
  { id: "transports", tab: "transports", titleKey: "reportsPage.transportsTab.cardTitle",
    noteKey: "reportsPage.shell.notes.periodVehicleIgnored", ignoresPeriod: true, ignoresVehicle: true,
    visible: (c) => reports(c) && transports(c), Component: TransportsReport },
  // Financieel (money reports: the report right only)
  { id: "vehicle-financials", tab: "financial", titleKey: "financialTab.table.title",
    visible: reports, Component: VehicleFinancialsReport },
  { id: "fines", tab: "financial", titleKey: "moneyReports.fines.title", visible: reports, Component: FinesReportCard, badge: FinesBadge },
  { id: "extra-costs", tab: "financial", titleKey: "moneyReports.extraCosts.title", visible: reports, Component: ExtraCostsReportCard },
  { id: "transport-billing", tab: "financial", titleKey: "moneyReports.transport.title", visible: reports, Component: TransportBillingReportCard },
  // Fiscaal (exactly view_fiscal)
  { id: "fiscal", tab: "fiscal", titleKey: "fiscal:report.title", visible: (c) => c.canViewFiscal, Component: FiscalReport },
  // Portaal
  { id: "portal-requests", tab: "portal", titleKey: "portalReports.requests.title",
    visible: (c) => reports(c) && portal(c), Component: PortalRequestsReportCard, badge: PortalRequestsBadge },
  { id: "waitlist", tab: "portal", titleKey: "portalReports.waitlist.title",
    visible: (c) => reports(c) && portal(c), Component: WaitlistReportCard },
  // Kantoor. The invoice inbox is two reports: the pickup rounds and the invoices that came in.
  { id: "invoice-inbox-runs", tab: "office", titleKey: "officeReports.inbox.runsTitle",
    visible: (c) => reports(c) && any(c, UserPermission.MANAGE_EXPENSES, UserPermission.MANAGE_SETTINGS), Component: InvoiceInboxRunsReport },
  { id: "invoice-inbox-items", tab: "office", titleKey: "officeReports.inbox.itemsTitle",
    visible: (c) => reports(c) && any(c, UserPermission.MANAGE_EXPENSES), Component: InvoiceInboxItemsReport, badge: InvoiceInboxItemsBadge },
  { id: "deliveries", tab: "office", titleKey: "officeReports.delivery.title",
    visible: (c) => reports(c) && transports(c), Component: DeliveryReportCard, badge: DeliveriesBadge },
  { id: "damage-checks", tab: "office", titleKey: "officeReports.damage.title",
    visible: (c) => reports(c) && any(c, UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), Component: DamageChecksReportCard },
];

export function visibleReports(access: ReportAccess, reports: ReportDef[] = REPORTS): ReportDef[] {
  return reports.filter((r) => r.visible(access));
}

/** A tab shows only when it has at least one visible report. */
export function visibleTabs(access: ReportAccess, reports: ReportDef[] = REPORTS): ReportTabId[] {
  const shown = visibleReports(access, reports);
  return REPORT_TABS.filter((tab) => shown.some((r) => r.tab === tab));
}

// ---- Saved builder reports on a tab (Rapporten herontwerp deel 2, Task 3) ----

/** The list of the shell: the fixed reports plus the saved reports on a tab. */
export interface ReportList {
  reports: ReportDef[];
  saved: SavedReport[];
  /** The saved reports are still loading. */
  savedLoading: boolean;
}

export const ReportListContext = createContext<ReportList | null>(null);

/** One component per saved report id, so a refreshed list does not remount the report. */
const savedComponents = new Map<number, ComponentType>();
function savedComponent(id: number): ComponentType {
  let Component = savedComponents.get(id);
  if (!Component) {
    Component = function SavedReportPane() {
      const report = useContext(ReportListContext)?.saved.find((r) => r.id === id);
      return report ? <SavedReportView report={report} /> : null;
    };
    savedComponents.set(id, Component);
  }
  return Component;
}

/** The right a tab itself needs, on top of the report right (Portaal; Kantoor is built on four areas). */
function tabGate(tab: string | undefined, c: ReportAccess): boolean {
  if (tab === "portal") return portal(c);
  if (tab === "office") {
    return expenses(c) || any(c, UserPermission.MANAGE_SETTINGS, UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS) || transports(c);
  }
  return true;
}

/**
 * The saved reports that sit on a tab, as reports of that tab. Visible with the report right
 * and the right for every source (the same rule as the server); a report without a tab stays
 * under Opgeslagen rapporten of the report builder only.
 */
export function savedReportDefs(saved: SavedReport[], user: ReportSourceUser | null | undefined): ReportDef[] {
  return saved
    .filter((r) => (SAVED_REPORT_TABS as readonly string[]).includes(r.configuration?.tab ?? ""))
    .map((r) => {
      const config = r.configuration;
      const sources = Array.isArray(config.dataSources) ? config.dataSources : [];
      return {
        id: `${SAVED_REPORT_PREFIX}${r.id}`,
        tab: config.tab as ReportTabId,
        titleKey: "",
        title: r.name,
        saved: true,
        visible: (c: ReportAccess) => reports(c) && tabGate(config.tab, c) && sources.length > 0 && sources.every((id) => {
          const source = getDataSource(id);
          return !!source && canUseReportSource(user, source);
        }),
        Component: savedComponent(r.id),
        ignoresPeriod: !config.periodField,
        ignoresVehicle: !getDataSource(sources[0] ?? "")?.vehicleField,
      };
    });
}

/** The fixed reports plus the saved reports on a tab, for the shell, the list and the selection. */
export function useReportList(access: ReportAccess): ReportList {
  const { user } = useAuth();
  const allowed = reports(access);
  const { data, status } = useQuery<SavedReport[]>({ queryKey: ["/api/reports/saved"], enabled: allowed });
  const saved = useMemo(() => (allowed && Array.isArray(data) ? data : []), [allowed, data]);
  const role = user?.role ?? null;
  const permissionKey = ((user?.permissions as string[] | undefined) ?? []).join(",");
  const list = useMemo(
    () => [...REPORTS, ...savedReportDefs(saved, { role, permissions: permissionKey ? permissionKey.split(",") : [] })],
    [saved, role, permissionKey],
  );
  return { reports: list, saved, savedLoading: allowed && status === "pending" };
}
