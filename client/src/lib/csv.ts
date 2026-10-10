/**
 * The one CSV writer of the client (A-19-3, A-19-8, A-12-7; audit 2026-10-09,
 * module 19). Before, the fines export wrote "95.00" and "1-10-2026, 08:00:00",
 * the customer history wrote ISO dates and "150", and neither named its file
 * or told the user it had made one. Now:
 *
 *   - UTF-8 with a BOM and ";" as separator, so Excel in the Netherlands opens
 *     it with the columns in place and the accents intact;
 *   - amounts with a decimal comma ("95,00"), dates as dd-mm-yyyy, times
 *     without seconds;
 *   - the file is called <onderwerp>-<yyyy-mm-dd>.csv (the office's today);
 *   - a toast names the file and its size (`notifyFileReady`).
 *
 * The server's fiscal CSV follows the same conventions (server/services/fiscal/reports.ts).
 */
import { officeToday } from "./office-date";
import { notifyFileReady } from "./file-ready";

type Cell = string | number | null | undefined;

const BOM = "﻿";

function cell(value: Cell): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The file content: BOM, header, rows; ";" between cells, CRLF between lines. */
export function csvText(header: string[], rows: Cell[][]): string {
  return BOM + [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n");
}

/** "95,00": a decimal comma and, by default, two decimals. Missing or unreadable values are empty. */
export function csvNumber(value: number | string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(decimals).replace(".", ",");
}

/** "09-10-2026" from an ISO date or timestamp. Reads the calendar date as written, so no time zone can shift it. */
export function csvDate(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** "09-10-2026 08:00": date and time without seconds, in the local time of the viewer. */
export function csvDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** <onderwerp>-<yyyy-mm-dd>.csv. A subject that already ends in .csv keeps its stem. */
export function csvFileName(subject: string, today: string = officeToday()): string {
  return `${subject.replace(/\.csv$/i, "")}-${today}.csv`;
}

/**
 * Builds the file, hands it to the browser as a download and tells the user
 * what was made. Returns the file name.
 */
export function downloadCsv(subject: string, header: string[], rows: Cell[][], today?: string): string {
  const name = csvFileName(subject, today);
  const blob = new Blob([csvText(header, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notifyFileReady(name, blob.size);
  return name;
}
