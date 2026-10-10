import { sql } from "drizzle-orm";
import { customers } from "../../shared/schema";

/**
 * The name a customer is shown under: the company name, or the person's name
 * when there is no company name. A-12-2 (audit 2026-10-09): `coalesce(company_name, name)`
 * only falls back on NULL, so a customer saved with "" (or spaces) as company name
 * came out as a blank line in the fines list and the portal screens. `nullif(btrim(..), '')`
 * treats "", whitespace and NULL alike. Every query that names a customer uses this one
 * expression, so the rule cannot drift between screens.
 */
export function customerDisplayName() {
  return sql<string>`coalesce(nullif(btrim(${customers.companyName}), ''), ${customers.name})`;
}

/** The same expression for hand-written SQL where the customers table has an alias (e.g. `c`). */
export function customerDisplayNameFor(alias: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`Invalid SQL alias: ${alias}`);
  return sql`coalesce(nullif(btrim(${sql.raw(alias)}.company_name), ''), ${sql.raw(alias)}.name)`;
}
