/**
 * Rapporten fase 2: the print version of one detail list of a money report
 * (fines, extra km, transport), shown in HtmlPreviewDialog. A plain table with a
 * title and a subtitle. Every value is escaped with escapeHtml (FIX-R, BUG-102):
 * descriptions and names come from the database and must never become markup.
 */
import { escapeHtml as esc } from "@/lib/html-escape";

export interface ReportTableHtmlInput {
  title: string;
  subtitle: string;
  header: string[];
  rows: string[][];
  /** Shown above the table when the export stopped at its limit. */
  truncatedNote?: string;
}

export function reportTableHtml({ title, subtitle, header, rows, truncatedNote }: ReportTableHtmlInput): string {
  const head = header.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("\n");
  return `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8" /><title>${esc(title)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #111827; margin: 24px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #6b7280; margin-bottom: 16px; }
  .note { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 4px; padding: 6px 10px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f9fafb; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
</style></head>
<body>
  <h1>${esc(title)}</h1>
  ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ""}
  ${truncatedNote ? `<div class="note">${esc(truncatedNote)}</div>` : ""}
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>
${body}
    </tbody>
  </table>
</body></html>`;
}
