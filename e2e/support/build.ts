import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { REPO_ROOT } from "./env";

const SOURCES = ["client/src", "server", "shared", "package.json", "vite.config.ts", "schema-columns.json"];
const SKIP = new Set(["node_modules", "__tests__", "dist"]);

function newest(target: string): number {
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let latest = 0;
  for (const entry of fs.readdirSync(target)) {
    if (SKIP.has(entry)) continue;
    latest = Math.max(latest, newest(path.join(target, entry)));
  }
  return latest;
}

/** Builds unless dist/ is newer than every source file. */
export function ensureBuild(): void {
  const built = path.join(REPO_ROOT, "dist", "server", "index.js");
  const builtAt = fs.existsSync(built) ? fs.statSync(built).mtimeMs : 0;
  const changedAt = Math.max(...SOURCES.map((source) => newest(path.join(REPO_ROOT, source))));
  if (builtAt > changedAt) { console.log("[e2e] dist/ is up to date, build skipped"); return; }
  console.log("[e2e] building…");
  // One command string with shell: true (no args array), same as database.ts,
  // to avoid Node's DEP0190 warning about unescaped args under shell: true.
  const result = spawnSync(["npm", "run", "build"].join(" "), { cwd: REPO_ROOT, stdio: "inherit", shell: true });
  if (result.status !== 0) throw new Error("npm run build failed");
}
