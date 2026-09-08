// scripts/export-schema.test.ts
//
// Drift guard: fails if the committed schema-columns.json doesn't match
// what scripts/export-schema.ts's buildManifest() would produce from the
// current shared/schema.ts. Catches a schema change that forgot to
// re-run `npm run schema:export` (the build script does this
// automatically, but this test catches it in CI / before commit too).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { buildManifest } from "./export-schema";

describe("schema-columns.json drift guard", () => {
  it("matches the manifest built from the current shared/schema.ts", () => {
    const manifestPath = path.resolve(__dirname, "..", "schema-columns.json");
    const committed = readFileSync(manifestPath, "utf8").replace(/\r\n/g, "\n");
    const rebuilt = (JSON.stringify(buildManifest(), null, 2) + "\n").replace(/\r\n/g, "\n");
    expect(committed).toBe(rebuilt);
  });
});
