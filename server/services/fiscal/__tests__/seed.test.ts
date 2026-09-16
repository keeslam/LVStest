/**
 * The first rule version ships as a draft with the values from the legal
 * frame of 16 September 2026 — never as a published version. Publication is
 * a human act after the verification points in docs/fiscaal/01-wettelijk-kader.md.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../../db";
import { fiscalRuleVersions, fiscalParameterValues } from "../../../../shared/schema";
import { eq, like } from "drizzle-orm";
import { ensureFiscalDraftVersion, SEED_TITLE } from "../seed";
import { cleanupFiscalFixtures } from "../../../__tests__/helpers/fiscal";

async function removeSeed() {
  await db.delete(fiscalRuleVersions).where(like(fiscalRuleVersions.title, `${SEED_TITLE}%`));
}

beforeAll(async () => {
  await cleanupFiscalFixtures();
  await removeSeed();
});
afterAll(async () => {
  await removeSeed();
  await cleanupFiscalFixtures();
});

describe("startseed van de eerste regelversie", () => {
  it("creates one complete draft, and only when no version exists yet", async () => {
    const first = await ensureFiscalDraftVersion();
    expect(first.created).toBe(true);
    const [version] = await db.select().from(fiscalRuleVersions).where(eq(fiscalRuleVersions.id, first.versionId!));
    expect(version.status).toBe("draft");
    expect(version.title).toContain("Belastingplan 2026");
    expect(version.sourceUrl).toMatch(/^https:\/\//);
    expect(version.legalReference).toContain("32bc");
    expect(version.assumptions).toContain("V1");
    const values = await db.select().from(fiscalParameterValues).where(eq(fiscalParameterValues.ruleVersionId, version.id));
    expect(values).toHaveLength(27);
    expect(values.filter((v) => v.legalStatus === "legal").every((v) => v.sourceUrl)).toBe(true);

    const second = await ensureFiscalDraftVersion();
    expect(second.created).toBe(false);
    const all = await db.select().from(fiscalRuleVersions).where(like(fiscalRuleVersions.title, `${SEED_TITLE}%`));
    expect(all).toHaveLength(1);
  });
});
