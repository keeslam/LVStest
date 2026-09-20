# Browser E2E Tests — Harness, Layer A and Desk Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Playwright suite that builds a database from nothing, starts the production build, opens every page and dialog for seven permission profiles, walks the rental-desk workflow with a counted step budget, and ends with a Dutch review of that workflow for the owner.

**Architecture:** Playwright's `webServer` runs one script (`e2e/support/serve.ts`) that recreates the database `lvs_e2e`, applies `drizzle-kit push` and `startup-migration.js`, seeds it, starts a local RDW stub and then the production build on port 5010. A `setup` project logs in once per role and stores the session; `layer-a` and `layer-b` projects reuse those sessions. A page-health fixture fails any test on a 5xx/429, console error, uncaught exception, destructive toast or the error boundary.

**Tech Stack:** `@playwright/test` (installed Chrome, `channel: "chrome"`), `tsx`, `pg`, PostgreSQL 17 on localhost, the existing Express + React production build.

**Spec:** `docs/superpowers/specs/2026-09-20-e2e-browser-tests-design.md` — read it first. This plan covers "Order of work" steps 1–4 and 6. Step 5 (approved improvements and the final desk tests) gets its own plan after the owner has decided on the proposals from Task 9.

## Global Constraints

- Database name is exactly `lvs_e2e`, on `postgresql://postgres:postgres@localhost:5432`. The harness refuses any other database name. Never touch `lvstest`, `lvs_prodtest`, `lvs_fixtest`.
- Server tests (vitest) run only with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest DATABASE_SSL=false`.
- No test-only bypass in server code. The only production code change allowed by this plan is the `RDW_BASE_URL` constant (Task 2) and added `data-testid` attributes.
- No outbound traffic from the application under test: no SMTP seeded, `GEMINI_API_KEY` empty, RDW pointed at the local stub.
- No workflow or business behaviour changes. Findings go into the review document (Task 9); technical bugs may be fixed only with a regression test and a separate commit.
- `retries: 0`. A flaky test is fixed, never retried into green.
- Everything the harness writes goes under `e2e/.tmp/` (git-ignored).
- Code and comments in English. `docs/e2e/**` in Dutch (the owner reads it). Commit messages: Dutch Conventional Commits, scope `(e2e)`, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- `git add` explicit paths only; never `graphify-out/`, never `.claude/launch.json`.
- Never push. Pushing to `main` deploys production and needs the owner's explicit approval.
- Windows machine: PostgreSQL client tools live in `C:\Program Files\PostgreSQL\17\bin` and are not on `PATH`; use the `pg` package, not `psql`, from code.

## File Structure

```
e2e/
  tsconfig.json
  playwright.config.ts
  support/
    env.ts            constants: port, database URL, paths, password
    database.ts       recreate lvs_e2e, push schema, run migration
    build.ts          reuse dist/ when fresh, else npm run build
    rdw-stub.ts       local HTTP stub for the two RDW resources
    serve.ts          webServer entry: database, seed, stub, server
    guards.ts         settle(), watchPage(), `test` fixture with `health`
    roles.ts          ROLES, authFile(role), can(role, permissions)
    steps.ts          Story: counted user actions with a budget
  seed/
    users.ts          permission profile per role
    data.ts           vehicles, customers, reservations, other records
    seed.ts           runSeed(): writes users.ts + data.ts into the database
  setup/
    database.setup.ts schema proof
    auth.setup.ts     one login per role, storageState saved
  registry/
    pages.ts          routes and the permissions that may open them
    dialogs.ts        per page: dialog openers
    coverage-baseline.json
  layer-a/
    pages.spec.ts
    forbidden.spec.ts
    dialogs.spec.ts
  layer-b/
    desk/rental-story.spec.ts
scripts/
  e2e-dialog-coverage.ts        pure scanner + CLI
  e2e-dialog-coverage.test.ts   vitest (scripts/** is in the server project)
server/utils/rdw-api.ts         RDW_BASE_URL constant
server/__tests__/rdw-base-url.test.ts
docs/e2e/README.md
docs/e2e/werkstromen/01-balie.md
```

---

### Task 1: Playwright scaffolding and a database built from nothing

**Files:**
- Modify: `package.json` (devDependency, scripts), `.gitignore`
- Create: `e2e/tsconfig.json`, `e2e/playwright.config.ts`, `e2e/support/env.ts`, `e2e/support/database.ts`, `e2e/setup/database.setup.ts`

**Interfaces:**
- Produces: `E2E` constants object; `prepareDatabase(): Promise<void>`; npm scripts `e2e`, `e2e:a`, `e2e:b`.

- [ ] **Step 1: Install and wire up**

```bash
npm install --save-dev @playwright/test
```

Add to `package.json` scripts:

```json
"e2e": "playwright test -c e2e/playwright.config.ts && tsx scripts/e2e-dialog-coverage.ts",
"e2e:a": "playwright test -c e2e/playwright.config.ts --project=layer-a",
"e2e:b": "playwright test -c e2e/playwright.config.ts --project=layer-b",
"e2e:coverage": "tsx scripts/e2e-dialog-coverage.ts"
```

(The coverage part of `e2e` is added in Task 7; until then use `"e2e": "playwright test -c e2e/playwright.config.ts"`.)

Append to `.gitignore`:

```
e2e/.tmp/
```

- [ ] **Step 2: Constants**

`e2e/support/env.ts`:

```ts
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "..", "..");
const TMP = path.join(REPO_ROOT, "e2e", ".tmp");

export const E2E = {
  port: 5010,
  baseUrl: "http://localhost:5010",
  databaseName: "lvs_e2e",
  adminDatabaseUrl: "postgresql://postgres:postgres@localhost:5432/postgres",
  databaseUrl: "postgresql://postgres:postgres@localhost:5432/lvs_e2e",
  rdwStubPort: 5011,
  tmp: TMP,
  authDir: path.join(TMP, "auth"),
  uploadsDir: path.join(TMP, "uploads"),
  backupDir: path.join(TMP, "backups"),
  // Exists only in lvs_e2e, which is dropped on every run. Override with E2E_PASSWORD.
  password: process.env.E2E_PASSWORD || "E2e-Alleen-Lokaal-2026!",
} as const;
```

`e2e/tsconfig.json`:

```json
{
  "extends": "../tsconfig.json",
  "include": ["./**/*.ts", "../scripts/e2e-dialog-coverage.ts"],
  "exclude": [".tmp"],
  "compilerOptions": { "noEmit": true, "incremental": false, "types": ["node"] }
}
```

- [ ] **Step 3: Write the failing schema proof**

`e2e/setup/database.setup.ts`:

```ts
import { test, expect } from "@playwright/test";
import pg from "pg";
import { E2E } from "../support/env";

// The dashboard of 2026-09-20 failed on a database that had missed a migration
// (column expenses.inbox_item_id). This proves the database under test was
// built by the real migration path, from nothing.
test("the database was built from nothing by the real migration", async () => {
  const client = new pg.Client({ connectionString: E2E.databaseUrl });
  await client.connect();
  try {
    const column = await client.query(
      "select 1 from information_schema.columns where table_name = 'expenses' and column_name = 'inbox_item_id'",
    );
    expect(column.rowCount, "expenses.inbox_item_id").toBe(1);
    const table = await client.query("select to_regclass('public.invoice_inbox_items') as name");
    expect(table.rows[0].name, "invoice_inbox_items").toBe("invoice_inbox_items");
    const tables = await client.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
    expect(tables.rows[0].n).toBeGreaterThan(40);
  } finally {
    await client.end();
  }
});
```

Minimal `e2e/playwright.config.ts` for now (no `webServer` yet):

```ts
import { defineConfig } from "@playwright/test";
import { E2E } from "./support/env";

export default defineConfig({
  testDir: ".",
  outputDir: ".tmp/results",
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { outputFolder: ".tmp/report", open: "never" }]],
  use: {
    baseURL: E2E.baseUrl,
    channel: "chrome",
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /setup[\\/].*\.setup\.ts/ },
    { name: "layer-a", testMatch: /layer-a[\\/].*\.spec\.ts/, dependencies: ["setup"], fullyParallel: true },
    { name: "layer-b", testMatch: /layer-b[\\/].*\.spec\.ts/, dependencies: ["setup"] },
  ],
});
```

- [ ] **Step 4: Run it, see it fail**

Run: `npx playwright test -c e2e/playwright.config.ts --project=setup`
Expected: FAIL, `database "lvs_e2e" does not exist`.

- [ ] **Step 5: Implement `prepareDatabase`**

`e2e/support/database.ts`:

```ts
import { spawn } from "child_process";
import pg from "pg";
import { E2E, REPO_ROOT } from "./env";

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    // shell: true so `npx` resolves to npx.cmd on Windows.
    const child = spawn(command, args, { cwd: REPO_ROOT, env, stdio: "inherit", shell: true });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))));
  });
}

/** Drops and rebuilds lvs_e2e the way a new production database is built. */
export async function prepareDatabase(): Promise<void> {
  if (!/\/lvs_e2e$/.test(E2E.databaseUrl)) throw new Error("The E2E harness only ever touches the database lvs_e2e");
  const admin = new pg.Client({ connectionString: E2E.adminDatabaseUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${E2E.databaseName} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${E2E.databaseName}`);
  } finally {
    await admin.end();
  }
  const env = { ...process.env, DATABASE_URL: E2E.databaseUrl, DATABASE_SSL: "false" };
  await run("npx", ["drizzle-kit", "push", "--force"], env);
  await run("node", ["startup-migration.js"], env);
}
```

Temporarily call it from the setup file to get to green (it moves into `serve.ts` in Task 3): add at the top of `database.setup.ts`:

```ts
import { prepareDatabase } from "../support/database";
test.beforeAll(async () => { test.setTimeout(300_000); await prepareDatabase(); });
```

- [ ] **Step 6: Run it, see it pass**

Run: `npx playwright test -c e2e/playwright.config.ts --project=setup`
Expected: PASS. If `drizzle-kit push --force` still prompts, or `startup-migration.js` fails on a database that push created, that is a real defect in the path a new production database takes: stop, report it with the exact output, and fix it in its own commit with a regression test. Do not work around it by cloning another database.

Also run `npx tsc --noEmit -p e2e` — expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore e2e/tsconfig.json e2e/playwright.config.ts e2e/support/env.ts e2e/support/database.ts e2e/setup/database.setup.ts
git commit -m "test(e2e): Playwright-opzet en een database die vanaf nul wordt opgebouwd"
```

---

### Task 2: `RDW_BASE_URL` and the local RDW stub

**Files:**
- Modify: `server/utils/rdw-api.ts` (the four `https://opendata.rdw.nl/...` literals at about lines 190, 192, 211, 249)
- Create: `server/__tests__/rdw-base-url.test.ts`, `e2e/support/rdw-stub.ts`

**Interfaces:**
- Produces: `startRdwStub(port: number): Promise<{ close(): Promise<void> }>`; env var `RDW_BASE_URL`.

- [ ] **Step 1: Failing test**

`server/__tests__/rdw-base-url.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => { delete process.env.RDW_BASE_URL; vi.resetModules(); });

const fakeFetch = (seen: string[]) => (async (url: string) => {
  seen.push(String(url));
  return new Response(JSON.stringify([{ kenteken: "AB123C" }]), { status: 200, headers: { "Content-Type": "application/json" } });
}) as unknown as typeof fetch;

describe("RDW base address", () => {
  it("talks to opendata.rdw.nl by default", async () => {
    const { fetchRdwFiscalData } = await import("../utils/rdw-api");
    const seen: string[] = [];
    await fetchRdwFiscalData("AB-123-C", fakeFetch(seen));
    expect(seen[0]).toBe("https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=AB123C");
  });

  it("uses RDW_BASE_URL when set, without a double slash", async () => {
    process.env.RDW_BASE_URL = "http://127.0.0.1:5011/";
    vi.resetModules();
    const { fetchRdwFiscalData } = await import("../utils/rdw-api");
    const seen: string[] = [];
    await fetchRdwFiscalData("AB-123-C", fakeFetch(seen));
    expect(seen).toEqual([
      "http://127.0.0.1:5011/resource/m9d7-ebf2.json?kenteken=AB123C",
      "http://127.0.0.1:5011/resource/8ys7-d773.json?kenteken=AB123C",
    ]);
  });
});
```

- [ ] **Step 2: Run, see the second test fail**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest DATABASE_SSL=false npx vitest run server/__tests__/rdw-base-url.test.ts`
Expected: first passes, second FAILS (URL still opendata.rdw.nl).

- [ ] **Step 3: Implement**

In `server/utils/rdw-api.ts`, below the imports:

```ts
/**
 * Where the RDW open data lives. Only the deployment can change it (an
 * environment variable, never user input); the browser test suite points it at
 * a local stub so a test run never leaves the machine.
 */
const RDW_BASE_URL = (process.env.RDW_BASE_URL || "https://opendata.rdw.nl").replace(/\/+$/, "");
```

Replace all four literals `https://opendata.rdw.nl/resource/` with `${RDW_BASE_URL}/resource/` (they are template strings already; line 211's `apiUrl` too). Leave the URL in the doc comment as it is.

- [ ] **Step 4: Run, see both pass; run the neighbours**

Run the command from Step 2 (PASS), then `... npx vitest run server/__tests__ -t "rdw"` and `npx tsc --noEmit -p .` — expected: green.

- [ ] **Step 5: The stub**

`e2e/support/rdw-stub.ts`:

```ts
import http from "http";

const VEHICLE = (plate: string) => [{
  kenteken: plate, merk: "VOLKSWAGEN", handelsbenaming: "CRAFTER", voertuigsoort: "Bedrijfsauto",
  inrichting: "gesloten opbouw", eerste_kleur: "WIT", datum_eerste_toelating: "20220315",
  vervaldatum_apk: "20270315", catalogusprijs: "45000", europese_voertuigcategorie: "N1",
}];
const FUEL = (plate: string) => [{ kenteken: plate, brandstof_omschrijving: "Diesel", co2_uitstoot_gecombineerd: "198" }];

/** Answers the two RDW resources the application reads; unknown plates get []. */
export function startRdwStub(port: number): Promise<{ close(): Promise<void> }> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const plate = (url.searchParams.get("kenteken") || "").toUpperCase();
    const known = /^E2E|^[A-Z0-9]{6}$/.test(plate) && !plate.startsWith("ZZ");
    let body: unknown = [];
    if (known && url.pathname.endsWith("/m9d7-ebf2.json")) body = VEHICLE(plate);
    if (known && url.pathname.endsWith("/8ys7-d773.json")) body = FUEL(plate);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve({ close: () => new Promise((done) => server.close(() => done())) }));
  });
}
```

Plates starting with `ZZ` are "not found at the RDW" on purpose, for a later not-found test.

- [ ] **Step 6: Commit**

```bash
git add server/utils/rdw-api.ts server/__tests__/rdw-base-url.test.ts e2e/support/rdw-stub.ts
git commit -m "feat(e2e): RDW-adres instelbaar via RDW_BASE_URL, met lokale nep-RDW voor de browsertests"
```

---

### Task 3: The application under test, users per role, one login each

**Files:**
- Create: `e2e/support/build.ts`, `e2e/support/serve.ts`, `e2e/support/roles.ts`, `e2e/seed/users.ts`, `e2e/seed/seed.ts`, `e2e/setup/auth.setup.ts`
- Modify: `e2e/playwright.config.ts` (add `webServer`), `e2e/setup/database.setup.ts` (remove the temporary `beforeAll`)

**Interfaces:**
- Consumes: `prepareDatabase()`, `startRdwStub()`, `E2E`.
- Produces: `ROLES`, `type Role`, `authFile(role)`, `PROFILES: Record<Role, string[]>`, `can(role, anyOf)`, `runSeed()`.

- [ ] **Step 1: Permission profiles**

`e2e/seed/users.ts` — a role is only a label in this application; rights are an explicit list per user (`server/middleware/permissions.ts`; `admin` bypasses). These profiles are an assumption that Task 9 puts in front of the owner.

```ts
import { UserPermission as P, UserRole } from "../../shared/schema";

export const ROLES = ["admin", "manager", "user", "cleaner", "viewer", "accountant", "maintenance"] as const;
export type Role = (typeof ROLES)[number];

const ALL = Object.values(P) as string[];
const without = (...denied: string[]) => ALL.filter((permission) => !denied.includes(permission));

export const PROFILES: Record<Role, string[]> = {
  admin: ALL,
  manager: without(P.MANAGE_USERS, P.MANAGE_BACKUPS, P.MANAGE_SETTINGS),
  user: [P.VIEW_DASHBOARD, P.VIEW_VEHICLES, P.VIEW_CUSTOMERS, P.MANAGE_CUSTOMERS, P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS,
    P.VIEW_DOCUMENTS, P.MANAGE_DOCUMENTS, P.VIEW_DAMAGE_CHECKS, P.MANAGE_DAMAGE_CHECKS, P.VIEW_FINES],
  cleaner: [P.VIEW_DASHBOARD, P.VIEW_VEHICLES, P.VIEW_RESERVATIONS],
  viewer: [P.VIEW_DASHBOARD, P.VIEW_VEHICLES, P.VIEW_CUSTOMERS, P.VIEW_RESERVATIONS, P.VIEW_DOCUMENTS, P.VIEW_DAMAGE_CHECKS, P.VIEW_REPORTS],
  accountant: [P.VIEW_DASHBOARD, P.VIEW_VEHICLES, P.VIEW_CUSTOMERS, P.VIEW_RESERVATIONS, P.MANAGE_EXPENSES, P.VIEW_DOCUMENTS,
    P.VIEW_REPORTS, P.MANAGE_REPORTS, P.VIEW_FINES, P.VIEW_FISCAL],
  maintenance: [P.VIEW_DASHBOARD, P.VIEW_VEHICLES, P.MANAGE_VEHICLES, P.MANAGE_MAINTENANCE, P.VIEW_RESERVATIONS,
    P.VIEW_DAMAGE_CHECKS, P.MANAGE_DAMAGE_CHECKS, P.VIEW_DOCUMENTS],
};

export const usernameOf = (role: Role) => `e2e-${role}`;
export const roleLabel: Record<Role, string> = {
  admin: UserRole.ADMIN, manager: UserRole.MANAGER, user: UserRole.USER, cleaner: UserRole.CLEANER,
  viewer: UserRole.VIEWER, accountant: UserRole.ACCOUNTANT, maintenance: UserRole.MAINTENANCE,
};
```

If `UserPermission` has no `VIEW_DASHBOARD` member at compile time, stop and report; the sidebar (`client/src/components/sidebar-nav.tsx:24`) uses it.

`e2e/support/roles.ts`:

```ts
import path from "path";
import { E2E } from "./env";
import { PROFILES, ROLES, type Role } from "../seed/users";

export { ROLES, type Role };
export const authFile = (role: Role) => path.join(E2E.authDir, `${role}.json`);
/** May this role do something that needs one of these permissions? */
export const can = (role: Role, anyOf: readonly string[]) => role === "admin" || anyOf.some((permission) => PROFILES[role].includes(permission));
```

- [ ] **Step 2: Seed users**

`e2e/seed/seed.ts`:

```ts
import { E2E } from "../support/env";
import { PROFILES, ROLES, roleLabel, usernameOf } from "./users";

/** Writes the fixed E2E content. DATABASE_URL must already point at lvs_e2e. */
export async function runSeed(): Promise<void> {
  if (!/\/lvs_e2e$/.test(process.env.DATABASE_URL || "")) throw new Error("runSeed only runs against lvs_e2e");
  // Imported late: these modules open the database pool from DATABASE_URL on import.
  const { db } = await import("../../server/db");
  const { users } = await import("../../shared/schema");
  const { hashPassword } = await import("../../server/auth");

  const password = await hashPassword(E2E.password);
  await db.insert(users).values(ROLES.map((role) => ({
    username: usernameOf(role),
    password,
    fullName: `E2E ${role}`,
    email: `${role}@e2e.invalid`,
    role: roleLabel[role],
    permissions: PROFILES[role],
    active: true,
  })));
}
```

- [ ] **Step 3: Build reuse**

`e2e/support/build.ts`:

```ts
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
  const result = spawnSync("npm", ["run", "build"], { cwd: REPO_ROOT, stdio: "inherit", shell: true });
  if (result.status !== 0) throw new Error("npm run build failed");
}
```

- [ ] **Step 4: The webServer entry**

`e2e/support/serve.ts`:

```ts
import fs from "fs";
import { spawn } from "child_process";
import { E2E, REPO_ROOT } from "./env";
import { prepareDatabase } from "./database";
import { ensureBuild } from "./build";
import { startRdwStub } from "./rdw-stub";

async function main() {
  for (const dir of [E2E.tmp, E2E.authDir, E2E.uploadsDir, E2E.backupDir]) fs.mkdirSync(dir, { recursive: true });
  ensureBuild();
  await prepareDatabase();

  process.env.DATABASE_URL = E2E.databaseUrl;
  process.env.DATABASE_SSL = "false";
  const { runSeed } = await import("../seed/seed");
  await runSeed();
  const { pool } = await import("../../server/db");
  await pool.end();

  const stub = await startRdwStub(E2E.rdwStubPort);

  const server = spawn("node", ["dist/server/index.js"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(E2E.port),
      DATABASE_URL: E2E.databaseUrl,
      DATABASE_SSL: "false",
      UPLOADS_DIR: E2E.uploadsDir,
      BACKUP_PATH: E2E.backupDir,
      TRUST_PROXY_HOPS: "0",
      SESSION_SECRET: "e2e-only-session-secret-not-used-anywhere-else",
      DEFAULT_ADMIN_USERNAME: "e2e-bootstrap-admin",
      DEFAULT_ADMIN_PASSWORD: E2E.password,
      RDW_BASE_URL: `http://127.0.0.1:${E2E.rdwStubPort}`,
      OUTBOUND_ALLOW_PRIVATE: "true",
      GEMINI_API_KEY: "",
    },
  });
  const stop = async () => { server.kill(); await stub.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  server.on("exit", (code) => { void stub.close(); process.exit(code ?? 1); });
}

main().catch((error) => { console.error("[e2e] could not start the application under test:", error); process.exit(1); });
```

Check before relying on it: the server creates its first administrator from `DEFAULT_ADMIN_*` only when no user exists (`server/initAdmin.ts`). The seed already made `e2e-admin`, so that bootstrap user may never appear; both outcomes are fine. If the production build refuses to start without some other variable (read the startup output), add it here with a comment saying why.

Add to `e2e/playwright.config.ts`, inside `defineConfig({ … })`:

```ts
  webServer: {
    command: "npx tsx e2e/support/serve.ts",
    cwd: "..",
    url: `${E2E.baseUrl}/api/user`, // 401 when nobody is logged in: that counts as "up"
    timeout: 600_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
```

Remove the temporary `beforeAll` from `e2e/setup/database.setup.ts`.

- [ ] **Step 5: Failing login proof**

`e2e/setup/auth.setup.ts`:

```ts
import { test as setup, expect } from "@playwright/test";
import { E2E } from "../support/env";
import { ROLES, authFile } from "../support/roles";
import { usernameOf } from "../seed/users";

for (const role of ROLES) {
  setup(`log in as ${role}`, async ({ page }) => {
    await page.goto("/auth");
    await page.locator('input[name="username"]').fill(usernameOf(role));
    await page.locator('input[name="password"]').fill(E2E.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).not.toHaveURL(/\/auth/);
    const me = await page.request.get("/api/user");
    expect(me.status()).toBe(200);
    expect((await me.json()).username).toBe(usernameOf(role));
    await page.context().storageState({ path: authFile(role) });
  });
}
```

- [ ] **Step 6: Run**

Run: `npx playwright test -c e2e/playwright.config.ts --project=setup`
Expected: 8 passed (1 schema proof, 7 logins). The first run builds (a few minutes); the second run must print `dist/ is up to date`.

If a login fails, read the server output Playwright prints: a 429 means the login limiter counted failures (wrong selector → fix the selector, then restart the run; counters are in memory).

- [ ] **Step 7: Commit**

```bash
git add e2e/support/build.ts e2e/support/serve.ts e2e/support/roles.ts e2e/seed/users.ts e2e/seed/seed.ts e2e/setup/auth.setup.ts e2e/setup/database.setup.ts e2e/playwright.config.ts
git commit -m "test(e2e): app onder test starten, zeven rechtenprofielen en één login per rol"
```

---

### Task 4: Seed data with dates relative to today

**Files:**
- Create: `e2e/seed/data.ts`, `e2e/setup/seed.setup.ts`
- Modify: `e2e/seed/seed.ts`

**Interfaces:**
- Produces: `SEED` (plates, customer names, reservation labels) imported by later specs; `officeDay(offset: number): string`.

- [ ] **Step 1: Failing proof**

`e2e/setup/seed.setup.ts`:

```ts
import { test, expect } from "@playwright/test";
import { authFile } from "../support/roles";
import { SEED } from "../seed/data";

test.use({ storageState: authFile("admin") });

test("the seed is visible through the API", async ({ request }) => {
  const vehicles = await (await request.get("/api/vehicles")).json();
  expect(vehicles.map((v: { licensePlate: string }) => v.licensePlate)).toEqual(expect.arrayContaining(SEED.vehicles.map((v) => v.licensePlate)));
  const customers = await (await request.get("/api/customers")).json();
  expect(customers.length).toBeGreaterThanOrEqual(SEED.customers.length);
  const reservations = await (await request.get("/api/reservations")).json();
  const statuses = new Set(reservations.map((r: { status: string }) => r.status));
  for (const status of ["booked", "picked_up", "returned", "completed", "cancelled"]) expect(statuses, status).toContain(status);
});
```

This proof uses the admin session, so the logins must have finished first. Playwright gives no order between files of one project; split the project in `playwright.config.ts` (replace the single `setup` entry):

```ts
    { name: "auth", testMatch: /setup[\\/](database|auth)\.setup\.ts/ },
    { name: "setup", testMatch: /setup[\\/]seed\.setup\.ts/, dependencies: ["auth"] },
```

(`layer-a` and `layer-b` keep `dependencies: ["setup"]`.)

Run: `npx playwright test -c e2e/playwright.config.ts --project=setup` — expected: FAIL, `Cannot find module '../seed/data'`.

- [ ] **Step 2: The data**

`e2e/seed/data.ts` — required columns (checked against the schema on 2026-09-20): vehicles `licensePlate, brand, model`; customers `name`; reservations `startDate`; expenses `vehicleId, category, amount, date`; vehicle_transports `transportType, scheduledDate`; portal_users `customerId, email, fullName`. Read `shared/schema.ts` for the exact property names of the optional columns used below and adjust names only, not the content.

```ts
/** Office (Europe/Amsterdam) calendar date, `offset` days from today, as yyyy-MM-dd. */
export function officeDay(offset: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

export const SEED = {
  vehicles: [
    { licensePlate: "E2E-01-A", brand: "Volkswagen", model: "Crafter", currentMileage: 45000, availabilityStatus: "available" },
    { licensePlate: "E2E-02-B", brand: "Mercedes-Benz", model: "Sprinter", currentMileage: 82000, availabilityStatus: "available" },
    { licensePlate: "E2E-03-C", brand: "Ford", model: "Transit", currentMileage: 61000, availabilityStatus: "available" },   // rented (picked up)
    { licensePlate: "E2E-04-D", brand: "Renault", model: "Master", currentMileage: 120500, availabilityStatus: "needs_fixing" },
    { licensePlate: "E2E-05-E", brand: "Opel", model: "Vivaro", currentMileage: 30100, availabilityStatus: "not_for_rental" },
    { licensePlate: "E2E-06-F", brand: "Peugeot", model: "Boxer", currentMileage: 99000, availabilityStatus: "available", apkDate: officeDay(20) },
    { licensePlate: "E2E-07-G", brand: "Fiat", model: "Ducato", currentMileage: 15000, availabilityStatus: "available", warrantyEndDate: officeDay(25) },
    { licensePlate: "E2E-08-H", brand: "Toyota", model: "Proace", currentMileage: 5000, availabilityStatus: "available" },
  ],
  customers: [
    { name: "E2E Bouwbedrijf De Vries B.V.", email: "devries@e2e.invalid", phone: "0612345601" },
    { name: "E2E Jansen Transport", email: "jansen@e2e.invalid", phone: "0612345602" },
    { name: "E2E Pieter Bakker", email: "bakker@e2e.invalid", phone: "0612345603" },
    { name: "E2E Sanne de Boer", email: "deboer@e2e.invalid", phone: "0612345604" },
    { name: "E2E Garage Visser", email: "visser@e2e.invalid", phone: "0612345605" },
    { name: "E2E Hoveniers Groen", email: "groen@e2e.invalid", phone: "0612345606" },
  ],
  // vehicle and customer are indexes into the arrays above.
  reservations: [
    { label: "today-booked", vehicle: 0, customer: 0, startDate: officeDay(0), endDate: officeDay(3), status: "booked" },
    { label: "next-week", vehicle: 1, customer: 1, startDate: officeDay(7), endDate: officeDay(10), status: "booked" },
    { label: "picked-up", vehicle: 2, customer: 2, startDate: officeDay(-2), endDate: officeDay(2), status: "picked_up", pickupMileage: 61000 },
    { label: "returned", vehicle: 7, customer: 3, startDate: officeDay(-10), endDate: officeDay(-6), status: "returned", pickupMileage: 4600, returnMileage: 5000 },
    { label: "completed", vehicle: 5, customer: 4, startDate: officeDay(-30), endDate: officeDay(-25), status: "completed", pickupMileage: 98000, returnMileage: 99000 },
    { label: "cancelled", vehicle: 6, customer: 5, startDate: officeDay(14), endDate: officeDay(16), status: "cancelled" },
    { label: "open-ended", vehicle: 1, customer: 0, startDate: officeDay(20), endDate: null, status: "booked" },
  ],
} as const;
```

- [ ] **Step 3: Write it in `runSeed`**

Extend `e2e/seed/seed.ts` after the users insert:

```ts
  const { vehicles, customers, reservations, expenses } = await import("../../shared/schema");
  const { SEED, officeDay } = await import("./data");
  const vehicleRows = await db.insert(vehicles).values(SEED.vehicles.map((v) => ({ ...v }))).returning({ id: vehicles.id });
  const customerRows = await db.insert(customers).values(SEED.customers.map((c) => ({ ...c }))).returning({ id: customers.id });
  await db.insert(reservations).values(SEED.reservations.map(({ label, vehicle, customer, ...rest }) => ({
    ...rest,
    vehicleId: vehicleRows[vehicle].id,
    customerId: customerRows[customer].id,
    notes: `e2e:${label}`,
    type: "standard",
  })));
  await db.insert(expenses).values([
    { vehicleId: vehicleRows[0].id, category: "maintenance", amount: "245.50", date: officeDay(-5), description: "E2E kleine beurt" },
    { vehicleId: vehicleRows[1].id, category: "tires", amount: "612.00", date: officeDay(-12), description: "E2E banden" },
  ]);
```

Where TypeScript rejects a property (name differs in `shared/schema.ts`), use the schema's name. A maintenance block, a transport and a portal user are added in the round that needs them, not now (YAGNI).

- [ ] **Step 4: Run, see it pass; type-check**

Run: `npx playwright test -c e2e/playwright.config.ts --project=setup` — PASS. `npx tsc --noEmit -p e2e` — clean.

- [ ] **Step 5: Commit**

```bash
git add e2e/seed/data.ts e2e/seed/seed.ts e2e/setup/seed.setup.ts e2e/playwright.config.ts
git commit -m "test(e2e): vaste testgegevens met datums ten opzichte van vandaag"
```

---

### Task 5: The page-health guard

**Files:**
- Create: `e2e/support/guards.ts`, `e2e/layer-a/guard.spec.ts`

**Interfaces:**
- Produces: `test` (extended with fixture `health`), `expect`, `settle(page)`, `watchPage(page, options)`, `type Violation`.

- [ ] **Step 1: Failing self-test**

`e2e/layer-a/guard.spec.ts`:

```ts
import { test as base, expect } from "@playwright/test";
import { authFile } from "../support/roles";
import { settle, watchPage } from "../support/guards";

base.use({ storageState: authFile("admin") });

base("the guard reports a 500 that the page swallowed", async ({ page }) => {
  await page.route("**/api/expenses/recent*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"Internal server error"}' }));
  const watcher = watchPage(page);
  await page.goto("/");
  await settle(page);
  await watcher.check();
  const kinds = watcher.violations.map((v) => v.kind);
  expect(kinds).toContain("http");
  expect(kinds).toContain("toast"); // "Kon de gegevens niet laden"
});

base("the guard is silent on a healthy dashboard", async ({ page }) => {
  const watcher = watchPage(page);
  await page.goto("/");
  await settle(page);
  await watcher.check();
  expect(watcher.violations).toEqual([]);
});
```

Run: `npx playwright test -c e2e/playwright.config.ts --project=layer-a` — expected: FAIL, module `../support/guards` not found.

- [ ] **Step 2: Implement**

`e2e/support/guards.ts`:

```ts
import { test as base, expect, type Page } from "@playwright/test";

export interface Violation { kind: "http" | "console" | "pageerror" | "toast" | "boundary"; detail: string }
export interface WatchOptions {
  /** Responses that are expected here, e.g. 403 for a page this role may not use. */
  allow?: Array<{ url: RegExp; status: number; reason: string }>;
  /** Off where refused requests are the point of the test: Chrome logs each as a console error. */
  console?: boolean;
}

/** Known harmless console noise. Every entry needs a reason. */
export const CONSOLE_ALLOWLIST: Array<{ pattern: RegExp; reason: string }> = [];

const inflight = new WeakMap<Page, Set<string>>();

/** Waits until no /api/ request has been in flight for 400 ms. (networkidle never settles with socket.io polling.) */
export async function settle(page: Page, quietMs = 400, timeoutMs = 20_000): Promise<void> {
  await page.waitForLoadState("load");
  const open = trackRequests(page);
  const deadline = Date.now() + timeoutMs;
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    if (open.size > 0) quietSince = Date.now();
    if (Date.now() - quietSince >= quietMs) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`Page did not settle within ${timeoutMs} ms; still loading: ${[...open].join(", ")}`);
}

function trackRequests(page: Page): Set<string> {
  let open = inflight.get(page);
  if (open) return open;
  open = new Set<string>();
  inflight.set(page, open);
  const key = (url: string) => url.replace(/^https?:\/\/[^/]+/, "");
  page.on("request", (request) => { if (request.url().includes("/api/")) open!.add(key(request.url())); });
  const done = (url: string) => open!.delete(key(url));
  page.on("requestfinished", (request) => done(request.url()));
  page.on("requestfailed", (request) => done(request.url()));
  return open;
}

export function watchPage(page: Page, options: WatchOptions = {}) {
  const violations: Violation[] = [];
  trackRequests(page);
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/api/")) return;
    const status = response.status();
    if (options.allow?.some((entry) => entry.status === status && entry.url.test(url))) return;
    if (status >= 500 || status === 429) violations.push({ kind: "http", detail: `${status} ${response.request().method()} ${url}` });
  });
  if (options.console !== false) {
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (CONSOLE_ALLOWLIST.some((entry) => entry.pattern.test(text))) return;
      violations.push({ kind: "console", detail: text });
    });
  }
  page.on("pageerror", (error) => violations.push({ kind: "pageerror", detail: error.message }));
  return {
    violations,
    /** Looks at what is on screen now; call after the page settled. */
    async check() {
      if (await page.getByText("Er ging iets mis op dit scherm").count()) violations.push({ kind: "boundary", detail: page.url() });
      const toasts = page.locator('li.destructive[data-state="open"]');
      for (let index = 0; index < await toasts.count(); index++) {
        violations.push({ kind: "toast", detail: (await toasts.nth(index).innerText()).replace(/\s+/g, " ").trim() });
      }
    },
  };
}

/** `health` fails the test afterwards when anything went wrong on the page. */
export const test = base.extend<{ health: ReturnType<typeof watchPage> }>({
  health: async ({ page }, use) => {
    const watcher = watchPage(page);
    await use(watcher);
    await watcher.check();
    expect(watcher.violations.map((v) => `${v.kind}: ${v.detail}`), "page health").toEqual([]);
  },
});
export { expect };
```

- [ ] **Step 3: Run, see both pass**

Run: `npx playwright test -c e2e/playwright.config.ts --project=layer-a` — PASS. If the healthy dashboard reports a violation, that is a finding: fix the application if it is a real fault (own commit, regression test), or add an allowlist entry with a written reason if it is provably harmless. Do not loosen the guard otherwise.

- [ ] **Step 4: Commit**

```bash
git add e2e/support/guards.ts e2e/layer-a/guard.spec.ts
git commit -m "test(e2e): paginabewaker voor 5xx, consolefouten, foutmeldingen en de foutgrens"
```

---

### Task 6: Layer A — every page per role, and the pages a role may not use

**Files:**
- Create: `e2e/registry/pages.ts`, `e2e/layer-a/pages.spec.ts`, `e2e/layer-a/forbidden.spec.ts`

**Interfaces:**
- Consumes: `test`, `settle`, `watchPage`, `ROLES`, `can`, `authFile`.
- Produces: `PAGES: PageEntry[]`, `interface PageEntry { path: string; anyOf: string[]; api: string }`.

- [ ] **Step 1: Registry**

`e2e/registry/pages.ts` — permissions copied from `client/src/components/sidebar-nav.tsx` (lines 24–37); re-read that file and keep the two in step. `api` is one GET the page depends on, used to prove a forbidden role gets 403.

```ts
import { UserPermission as P } from "../../shared/schema";

export interface PageEntry { path: string; anyOf: string[]; api: string }

export const PAGES: PageEntry[] = [
  { path: "/", anyOf: [P.VIEW_DASHBOARD], api: "/api/vehicles" },
  { path: "/vehicles", anyOf: [P.VIEW_VEHICLES, P.MANAGE_VEHICLES], api: "/api/vehicles" },
  { path: "/scan", anyOf: [P.VIEW_VEHICLES, P.MANAGE_VEHICLES], api: "/api/vehicles" },
  { path: "/customers", anyOf: [P.VIEW_CUSTOMERS, P.MANAGE_CUSTOMERS], api: "/api/customers" },
  { path: "/portal-admin", anyOf: [P.VIEW_PORTAL, P.MANAGE_PORTAL], api: "/api/portal-admin/users" },
  { path: "/reservations", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS], api: "/api/reservations" },
  { path: "/maintenance", anyOf: [P.MANAGE_MAINTENANCE], api: "/api/vehicles/apk-expiring" },
  { path: "/expenses", anyOf: [P.MANAGE_EXPENSES], api: "/api/expenses" },
  { path: "/expenses/add", anyOf: [P.MANAGE_EXPENSES], api: "/api/expenses" },
  { path: "/documents", anyOf: [P.VIEW_DOCUMENTS, P.MANAGE_DOCUMENTS], api: "/api/documents" },
  { path: "/delivery", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS], api: "/api/transports" },
  { path: "/communications", anyOf: [P.MANAGE_EMAIL_TEMPLATES, P.MANAGE_NOTIFICATIONS], api: "/api/email-templates" },
  { path: "/reports", anyOf: [P.VIEW_REPORTS, P.MANAGE_REPORTS], api: "/api/reports/saved" },
];
```

For every `api` value, confirm in `server/routes/` that the route exists and is guarded by (a superset of) the same permissions; where it is not, pick another GET the page calls (see the page's `queryKey`s). A page whose data routes allow a wider audience than the sidebar is a finding for Task 9, not something to change here.

- [ ] **Step 2: Specs**

`e2e/layer-a/pages.spec.ts`:

```ts
import { test, expect, settle } from "../support/guards";
import { ROLES, authFile, can } from "../support/roles";
import { PAGES } from "../registry/pages";

for (const role of ROLES) {
  test.describe(`pages as ${role}`, () => {
    test.use({ storageState: authFile(role) });
    for (const entry of PAGES.filter((candidate) => can(role, candidate.anyOf))) {
      test(`${entry.path} opens without a fault`, async ({ page, health }) => {
        await page.goto(entry.path);
        await settle(page);
        await expect(page).not.toHaveURL(/\/auth/);
        await expect(page.getByText("404")).toHaveCount(0);
        expect(health.violations).toEqual([]);
      });
    }
  });
}
```

`e2e/layer-a/forbidden.spec.ts`:

```ts
import { test as base, expect } from "@playwright/test";
import { settle, watchPage } from "../support/guards";
import { ROLES, authFile, can } from "../support/roles";
import { PAGES } from "../registry/pages";

for (const role of ROLES.filter((candidate) => candidate !== "admin")) {
  base.describe(`pages ${role} may not use`, () => {
    base.use({ storageState: authFile(role) });
    for (const entry of PAGES.filter((candidate) => !can(role, candidate.anyOf))) {
      base(`${entry.path}: not offered, data refused, no crash`, async ({ page, request }) => {
        const refused = await request.get(entry.api);
        expect(refused.status(), `GET ${entry.api}`).toBe(403);

        await page.goto("/");
        await settle(page);
        await expect(page.locator(`nav a[href="${entry.path}"]`)).toHaveCount(0);

        // A typed address: the client has no page-level refusal today
        // (ProtectedRoute only checks the login). It must at least not crash.
        const watcher = watchPage(page, { console: false, allow: [{ url: /\/api\//, status: 403, reason: "this role may not use the page" }] });
        await page.goto(entry.path);
        await settle(page);
        await watcher.check();
        expect(watcher.violations.filter((v) => v.kind === "boundary" || v.kind === "pageerror" || v.kind === "http")).toEqual([]);
      });
    }
  });
}
```

Dashboard for a role without `view_dashboard`: no profile lacks it, so `"/"` never lands in the forbidden list; the `page.goto("/")` above is safe.

- [ ] **Step 3: Run**

Run: `npm run e2e:a`
Expected: all green. Each red test is either a wrong `api` choice (fix the registry), or a real fault in the application. For a real fault: reproduce it, write it down for Task 9, and fix it only if it is a technical bug (own commit, regression test, no behaviour change). Error toasts on a forbidden page are expected and are recorded as a finding ("typed address shows error toasts instead of 'geen toegang'"), which is why the forbidden spec ignores `toast` and `console`.

- [ ] **Step 4: Commit**

```bash
git add e2e/registry/pages.ts e2e/layer-a/pages.spec.ts e2e/layer-a/forbidden.spec.ts
git commit -m "test(e2e): laag A, elke pagina per rol en geweigerde pagina's"
```

---

### Task 7: Layer A — dialogs, and the coverage report

**Files:**
- Create: `scripts/e2e-dialog-coverage.ts`, `scripts/e2e-dialog-coverage.test.ts`, `e2e/registry/dialogs.ts`, `e2e/registry/coverage-baseline.json`, `e2e/layer-a/dialogs.spec.ts`
- Modify: `package.json` (`e2e` script gains the coverage step), client files that need a `data-testid` on an opener

**Interfaces:**
- Produces: `interface DialogEntry { page: string; opener: string; anyOf: string[]; source: string; name: string }`, `DIALOGS: DialogEntry[]`, `LAYER_B_SOURCES: string[]`; `findDialogFiles(files)`, `unreached(dialogFiles, covered)`.

- [ ] **Step 1: Failing unit test for the scanner**

`scripts/e2e-dialog-coverage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { findDialogFiles, unreached } from "./e2e-dialog-coverage";

describe("dialog coverage scanner", () => {
  it("finds files that render a dialog root and counts the roots", () => {
    const found = findDialogFiles([
      { path: "client/src/a.tsx", text: "<Dialog open={open}>\n<AlertDialog open>\n" },
      { path: "client/src/b.tsx", text: "<DialogContent>only content, the root lives elsewhere</DialogContent>" },
      { path: "client/src/c.tsx", text: "<Sheet open>" },
      { path: "client/src/ui/dialog.tsx", text: "const Dialog = DialogPrimitive.Root" },
      { path: "client/src/d.test.tsx", text: "<Dialog open>" },
    ]);
    expect(found).toEqual([{ path: "client/src/a.tsx", roots: 2 }, { path: "client/src/c.tsx", roots: 1 }]);
  });

  it("lists the files no registry entry reaches", () => {
    const files = [{ path: "client/src/a.tsx", roots: 2 }, { path: "client/src/c.tsx", roots: 1 }];
    expect(unreached(files, ["client/src/a.tsx"])).toEqual([{ path: "client/src/c.tsx", roots: 1 }]);
  });
});
```

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest DATABASE_SSL=false npx vitest run scripts/e2e-dialog-coverage.test.ts` — FAIL, module not found.

- [ ] **Step 2: Scanner and CLI**

`scripts/e2e-dialog-coverage.ts`:

```ts
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
```

Run the unit test again — PASS.

- [ ] **Step 3: Registry and spec**

`e2e/registry/dialogs.ts` — start with these two real entries, then grow it (Step 4):

```ts
import { UserPermission as P } from "../../shared/schema";

export interface DialogEntry {
  /** Page the opener is on. */
  page: string;
  /** data-testid of the control that opens the dialog. */
  opener: string;
  /** Permissions that show the opener; roles without them are skipped. */
  anyOf: string[];
  /** Source file that renders the dialog root; this is what the coverage report counts. */
  source: string;
  name: string;
}

export const DIALOGS: DialogEntry[] = [
  { page: "/vehicles", opener: "button-open-recycle-bin", anyOf: [P.MANAGE_VEHICLES], source: "client/src/components/vehicles/vehicle-recycle-bin-dialog.tsx", name: "prullenbak voertuigen" },
  { page: "/expenses", opener: "button-invoice-inbox", anyOf: [P.MANAGE_EXPENSES], source: "client/src/components/expenses/invoice-inbox-dialog.tsx", name: "ontvangen facturen" },
];

/** Dialogs that need a record in a certain state; a Layer B story opens them. */
export const LAYER_B_SOURCES: string[] = [];
```

Verify both `source` paths exist (`ls`); correct them if the file is named differently.

`e2e/layer-a/dialogs.spec.ts`:

```ts
import { test, expect, settle } from "../support/guards";
import { ROLES, authFile, can } from "../support/roles";
import { DIALOGS } from "../registry/dialogs";

for (const role of ROLES) {
  test.describe(`dialogs as ${role}`, () => {
    test.use({ storageState: authFile(role) });
    for (const entry of DIALOGS.filter((candidate) => can(role, candidate.anyOf))) {
      test(`${entry.page}: ${entry.name}`, async ({ page, health }) => {
        await page.goto(entry.page);
        await settle(page);
        await page.getByTestId(entry.opener).first().click();
        const dialog = page.locator('[role="dialog"], [role="alertdialog"]').last();
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("heading").first()).toBeVisible();
        await settle(page);
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        expect(health.violations).toEqual([]);
      });
    }
  });
}
```

- [ ] **Step 4: Fill the registry, page by page**

For each entry in `PAGES`, in order:

1. `grep -noE 'data-testid="(button|btn|tab|menu)[a-z0-9-]*"' <page file and the components it imports>` and read the page source for `setOpen(true)` / `set…DialogOpen(true)` / `<DialogTrigger`.
2. For every control that opens a dialog and is visible without selecting a record: add a `DialogEntry`. If the control has no `data-testid`, add one to the source (`data-testid="button-<what-it-opens>"`), nothing else.
3. A dialog that needs a record (edit, view, pickup, return, delete confirmation): open it through the first seeded row if the row has a stable test id (add an `opener` that targets it, e.g. `button-edit-vehicle-E2E-01-A` only if such ids exist). Otherwise leave it for Layer B and do not add it here.
4. Never register a control whose click changes data without a further confirmation.
5. Global dialogs (settings, users, backup, notifications, in the header or sidebar): register them once with `page: "/"`.
6. Run `npm run e2e:a` after each page; fix or record what turns red, as in Task 6 Step 3.

Then write the real number: run `npx tsx scripts/e2e-dialog-coverage.ts` with `{"unreached": 9999}` in `e2e/registry/coverage-baseline.json`, read the count it prints, store that count in the baseline file, run again — exit code 0 and no "lower the baseline" line.

Change `package.json`: `"e2e": "playwright test -c e2e/playwright.config.ts && tsx scripts/e2e-dialog-coverage.ts"`.

- [ ] **Step 5: Verify**

Run: `npm run e2e` — all green, coverage printed. `npx vitest run --project client` — the added `data-testid`s broke no component test. `npx tsc --noEmit -p . && npx tsc --noEmit -p e2e` — clean.

- [ ] **Step 6: Commit** (one commit for the mechanism, then one per batch of pages is fine)

```bash
git add scripts/e2e-dialog-coverage.ts scripts/e2e-dialog-coverage.test.ts e2e/registry/dialogs.ts e2e/registry/coverage-baseline.json e2e/layer-a/dialogs.spec.ts package.json
git add <each client file that got a data-testid>
git commit -m "test(e2e): laag A, dialogen per pagina en rol, met dekkingsrapport"
```

---

### Task 8: The step counter and the desk story as it works today

**Files:**
- Create: `e2e/support/steps.ts`, `e2e/layer-b/desk/rental-story.spec.ts`
- Modify: `e2e/registry/dialogs.ts` (`LAYER_B_SOURCES`), `e2e/registry/coverage-baseline.json`

**Interfaces:**
- Produces: `class Story` with `click`, `fill`, `choose`, `finish`, `steps`.

- [ ] **Step 1: The counter**

`e2e/support/steps.ts`:

```ts
import type { Locator } from "@playwright/test";

/**
 * One workflow as a member of staff performs it. Every deliberate user action
 * goes through this class and is counted; Layer B tests touch the page in no
 * other way. The budget is the approved number of actions: more is a
 * regression, fewer is an improvement that should lower the budget.
 */
export class Story {
  readonly steps: string[] = [];
  constructor(readonly name: string, readonly budget: number) {}

  async click(target: Locator, label: string) { await target.click(); this.steps.push(`klik: ${label}`); }
  async fill(target: Locator, value: string, label: string) { await target.fill(value); this.steps.push(`typ: ${label}`); }
  /** A select, combobox option, radio or checkbox. */
  async choose(open: Locator, option: Locator, label: string) { await open.click(); await option.click(); this.steps.push(`kies: ${label}`); }

  finish() {
    const listing = this.steps.map((step, index) => `${String(index + 1).padStart(2)}. ${step}`).join("\n");
    console.log(`\n[werkstroom] ${this.name}: ${this.steps.length} handelingen (budget ${this.budget})\n${listing}\n`);
    if (this.steps.length > this.budget) throw new Error(`${this.name}: ${this.steps.length} handelingen, het budget is ${this.budget}.\n${listing}`);
    if (this.steps.length < this.budget) console.log(`[werkstroom] ${this.name}: budget kan omlaag naar ${this.steps.length}.`);
  }
}
```

- [ ] **Step 2: The story, as staff do it today**

`e2e/layer-b/desk/rental-story.spec.ts` follows one customer from phone call to returned van, as user `e2e-user` (the desk profile). Do not improve anything on the way; the point is to measure today's flow. Each numbered stage is one `test.step`, all inside one `test` in `describe.configure({ mode: "serial" })`, using one `Story` per stage so the review can quote counts per stage:

| # | Stage | Starts at | Ends when | Source to read for selectors |
|---|-------|-----------|-----------|------------------------------|
| 1 | New customer "E2E Story Klant" | `/customers` | customer is in the list | `client/src/pages/customers/index.tsx`, `client/src/components/customers/customer-form.tsx` |
| 2 | New reservation for that customer on `E2E-08-H`, today to today+3 | wherever stage 1 ended | reservation visible on the calendar | `client/src/pages/reservations/calendar.tsx`, `client/src/components/reservations/reservation-form.tsx` |
| 3 | Pickup: contract number `9000001`, mileage and fuel as pre-filled | wherever stage 2 ended | status `picked_up` | `client/src/components/reservations/pickup-return-dialogs.tsx` (`input-contract-number`, `button-confirm-pickup`, `#pickupDate`) |
| 4 | Damage check at pickup, no damage | wherever stage 3 ended | check saved | `client/src/pages/interactive-damage-check.tsx` |
| 5 | Return: mileage +350, fuel full | wherever stage 4 ended | status `returned` or `completed` (B-02: return auto-completes) | `pickup-return-dialogs.tsx` (`#returnDate`) |
| 6 | End state | — | via API: reservation completed, vehicle `E2E-08-H` available, mileage 5350 | — |

Skeleton (fill the selectors from the files above; list test ids with `grep -noE 'data-testid="[^"]+"' <file>`):

```ts
import { test, expect, settle } from "../../support/guards";
import { authFile } from "../../support/roles";
import { Story } from "../../support/steps";
import { officeDay } from "../../seed/data";

test.describe.configure({ mode: "serial" });
test.use({ storageState: authFile("user") });

// Budgets are today's measured counts (Task 8 Step 3); Task 9 proposes lower ones.
const BUDGET = { customer: 999, reservation: 999, pickup: 999, damage: 999, return: 999 };

test("desk: from phone call to returned van", async ({ page, health, request }) => {
  test.setTimeout(180_000);

  await test.step("1. new customer", async () => {
    const story = new Story("Nieuwe klant", BUDGET.customer);
    await page.goto("/customers");
    await settle(page);
    // story.click(...), story.fill(...): open the form, name, phone, e-mail, save
    await expect(page.getByText("E2E Story Klant")).toBeVisible();
    story.finish();
  });

  // Stages 2–5 in the same shape. Inside every stage also assert the pre-fills
  // staff rely on, without counting them (they are not user actions):
  //   pickup:  expect(page.locator("#pickupDate")).toHaveValue(officeDay(0)); mileage field holds "5000"
  //   return:  expect(page.locator("#returnDate")).toHaveValue(officeDay(0)); mileage field holds the pickup mileage
  // and record, as a plain comment in the test, where the next action was NOT
  // offered on the screen the previous one ended on (you had to navigate).

  await test.step("6. end state", async () => {
    const vehicles = await (await request.get("/api/vehicles")).json();
    const van = vehicles.find((v: { licensePlate: string }) => v.licensePlate === "E2E-08-H");
    expect(van.currentMileage).toBe(5350);
  });
  expect(health.violations).toEqual([]);
});
```

`e2e-user` lacks `manage_vehicles`, so the story rents a seeded vehicle instead of creating one; creating a vehicle is walked as `e2e-maintenance` in a second, shorter test in the same file (`/vehicles` → new vehicle with plate `E2E-99-Z` → RDW stub fills brand and model → save), with its own `Story` and budget.

- [ ] **Step 3: Measure, then set the budgets**

Run `npm run e2e:b`, read the `[werkstroom]` lines, replace each `999` by the measured count, run again — green, no "budget kan omlaag" line.

Add every dialog source file the story opened to `LAYER_B_SOURCES` in `e2e/registry/dialogs.ts`, re-run `npx tsx scripts/e2e-dialog-coverage.ts`, lower the baseline.

- [ ] **Step 4: Edge cases staff already hit**

In the same folder, `e2e/layer-b/desk/edge-cases.spec.ts`, each its own test with `health`:

- Emptied start date: open the new-reservation form, clear the start date (`fill("")`), the page stays up (no error boundary) and the end date suggestion is empty.
- Pickup before the start date: open pickup for the seeded `next-week` reservation (notes `e2e:next-week`), confirm → the question "De huur start eerder" appears (B-16), answer no → nothing changed (status still `booked` via API).
- Double booking: new reservation on `E2E-03-C` (picked up) for today → refused with a message, nothing created.
- Return with lower mileage: return the seeded `picked-up` reservation with mileage 60000 (< 61000) → refused or override asked, never saved silently.
- Just after midnight: `await page.clock.setFixedTime(new Date("…T22:30:00Z"))` for a summer date relative to nothing seeded (use the literal `2026-09-20T22:30:00Z`), open pickup for any booked reservation → `#pickupDate` holds `2026-09-21`.

Where the application's behaviour today differs from the expectation above, do not bend the test to pass silently: assert what the owner decided (B-16, B-02 in `docs/audit/besluiten.md`), and if the application violates a recorded decision, that is a bug to report in Task 9 and mark with `test.fail()` plus the finding number.

- [ ] **Step 5: Commit**

```bash
git add e2e/support/steps.ts e2e/layer-b/desk/rental-story.spec.ts e2e/layer-b/desk/edge-cases.spec.ts e2e/registry/dialogs.ts e2e/registry/coverage-baseline.json
git commit -m "test(e2e): baliewerkstroom zoals hij nu is, met geteld aantal handelingen en randgevallen"
```

---

### Task 9: README and the desk review — STOP for the owner

**Files:**
- Create: `docs/e2e/README.md`, `docs/e2e/werkstromen/01-balie.md`

Both in Dutch, plain language, no jargon the owner would not use; he runs a rental company, he is not a developer.

- [ ] **Step 1: `docs/e2e/README.md`**

Sections: wat dit is (twee lagen, in vier zinnen); draaien (`npm run e2e`, `npm run e2e:a`, `npm run e2e:b`, `npm run e2e:coverage`; PostgreSQL moet lokaal draaien; eerste keer bouwt de app, dat duurt een paar minuten); wat er gebeurt (database `lvs_e2e` wordt elke keer weggegooid en opnieuw opgebouwd, poort 5010, niets gaat naar buiten); een fout lezen (`e2e/.tmp/report/index.html`, schermafdruk, video, trace openen met `npx playwright show-trace`); een pagina of dialoog toevoegen (`e2e/registry/pages.ts`, `dialogs.ts`, dekkingsgetal mag alleen omlaag); regels (geen retries, geen testachterdeur in de server, budget per werkstroom omlaag bij een verbetering). State the measured total duration of `npm run e2e` on this machine; if it is over five minutes, say so and name the slowest part.

- [ ] **Step 2: `docs/e2e/werkstromen/01-balie.md`**

Built from the measured runs of Task 8, not from memory. Structure:

1. **Samenvatting** — five lines at most: how many actions the whole desk flow takes today, the three proposals that save the most.
2. **Per werkstroom** (nieuwe klant, reservering, ophalen, schadecheck, inleveren, nieuw voertuig): the numbered steps exactly as `Story.finish()` printed them, the count, and the places marked during Task 8 where data was typed twice, the next action was not offered, the screen had to be left, a default was wrong, or a confirmation added nothing.
3. **Voorstellen** — numbered OPT-034 onward. Each: what changes for the member of staff in one sentence, what it saves (actions, screens), what it touches in the code (files), size (klein / middel / groot), and any risk. Only proposals that follow from an observation in section 2.
4. **Gevonden fouten** — technical bugs found by Layer A and B with their status (fixed in commit …, or open), numbered BUG-231 onward.
5. **Rechtenprofielen** — the table from `e2e/seed/users.ts` in words, with the question whether it matches how staff accounts are set up in production, and the finding that a typed address of a page without rights shows error toasts instead of "geen toegang".
6. **Open vragen uit de audit** that belong to the desk (from `docs/audit/11-eindrapport.md`), asked again.
7. **Besluiten** — an empty table (voorstel, besluit, datum) for the owner's answers; the decisions are copied into `docs/audit/besluiten.md` from B-25 onward once given.

- [ ] **Step 3: Full verification**

Run, and paste the summaries into the commit body or the hand-over message:

```bash
npm run e2e
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest DATABASE_SSL=false npx vitest run
npx tsc --noEmit -p . && npx tsc --noEmit -p e2e
```

Expected: all green. Run `npm run e2e` twice in a row: the second run must also be green (no state leaking between runs, no port left open).

- [ ] **Step 4: Commit and stop**

```bash
git add docs/e2e/README.md docs/e2e/werkstromen/01-balie.md
git commit -m "docs(e2e): handleiding en doorlichting van de baliewerkstroom met verbetervoorstellen"
```

STOP. Nothing from section 3 of the review is built until the owner has answered per proposal. The follow-up plan (approved improvements, lowered budgets, next area: costs and invoices) is written after that.
