import type { ComponentType } from "react";

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

/** Filled by the report tasks. */
export const REPORTS: ReportDef[] = [];

export function visibleReports(access: ReportAccess, reports: ReportDef[] = REPORTS): ReportDef[] {
  return reports.filter((r) => r.visible(access));
}

/** A tab shows only when it has at least one visible report. */
export function visibleTabs(access: ReportAccess, reports: ReportDef[] = REPORTS): ReportTabId[] {
  const shown = visibleReports(access, reports);
  return REPORT_TABS.filter((tab) => shown.some((r) => r.tab === tab));
}
