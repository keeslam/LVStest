/**
 * Final wave of sub-project C, item 11 - every control that opens the revert
 * dialog (`button-revert-handover*`) sits inside
 * `<RequiresPermission anyOf={[UserPermission.REVERT_HANDOVER]}>`: visible but
 * greyed out, naming the right, for everyone who lacks it. The server answers
 * 403 to the dialog's preview and to the revert itself without the right, so an
 * opener that is not wrapped would lead to a dialog that can only fail.
 *
 * A source check in the style of recycle-bin-openers.test.tsx: the openers live
 * in five page-sized components that are covered end to end by the E2E suite;
 * here nobody can add a sixth opener (or drop a wrapper) without this failing.
 *
 * Runs in the jsdom project (plan section 8.8).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(process.cwd(), "client/src");
const OPENER = /button-revert-handover/g;
const RIGHT = "UserPermission.REVERT_HANDOVER";

/** The `anyOf` expressions of every RequiresPermission that is still open at `index`. */
function openWrappersAt(source: string, index: number): string[] {
  const stack: string[] = [];
  const tag = /<RequiresPermission\b|<\/RequiresPermission\s*>/g;
  for (let match = tag.exec(source); match && match.index < index; match = tag.exec(source)) {
    if (match[0].startsWith("</")) {
      stack.pop();
      continue;
    }
    // Read the opening tag up to its closing ">" (braces may hold arrow functions with "=>").
    let depth = 0;
    let end = match.index + match[0].length;
    for (; end < source.length; end++) {
      const ch = source[end];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    const openingTag = source.slice(match.index, end + 1);
    if (openingTag.endsWith("/>")) continue; // self-closing: encloses nothing
    stack.push(/anyOf=\{([^]*?)\}(?=\s|>)/.exec(openingTag)?.[1] ?? "");
  }
  return stack;
}

/** Whether the opener at `index` sits inside a RequiresPermission that lists the revert right. */
function isGatedByRevertRight(source: string, index: number): boolean {
  return openWrappersAt(source, index).some((anyOf) => anyOf.includes(RIGHT));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" || name === "node_modules" ? [] : sourceFiles(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

describe("the checker itself", () => {
  it("accepts an opener inside the wrapper and rejects one outside it, or inside another right", () => {
    const at = (source: string) => source.indexOf("button-revert-handover");

    const wrapped = `<RequiresPermission anyOf={[UserPermission.REVERT_HANDOVER]}>\n<Button data-testid="button-revert-handover">x</Button>\n</RequiresPermission>`;
    expect(isGatedByRevertRight(wrapped, at(wrapped))).toBe(true);

    const bare = `<div><Button data-testid="button-revert-handover">x</Button></div>`;
    expect(isGatedByRevertRight(bare, at(bare))).toBe(false);

    const afterClose = `<RequiresPermission anyOf={[UserPermission.REVERT_HANDOVER]}><A/></RequiresPermission>\n<Button data-testid="button-revert-handover">x</Button>`;
    expect(isGatedByRevertRight(afterClose, at(afterClose))).toBe(false);

    const otherRight = `<RequiresPermission anyOf={[UserPermission.MANAGE_RESERVATIONS]}>\n<Button data-testid="button-revert-handover">x</Button>\n</RequiresPermission>`;
    expect(isGatedByRevertRight(otherRight, at(otherRight))).toBe(false);

    const arrow = `<RequiresPermission fallback={() => <i/>} anyOf={[UserPermission.REVERT_HANDOVER]}>\n<Button data-testid="button-revert-handover">x</Button>\n</RequiresPermission>`;
    expect(isGatedByRevertRight(arrow, at(arrow))).toBe(true);
  });
});

describe("every button-revert-handover* opener is wrapped in RequiresPermission anyOf REVERT_HANDOVER", () => {
  const sites = sourceFiles(ROOT).flatMap((file) => {
    const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    return [...source.matchAll(OPENER)].map((match) => ({
      file: relative(process.cwd(), file).replace(/\\/g, "/"),
      source,
      index: match.index as number,
      line: source.slice(0, match.index).split("\n").length,
    }));
  });

  it("finds the known call sites (so this check cannot pass by finding nothing)", () => {
    const files = new Set(sites.map((site) => site.file));
    for (const known of [
      "client/src/components/reservations/reservation-list-dialog.tsx",
      "client/src/components/reservations/reservation-quick-status-button.tsx",
      "client/src/components/reservations/vehicle-reservations-status-dialog.tsx",
      "client/src/components/vehicles/quick-status-change-button.tsx",
      "client/src/pages/reservations/calendar.tsx",
    ]) {
      expect(files, `${known} must still hold a revert opener`).toContain(known);
    }
    expect(sites.length).toBeGreaterThanOrEqual(7);
  });

  it("no call site is outside the wrapper", () => {
    const ungated = sites
      .filter((site) => !isGatedByRevertRight(site.source, site.index))
      .map((site) => `${site.file}:${site.line}`);
    expect(ungated).toEqual([]);
  });
});
