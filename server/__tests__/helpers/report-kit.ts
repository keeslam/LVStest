/**
 * Rapporten fase 2 — the check every money report runs: each tile on the
 * summary must agree with the rows behind it. The count matches `rows.total`
 * and the amount matches the sum of `amount` over the export (every report
 * puts a row's tile amount in the field `amount`).
 */
import { expect } from "vitest";
import type { TestAgent } from "./app";

function queryString(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function expectTilesMatchRows(
  agent: TestAgent,
  basePath: string,
  params: Record<string, string>,
  tiles: readonly string[],
): Promise<void> {
  const summary = await agent.get(`${basePath}/summary?${queryString(params)}`);
  expect(summary.status, `${basePath}/summary`).toBe(200);
  for (const tile of tiles) {
    const total = summary.body.tiles?.[tile];
    expect(total, `tile ${tile} on the summary`).toBeDefined();

    const rows = await agent.get(`${basePath}/rows?${queryString({ ...params, tile, pageSize: "250" })}`);
    expect(rows.status, `${basePath}/rows tile=${tile}`).toBe(200);
    expect(total.count, `count of tile ${tile}`).toBe(rows.body.total);

    const exported = await agent.get(`${basePath}/export?${queryString({ ...params, tile })}`);
    expect(exported.status, `${basePath}/export tile=${tile}`).toBe(200);
    const sum = (exported.body.rows as Array<{ amount: number | null }>).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    expect(total.amount, `amount of tile ${tile}`).toBe(round2(sum));
  }
}
