/**
 * D11 follow-up (df-review Minor 8): `formatDateNl` and the helpers around it put a *moment* (an epoch
 * number, or a timestamp string with a `Z`/offset) on the office clock. A `Date` object is taken as
 * the caller built it, so `formatNl(new Date(row.createdAt), ...)` silently printed the browser's
 * clock again. This pins the sweep: no screen hands `new Date(<something>)` (or `new Date()`) to one
 * of the Dutch formatters; it passes the raw string or `Date.now()`.
 *
 * A date built from numbers (`new Date(year, month, 1)`, a calendar month) names a day, not a moment,
 * and is allowed.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const ALWAYS = ["formatNl", "formatDateNl", "formatDateTimeNl", "formatDateRangeNl", "formatDate", "formatDateTime"];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" || entry.name === "node_modules" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("screens give the Dutch date formatters the raw moment, not a Date built from it", () => {
  it("no formatter call wraps new Date(...)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(ROOT)) {
      const text = fs.readFileSync(file, "utf8");
      if (!/format-date-nl|format-utils/.test(text)) continue;
      const names = /formatNl as format\b/.test(text) ? [...ALWAYS, "format"] : ALWAYS;
      const call = new RegExp(String.raw`\b(${names.join("|")})\(\s*new Date\(([^()]*)\)`, "g");
      text.split(/\r?\n/).forEach((line, index) => {
        for (const match of line.matchAll(call)) {
          if (match[2].includes(",")) continue; // new Date(year, month, 1): a calendar day, not a moment
          offenders.push(`${path.relative(ROOT, file).split(path.sep).join("/")}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
