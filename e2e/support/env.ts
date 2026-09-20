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
