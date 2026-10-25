import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

/**
 * Paginering voor lange lijsten in de app: paginagrootte, bereik "51–100 van
 * 2.340" en vorige/volgende. `usePager` houdt pagina en grootte bij en springt
 * terug naar pagina 1 zodra de lijst (filter of sortering) verandert.
 */
export const PAGE_SIZES = [25, 50, 100, 250] as const;

export function usePager<T>(items: T[], initialSize: number = 50) {
  const [pageSize, setPageSize] = useState<number>(initialSize);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setPage(1); }, [items, pageSize]);
  return { rows, page: safePage, pageCount, pageSize, setPage, setPageSize, total: items.length };
}

export function TablePager({ page, pageCount, pageSize, total, setPage, setPageSize, testId, sizes = PAGE_SIZES }: {
  page: number; pageCount: number; pageSize: number; total: number; setPage: (p: number) => void; setPageSize: (n: number) => void; testId: string; sizes?: readonly number[];
}) {
  const { t } = useTranslation("common");
  if (total <= Math.min(...sizes)) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid={`${testId}-pagination`}>
      <label className="flex items-center gap-2 text-muted-foreground">
        {t("table.perPage")}
        <select className="h-8 rounded-md border bg-background px-2 text-sm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} data-testid={`${testId}-page-size`}>
          {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{t("table.pageRange", { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, total), total })}</span>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={t("table.prevPage")} data-testid={`${testId}-prev-page`}><ChevronLeft className="h-4 w-4" /></Button>
        <span data-testid={`${testId}-page-indicator`}>{page} / {pageCount}</span>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page >= pageCount} onClick={() => setPage(page + 1)} aria-label={t("table.nextPage")} data-testid={`${testId}-next-page`}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
