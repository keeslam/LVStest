import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Known limit: coverage is counted per FILE, not per dialog root. A file with
// several <Dialog>/<AlertDialog>/<Sheet> roots is credited as reached in full
// the moment ANY one registry entry (or LAYER_B_SOURCES entry) names it, even
// if the other roots in that same file are never opened by a test. This is
// deliberate (matches the brief's own DialogFile.roots-but-unreached-by-file
// design) — it is not a promise that every dialog in a reached file is
// exercised, only that the file is not silently skipped entirely.

export interface SourceFile { path: string; text: string }
export interface DialogFile { path: string; roots: number }

const ROOT = /<(Dialog|AlertDialog|Sheet)(\s|>)/g;

export function findDialogFiles(files: SourceFile[]): DialogFile[] {
  return files
    .filter((file) => file.path.endsWith(".tsx") && !/\.test\.tsx$/.test(file.path) && !file.path.includes("/ui/"))
    .map((file) => ({ path: file.path, roots: (file.text.match(ROOT) || []).length }))
    .filter((file) => file.roots > 0)
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function unreached(dialogFiles: DialogFile[], covered: string[]): DialogFile[] {
  const reached = new Set(covered);
  return dialogFiles.filter((file) => !reached.has(file.path));
}

/**
 * Names every claimed `source` (a DIALOGS[].source or a LAYER_B_SOURCES
 * entry) that is not one of the files `findDialogFiles` actually found a
 * dialog root in — e.g. a file the opener merely navigates through, or a
 * typo. Catches exactly the /reports mistake (task-7 fix round 1): crediting
 * `report-builder.tsx` / `maintenance-costs.tsx` when the <Dialog> root the
 * card actually opens lives in `reports/index.tsx`.
 */
export function unknownSources(dialogFiles: DialogFile[], claimed: string[]): string[] {
  const known = new Set(dialogFiles.map((file) => file.path));
  return [...new Set(claimed.filter((source) => !known.has(source)))];
}

function readTree(dir: string, base: string, out: SourceFile[]): SourceFile[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) readTree(full, base, out);
    else if (entry.name.endsWith(".tsx")) out.push({ path: path.relative(base, full).split(path.sep).join("/"), text: fs.readFileSync(full, "utf8") });
  }
  return out;
}

async function main() {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { DIALOGS, LAYER_B_SOURCES } = await import("../e2e/registry/dialogs");
  const dialogFiles = findDialogFiles(readTree(path.join(repo, "client", "src"), repo, []));
  const claimed = [...DIALOGS.map((entry) => entry.source), ...LAYER_B_SOURCES];
  const unknown = unknownSources(dialogFiles, claimed);
  if (unknown.length > 0) {
    console.error(`Coverage claims a source with no dialog root of its own:`);
    for (const source of unknown) {
      const entries = DIALOGS.filter((entry) => entry.source === source);
      if (entries.length > 0) {
        for (const entry of entries) console.error(`  - "${source}" (DIALOGS: "${entry.name}", opener "${entry.opener}") — find the file that actually renders <Dialog>/<AlertDialog>/<Sheet> for this opener.`);
      } else {
        console.error(`  - "${source}" (LAYER_B_SOURCES) — find the file that actually renders <Dialog>/<AlertDialog>/<Sheet> for this story.`);
      }
    }
    process.exit(1);
  }
  const missing = unreached(dialogFiles, claimed);
  const baselineFile = path.join(repo, "e2e", "registry", "coverage-baseline.json");
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8")) as { unreached: number };
  console.log(`Dialogs: ${dialogFiles.length} files with a dialog, ${dialogFiles.length - missing.length} reached by a test, ${missing.length} not yet.`);
  for (const file of missing) console.log(`  - ${file.path} (${file.roots})`);
  if (missing.length > baseline.unreached) {
    console.error(`Coverage went down: ${missing.length} unreached, the baseline allows ${baseline.unreached}. Add the new dialog to e2e/registry/dialogs.ts.`);
    process.exit(1);
  }
  if (missing.length < baseline.unreached) console.log(`Lower "unreached" in e2e/registry/coverage-baseline.json to ${missing.length}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
