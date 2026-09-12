/**
 * A throwaway database for the restore tests (remediation plan §8.4).
 *
 * FIX-L restores databases. Its tests must never point at `lvs_fixtest`, let
 * alone at development or production. The rails, in order of how much they
 * matter:
 *
 *  1. The helper REFUSES to act on any database whose name does not match
 *     /^lvs_scratch_/. That guard is asserted first in the FIX-L test file, so
 *     a future edit that breaks it fails loudly rather than quietly widening
 *     the blast radius.
 *  2. It creates the database itself, from template0, and drops it WITH
 *     (FORCE) in a `finally` — psql leaves a connection behind often enough
 *     that a plain DROP fails.
 *  3. The admin connection it uses to CREATE/DROP is its own client against
 *     `postgres`, never the application pool.
 *
 * The database this creates is empty apart from what the test puts in it: the
 * restore tests care about row counts before and after, which is the entire
 * assertion ("500, and `vehicles` still has N rows").
 */
import pg from "pg";

const SCRATCH_PREFIX = "lvs_scratch_";

let counter = 0;

/** The name a scratch database would get. Exported so a test can assert the shape. */
export function scratchDatabaseName(): string {
  counter += 1;
  return `${SCRATCH_PREFIX}${process.pid}_${counter}`;
}

/** The guard, exported so the test file can assert it before anything runs. */
export function isScratchDatabaseName(name: string): boolean {
  return /^lvs_scratch_[0-9]+_[0-9]+$/.test(name);
}

function adminUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL must be set to create a scratch database");
  const url = new URL(base);
  url.pathname = "/postgres";
  return url.toString();
}

function urlFor(database: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${database}`;
  return url.toString();
}

async function withAdminClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: adminUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Creates a scratch database, hands its connection URL to `fn`, and drops it
 * again — whatever `fn` did or threw.
 */
export async function withScratchDatabase<T>(fn: (url: string, name: string) => Promise<T>): Promise<T> {
  const name = scratchDatabaseName();
  if (!isScratchDatabaseName(name)) {
    throw new Error(`Refusing to create "${name}": not a scratch database name`);
  }

  await withAdminClient(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
  });

  try {
    return await fn(urlFor(name), name);
  } finally {
    await dropScratchDatabase(name);
  }
}

/** Drops a scratch database. Refuses any name that is not one. */
export async function dropScratchDatabase(name: string): Promise<void> {
  if (!isScratchDatabaseName(name)) {
    throw new Error(`Refusing to drop "${name}": not a scratch database name`);
  }
  try {
    await withAdminClient(async (client) => {
      await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    });
  } catch (error) {
    console.error(`Could not drop scratch database ${name}:`, error instanceof Error ? error.message : error);
  }
}

/** Runs one statement against a scratch database and returns the rows. */
export async function queryScratch<T extends Record<string, any> = Record<string, any>>(
  url: string,
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!isScratchDatabaseName(name)) {
    throw new Error(`Refusing to query "${name}": not a scratch database`);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query(sql, values as any[]);
    return result.rows as T[];
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** `SELECT count(*)` as a number, or null when the table does not exist. */
export async function countRows(url: string, table: string): Promise<number | null> {
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) throw new Error(`Refusing to count "${table}"`);
  try {
    const rows = await queryScratch<{ count: string }>(url, `SELECT count(*)::text AS count FROM public.${table}`);
    return Number(rows[0].count);
  } catch {
    return null;
  }
}
