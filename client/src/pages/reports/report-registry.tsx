import { useMemo, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { endOfDay, parseISO } from "date-fns";
import { UserPermission, type Vehicle } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/searchable-combobox";
import { formatExpenseCategory, formatLicensePlate } from "@/lib/format-utils";
import { MileageHistoryPanel } from "@/components/vehicles/mileage-history-panel";
import { FiscalReportTab } from "@/components/fiscal/fiscal-report-tab";
import { useReportFilters } from "./report-filters";
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
import { InvoiceInboxReportCard } from "./invoice-inbox-report-card";
import { DeliveryReportCard } from "./delivery-report-card";
import { DamageChecksReportCard } from "./damage-checks-report-card";
import { LegacyReportSection, type LegacySection } from "./legacy-sections";

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
  badge?: ComponentType;
  /** The report uses the category filter. */
  usesCategory?: boolean;
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

// ---- Wrappers: the kit cards with the values of the filter bar ----
function useRange() {
  const { from, to, vehicleId } = useReportFilters();
  return { from, to, vehicleId };
}

function FinesReport() { const r = useRange(); return <FinesReportCard {...r} />; }
function ExtraCostsReport() { const r = useRange(); return <ExtraCostsReportCard {...r} />; }
function TransportBillingReport() { const r = useRange(); return <TransportBillingReportCard {...r} />; }
function OccupancyReport() { const r = useRange(); return <OccupancyReportCard {...r} />; }
function MaintenanceOutlookReport() { const { vehicleId } = useRange(); return <MaintenanceOutlookCard vehicleId={vehicleId} />; }
function FleetMileageReport() { const r = useRange(); return <FleetMileageReportCard {...r} />; }
function CustomerValueReport() { const r = useRange(); return <CustomerValueReportCard {...r} />; }
function PortalRequestsReport() { const r = useRange(); return <PortalRequestsReportCard {...r} />; }
function WaitlistReport() { const r = useRange(); return <WaitlistReportCard {...r} />; }
function InvoiceInboxReport() { const r = useRange(); return <InvoiceInboxReportCard {...r} />; }
function DeliveriesReport() { const r = useRange(); return <DeliveryReportCard {...r} />; }
function DamageChecksReport() { const r = useRange(); return <DamageChecksReportCard {...r} />; }

function WorkshopDowntimeReport() {
  const { from, to } = useRange();
  const dateRange = useMemo(() => ({ from: parseISO(from), to: endOfDay(parseISO(to)) }), [from, to]);
  return <WorkshopDowntimeCard dateRange={dateRange} />;
}

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
    <Card data-testid="card-report-mileage-history">
      <CardHeader>
        <CardTitle>{t("reportsPage.vehiclesTab.mileageHistory.title")}</CardTitle>
        <CardDescription>{t("reportsPage.vehiclesTab.mileageHistory.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
      </CardContent>
    </Card>
  );
}

// TEMPORARY (Task 5 replaces these): the old inline sections, one per old tab.
const legacy = (section: LegacySection): ComponentType => {
  const Legacy = () => <LegacyReportSection section={section} />;
  Legacy.displayName = `Legacy_${section}`;
  return Legacy;
};

/** Every fixed report, in list order per tab. */
export const REPORTS: ReportDef[] = [
  // Overzicht (for now the old operations numbers)
  { id: "legacy-operations", tab: "overview", titleKey: "reportsPage.tabs.operations", usesCategory: true,
    visible: (c) => reports(c) && vehicles(c) && reservations(c), Component: legacy("operations") },
  // Kosten
  { id: "legacy-expenses", tab: "expenses", titleKey: "reportsPage.tabs.expenses", usesCategory: true,
    visible: (c) => reports(c) && expenses(c), Component: legacy("expenses") },
  // Voertuigen (today all of these sat behind the vehicles right of the tab)
  { id: "legacy-vehicles", tab: "vehicles", titleKey: "reportsPage.tabs.vehicles", usesCategory: true,
    visible: (c) => reports(c) && vehicles(c), Component: legacy("vehicles") },
  { id: "occupancy", tab: "vehicles", titleKey: "fleetReports.occupancy.title",
    visible: (c) => reports(c) && vehicles(c) && reservations(c), Component: OccupancyReport },
  { id: "maintenance-outlook", tab: "vehicles", titleKey: "fleetReports.outlook.title",
    visible: (c) => reports(c) && vehicles(c), Component: MaintenanceOutlookReport },
  { id: "workshop-downtime", tab: "vehicles", titleKey: "reportsPage.downtime.title",
    visible: (c) => reports(c) && vehicles(c), Component: WorkshopDowntimeReport },
  { id: "fleet-mileage", tab: "vehicles", titleKey: "fleetReports.mileage.title",
    visible: (c) => c.isAdmin, Component: FleetMileageReport },
  { id: "mileage-history", tab: "vehicles", titleKey: "reportsPage.vehiclesTab.mileageHistory.title",
    visible: (c) => c.isAdmin, Component: MileageHistoryReport },
  // Klanten (customer value is a money report: the report right only)
  { id: "customer-value", tab: "customers", titleKey: "customerReports.value.title",
    visible: reports, Component: CustomerValueReport },
  { id: "legacy-customers", tab: "customers", titleKey: "reportsPage.tabs.customers", usesCategory: true,
    visible: (c) => reports(c) && customers(c), Component: legacy("customers") },
  // Transporten
  { id: "legacy-transports", tab: "transports", titleKey: "reportsPage.tabs.transports",
    visible: (c) => reports(c) && transports(c), Component: legacy("transports") },
  // Financieel (money reports: the report right only)
  { id: "legacy-financial", tab: "financial", titleKey: "reportsPage.tabs.financial",
    visible: reports, Component: legacy("financial") },
  { id: "fines", tab: "financial", titleKey: "moneyReports.fines.title", visible: reports, Component: FinesReport },
  { id: "extra-costs", tab: "financial", titleKey: "moneyReports.extraCosts.title", visible: reports, Component: ExtraCostsReport },
  { id: "transport-billing", tab: "financial", titleKey: "moneyReports.transport.title", visible: reports, Component: TransportBillingReport },
  // Fiscaal (exactly view_fiscal)
  { id: "fiscal", tab: "fiscal", titleKey: "fiscal:report.title", visible: (c) => c.canViewFiscal, Component: FiscalReport },
  // Portaal
  { id: "portal-requests", tab: "portal", titleKey: "portalReports.requests.title",
    visible: (c) => reports(c) && portal(c), Component: PortalRequestsReport },
  { id: "waitlist", tab: "portal", titleKey: "portalReports.waitlist.title",
    visible: (c) => reports(c) && portal(c), Component: WaitlistReport },
  // Kantoor. For now one entry renders the whole invoice-inbox card (rounds and, with the
  // expenses right, the invoices); Task 6 splits it into invoice-inbox-runs and -items.
  { id: "invoice-inbox-runs", tab: "office", titleKey: "officeReports.inbox.title",
    visible: (c) => reports(c) && any(c, UserPermission.MANAGE_EXPENSES, UserPermission.MANAGE_SETTINGS), Component: InvoiceInboxReport },
  { id: "deliveries", tab: "office", titleKey: "officeReports.delivery.title",
    visible: (c) => reports(c) && transports(c), Component: DeliveriesReport },
  { id: "damage-checks", tab: "office", titleKey: "officeReports.damage.title",
    visible: (c) => reports(c) && any(c, UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), Component: DamageChecksReport },
];

export function visibleReports(access: ReportAccess, reports: ReportDef[] = REPORTS): ReportDef[] {
  return reports.filter((r) => r.visible(access));
}

/** A tab shows only when it has at least one visible report. */
export function visibleTabs(access: ReportAccess, reports: ReportDef[] = REPORTS): ReportTabId[] {
  const shown = visibleReports(access, reports);
  return REPORT_TABS.filter((tab) => shown.some((r) => r.tab === tab));
}
