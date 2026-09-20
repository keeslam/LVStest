import { spawn } from "child_process";
import pg from "pg";
import { E2E, REPO_ROOT } from "./env";

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    // shell: true so `npx` resolves to npx.cmd on Windows. All args here are fixed
    // literals with no spaces, so joining into one command string needs no quoting,
    // and it avoids Node's DEP0190 warning about an args array under shell: true.
    const child = spawn([command, ...args].join(" "), { cwd: REPO_ROOT, env, stdio: "inherit", shell: true });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))));
  });
}

/** Drops and rebuilds lvs_e2e the way a new production database is built. */
export async function prepareDatabase(): Promise<void> {
  // Guard what is actually dropped/created below: both the name constant and the
  // connection string must agree that this is lvs_e2e, never anything else.
  if (E2E.databaseName !== "lvs_e2e" || !/\/lvs_e2e$/.test(E2E.databaseUrl)) {
    throw new Error("The E2E harness only ever touches the database lvs_e2e");
  }
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
