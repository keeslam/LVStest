/**
 * Rapporten herontwerp deel 1, Task 4: the one print document of a report. Tiles, a chart,
 * a table and notes in a fixed order under a header with the company, the title, the period
 * and the filters. The print preview shows this exact string, and the browser prints it.
 * Every value is escaped; only the chart svg is inserted as it is (it comes from our own DOM).
 */
import { escapeHtml as esc } from "@/lib/html-escape";

/** One tile on paper; `previous` ("was 100") and `delta` (an arrow and percent) when the report compares. */
export interface PrintTile { label: string; value: string; hint?: string; previous?: string; delta?: string }

/** The rows of a print table: their text, whether the export was cut short and optionally a key per row. */
export interface PrintTableRows { rows: string[][]; truncated: boolean; rowKeys?: string[] }

/** What a report registers for printing (see ReportPrintProvider). */
export type PrintSection =
  | { kind: "tiles"; tiles: PrintTile[] }
  | { kind: "chart"; title?: string; getSvg(): string | null }
  | {
      kind: "table";
      id: string;
      title?: string;
      header: string[];
      /** A stable id per column (same order as `header`), for choosing columns; else the headings are used. */
      columnIds?: string[];
      /**
       * Every row of the filter. May be fetched (an export), so it may be async. `rowKeys` is a stable
       * key per row (plate, id) for picking rows; without it the row number is used.
       */
      allRows: () => Promise<PrintTableRows> | PrintTableRows;
      /** The rows of the page on screen. */
      pageRows?: string[][];
      /** The rows ticked in the table. */
      selectedRows?: string[][];
      /** Keys of the ticked rows (see `rowKeys`); without them the ticked rows are found by their text. */
      selectedRowKeys?: string[];
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
  /** A note of the user, printed under the header. */
  note?: string;
  fontSize?: PrintFontSize;
  /** Every section after the first starts on a new page. */
  pageBreakEach?: boolean;
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
  .intro { margin: 8px 0; white-space: pre-wrap; }
  body.font-small { font-size: 10px; }
  body.font-small .tile-value { font-size: 13px; }
  body.font-large { font-size: 14px; }
  body.font-large .tile-value { font-size: 17px; }
  body.font-large h2 { font-size: 16px; }${input.pageBreakEach ? "\n  .page-part { page-break-before: always; break-before: page; }" : ""}
</style></head>
<body class="font-${input.fontSize ?? "normal"}">
  <div class="company">${esc(input.company)}</div>
  <h1>${esc(input.title)}</h1>
  ${input.period ? `<div class="sub">${esc(input.period)}</div>` : ""}
  ${input.filters.map((line) => `<div class="sub">${esc(line)}</div>`).join("\n  ")}
  ${input.note?.trim() ? `<div class="intro">${esc(input.note.trim())}</div>` : ""}
  ${input.sections
    .map((section, i) => (input.pageBreakEach && i > 0 ? `<div class="page-part">${sectionHtml(section, labels)}</div>` : sectionHtml(section, labels)))
    .join("\n  ")}
  <div class="foot">${esc(labels.printedOn)} ${esc(input.printedAt)}</div>
</body></html>`;
}

/* ------------------------------------------------------------------------------------------------
 * Task 7 (onderhoudsanalyse): the choices of the print dialog. Sections on/off and in an own order,
 * per table which rows (all, the page, the ticked ones or picked by hand), which columns and a sort,
 * and the layout (own title, note, font size, filter lines, a new page per section).
 * ---------------------------------------------------------------------------------------------- */

export type PrintRowsChoice = "all" | "page" | "selected" | "pick";
export type PrintFontSize = "small" | "normal" | "large";

export interface PrintTableChoice {
  rows: PrintRowsChoice;
  /** Row keys picked by hand (rows "pick"). */
  picked: string[];
  /** Column ids that go on paper, in the order of the table. */
  columns: string[];
  sort?: { col: string; dir: "asc" | "desc" };
}

export interface PrintOptions {
  /** Section keys in print order. */
  order: string[];
  sectionOn: Record<string, boolean>;
  pageBreakEach: boolean;
  title?: string;
  note?: string;
  fontSize: PrintFontSize;
  showFilters: boolean;
  landscape: boolean;
  perTable: Record<string, PrintTableChoice>;
}

/**
 * A key per row for the print dialog (picking rows): `rowKey`, else the row's `id`. When a row has
 * no key the print dialog falls back to row numbers, so then there are no keys at all.
 */
export function printRowKeys<R>(rows: R[], rowKey?: (r: R) => string | number): string[] | undefined {
  const keys: string[] = [];
  for (const r of rows) {
    const k = rowKey ? rowKey(r) : (r as { id?: unknown } | null)?.id;
    if (typeof k !== "string" && typeof k !== "number") return undefined;
    keys.push(String(k));
  }
  return keys;
}

/** A section with its data in hand and a key, before the choices are applied. */
export type PreparedPrintSection =
  | { key: string; kind: "tiles" | "chart" | "note"; resolved: ResolvedPrintSection }
  | {
      key: string;
      kind: "table";
      title?: string;
      header: string[];
      columnIds: string[];
      rows: string[][];
      rowKeys: string[];
      truncated: boolean;
      page?: string[][];
      selected?: string[][];
      selectedRowKeys?: string[];
      totals?: string[];
      pageTotals?: string[];
      selectedTotals?: string[];
    };
export type PreparedPrintTable = Extract<PreparedPrintSection, { kind: "table" }>;

const unique = (list: string[]): string[] => {
  const seen = new Map<string, number>();
  return list.map((item) => {
    const n = seen.get(item) ?? 0;
    seen.set(item, n + 1);
    return n === 0 ? item : `${item}#${n + 1}`;
  });
};

/** A table section with its fetched rows; without keys from the producer, row numbers and headings are used. */
export function prepareTableSection(key: string, section: Extract<PrintSection, { kind: "table" }>, data: PrintTableRows): PreparedPrintTable {
  const rowKeys = data.rowKeys && data.rowKeys.length === data.rows.length ? unique(data.rowKeys) : data.rows.map((_, i) => String(i));
  const columnIds = section.columnIds && section.columnIds.length === section.header.length ? unique(section.columnIds) : unique(section.header);
  return {
    key,
    kind: "table",
    title: section.title,
    header: section.header,
    columnIds,
    rows: data.rows,
    rowKeys,
    truncated: data.truncated,
    page: section.pageRows,
    selected: section.selectedRows,
    selectedRowKeys: section.selectedRowKeys,
    totals: section.totals,
    pageTotals: section.pageTotals,
    selectedTotals: section.selectedTotals,
  };
}

/** The keys of the rows ticked on screen: by their key, else by their text. */
export function tickedRowKeys(table: PreparedPrintTable): string[] {
  const known = new Set(table.rowKeys);
  if (table.selectedRowKeys?.length) return table.selectedRowKeys.filter((k) => known.has(k));
  if (!table.selected?.length) return [];
  const texts = new Set(table.selected.map((row) => JSON.stringify(row)));
  return table.rowKeys.filter((_, i) => texts.has(JSON.stringify(table.rows[i])));
}

/** Everything on, all rows, the columns of the screen; a pick starts from the rows ticked on screen (else all). */
export function defaultPrintOptions(sections: PreparedPrintSection[]): PrintOptions {
  const perTable: Record<string, PrintTableChoice> = {};
  for (const s of sections) {
    if (s.kind !== "table") continue;
    const ticked = tickedRowKeys(s);
    perTable[s.key] = { rows: "all", picked: ticked.length > 0 ? ticked : [...s.rowKeys], columns: [...s.columnIds] };
  }
  return {
    order: sections.map((s) => s.key),
    sectionOn: Object.fromEntries(sections.map((s) => [s.key, true])),
    pageBreakEach: false,
    fontSize: "normal",
    showFilters: true,
    landscape: false,
    perTable,
  };
}

/**
 * Earlier choices (the dialog was open before for this report) on top of the defaults for the
 * sections there are now: unknown keys, columns and rows drop out, new sections are added at the end.
 */
export function mergePrintOptions(defaults: PrintOptions, saved: PrintOptions | undefined, sections: PreparedPrintSection[]): PrintOptions {
  if (!saved) return defaults;
  const keys = new Set(defaults.order);
  const order = [...saved.order.filter((k) => keys.has(k)), ...defaults.order.filter((k) => !saved.order.includes(k))];
  const sectionOn = { ...defaults.sectionOn };
  for (const k of keys) if (k in saved.sectionOn) sectionOn[k] = saved.sectionOn[k];
  const perTable: Record<string, PrintTableChoice> = { ...defaults.perTable };
  for (const s of sections) {
    if (s.kind !== "table" || !saved.perTable[s.key]) continue;
    const old = saved.perTable[s.key];
    const rowSet = new Set(s.rowKeys);
    const colSet = new Set(old.columns);
    const rows = (old.rows === "page" && !s.page) || (old.rows === "selected" && !s.selected?.length) ? "all" : old.rows;
    const picked = old.picked.filter((k) => rowSet.has(k));
    perTable[s.key] = {
      rows,
      picked: picked.length > 0 || old.picked.length === 0 ? picked : defaults.perTable[s.key].picked,
      columns: s.columnIds.filter((c) => colSet.has(c)),
      sort: old.sort && s.columnIds.includes(old.sort.col) ? old.sort : undefined,
    };
  }
  return { ...saved, order, sectionOn, perTable };
}

const DASH = /^[\s–—-]*$/;

/** A Dutch number in a cell ("€ 1.234,56", "12 %", "1.234 km", "-3"); null when the cell is no number. */
export function parseCellNumber(text: string): number | null {
  if (text == null || DASH.test(text)) return null;
  let s = text.replace(/[\s  ]/g, "").replace(/−/g, "-").replace("€", "");
  s = s.replace(/(%|km)$/i, "");
  if (!/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(s)) return null;
  return Number(s.replace(/\./g, "").replace(",", "."));
}

/** A Dutch date in a cell ("26-10-2026", "26-10-2026 14:05") as a number to sort on; else null. */
function parseCellDate(text: string): number | null {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/.exec(text.trim());
  if (!m) return null;
  return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0));
}

/** Rows sorted on one column: dates and amounts by value, text in Dutch order; empty cells last. */
export function sortPrintRows(rows: string[][], col: number, dir: "asc" | "desc"): string[][] {
  const sign = dir === "asc" ? 1 : -1;
  const value = (cell: string) => parseCellDate(cell) ?? parseCellNumber(cell);
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const x = a.row[col] ?? "";
      const y = b.row[col] ?? "";
      const ex = DASH.test(x);
      const ey = DASH.test(y);
      if (ex || ey) return ex === ey ? a.i - b.i : ex ? 1 : -1;
      const vx = value(x);
      const vy = value(y);
      const c = vx !== null && vy !== null ? vx - vy : x.localeCompare(y, "nl", { numeric: true, sensitivity: "base" });
      return c !== 0 ? sign * c : a.i - b.i;
    })
    .map(({ row }) => row);
}

const searchText = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");

/** True when the search matches the row; dashes and spaces do not count, so "ab12cd" finds "AB-12-CD". */
export function rowMatchesSearch(row: string[], query: string): boolean {
  const q = searchText(query);
  return q === "" || row.some((cell) => searchText(cell).includes(q));
}

/** A total in the format of the cell it replaces (euro sign and decimals). */
function formatLike(value: number, template: string): string {
  const decimals = /,(\d+)/.exec(template.replace(/\s/g, ""))?.[1].length ?? 0;
  const opts = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  return template.includes("€")
    ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", ...opts }).format(value)
    : value.toLocaleString("nl-NL", opts);
}

/**
 * Totals over the picked rows. A column is added up only when its total is the sum of all rows
 * (so an average or a count of something else stays empty); the label cell says "gekozen regels".
 */
export function pickedRowTotals(all: string[][], picked: string[][], totals: string[], label: string): string[] {
  return totals.map((cell, c) => {
    const total = parseCellNumber(cell);
    if (total === null) return c === 0 && cell.trim() !== "" ? label : "";
    let sumAll = 0;
    for (const row of all) {
      const v = row[c] === undefined || DASH.test(row[c]) ? 0 : parseCellNumber(row[c]);
      if (v === null) return "";
      sumAll += v;
    }
    if (Math.abs(sumAll - total) > 0.01 + all.length * 0.006) return "";
    const sum = picked.reduce((acc, row) => acc + (parseCellNumber(row[c] ?? "") ?? 0), 0);
    return formatLike(sum, cell);
  });
}

/** The sections as they go on paper: in the chosen order, only those that are on, with the choices of each table. */
export function resolvePrintSections(sections: PreparedPrintSection[], options: PrintOptions, labels: { pickedTotal: string }): ResolvedPrintSection[] {
  const byKey = new Map(sections.map((s) => [s.key, s]));
  const out: ResolvedPrintSection[] = [];
  for (const key of options.order) {
    const s = byKey.get(key);
    if (!s || options.sectionOn[key] === false) continue;
    if (s.kind !== "table") { out.push(s.resolved); continue; }
    const choice = options.perTable[key] ?? { rows: "all", picked: s.rowKeys, columns: s.columnIds };
    let rows = s.rows;
    let truncated = s.truncated;
    let totals = s.totals;
    if (choice.rows === "page" && s.page) {
      rows = s.page; truncated = false; totals = s.pageTotals ?? s.totals;
    } else if (choice.rows === "selected" && s.selected?.length) {
      rows = s.selected; truncated = false; totals = s.selectedTotals ?? s.totals;
    } else if (choice.rows === "pick") {
      const set = new Set(choice.picked);
      rows = s.rows.filter((_, i) => set.has(s.rowKeys[i]));
      truncated = false;
      if (s.totals && rows.length !== s.rows.length) totals = pickedRowTotals(s.rows, rows, s.totals, labels.pickedTotal);
    }
    if (choice.sort) {
      const col = s.columnIds.indexOf(choice.sort.col);
      if (col >= 0) rows = sortPrintRows(rows, col, choice.sort.dir);
    }
    const chosen = new Set(choice.columns);
    const keep = s.columnIds.map((id, i) => (chosen.has(id) ? i : -1)).filter((i) => i >= 0);
    const pickCols = (row: string[]) => keep.map((i) => row[i] ?? "");
    out.push({
      kind: "table",
      title: s.title,
      header: pickCols(s.header),
      rows: rows.map(pickCols),
      truncated,
      totals: totals ? pickCols(totals) : undefined,
    });
  }
  return out;
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
