import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
  const missing = unreached(dialogFiles, [...DIALOGS.map((entry) => entry.source), ...LAYER_B_SOURCES]);
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
