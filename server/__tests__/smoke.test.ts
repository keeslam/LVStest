import { describe, it, expect } from "vitest";
import { db } from "../db";
import { sql } from "drizzle-orm";

describe("test database", () => {
  it("answers a trivial query", async () => {
    const result = await db.execute(sql`select 1 as one`);
    expect(result.rows[0]).toEqual({ one: 1 });
  });
});
