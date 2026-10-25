/**
 * Rapporten fase 2: the summary tiles of a money report. Every tile is a button
 * (like the tiles on Klantcommunicatie > Analyse) that opens the detail list
 * behind its number.
 *
 * Deel 1b, Task 4: a tile that follows the period can also show the number of the
 * comparison period and the change (`useCompareTile`).
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { PrintSection } from "@/lib/report-document-print";

/** The tiles of a card as a print section: label, the formatted value and the comparison. */
export function tilesPrintSection<T extends string>(tiles: Array<ReportTile<T>>): PrintSection {
  return {
    kind: "tiles",
    tiles: tiles.map((tile) => ({
      label: tile.label,
      value: tile.value,
      ...(tile.hint ? { hint: tile.hint } : {}),
      ...(tile.previous !== undefined ? { previous: tile.previous } : {}),
      ...(tile.delta ? { delta: tile.delta.text } : {}),
    })),
  };
}

export type ReportTileTone = "default" | "green" | "red" | "amber";

export type DeltaDir = "up" | "down" | "flat";

/** Which way is better for a number: more (`up`) or less (`down`). Without it the change stays neutral. */
export type BetterDir = "up" | "down";

export interface ReportTile<T extends string> {
  id: T;
  label: string;
  value: string;
  hint?: string;
  tone?: ReportTileTone;
  /** The comparison line, e.g. "was € 100"; "was –" when the old number is not known. */
  previous?: string;
  /** The change against the old number; absent when the old number is not known. */
  delta?: { text: string; dir: DeltaDir };
  better?: BetterDir;
}

const TONE: Record<ReportTileTone, string> = {
  default: "text-foreground",
  green: "text-green-600",
  red: "text-red-600",
  amber: "text-amber-600",
};

const UP = "↑";
const DOWN = "↓";

/**
 * The change from `previous` to `current` in whole percent with an arrow. An old number 0 gives
 * `newLabel` ("nieuw"), unless the new one is 0 too. The direction follows the difference, also for
 * a negative old number (a margin).
 */
export function deltaLabel(current: number, previous: number, newLabel = "nieuw"): { text: string; dir: DeltaDir } {
  if (previous === 0) return current === 0 ? { text: "0%", dir: "flat" } : { text: newLabel, dir: current > 0 ? "up" : "down" };
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (pct === 0) return { text: "0%", dir: "flat" };
  return pct > 0 ? { text: `${UP} ${pct}%`, dir: "up" } : { text: `${DOWN} ${-pct}%`, dir: "down" };
}

/** Green when the change goes the better way, red when not; neutral without `better` or without change. */
export function deltaClass(dir: DeltaDir, better?: BetterDir): string {
  if (!better || dir === "flat") return "text-muted-foreground";
  return dir === better ? "text-green-600" : "text-red-600";
}

export interface TileComparison {
  current: number;
  /** undefined: no comparison; null: compared, but the old number is not known (loading, refused). */
  previous: number | null | undefined;
  /** Formats the old number like the tile value; default nl-NL. */
  format?: (n: number) => string;
  better?: BetterDir;
}

const DASH = "–";

/**
 * Returns a function that adds the comparison to a tile (or leaves the tile as it is when
 * `previous` is undefined).
 */
export function useCompareTile() {
  const { t } = useTranslation("reports");
  return useCallback(<T extends string>(tile: ReportTile<T>, c: TileComparison): ReportTile<T> => {
    if (c.previous === undefined) return tile;
    const format = c.format ?? ((n: number) => n.toLocaleString("nl-NL"));
    if (c.previous === null) return { ...tile, previous: t("reportKit.compare.was", { value: DASH }), better: c.better };
    return {
      ...tile,
      previous: t("reportKit.compare.was", { value: format(c.previous) }),
      delta: deltaLabel(c.current, c.previous, t("reportKit.compare.new")),
      better: c.better,
    };
  }, [t]);
}

/** The comparison line under a tile value: the old number and the change. */
export function TileCompareLine({ previous, delta, better, testId }: Pick<ReportTile<string>, "previous" | "delta" | "better"> & { testId: string }) {
  if (previous === undefined) return null;
  return (
    <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
      <span data-testid={`${testId}-previous`}>{previous}</span>
      {delta && <span className={cn("font-medium", deltaClass(delta.dir, better))} data-testid={`${testId}-delta`}>{delta.text}</span>}
    </p>
  );
}

export function ReportTiles<T extends string>({ tiles, onOpen, testIdPrefix }: {
  tiles: Array<ReportTile<T>>;
  onOpen: (id: T) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <button
          key={tile.id}
          type="button"
          onClick={() => onOpen(tile.id)}
          className="rounded-lg border bg-card text-left shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`button-${testIdPrefix}-tile-${tile.id}`}
        >
          <div className="p-4">
            <p className={cn("text-2xl font-bold", TONE[tile.tone ?? "default"])} data-testid={`${testIdPrefix}-tile-${tile.id}-value`}>{tile.value}</p>
            <p className="text-sm text-muted-foreground">{tile.label}</p>
            {tile.hint && <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>}
            <TileCompareLine previous={tile.previous} delta={tile.delta} better={tile.better} testId={`${testIdPrefix}-tile-${tile.id}`} />
          </div>
        </button>
      ))}
    </div>
  );
}
