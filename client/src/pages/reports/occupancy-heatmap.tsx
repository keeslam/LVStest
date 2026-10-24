/**
 * Rapporten fase 3, onderdeel 6: the occupancy calendar. Weeks are rows (Monday
 * to Sunday), each cell is one day coloured by the rented share of the fleet,
 * with a dot for cars in the workshop and one for replacement cars (those never
 * count as occupied). Below it a line per state as a share of the fleet.
 *
 * Dates are the office dates the server sends (`yyyy-mm-dd`); the weekday is
 * read from the date itself (UTC), not from the browser's time zone.
 */
import { useTranslation } from "react-i18next";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OccupancyDay } from "@shared/reports/occupancy-report";
import { occupancyPct } from "@shared/reports/occupancy-report";
import { formatDateNl } from "@/lib/format-date-nl";
import { cn } from "@/lib/utils";

/** 0 = Monday … 6 = Sunday, from the date string alone. */
function weekdayIndex(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** The days as weeks Monday–Sunday, padded with null before the first and after the last day. */
export function calendarWeeks(days: OccupancyDay[]): Array<Array<OccupancyDay | null>> {
  if (days.length === 0) return [];
  const cells: Array<OccupancyDay | null> = [
    ...Array.from({ length: weekdayIndex(days[0].date) }, () => null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<OccupancyDay | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export type OccupancyBucket = "none" | 0 | 1 | 2 | 3 | 4;

/** The colour step of a day: no fleet, nothing rented, up to 25, 50, 75 % and above. */
export function occupancyBucket(pct: number | null): OccupancyBucket {
  if (pct === null) return "none";
  if (pct === 0) return 0;
  if (pct <= 25) return 1;
  if (pct <= 50) return 2;
  if (pct <= 75) return 3;
  return 4;
}

const BUCKET_CLASS: Record<string, string> = {
  none: "bg-muted text-muted-foreground",
  0: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  1: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100",
  2: "bg-green-300 text-green-950 dark:bg-green-800 dark:text-green-50",
  3: "bg-green-500 text-white dark:bg-green-600",
  4: "bg-green-700 text-white dark:bg-green-500",
};

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const LINE_COLORS = { rented: "#16a34a", workshop: "#f97316", replacement: "#3b82f6" } as const;

const pctText = (pct: number | null) => (pct === null ? "–" : `${pct.toLocaleString("nl-NL")}%`);

export function OccupancyHeatmap({ days, onSelectDay, selectedDay }: {
  days: OccupancyDay[];
  onSelectDay: (date: string) => void;
  selectedDay: string | null;
}) {
  const { t } = useTranslation("reports");
  const k = (key: string, opts?: Record<string, unknown>) => t(`fleetReports.occupancy.${key}`, opts);

  if (days.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground" data-testid="occupancy-heatmap-empty">{t("reportKit.noData")}</p>;
  }

  const weeks = calendarWeeks(days);
  const lines = days.map((d) => ({
    date: d.date,
    rented: occupancyPct(d.rented, d.fleet),
    workshop: occupancyPct(d.workshop, d.fleet),
    replacement: occupancyPct(d.replacement, d.fleet),
  }));
  const dayLabel = (date: string) => formatDateNl(date, "d MMM");

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto" data-testid="occupancy-heatmap">
        <div className="grid min-w-[22rem] grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-xs font-medium text-muted-foreground">{k(`weekdays.${w}`)}</div>
          ))}
          {weeks.flatMap((week, wi) => week.map((day, di) => {
            if (!day) return <div key={`empty-${wi}-${di}`} aria-hidden="true" />;
            const bucket = occupancyBucket(day.pct);
            const title = [
              formatDateNl(day.date, "medium"),
              `${k("tiles.rented")}: ${day.rented}`,
              `${k("tiles.workshop")}: ${day.workshop}`,
              `${k("tiles.replacement")}: ${day.replacement}`,
              `${k("tiles.available")}: ${day.available}`,
              `${k("fleet")}: ${day.fleet}`,
              `${k("pct")}: ${pctText(day.pct)}`,
            ].join("\n");
            return (
              <button
                key={day.date}
                type="button"
                title={title}
                aria-pressed={selectedDay === day.date}
                onClick={() => onSelectDay(day.date)}
                className={cn(
                  "relative flex h-12 flex-col items-center justify-center rounded-md text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  BUCKET_CLASS[String(bucket)],
                  selectedDay === day.date && "ring-2 ring-primary ring-offset-1",
                )}
                data-testid={`occupancy-day-${day.date}`}
                data-bucket={String(bucket)}
              >
                <span className="font-semibold">{Number(day.date.slice(8, 10))}</span>
                <span className="tabular-nums">{pctText(day.pct)}</span>
                <span className="absolute right-1 top-1 flex gap-0.5">
                  {day.workshop > 0 && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" data-testid={`occupancy-day-${day.date}-workshop`} />}
                  {day.replacement > 0 && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" data-testid={`occupancy-day-${day.date}-replacement`} />}
                </span>
              </button>
            );
          }))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground" data-testid="occupancy-legend">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-green-500" />{k("legend.rented")}</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" />{k("legend.workshop")}</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />{k("legend.replacement")}</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-muted" />{k("legend.none")}</span>
      </div>
      <div className="h-64 w-full" data-testid="occupancy-lines">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={lines} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={dayLabel} minTickGap={16} />
            <YAxis domain={[0, 100]} tickFormatter={(n: number) => `${n}%`} width={45} />
            <Tooltip labelFormatter={(d) => dayLabel(String(d))} formatter={(n: number, name: string) => [pctText(n ?? null), name]} />
            <Legend />
            <Line type="monotone" dataKey="rented" name={k("lines.rented")} stroke={LINE_COLORS.rented} dot={false} connectNulls />
            <Line type="monotone" dataKey="workshop" name={k("lines.workshop")} stroke={LINE_COLORS.workshop} dot={false} connectNulls />
            <Line type="monotone" dataKey="replacement" name={k("lines.replacement")} stroke={LINE_COLORS.replacement} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
