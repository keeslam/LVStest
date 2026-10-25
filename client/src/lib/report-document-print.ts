/**
 * Rapporten herontwerp deel 1, Task 4: the one print document of a report. Tiles, a chart,
 * a table and notes in a fixed order under a header with the company, the title, the period
 * and the filters. The print preview shows this exact string, and the browser prints it.
 * Every value is escaped; only the chart svg is inserted as it is (it comes from our own DOM).
 */
import { escapeHtml as esc } from "@/lib/html-escape";

/** One tile on paper; `previous` ("was 100") and `delta` (an arrow and percent) when the report compares. */
export interface PrintTile { label: string; value: string; hint?: string; previous?: string; delta?: string }

/** What a report registers for printing (see ReportPrintProvider). */
export type PrintSection =
  | { kind: "tiles"; tiles: PrintTile[] }
  | { kind: "chart"; title?: string; getSvg(): string | null }
  | {
      kind: "table";
      id: string;
      title?: string;
      header: string[];
      /** Every row of the filter. May be fetched (an export), so it may be async. */
      allRows: () => Promise<{ rows: string[][]; truncated: boolean }> | { rows: string[][]; truncated: boolean };
      /** The rows of the page on screen. */
      pageRows?: string[][];
      /** The rows ticked in the table. */
      selectedRows?: string[][];
      totals?: string[];
      /** Totals over the rows of the page on screen / the ticked rows, for those print choices (else `totals`). */
      pageTotals?: string[];
      selectedTotals?: string[];
    }
  | { kind: "note"; text: string };

/** A section with its data in hand, ready to be written down. */
export type ResolvedPrintSection =
  | { kind: "tiles"; tiles: PrintTile[] }
  | { kind: "chart"; title?: string; svg: string }
  | { kind: "table"; title?: string; header: string[]; rows: string[][]; truncated: boolean; totals?: string[] }
  | { kind: "note"; text: string };

export interface ReportDocumentLabels {
  truncated: string;
  printedOn: string;
}

export const DEFAULT_REPORT_DOCUMENT_LABELS: ReportDocumentLabels = {
  truncated: "Niet alle regels passen in de export. De lijst is afgekapt.",
  printedOn: "Gedrukt op",
};

export interface ReportDocumentInput {
  company: string;
  title: string;
  period: string;
  filters: string[];
  sections: ResolvedPrintSection[];
  landscape: boolean;
  printedAt: string;
  /** Translated texts; the Dutch defaults apply to what is left out. */
  labels?: Partial<ReportDocumentLabels>;
}

/** Text for a CSS string (the page margin box); nothing in it can end the string or the style element. */
function cssString(text: string): string {
  return text.replace(/[\\"<>&\r\n]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `);
}

function sectionHtml(section: ResolvedPrintSection, labels: ReportDocumentLabels): string {
  switch (section.kind) {
    case "tiles":
      return `<div class="tiles">${section.tiles
        .map((tile) => `<div class="tile"><div class="tile-label">${esc(tile.label)}</div><div class="tile-value">${esc(tile.value)}</div>${tile.hint ? `<div class="tile-hint">${esc(tile.hint)}</div>` : ""}${
          tile.previous !== undefined ? `<div class="tile-hint tile-compare">${esc([tile.previous, tile.delta].filter(Boolean).join(" · "))}</div>` : ""
        }</div>`)
        .join("")}</div>`;
    case "chart":
      return `<div class="chart">${section.title ? `<h2>${esc(section.title)}</h2>` : ""}${section.svg}</div>`;
    case "table": {
      const head = section.header.map((h) => `<th>${esc(h)}</th>`).join("");
      const body = section.rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("\n");
      const foot = section.totals ? `<tfoot><tr>${section.totals.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr></tfoot>` : "";
      return `<div class="table">${section.title ? `<h2>${esc(section.title)}</h2>` : ""}${
        section.truncated ? `<div class="note">${esc(labels.truncated)}</div>` : ""
      }<table><thead><tr>${head}</tr></thead><tbody>
${body}
</tbody>${foot}</table></div>`;
    }
    case "note":
      return `<p class="note">${esc(section.text)}</p>`;
  }
}

export function reportDocumentHtml(input: ReportDocumentInput): string {
  const labels = { ...DEFAULT_REPORT_DOCUMENT_LABELS, ...input.labels };
  const size = input.landscape ? "landscape" : "portrait";
  return `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8" /><title>${esc(input.title)}</title>
<style>
  @page { size: A4 ${size}; margin: 12mm 12mm 16mm; @bottom-left { content: "${cssString(`${labels.printedOn} ${input.printedAt}`)}"; font-size: 10px; color: #6b7280; } @bottom-right { content: counter(page); font-size: 10px; color: #6b7280; } }
  body { font-family: Arial, sans-serif; color: #111827; margin: 0; font-size: 12px; }
  .company { color: #6b7280; font-size: 11px; }
  h1 { font-size: 20px; margin: 2px 0 4px; }
  h2 { font-size: 14px; margin: 14px 0 6px; }
  .sub { color: #374151; margin-bottom: 2px; }
  .tiles { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
  .tile { border: 1px solid #e5e7eb; border-radius: 4px; padding: 6px 10px; min-width: 110px; }
  .tile-label { color: #6b7280; font-size: 10px; }
  .tile-value { font-size: 15px; font-weight: bold; }
  .tile-hint { color: #6b7280; font-size: 10px; }
  .chart svg { max-width: 100%; height: auto; }
  .note { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 4px; padding: 6px 10px; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f9fafb; }
  thead { display: table-header-group; }
  tfoot td { font-weight: bold; border-top: 2px solid #9ca3af; }
  tr { page-break-inside: avoid; }
  .foot { margin-top: 16px; color: #6b7280; font-size: 10px; }
</style></head>
<body>
  <div class="company">${esc(input.company)}</div>
  <h1>${esc(input.title)}</h1>
  ${input.period ? `<div class="sub">${esc(input.period)}</div>` : ""}
  ${input.filters.map((line) => `<div class="sub">${esc(line)}</div>`).join("\n  ")}
  ${input.sections.map((section) => sectionHtml(section, labels)).join("\n  ")}
  <div class="foot">${esc(labels.printedOn)} ${esc(input.printedAt)}</div>
</body></html>`;
}

/** The svg of a chart wrapper as text, scaled to the page; null when the chart is not drawn. */
export function chartSvgFromRef(ref: { current: HTMLElement | null }): string | null {
  const svg = ref.current?.querySelector("svg.recharts-surface");
  if (!svg) return null;
  const copy = svg.cloneNode(true) as SVGElement;
  const width = copy.getAttribute("width");
  const height = copy.getAttribute("height");
  if (!copy.getAttribute("viewBox") && width && height) copy.setAttribute("viewBox", `0 0 ${parseFloat(width)} ${parseFloat(height)}`);
  copy.removeAttribute("height");
  copy.setAttribute("width", "100%");
  return copy.outerHTML;
}
