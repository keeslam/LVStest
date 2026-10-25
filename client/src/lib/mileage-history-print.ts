/**
 * Shared types and helpers of the kilometre history of one vehicle (screen panel). The print goes
 * through the report print dialog; see mileage-history-panel.tsx.
 */
import type { AnalysedRow, MileageSource, MileageSummary } from "@shared/mileage-history";

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
