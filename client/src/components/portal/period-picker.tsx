import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format, parseISO, isValid } from "date-fns";
import { nl, enGB } from "date-fns/locale";
import { CalendarDays, Clock, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const toIso = (d: Date | undefined) => (d ? format(d, "yyyy-MM-dd") : "");
const fromIso = (s: string | undefined) => { if (!s) return undefined; const d = parseISO(s); return isValid(d) ? d : undefined; };
const todayIso = () => format(new Date(), "yyyy-MM-dd");

/**
 * One button that shows the rental period and opens a calendar to pick it:
 * click the first day, then the last day. A single day, or "open einde"
 * (no end date), are both fine. Past days cannot be chosen.
 */
export function PeriodPicker({ start, end, onChange, allowOpenEnd = true, minDate, single, id, testId = "period", disableWeekends }: {
  start: string; end: string; onChange: (start: string, end: string) => void;
  allowOpenEnd?: boolean; minDate?: string; single?: boolean; id?: string; testId?: string; disableWeekends?: boolean;
}) {
  const { t, i18n } = useTranslation("portal");
  const locale = i18n.language?.startsWith("en") ? enGB : nl;
  const [open, setOpen] = useState(false);
  const range: DateRange = useMemo(() => ({ from: fromIso(start), to: fromIso(end) }), [start, end]);
  const min = fromIso(minDate ?? todayIso())!;
  const disabledMatcher = disableWeekends ? [{ before: min }, { dayOfWeek: [0, 6] }] : { before: min };
  const day = (d: Date, withYear = true) => format(d, withYear ? "EEEEEE d MMM yyyy" : "EEEEEE d MMM", { locale }).replace(/\./g, "");
  // First click = first day; second click = last day (or open end when it is the same day);
  // a click before the first day moves the first day; a click after a complete range starts over.
  const pickDay = (d: Date) => {
    const iso = toIso(d);
    if (!range.from || (range.from && range.to)) return onChange(iso, "");
    const from = toIso(range.from);
    if (iso < from) return onChange(iso, "");
    onChange(from, iso === from ? "" : iso);
  };
  const label = range.from
    ? single
      ? day(range.from)
      : range.to && toIso(range.to) !== toIso(range.from)
        ? `${day(range.from, range.from.getFullYear() !== range.to.getFullYear())} – ${day(range.to)}`
        : range.to ? day(range.from) : `${day(range.from)} · ${t("period.openEnd")}`
    : t(single ? "period.pickDay" : "period.pick");
  const months = typeof window !== "undefined" && window.innerWidth >= 768 ? 2 : 1;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" className="h-10 w-full justify-start text-left font-normal" data-testid={`${testId}-button`}>
          <CalendarDays className="mr-2 h-4 w-4 shrink-0 text-[#1a1d62]" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {single ? (
          <Calendar mode="single" locale={locale} numberOfMonths={months} defaultMonth={range.from ?? min} selected={range.from}
            disabled={disabledMatcher} weekStartsOn={1} initialFocus
            onSelect={() => undefined} onDayClick={(d, mods) => { if (!mods.disabled) { onChange(toIso(d), ""); setOpen(false); } }} />
        ) : (<>
          <Calendar mode="range" locale={locale} numberOfMonths={months} defaultMonth={range.from ?? min} selected={range}
            disabled={disabledMatcher} weekStartsOn={1} initialFocus
            onSelect={() => undefined} onDayClick={(d, mods) => { if (!mods.disabled) pickDay(d); }} />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-[#64748b]">
            <span>{range.from && !range.to ? (allowOpenEnd ? t("period.hintEnd") : t("period.hintEndRequired")) : t("period.hintStart")}</span>
            <div className="flex gap-1">
              {allowOpenEnd && range.from && range.to && <Button type="button" size="sm" variant="ghost" onClick={() => onChange(start, "")}><X className="mr-1 h-3.5 w-3.5" />{t("period.openEnd")}</Button>}
              <Button type="button" size="sm" onClick={() => setOpen(false)} data-testid={`${testId}-done`}>{t("period.done")}</Button>
            </div>
          </div>
        </>)}
      </PopoverContent>
    </Popover>
  );
}

/** Quarter-hour choices between 06:00 and 22:00; "geen voorkeur" leaves it empty. */
export function TimeSelect({ id, label, value, onChange, testId }: { id: string; label: string; value: string; onChange: (v: string) => void; testId?: string }) {
  const { t } = useTranslation("portal");
  const options = useMemo(() => {
    const out: string[] = [];
    for (let h = 6; h <= 22; h += 1) for (const m of ["00", "15", "30", "45"]) { if (h === 22 && m !== "00") break; out.push(`${String(h).padStart(2, "0")}:${m}`); }
    return out;
  }, []);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
        <select id={id} className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
          <option value="">{t("period.noTime")}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    </div>
  );
}
