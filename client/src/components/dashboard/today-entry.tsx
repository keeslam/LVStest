/**
 * OPT-001 — the dashboard's entry to "Vandaag".
 *
 * B-17 settled what the work-day screen shows but left open whether it
 * *replaces* the dashboard. The smaller, reversible half of that choice was
 * taken: "Vandaag" is its own route, the dashboard keeps every widget it had,
 * and this banner sits at the top of it — so the first thing an employee sees
 * is still "wat moet er vandaag gebeuren", and reverting the decision is
 * deleting one component rather than restoring a page.
 *
 * It shares `useTodayBoard`'s query key with the screen itself, so opening the
 * board from here costs no second request.
 */
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTodayBoard } from "@/hooks/use-today-board";

export function TodayEntry() {
  const { t } = useTranslation("dashboard");
  const { data: board, isLoading } = useTodayBoard();
  const total = board?.counts.total ?? 0;

  return (
    <Card data-testid="dashboard-today-entry">
      <CardContent className="flex flex-wrap items-center gap-3 py-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <CalendarCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-grow">
          <p className="text-base font-medium">{t("today.entryTitle")}</p>
          <p className="text-sm text-gray-500" data-testid="dashboard-today-entry-count">
            {isLoading
              ? "—"
              : total === 0
                ? t("today.entryNothing")
                : t("today.entryOpen", { count: total })}
          </p>
        </div>
        <Button asChild data-testid="button-open-today">
          <Link href="/vandaag">
            {t("today.entryAction")}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
