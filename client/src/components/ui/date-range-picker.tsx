import * as React from "react";
import { useTranslation } from "react-i18next";
// BUG-223: "Aug 11, 2026 - Sep 10, 2026" in the reports header was the audit's
// own example. formatNl writes it as "11 aug 2026 - 10 sep 2026".
import { formatNl as format } from "@/lib/format-date-nl";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerWithRangeProps {
  date: DateRange;
  setDate: React.Dispatch<React.SetStateAction<DateRange>>;
  className?: string;
}

export function DatePickerWithRange({
  date,
  setDate,
  className,
}: DatePickerWithRangeProps) {
  const { t } = useTranslation("common");
  // Custom handler to manage the DateRange type compatibility
  const handleSelect = (selectedDateRange: DateRange | undefined) => {
    if (selectedDateRange) {
      setDate(selectedDateRange);
    }
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "d MMM yyyy")} -{" "}
                  {format(date.to, "d MMM yyyy")}
                </>
              ) : (
                format(date.from, "d MMM yyyy")
              )
            ) : (
              <span>{t('datePicker.pickDateRange')}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={handleSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}