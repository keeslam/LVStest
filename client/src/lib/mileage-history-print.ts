/**
 * Task 7 (rapporten fase 1): the print version of the kilometre history of one
 * vehicle, shown in HtmlPreviewDialog. Every value from the database (plate,
 * brand, model, who recorded it) is escaped with escapeHtml (FIX-R, BUG-102).
 * The chart is an inline SVG polyline built from the same points as the screen's
 * line chart (valid readings only), so the print needs no script.
 */
import type { AnalysedRow, MileageSource, MileageSummary } from "@shared/mileage-history";
import { escapeHtml as esc } from "@/lib/html-escape";
import { formatDateNl, formatDateTimeNl } from "@/lib/format-date-nl";
import { formatLicensePlate } from "@/lib/format-utils";

export interface MileageHistoryResponse {
  vehicle: { id: number; licensePlate: string; brand: string; model: string; freeKmPerDay: number | null };
  rows: AnalysedRow[];
  summary: MileageSummary;
}

export interface MileageHistoryLabels {
  title: string;
  period: string;
  drivenKm: string;
  avgPerMonth: string;
  freeKm: string;
  overFreeKm: string;
  warnings: string;
  chart: string;
  date: string;
  mileage: string;
  driven: string;
  source: string;
  actor: string;
  warning: string;
  voided: string;
  empty: string;
  sources: Record<MileageSource, string>;
  warningTypes: Record<"decrease" | "jump", string>;
}

/** "12.500 km"; a missing number prints a dash. */
export function formatKm(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return `${value.toLocaleString("nl-NL")} km`;
}

/** The points of the line chart: valid readings only, oldest first. */
export function mileageChartPoints(rows: AnalysedRow[]): { time: number; mileage: number }[] {
  return rows
    .filter((r) => !r.voided)
    .map((r) => ({ time: Date.parse(r.recordedAt), mileage: r.mileage }))
    .filter((p) => Number.isFinite(p.time))
    .sort((a, b) => a.time - b.time);
}

function chartSvg(rows: AnalysedRow[]): string {
  const points = mileageChartPoints(rows);
  if (points.length === 0) return "";
  const width = 700;
  const height = 200;
  const pad = 10;
  const minT = points[0].time;
  const maxT = points[points.length - 1].time;
  const minM = Math.min(...points.map((p) => p.mileage));
  const maxM = Math.max(...points.map((p) => p.mileage));
  const x = (t: number) => (maxT === minT ? width / 2 : pad + ((t - minT) / (maxT - minT)) * (width - 2 * pad));
  const y = (m: number) => (maxM === minM ? height / 2 : height - pad - ((m - minM) / (maxM - minM)) * (height - 2 * pad));
  const coords = points.map((p) => `${x(p.time).toFixed(1)},${y(p.mileage).toFixed(1)}`).join(" ");
  const dots = points.map((p) => `<circle cx="${x(p.time).toFixed(1)}" cy="${y(p.mileage).toFixed(1)}" r="3" fill="#2563eb" />`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" style="border:1px solid #e5e7eb;border-radius:4px">
    <polyline points="${coords}" fill="none" stroke="#2563eb" stroke-width="2" />${dots}
  </svg>
  <div class="axis"><span>${esc(formatKm(minM))}</span><span>${esc(formatKm(maxM))}</span></div>`;
}

export function mileageHistoryHtml(
  data: MileageHistoryResponse,
  labels: MileageHistoryLabels,
  period: { from: string; to: string },
): string {
  const { vehicle, rows, summary } = data;
  const plate = formatLicensePlate(vehicle.licensePlate);
  // The effective period (first reading .. today at the latest) when the summary has one, else the asked period.
  const periodText = `${formatDateNl(summary.periodFrom ?? period.from, "medium")} – ${formatDateNl(summary.periodTo ?? period.to, "medium")}`;
  const freeText = summary.freeKm == null
    ? "–"
    : `${formatKm(summary.freeKm)}${summary.overFreeKm ? ` (${labels.overFreeKm}: ${formatKm(summary.overFreeKm)})` : ""}`;

  const rowHtml = rows.map((r) => {
    const warning = r.voided ? labels.voided : r.warning ? labels.warningTypes[r.warning] : "";
    return `<tr class="${r.voided ? "voided" : r.warning ? "warn" : ""}">
      <td>${esc(formatDateTimeNl(r.recordedAt))}</td>
      <td class="num">${esc(formatKm(r.mileage))}</td>
      <td class="num">${esc(r.drivenSincePrevious == null ? "–" : formatKm(r.drivenSincePrevious))}</td>
      <td>${esc(labels.sources[r.source] ?? r.source)}</td>
      <td>${esc(r.actorName ?? "–")}</td>
      <td>${esc(warning)}</td>
    </tr>`;
  }).join("");

  const warningRows = rows.filter((r) => !r.voided && r.warning);
  const warningList = warningRows.length === 0 ? "" : `
    <h2>${esc(labels.warnings)}</h2>
    <ul>${warningRows.map((r) => `<li>${esc(formatDateTimeNl(r.recordedAt))}: ${esc(labels.warningTypes[r.warning!])} (${esc(formatKm(r.mileage))})</li>`).join("")}</ul>`;

  return `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8" /><title>${esc(labels.title)} ${esc(plate)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #111827; margin: 24px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 20px 0 8px; }
  .sub { color: #6b7280; margin-bottom: 16px; }
  .stats { display: flex; gap: 12px; margin-bottom: 16px; }
  .stat { border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px 12px; flex: 1; }
  .stat-label { color: #6b7280; font-size: 11px; }
  .stat-value { font-size: 16px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 4px 6px; text-align: left; }
  th { background: #f9fafb; }
  td.num, th.num { text-align: right; }
  tr.voided td { color: #9ca3af; text-decoration: line-through; }
  tr.warn td { background: #fef3c7; }
  .axis { display: flex; justify-content: space-between; color: #6b7280; font-size: 10px; }
</style></head>
<body>
  <h1>${esc(labels.title)} ${esc(plate)}</h1>
  <div class="sub">${esc(vehicle.brand)} ${esc(vehicle.model)} · ${esc(labels.period)}: ${esc(periodText)}</div>
  <div class="stats">
    <div class="stat"><div class="stat-label">${esc(labels.drivenKm)}</div><div class="stat-value">${esc(formatKm(summary.drivenKm))}</div></div>
    <div class="stat"><div class="stat-label">${esc(labels.avgPerMonth)}</div><div class="stat-value">${esc(formatKm(summary.avgPerMonth))}</div></div>
    <div class="stat"><div class="stat-label">${esc(labels.freeKm)}</div><div class="stat-value">${esc(freeText)}</div></div>
    <div class="stat"><div class="stat-label">${esc(labels.warnings)}</div><div class="stat-value">${esc(summary.warnings)}</div></div>
  </div>
  ${rows.length === 0 ? `<p>${esc(labels.empty)}</p>` : `
  <h2>${esc(labels.chart)}</h2>
  ${chartSvg(rows)}
  <h2>${esc(labels.title)}</h2>
  <table>
    <thead><tr>
      <th>${esc(labels.date)}</th><th class="num">${esc(labels.mileage)}</th><th class="num">${esc(labels.driven)}</th>
      <th>${esc(labels.source)}</th><th>${esc(labels.actor)}</th><th>${esc(labels.warning)}</th>
    </tr></thead>
    <tbody>${rowHtml}</tbody>
  </table>
  ${warningList}`}
</body></html>`;
}
