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
import { csvDate, csvNumber } from "@/lib/csv";
import { formatDate, formatLicensePlate } from "@/lib/format-utils";
import { escapeHtml } from "@/lib/html-escape";
import { isTrueValue } from "@/lib/utils";

export function sourceLabel(t: TFunction, id: string, fallback?: string): string {
  return String(t(`reportBuilderPage.sources.${id}`, { defaultValue: fallback ?? id }));
}

export function fieldLabel(t: TFunction, table: string, name: string, fallback?: string): string {
  return String(t(`reportBuilderPage.fields.${table}.${name}`, { defaultValue: fallback ?? name }));
}

export function operatorLabel(t: TFunction, operator: FilterOperator | string): string {
  return String(t(`reportBuilderPage.operators.${operator}`, { defaultValue: operator.replace(/_/g, " ") }));
}

export interface OutputColumn {
  field: string;
  table: string;
  label: string;
  aggregation?: string;
}

/** Money-like number fields keep two decimals even when the value happens to be whole. */
const MONEY_FIELD = /price|rate|amount|fee|discount/i;

function isNumeric(column: OutputColumn): boolean {
  return !!column.aggregation || getField(column.table, column.field)?.type === "number";
}

/** One cell as the CSV file writes it: Dutch decimals, dd-mm-yyyy, Ja/Nee; empty for no value. */
export function csvCell(t: TFunction, column: OutputColumn, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const type = getField(column.table, column.field)?.type;
  if (column.field === "licensePlate") return formatLicensePlate(String(value));
  if (type === "boolean" && !column.aggregation) return String(t(isTrueValue(value as any) || value === 1 ? "common:actions.yes" : "common:actions.no"));
  if (type === "date" && !column.aggregation) return csvDate(String(value));
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
  const type = getField(column.table, column.field)?.type;
  if (column.field === "licensePlate") return formatLicensePlate(String(value));
  if (type === "boolean" && !column.aggregation) return String(t(isTrueValue(value as any) || value === 1 ? "common:actions.yes" : "common:actions.no"));
  if (type === "date" && !column.aggregation) return formatDate(String(value));
  return String(value);
}

export function outputHeader(t: TFunction, columns: OutputColumn[]): string[] {
  return columns.map((c) => fieldLabel(t, c.table, c.field, c.label));
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
 * Prints a table in the hidden, sandboxed frame the report page already uses
 * (no scripts can run in it; every value is escaped).
 */
export function printReportTable(options: { title: string; subtitle: string; header: string[]; rows: string[][] }): void {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  document.body.appendChild(frame);

  frame.onload = () => {
    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) return;
    doc.head.innerHTML = `
      <title>${escapeHtml(options.title)}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #333; padding: 20px; }
        h1 { font-size: 22px; margin: 0 0 6px; }
        .meta { font-size: 13px; color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 13px; }
        th { background: #f2f2f2; }
      </style>`;
    doc.body.innerHTML = `
      <h1>${escapeHtml(options.title)}</h1>
      <div class="meta">${escapeHtml(options.subtitle)}</div>
      <table>
        <thead><tr>${options.header.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
        <tbody>${options.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>`;
    setTimeout(() => {
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1000);
    }, 500);
  };
  frame.src = "about:blank";
}

