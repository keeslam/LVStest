/**
 * Counting SQL statements (remediation plan §8.6).
 *
 * Several of wave 8's acceptance criteria are statement *counts*, not timings:
 * a count is the thing that actually regresses, and unlike a millisecond
 * figure it is identical on every machine. `getReservationsInDateRange` issued
 * 924 statements for one month view and 3 774 for a year; `GET /api/vehicles`
 * issued up to three UPDATEs on a read. Both are assertions this helper can
 * make and no timing test can.
 *
 * How it hooks in: `pg`'s `Pool.query()` is implemented in terms of
 * `pool.connect()` + `client.query()`, so instrumenting `connect` catches both
 * the pooled one-shot queries drizzle normally issues *and* the ones inside a
 * transaction, with no double counting. The instrumentation is installed once
 * and is inert unless a collector is active.
 */
import { pool } from "../../db";

let collector: string[] | null = null;
const INSTRUMENTED = Symbol.for("lvs.sqlCounter.instrumented");

function statementText(config: unknown): string {
  if (typeof config === "string") return config;
  if (config && typeof config === "object" && typeof (config as any).text === "string") {
    return (config as any).text;
  }
  return String(config);
}

function instrument(client: any): void {
  if (!client || client[INSTRUMENTED]) return;
  Object.defineProperty(client, INSTRUMENTED, { value: true, enumerable: false });
  const original = client.query.bind(client);
  client.query = function patchedQuery(config: any, values?: any, callback?: any) {
    if (collector) collector.push(statementText(config));
    return original(config, values, callback);
  };
}

let installed = false;
function install(): void {
  if (installed) return;
  installed = true;
  const originalConnect = pool.connect.bind(pool);
  (pool as any).connect = function patchedConnect(callback?: any) {
    if (typeof callback === "function") {
      return originalConnect((err: any, client: any, done: any) => {
        if (client) instrument(client);
        callback(err, client, done);
      });
    }
    return (originalConnect() as Promise<any>).then((client: any) => {
      instrument(client);
      return client;
    });
  };
}

export interface SqlCount<T> {
  result: T;
  /** Every statement sent to Postgres while `fn` was running, in order. */
  statements: string[];
}

/**
 * Runs `fn` and returns what it produced together with every SQL statement it
 * caused. Not re-entrant: the server vitest project runs with
 * `fileParallelism: false`, and within a file these must not be nested.
 */
export async function countSql<T>(fn: () => Promise<T>): Promise<SqlCount<T>> {
  install();
  if (collector) throw new Error("countSql() is not re-entrant");
  const statements: string[] = [];
  collector = statements;
  try {
    const result = await fn();
    return { result, statements };
  } finally {
    collector = null;
  }
}

/** Statements whose first keyword is `verb` (case-insensitive). */
export function statementsOfKind(statements: string[], verb: string): string[] {
  const re = new RegExp(`^\\s*${verb}\\b`, "i");
  return statements.filter((s) => re.test(s));
}
