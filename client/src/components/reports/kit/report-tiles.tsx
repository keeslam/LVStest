/**
 * Rapporten fase 2: the summary tiles of a money report. Every tile is a button
 * (like the tiles on Klantcommunicatie > Analyse) that opens the detail list
 * behind its number.
 */
import { cn } from "@/lib/utils";

export type ReportTileTone = "default" | "green" | "red" | "amber";

export interface ReportTile<T extends string> {
  id: T;
  label: string;
  value: string;
  hint?: string;
  tone?: ReportTileTone;
}

const TONE: Record<ReportTileTone, string> = {
  default: "text-foreground",
  green: "text-green-600",
  red: "text-red-600",
  amber: "text-amber-600",
};

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
          </div>
        </button>
      ))}
    </div>
  );
}
