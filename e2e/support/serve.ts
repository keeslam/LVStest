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
