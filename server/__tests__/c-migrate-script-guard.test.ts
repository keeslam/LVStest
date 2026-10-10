/**
 * Sub-project C, post-review: the write guard of scripts/migrate-manager-rights-c.ts
 * is the same strict check c-01-rights.test.ts uses. The database name must BE the
 * path of the URL; a name that merely ends in it, a lookalike or a query string that
 * mentions it must not pass (the old regex `/\/lvs_fixtest(\?|$)/` let `?db=/lvs_fixtest`
 * through).
 */
import { describe, it, expect } from "vitest";
import { pointsAtFixtest } from "../../scripts/migrate-manager-rights-c";

describe("migrate-manager-rights-c: pointsAtFixtest", () => {
  it("accepts the fixtest database, with or without a query", () => {
    expect(pointsAtFixtest("postgresql://postgres:postgres@localhost:5432/lvs_fixtest")).toBe(true);
    expect(pointsAtFixtest("postgresql://postgres:postgres@localhost:5432/lvs_fixtest?sslmode=disable")).toBe(true);
  });

  it("refuses every lookalike, the production-shaped names and unparseable input", () => {
    for (const url of [
      "postgresql://postgres:postgres@localhost:5432/lvs_fixtest_copy",
      "postgresql://postgres:postgres@localhost:5432/x/lvs_fixtest",
      "postgresql://postgres:postgres@localhost:5432/lvstest?db=/lvs_fixtest",
      "postgresql://postgres:postgres@localhost:5432/lvs_prodtest",
      "postgresql://postgres:postgres@localhost:5432/",
      "not a url",
      "",
    ]) {
      expect(pointsAtFixtest(url), url).toBe(false);
    }
  });
});
