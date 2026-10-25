import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ReportDef, ReportTabId } from "./report-registry";

const NARROW_QUERY = "(max-width: 767px)";

function narrowNow(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(NARROW_QUERY).matches;
}

/** True below 768px (the Tailwind `md` breakpoint). The app has no shared mobile hook. */
function useNarrowScreen(): boolean {
  const [narrow, setNarrow] = useState(narrowNow);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(media.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);
  return narrow;
}

interface ReportNavProps {
  tab: ReportTabId;
  reports: ReportDef[];
  selectedId: string;
  onSelect(id: string): void;
}

/** The reports of one tab: a list on the left, or a select on a narrow screen. */
export function ReportNav({ tab, reports, selectedId, onSelect }: ReportNavProps) {
  const { t } = useTranslation(["reports", "fiscal"]);
  const narrow = useNarrowScreen();

  if (narrow) {
    return (
      <Select value={selectedId || undefined} onValueChange={onSelect}>
        <SelectTrigger className="w-full bg-white" data-testid="select-report-nav" aria-label={t("reports:reportsPage.shell.reportList")}>
          <SelectValue placeholder={t("reports:reportsPage.shell.chooseReport")} />
        </SelectTrigger>
        <SelectContent>
          {reports.map((r) => (
            <SelectItem key={r.id} value={r.id}>{t(r.titleKey)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <nav data-testid="report-nav" aria-label={t("reports:reportsPage.shell.reportList")} data-tab={tab}>
      <ul className="space-y-1">
        {reports.map((r) => {
          const active = r.id === selectedId;
          const Badge = r.badge;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                aria-current={active ? "page" : undefined}
                data-testid={`report-nav-item-${r.id}`}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-gray-100",
                )}
              >
                <span>{t(r.titleKey)}</span>
                {Badge && <Badge />}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
