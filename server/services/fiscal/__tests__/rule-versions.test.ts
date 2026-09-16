/**
 * Rule versions: draft → in_review → approved → published → superseded, with
 * validation at the gates, an immutable published row, the one system-made
 * change on publication (closing an open predecessor), and resolution of the
 * applicable version by date — never by "newest".
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "../../../db";
import { fiscalAuditEvents, fiscalParameterValues, fiscalRuleVersions } from "../../../../shared/schema";
import { eq, and } from "drizzle-orm";
import {
  createDraft,
  updateDraft,
  setParameters,
  validateVersion,
  submitVersion,
  approveVersion,
  rejectVersion,
  publishVersion,
  archiveVersion,
  getVersion,
  FiscalStateError,
  FiscalValidationError,
} from "../rule-versions";
import { resolveForDate, clearFiscalResolveCache } from "../resolve";
import { cleanupFiscalFixtures, FIXTURE_ACTOR, FIXTURE_PARAMETER_VALUES } from "../../../__tests__/helpers/fiscal";
import { FIXTURE_PREFIX } from "../../../__tests__/helpers/fixtures";

const RULE = "pseudo_eindheffing_fossiel" as const;

async function draftWithValues(title: string, effectiveFrom: string, effectiveUntil: string | null = null) {
  const v = await createDraft({ ruleKey: RULE, title: `${FIXTURE_PREFIX}${title}`, reasonCategory: "legislative_change", reasonText: "Belastingplan 2026, artikel 32bc" }, FIXTURE_ACTOR);
  await updateDraft(v.id, { effectiveFrom, effectiveUntil, sourceOrganisation: "Rijksoverheid", sourceUrl: "https://ondernemersplein.overheid.nl/", legalReference: "art. 32bc Wet LB 1964" }, FIXTURE_ACTOR);
  await setParameters(v.id, Object.entries(FIXTURE_PARAMETER_VALUES).map(([key, value]) => ({ key, value })), FIXTURE_ACTOR);
  return v;
}

async function published(title: string, effectiveFrom: string, effectiveUntil: string | null = null) {
  const v = await draftWithValues(title, effectiveFrom, effectiveUntil);
  await submitVersion(v.id, FIXTURE_ACTOR);
  await approveVersion(v.id, FIXTURE_ACTOR);
  return publishVersion(v.id, FIXTURE_ACTOR);
}

async function auditActions(versionId: number): Promise<string[]> {
  const rows = await db.select({ action: fiscalAuditEvents.action }).from(fiscalAuditEvents).where(eq(fiscalAuditEvents.ruleVersionId, versionId)).orderBy(fiscalAuditEvents.id);
  return rows.map((r) => r.action);
}

beforeAll(cleanupFiscalFixtures);
afterAll(cleanupFiscalFixtures);
beforeEach(async () => {
  await cleanupFiscalFixtures();
  clearFiscalResolveCache();
});

describe("regelversies — concept en parameters", () => {
  it("numbers versions per rule and audits the creation", async () => {
    const v1 = await createDraft({ ruleKey: RULE, title: `${FIXTURE_PREFIX}eerste`, reasonCategory: "other", reasonText: "eerste concept voor de test" }, FIXTURE_ACTOR);
    const v2 = await createDraft({ ruleKey: RULE, title: `${FIXTURE_PREFIX}tweede`, reasonCategory: "other", reasonText: "tweede concept voor de test" }, FIXTURE_ACTOR);
    expect(v1.status).toBe("draft");
    expect(v2.versionNumber).toBe(v1.versionNumber + 1);
    expect(await auditActions(v1.id)).toEqual(["draft_created"]);
  });

  it("stores each parameter with its unit and audits old and new value", async () => {
    const v = await createDraft({ ruleKey: RULE, title: `${FIXTURE_PREFIX}params`, reasonCategory: "other", reasonText: "parameters voor de test" }, FIXTURE_ACTOR);
    await setParameters(v.id, [{ key: "PSEUDO_ENDHEFFING_RATE", value: 12 }], FIXTURE_ACTOR);
    const first = await setParameters(v.id, [{ key: "PSEUDO_ENDHEFFING_RATE", value: 13.5, sourceUrl: "https://example.invalid/bron" }], FIXTURE_ACTOR);
    expect(first.values.PSEUDO_ENDHEFFING_RATE).toBe(13.5);
    const [row] = await db.select().from(fiscalParameterValues).where(and(eq(fiscalParameterValues.ruleVersionId, v.id), eq(fiscalParameterValues.parameterKey, "PSEUDO_ENDHEFFING_RATE")));
    expect(row.unit).toBe("percent_per_year");
    expect(row.legalStatus).toBe("legal");
    expect(row.valueDecimal).toBe("13.5000");
    const events = await db.select().from(fiscalAuditEvents).where(and(eq(fiscalAuditEvents.ruleVersionId, v.id), eq(fiscalAuditEvents.parameterKey, "PSEUDO_ENDHEFFING_RATE"))).orderBy(fiscalAuditEvents.id);
    expect(events.map((e) => [e.oldValue, e.newValue, e.unit])).toEqual([[null, "12", "percent_per_year"], ["12", "13.5", "percent_per_year"]]);
  });

  it("reports validation problems instead of storing nonsense silently", async () => {
    const v = await createDraft({ ruleKey: RULE, title: `${FIXTURE_PREFIX}ongeldig`, reasonCategory: "other", reasonText: "ongeldige waarden voor de test" }, FIXTURE_ACTOR);
    const result = await setParameters(v.id, [{ key: "PSEUDO_ENDHEFFING_RATE", value: 250 }, { key: "REPLACEMENT_VEHICLE_EXEMPTION_DAYS", value: 2.5 }], FIXTURE_ACTOR);
    expect(result.validation.ok).toBe(false);
    expect(result.validation.issues.map((i) => i.key)).toEqual(expect.arrayContaining(["PSEUDO_ENDHEFFING_RATE", "REPLACEMENT_VEHICLE_EXEMPTION_DAYS"]));
    await expect(setParameters(v.id, [{ key: "NOT_A_PARAMETER", value: 1 }], FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalValidationError);
  });

  it("refuses to submit an incomplete draft and audits the failed validation", async () => {
    const v = await createDraft({ ruleKey: RULE, title: `${FIXTURE_PREFIX}leeg`, reasonCategory: "other", reasonText: "leeg concept voor de test" }, FIXTURE_ACTOR);
    await expect(submitVersion(v.id, FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalValidationError);
    expect((await getVersion(v.id))!.status).toBe("draft");
    expect(await auditActions(v.id)).toContain("validation_failed");
    const check = await validateVersion(v.id);
    expect(check.ok).toBe(false);
    expect(check.issues.some((i) => i.key === "effective_from")).toBe(true);
  });
});

describe("regelversies — toestandsmachine", () => {
  it("walks draft → in_review → approved → published and records who did what", async () => {
    const v = await draftWithValues("stroom", "2027-01-01");
    await submitVersion(v.id, FIXTURE_ACTOR);
    expect((await getVersion(v.id))!.status).toBe("in_review");
    await approveVersion(v.id, FIXTURE_ACTOR);
    expect((await getVersion(v.id))!.status).toBe("approved");
    const done = await publishVersion(v.id, FIXTURE_ACTOR);
    expect(done.status).toBe("published");
    expect(done.publishedByName).toBe(FIXTURE_ACTOR.username);
    expect(done.publishedAt).not.toBeNull();
    expect(await auditActions(v.id)).toEqual(expect.arrayContaining(["submitted", "approved", "published"]));
  });

  it("refuses transitions that skip a state", async () => {
    const v = await draftWithValues("skip", "2027-01-01");
    await expect(approveVersion(v.id, FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalStateError);
    await expect(publishVersion(v.id, FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalStateError);
  });

  it("a rejection needs a reason and is final", async () => {
    const v = await draftWithValues("afgewezen", "2027-01-01");
    await submitVersion(v.id, FIXTURE_ACTOR);
    await expect(rejectVersion(v.id, "", FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalValidationError);
    await rejectVersion(v.id, "bron klopt niet", FIXTURE_ACTOR);
    expect((await getVersion(v.id))!.status).toBe("rejected");
    await expect(submitVersion(v.id, FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalStateError);
  });

  it("a published version cannot be edited", async () => {
    const v = await published("vast", "2027-01-01");
    await expect(updateDraft(v.id, { title: `${FIXTURE_PREFIX}anders` }, FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalStateError);
    await expect(setParameters(v.id, [{ key: "PSEUDO_ENDHEFFING_RATE", value: 1 }], FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalStateError);
    const [row] = await db.select().from(fiscalRuleVersions).where(eq(fiscalRuleVersions.id, v.id));
    expect(row.title).toBe(`${FIXTURE_PREFIX}vast`);
  });

  it("publishing a successor closes an open predecessor — the one change to a published row — and audits it", async () => {
    const v1 = await published("v1", "2027-01-01");
    const v2 = await published("v2", "2028-01-01");
    const [old] = await db.select().from(fiscalRuleVersions).where(eq(fiscalRuleVersions.id, v1.id));
    expect(old.status).toBe("superseded");
    expect(old.effectiveUntil).toBe("2027-12-31");
    expect(old.supersededById).toBe(v2.id);
    const events = await db.select().from(fiscalAuditEvents).where(and(eq(fiscalAuditEvents.ruleVersionId, v1.id), eq(fiscalAuditEvents.action, "superseded")));
    expect(events).toHaveLength(1);
    expect(events[0].oldValue).toBeNull();
    expect(events[0].newValue).toBe("2027-12-31");
  });

  it("refuses to publish a version that overlaps a closed published range", async () => {
    await published("dicht", "2027-01-01", "2027-12-31");
    const v = await draftWithValues("overlap", "2027-06-01");
    await submitVersion(v.id, FIXTURE_ACTOR);
    await approveVersion(v.id, FIXTURE_ACTOR);
    await expect(publishVersion(v.id, FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalStateError);
    expect((await getVersion(v.id))!.status).toBe("approved");
  });

  it("refuses to publish a version that starts before an open predecessor", async () => {
    await published("later", "2028-01-01");
    const v = await draftWithValues("eerder", "2027-01-01");
    await submitVersion(v.id, FIXTURE_ACTOR);
    await approveVersion(v.id, FIXTURE_ACTOR);
    await expect(publishVersion(v.id, FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalStateError);
  });

  it("archives a draft, and a published version only once it lies in the past", async () => {
    const d = await draftWithValues("weg", "2027-01-01");
    await archiveVersion(d.id, FIXTURE_ACTOR);
    expect((await getVersion(d.id))!.status).toBe("archived");
    const open = await published("open", "2027-01-01");
    await expect(archiveVersion(open.id, FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalStateError);
  });
});

describe("regelversies — keuze op datum", () => {
  it("picks the published version whose window contains the date, never the newest", async () => {
    const v1 = await published("2027", "2027-01-01");
    const v2 = await published("2028", "2028-01-01");
    const a = await resolveForDate(RULE, "2027-06-15");
    expect(a.status).toBe("ok");
    if (a.status === "ok") expect(a.version.id).toBe(v1.id);
    const b = await resolveForDate(RULE, "2028-03-01");
    if (b.status === "ok") expect(b.version.id).toBe(v2.id);
    expect(b.status).toBe("ok");
  });

  it("has no version before the first effective date or inside a gap", async () => {
    await published("dicht", "2027-01-01", "2027-06-30");
    expect((await resolveForDate(RULE, "2026-12-31")).status).toBe("RULE_NOT_AVAILABLE");
    expect((await resolveForDate(RULE, "2027-09-01")).status).toBe("RULE_NOT_AVAILABLE");
    expect((await resolveForDate(RULE, "2027-06-30")).status).toBe("ok");
  });

  it("ignores drafts and approved-but-unpublished versions", async () => {
    const v = await draftWithValues("concept", "2027-01-01");
    await submitVersion(v.id, FIXTURE_ACTOR);
    await approveVersion(v.id, FIXTURE_ACTOR);
    expect((await resolveForDate(RULE, "2027-06-15")).status).toBe("RULE_NOT_AVAILABLE");
  });

  it("resolves the parameters of the version with their units and sources", async () => {
    await published("params", "2027-01-01");
    const r = await resolveForDate(RULE, "2027-06-15");
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.params.decimal("PSEUDO_ENDHEFFING_RATE")).toBe(12);
    expect(r.params.list("VEHICLE_CATEGORIES_IN_SCOPE")).toEqual(["M1"]);
    expect(r.params.date("REPLACEMENT_VEHICLE_EXEMPTION_UNTIL")).toBeNull();
    const snap = r.params.snapshot().find((p) => p.key === "PSEUDO_ENDHEFFING_RATE");
    expect(snap?.unit).toBe("percent_per_year");
  });

  it("reports an invalid configuration when a published version lost a required parameter", async () => {
    const v = await published("kapot", "2027-01-01");
    await db.delete(fiscalParameterValues).where(and(eq(fiscalParameterValues.ruleVersionId, v.id), eq(fiscalParameterValues.parameterKey, "PSEUDO_ENDHEFFING_RATE")));
    clearFiscalResolveCache();
    const r = await resolveForDate(RULE, "2027-06-15");
    expect(r.status).toBe("CONFIGURATION_INVALID");
  });
});
