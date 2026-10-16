import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Een kolomkop die sorteert: klik sorteert op die kolom, nog een klik draait de
 * richting om. De kop draagt aria-sort en een pijltje voor de actieve kolom.
 */
export interface SortState<K extends string> { key: K; dir: "asc" | "desc" }

export function nextSort<K extends string>(cur: SortState<K>, key: K, defaultDir: (key: K) => "asc" | "desc" = () => "asc"): SortState<K> {
  return cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultDir(key) };
}

/** Sorteert stabiel: gelijke waarden houden hun onderlinge volgorde, ook aflopend. */
export function stableSort<T>(rows: T[], compare: (a: T, b: T) => number, dir: "asc" | "desc"): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const c = compare(a.row, b.row);
      return c ? c * (dir === "asc" ? 1 : -1) : a.index - b.index;
    })
    .map(({ row }) => row);
}

export function SortableHead<K extends string>({ label, sortKey, sort, onSort, testId, className }: {
  label: string; sortKey: K; sort: SortState<K>; onSort: (key: K) => void; testId: string; className?: string;
}) {
  const { t } = useTranslation("common");
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 -ml-1 rounded px-1 py-0.5 hover:bg-muted hover:text-foreground", active && "text-foreground")}
        title={t("table.sortBy", { column: label })}
        data-testid={testId}
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5", !active && "opacity-50")} />
      </button>
    </TableHead>
  );
}
