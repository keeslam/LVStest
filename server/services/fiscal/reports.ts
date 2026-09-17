/**
 * Fiscal reports (docs/fiscaal, stap 6): the latest assessment of every open
 * period, spread over its calendar months, so a year can be read per customer,
 * per vehicle and per month — with each month marked settled, provisional or
 * part of a final calculation (besluit F-15). Nothing is recalculated here;
 * the report only reads what was assessed and says so when a period has not
 * been assessed yet.
 */
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { customers, fiscalAssessments, fiscalRuleVersions, vehicles, vehicleUsagePeriods, type FiscalAssessment } from "../../../shared/schema";
import { FISCAL_STATUS_LABELS, MONTH_REASON_LABELS, type FiscalAssessmentStatus, type MonthReason } from "../../../shared/fiscal-types";
import { scopeCondition, type FiscalScope } from "./portal-storage";

export interface FiscalReportFilter {
  year: number;
  customerId?: number;
  vehicleId?: number;
  /** Portal driver scope: only the periods this driver drove. */
  scope?: FiscalScope;
}

export type MonthState = "final" | "settled" | "provisional";

export interface FiscalReportRow {
  customerId: number;
  customerName: string;
  vehicleId: number | null;
  licensePlate: string | null;
  vehicle: string | null;
  usagePeriodId: number;
  reservationId: number;
  periodStart: string;
  periodEnd: string | null;
  assessmentId: number;
  status: FiscalAssessmentStatus;
  statusLabel: string;
  month: string;
  days: number;
  charged: boolean;
  reason: MonthReason;
  reasonLabel: string;
  /** Absent (null) when the caller may not see amounts (besluit F-05). */
  amount: string | null;
  state: MonthState;
  ruleVersionTitle: string | null;
  assessedAt: string;
}

export interface FiscalReportTotals {
  amount: string | null;
  settled: string | null;
  provisional: string | null;
  chargedMonths: number;
  periods: number;
  unassessedPeriods: number;
}

export interface FiscalReport {
  year: number;
  withAmounts: boolean;
  rows: FiscalReportRow[];
  totals: FiscalReportTotals;
  byCustomer: Array<{ customerId: number; customerName: string; periods: number; chargedMonths: number; amount: string | null; settled: string | null; provisional: string | null }>;
  byMonth: Array<{ month: string; chargedMonths: number; amount: string | null; settled: string | null; provisional: string | null }>;
}

function cents(amount: string | null | undefined): number {
  return amount ? Math.round(Number(amount) * 100) : 0;
}

function money(centsValue: number): string {
  const sign = centsValue < 0 ? "-" : "";
  const abs = Math.abs(centsValue);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

class Sums {
  amount = 0;
  settled = 0;
  provisional = 0;
  chargedMonths = 0;
  periods = new Set<number>();
  add(row: FiscalReportRow): void {
    this.periods.add(row.usagePeriodId);
    if (row.charged) this.chargedMonths += 1;
    const c = cents(row.amount);
    this.amount += c;
    if (row.state === "provisional") this.provisional += c;
    else this.settled += c;
  }
  out(withAmounts: boolean) {
    return {
      chargedMonths: this.chargedMonths,
      amount: withAmounts ? money(this.amount) : null,
      settled: withAmounts ? money(this.settled) : null,
      provisional: withAmounts ? money(this.provisional) : null,
    };
  }
}

export async function monthlyReport(filter: FiscalReportFilter, options: { withAmounts: boolean } = { withAmounts: true }): Promise<FiscalReport> {
  const { year } = filter;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const conditions = [
    isNull(vehicleUsagePeriods.closedAt),
    lte(vehicleUsagePeriods.startDate, yearEnd),
    or(isNull(vehicleUsagePeriods.endDate), gte(vehicleUsagePeriods.endDate, yearStart)),
  ];
  if (filter.customerId !== undefined) conditions.push(eq(vehicleUsagePeriods.customerId, filter.customerId));
  if (filter.vehicleId !== undefined) conditions.push(eq(vehicleUsagePeriods.vehicleId, filter.vehicleId));
  const scoped = filter.scope ? scopeCondition(filter.scope) : undefined;
  if (scoped) conditions.push(scoped);

  const periods = await db
    .select({
      period: vehicleUsagePeriods,
      customerName: customers.name,
      vehicle: { id: vehicles.id, licensePlate: vehicles.licensePlate, brand: vehicles.brand, model: vehicles.model },
    })
    .from(vehicleUsagePeriods)
    .innerJoin(customers, eq(customers.id, vehicleUsagePeriods.customerId))
    .leftJoin(vehicles, eq(vehicles.id, vehicleUsagePeriods.vehicleId))
    .where(and(...conditions))
    .orderBy(customers.name, vehicles.licensePlate, vehicleUsagePeriods.startDate);

  const latest = new Map<number, FiscalAssessment & { ruleVersionTitle: string | null }>();
  const ids = periods.map((p) => p.period.id);
  if (ids.length) {
    const rows = await db
      .select({ assessment: fiscalAssessments, ruleVersionTitle: fiscalRuleVersions.title })
      .from(fiscalAssessments)
      .leftJoin(fiscalRuleVersions, eq(fiscalRuleVersions.id, fiscalAssessments.ruleVersionId))
      .where(
        and(
          inArray(fiscalAssessments.usagePeriodId, ids),
          sql`not exists (select 1 from ${fiscalAssessments} later where later.usage_period_id = ${fiscalAssessments.usagePeriodId} and later.sequence > ${fiscalAssessments.sequence})`,
        ),
      )
      .orderBy(desc(fiscalAssessments.id));
    for (const r of rows) latest.set(r.assessment.usagePeriodId, { ...r.assessment, ruleVersionTitle: r.ruleVersionTitle });
  }

  const rows: FiscalReportRow[] = [];
  let unassessed = 0;
  for (const { period, customerName, vehicle } of periods) {
    const a = latest.get(period.id);
    if (!a) {
      unassessed += 1;
      continue;
    }
    for (const m of a.months) {
      if (!m.month.startsWith(`${year}-`)) continue;
      rows.push({
        customerId: period.customerId,
        customerName,
        vehicleId: vehicle?.id ?? null,
        licensePlate: vehicle?.licensePlate ?? null,
        vehicle: vehicle ? [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || null : null,
        usagePeriodId: period.id,
        reservationId: period.reservationId,
        periodStart: period.startDate,
        periodEnd: period.endDate,
        assessmentId: a.id,
        status: a.status as FiscalAssessmentStatus,
        statusLabel: FISCAL_STATUS_LABELS[a.status as FiscalAssessmentStatus] ?? a.status,
        month: m.month,
        days: m.days,
        charged: m.charged,
        reason: m.reason as MonthReason,
        reasonLabel: MONTH_REASON_LABELS[m.reason as MonthReason] ?? m.reason,
        amount: options.withAmounts ? m.amount : null,
        state: a.isFinal ? "final" : m.settled ? "settled" : "provisional",
        ruleVersionTitle: a.ruleVersionTitle,
        assessedAt: a.createdAt.toISOString(),
      });
    }
  }

  const total = new Sums();
  const perCustomer = new Map<number, { customerName: string; sums: Sums }>();
  const perMonth = new Map<string, Sums>();
  for (const row of rows) {
    total.add(row);
    const c = perCustomer.get(row.customerId) ?? { customerName: row.customerName, sums: new Sums() };
    c.sums.add(row);
    perCustomer.set(row.customerId, c);
    const m = perMonth.get(row.month) ?? new Sums();
    m.add(row);
    perMonth.set(row.month, m);
  }

  return {
    year,
    withAmounts: options.withAmounts,
    rows,
    totals: { ...total.out(options.withAmounts), periods: periods.length, unassessedPeriods: unassessed },
    byCustomer: [...perCustomer.entries()]
      .map(([customerId, { customerName, sums }]) => ({ customerId, customerName, periods: sums.periods.size, ...sums.out(options.withAmounts) }))
      .sort((a, b) => a.customerName.localeCompare(b.customerName, "nl")),
    byMonth: [...perMonth.entries()]
      .map(([month, sums]) => ({ month, ...sums.out(options.withAmounts) }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

const STATE_NL: Record<MonthState, string> = { final: "eindberekening", settled: "vastgelegd", provisional: "voorlopig" };

function csvField(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Amounts with a decimal comma, so a Dutch spreadsheet reads them as numbers. */
function csvAmount(amount: string | null): string {
  return amount === null ? "" : amount.replace(".", ",");
}

/**
 * The report as CSV for a Dutch spreadsheet: semicolons, a BOM so Excel reads
 * UTF-8, one line per period-month, the totals at the end.
 */
export function reportToCsv(report: FiscalReport): string {
  const header = ["Klant", "Kenteken", "Voertuig", "Periode van", "Periode tot", "Maand", "Dagen", "Reden", ...(report.withAmounts ? ["Bedrag"] : []), "Stand", "Status", "Regelversie", "Beoordeeld op"];
  const lines = [header.join(";")];
  for (const r of report.rows) {
    lines.push(
      [
        csvField(r.customerName),
        csvField(r.licensePlate),
        csvField(r.vehicle),
        r.periodStart,
        r.periodEnd ?? "",
        r.month,
        r.days,
        csvField(r.reasonLabel),
        ...(report.withAmounts ? [csvAmount(r.amount)] : []),
        STATE_NL[r.state],
        csvField(r.statusLabel),
        csvField(r.ruleVersionTitle),
        r.assessedAt.slice(0, 10),
      ].join(";"),
    );
  }
  if (report.withAmounts) {
    lines.push("");
    lines.push(["Totaal", "", "", "", "", "", "", "", csvAmount(report.totals.amount), "", "", "", ""].join(";"));
    lines.push(["Waarvan vastgelegd", "", "", "", "", "", "", "", csvAmount(report.totals.settled), "", "", "", ""].join(";"));
    lines.push(["Waarvan voorlopig", "", "", "", "", "", "", "", csvAmount(report.totals.provisional), "", "", "", ""].join(";"));
  }
  lines.push("");
  lines.push(csvField("Berekening op basis van de geconfigureerde fiscale regels en de beschikbare gegevens. Dit is geen fiscaal advies en geen aangifte."));
  return `﻿${lines.join("\r\n")}\r\n`;
}
