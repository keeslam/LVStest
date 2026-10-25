/**
 * Labels and output of the report builder (A-14-1, A-14-6).
 *
 * The stored report definitions keep the English identifiers (`vehicles`,
 * `licensePlate`, `not_equals`); only what a person reads is translated, through
 * `reports:reportBuilderPage.{sources,fields,operators}`. A saved report that
 * carries an English `label` still shows the current Dutch one.
 */
import type { TFunction } from "i18next";
import { getField, type FilterOperator } from "@shared/report-builder-config";
import type { CalculatedField } from "@shared/report-formula";
import { csvDate, csvNumber } from "@/lib/csv";
import { formatDateNl } from "@/lib/format-date-nl";
import { formatCurrency, formatDate, formatLicensePlate } from "@/lib/format-utils";
import { escapeHtml } from "@/lib/html-escape";
import { isTrueValue } from "@/lib/utils";

export function sourceLabel(t: TFunction, id: string, fallback?: string): string {
  return String(t(`reportBuilderPage.sources.${id}`, { defaultValue: fallback ?? id }));
}

export function fieldLabel(t: TFunction, table: string, name: string, fallback?: string): string {
  return String(t(`reportBuilderPage.fields.${table}.${name}`, { defaultValue: fallback ?? name }));
}

/** "Voertuig · Merk": a field read through a link carries the name of the link in front. */
export function linkedFieldLabel(t: TFunction, via: string | undefined, table: string, name: string, fallback?: string): string {
  const base = fieldLabel(t, table, name, fallback);
  return via ? `${String(t(`reportBuilderPage.links.${via}`, { defaultValue: via }))} · ${base}` : base;
}

/**
 * The key a column, filter or group has in the result rows: "calc.<id>" for a calculated field,
 * "vehicle.brand" through a link, else the plain field.
 */
export function resultKey(entry: { via?: string; field: string; calc?: string }): string {
  if (entry.calc) return `calc.${entry.calc}`;
  return entry.via ? `${entry.via}.${entry.field}` : entry.field;
}

export function aggregationLabel(t: TFunction, agg: string): string {
  return String(t(`reportBuilderPage.aggregation.${agg}`, { defaultValue: agg }));
}

/** A date grouped per month comes back as "2019-02". */
const MONTH_VALUE = /^\d{4}-\d{2}$/;

export function operatorLabel(t: TFunction, operator: FilterOperator | string): string {
  return String(t(`reportBuilderPage.operators.${operator}`, { defaultValue: operator.replace(/_/g, " ") }));
}

export interface OutputColumn {
  field: string;
  table: string;
  via?: string;
  /** Id of a calculated field; withCalcInfo sets its name as label and its kind as calcType. */
  calc?: string;
  calcType?: CalculatedField["type"];
  label: string;
  aggregation?: string;
}

/** Columns of calculated fields carry the field's current name and kind, so the output can show them. */
export function withCalcInfo<C extends OutputColumn>(columns: C[], calcs: CalculatedField[] | undefined): C[] {
  return columns.map((c) => {
    if (!c.calc) return c;
    const def = (calcs ?? []).find((f) => f.id === c.calc);
    return { ...c, label: def?.name ?? (c.label || c.calc), calcType: def?.type ?? c.calcType ?? "number" };
  });
}

/** The heading of one column: the calculated field's name, or the (linked) field label. */
export function columnLabel(t: TFunction, column: OutputColumn): string {
  if (column.calc) return column.label || column.calc;
  return linkedFieldLabel(t, column.via, column.table, column.field, column.label);
}

/**
 * The number a person reads for a value of a calculated field: a percent is a ratio, shown × 100
 * like a spreadsheet does (0.25 is 25 %); every other kind is shown as it is. One place, so
 * cells, CSV, chart, preview and totals agree.
 */
export function calcDisplayNumber(type: CalculatedField["type"] | undefined, n: number): number {
  return type === "percent" ? n * 100 : n;
}

/** A number of a calculated field as its kind shows it: "€ 121,00", "12,50 %" (for 0.125), "1.234,5". */
export function calcValueText(type: CalculatedField["type"] | undefined, n: number): string {
  if (type === "money") return formatCurrency(n);
  if (type === "percent") {
    return `${calcDisplayNumber(type, n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
  }
  return n.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
}

const CALC_ERRORS = ["UNKNOWN_FIELD", "CYCLE", "TOO_DEEP", "TOO_MANY", "BAD_RULE"];

/**
 * The server's REPORT_CALC_INVALID ({ error, id }) as a sentence that names the calculated field
 * by its own name; null for any other error.
 */
export function calcErrorText(t: TFunction, error: unknown, calcs: CalculatedField[] | undefined): string | null {
  const e = error as { code?: unknown; error?: unknown; id?: unknown } | null;
  if (!e || typeof e !== "object" || e.code !== "REPORT_CALC_INVALID") return null;
  const id = typeof e.id === "string" ? e.id : "";
  const name = (calcs ?? []).find((c) => c.id === id)?.name ?? id;
  const kind = typeof e.error === "string" && CALC_ERRORS.includes(e.error) ? e.error : "BAD_RULE";
  return String(t(`reportBuilderPage.calc.errors.${kind}`, { name }));
}

const isCount = (aggregation: string | undefined) => aggregation === "COUNT" || aggregation === "COUNT_DISTINCT";

function calcCsvCell(column: OutputColumn, value: unknown): string {
  const n = Number(value);
  if (isCount(column.aggregation)) return Number.isFinite(n) ? csvNumber(n, 0) : String(value);
  if (column.calcType === "text" || !Number.isFinite(n)) return String(value);
  // A percent goes as the percentage number (25,00), its header says "(%)", like "Korting (%)".
  return csvNumber(calcDisplayNumber(column.calcType, n), 2);
}

function calcDisplayCell(column: OutputColumn, value: unknown): string {
  const n = Number(value);
  if (isCount(column.aggregation)) return Number.isFinite(n) ? n.toLocaleString("nl-NL") : String(value);
  if (column.calcType === "text" || !Number.isFinite(n)) return String(value);
  return calcValueText(column.calcType, n);
}

/** Money-like number fields keep two decimals even when the value happens to be whole. */
const MONEY_FIELD = /price|rate|amount|fee|discount/i;

function isNumeric(column: OutputColumn): boolean {
  return !!column.aggregation || getField(column.table, column.field)?.type === "number";
}

/** One cell as the CSV file writes it: Dutch decimals, dd-mm-yyyy, Ja/Nee; empty for no value. */
export function csvCell(t: TFunction, column: OutputColumn, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (column.calc) return calcCsvCell(column, value);
  const type = getField(column.table, column.field)?.type;
  if (column.field === "licensePlate") return formatLicensePlate(String(value));
  if (type === "boolean" && !column.aggregation) return String(t(isTrueValue(value as any) || value === 1 ? "common:actions.yes" : "common:actions.no"));
  if (type === "date" && !column.aggregation) {
    if (MONTH_VALUE.test(String(value))) return `${String(value).slice(5, 7)}-${String(value).slice(0, 4)}`;
    return csvDate(String(value));
  }
  if (isNumeric(column)) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    const whole = Number.isInteger(n) && !MONEY_FIELD.test(column.field) && column.aggregation !== "AVG";
    return csvNumber(n, whole ? 0 : 2);
  }
  return String(value);
}

/** One cell as the screen and the print show it. */
export function displayCell(t: TFunction, column: OutputColumn, value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (column.calc) return calcDisplayCell(column, value);
  const type = getField(column.table, column.field)?.type;
  if (column.field === "licensePlate") return formatLicensePlate(String(value));
  if (type === "boolean" && !column.aggregation) return String(t(isTrueValue(value as any) || value === 1 ? "common:actions.yes" : "common:actions.no"));
  if (type === "date" && !column.aggregation) {
    if (MONTH_VALUE.test(String(value))) return formatDateNl(`${value}-01T12:00:00`, "MMM yyyy");
    return formatDate(String(value));
  }
  if (column.aggregation) {
    // A calculation comes back as a long decimal string: show it like the CSV, with Dutch separators.
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    const whole = Number.isInteger(n) && !MONEY_FIELD.test(column.field) && column.aggregation !== "AVG";
    const digits = whole ? 0 : 2;
    return n.toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  return String(value);
}

export function outputHeader(t: TFunction, columns: OutputColumn[]): string[] {
  return columns.map((c) => columnLabel(t, c));
}

/** The CSV header: a percent column (not counted) says "(%)", as its cells carry no % sign. */
export function csvHeader(t: TFunction, columns: OutputColumn[], labels: string[] = outputHeader(t, columns)): string[] {
  return columns.map((c, i) => (isPercentColumn(c) ? `${labels[i]} (%)` : labels[i]));
}

/** A calculated percent column whose values are percentages (not a count of them). */
export function isPercentColumn(column: OutputColumn): boolean {
  return !!column.calc && column.calcType === "percent" && !isCount(column.aggregation);
}

/** "Toyota-lijst" -> "toyota-lijst"; accents and symbols folded so the file name is safe. */
export function reportFileSubject(name: string): string {
  const slug = name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `rapport-${slug || "rapport"}`;
}

/**
 * The printable table as a complete HTML document, for the print preview
 * dialog (HtmlPreviewDialog), which renders it in a sandboxed frame without
 * scripts; every value is escaped.
 */
export function buildReportTableHtml(options: { title: string; subtitle: string; header: string[]; rows: string[][] }): string {
  return `<!doctype html><html><head>
      <meta charset="utf-8">
      <title>${escapeHtml(options.title)}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #333; padding: 20px; }
        h1 { font-size: 22px; margin: 0 0 6px; }
        .meta { font-size: 13px; color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 13px; }
        th { background: #f2f2f2; }
      </style></head><body>
      <h1>${escapeHtml(options.title)}</h1>
      <div class="meta">${escapeHtml(options.subtitle)}</div>
      <table>
        <thead><tr>${options.header.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
        <tbody>${options.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></body></html>`;
}

