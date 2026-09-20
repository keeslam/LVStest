import { test, expect } from "@playwright/test";
import pg from "pg";
import { E2E } from "../support/env";

// The database is built once by the webServer fixture (e2e/support/serve.ts)
// before any project depending on "setup" runs; this test only inspects it.

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
