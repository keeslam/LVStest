/**
 * The monthly fiscal report: what was assessed, per customer, vehicle and
 * calendar month, with every month settled, provisional or final (besluit
 * F-15), as JSON and as a Dutch CSV — and one assessment as a PDF sheet.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import { db } from "../../../db";
import { reservations } from "../../../../shared/schema";
import { eq } from "drizzle-orm";
import { monthlyReport, reportToCsv, type FiscalReport, type FiscalReportRow } from "../reports";
import { renderAssessmentPdf } from "../assessment-pdf";
import { assessUsagePeriod } from "../assess";
import { syncUsagePeriodForReservation, confirmUsage } from "../usage-periods";
import { ensureProfile, applyManualOverride } from "../profiles";
import { createDraft, updateDraft, setParameters, submitVersion, approveVersion, publishVersion } from "../rule-versions";
import { clearFiscalResolveCache } from "../resolve";
import { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures, FIXTURE_PREFIX } from "../../../__tests__/helpers/fixtures";
import { cleanupFiscalFixtures, FIXTURE_ACTOR, FIXTURE_PARAMETER_VALUES } from "../../../__tests__/helpers/fiscal";

const RULE = "pseudo_eindheffing_fossiel" as const;

async function publish(title: string) {
  const v = await createDraft({ ruleKey: RULE, title: `${FIXTURE_PREFIX}${title}`, reasonCategory: "legislative_change", reasonText: "rapporttest" }, FIXTURE_ACTOR);
  await updateDraft(v.id, { effectiveFrom: "2027-01-01", sourceOrganisation: "Rijksoverheid", sourceUrl: "https://ondernemersplein.overheid.nl/", legalReference: "art. 32bc Wet LB 1964" }, FIXTURE_ACTOR);
  await setParameters(v.id, Object.entries(FIXTURE_PARAMETER_VALUES).map(([key, value]) => ({ key, value })), FIXTURE_ACTOR);
  await submitVersion(v.id, FIXTURE_ACTOR);
  await approveVersion(v.id, FIXTURE_ACTOR);
  await publishVersion(v.id, FIXTURE_ACTOR);
  clearFiscalResolveCache();
}

async function car(catalog = "36000.00") {
  const v = await createFixtureVehicle({ fuel: "Gasoline", productionDate: "2024-05-01" });
  await ensureProfile(v.id);
  await applyManualOverride(v.id, { field: "europeanCategory", value: "M1", reason: "kentekenbewijs" }, FIXTURE_ACTOR);
  await applyManualOverride(v.id, { field: "catalogValue", value: catalog, reason: "factuur" }, FIXTURE_ACTOR);
  return v;
}

async function rental(customerId: number, vehicleId: number, startDate: string, endDate: string | null) {
  const r = await createFixtureReservation({ customerId, vehicleId, startDate, endDate });
  const period = (await syncUsagePeriodForReservation(r.id))!;
  await confirmUsage(r.id, { privateUse: "yes", commuting: "no", providedBeforeCutoff: "no", usageType: "business_private" }, { kind: "staff", actor: FIXTURE_ACTOR });
  return { reservation: r, period };
}

beforeAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
});
afterAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
});
beforeEach(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
  clearFiscalResolveCache();
});

describe("maandrapport", () => {
  it("spreads the latest assessments over the months of the year, with state and totals, and counts unassessed periods", async () => {
    await publish("wet");
    const a = await createFixtureCustomer();
    const b = await createFixtureCustomer();
    const v1 = await car();
    const v2 = await car("24000.00");
    const pA = (await rental(a.id, v1.id, "2027-02-10", null)).period; // open-ended
    const pB = (await rental(b.id, v2.id, "2027-03-01", "2027-03-31")).period;
    await rental(b.id, v1.id, "2027-11-20", "2028-01-10"); // never assessed
    await assessUsagePeriod(pA.id, { trigger: "nightly", calculationDate: "2027-03-15" });
    await assessUsagePeriod(pB.id, { trigger: "nightly", calculationDate: "2027-04-02" });

    const ra = await monthlyReport({ year: 2027, customerId: a.id });
    expect(ra.rows.map((r) => [r.month, r.state, r.amount, r.charged])).toEqual([
      ["2027-02", "settled", "360.00", true],
      ["2027-03", "provisional", "360.00", true],
    ]);
    expect(ra.rows[0]).toMatchObject({ customerName: a.name, licensePlate: v1.licensePlate, usagePeriodId: pA.id, statusLabel: "Van toepassing", reasonLabel: "geheven" });
    expect(ra.totals).toMatchObject({ amount: "720.00", settled: "360.00", provisional: "360.00", chargedMonths: 2, periods: 1, unassessedPeriods: 0 });
    expect(ra.byMonth.map((m) => [m.month, m.amount])).toEqual([["2027-02", "360.00"], ["2027-03", "360.00"]]);
    expect(ra.byCustomer).toEqual([{ customerId: a.id, customerName: a.name, periods: 1, chargedMonths: 2, amount: "720.00", settled: "360.00", provisional: "360.00" }]);

    const rb = await monthlyReport({ year: 2027, customerId: b.id });
    expect(rb.rows.map((r) => [r.month, r.state, r.amount])).toEqual([["2027-03", "settled", "240.00"]]);
    expect(rb.totals).toMatchObject({ periods: 2, unassessedPeriods: 1, amount: "240.00" });

    const r28 = await monthlyReport({ year: 2028, customerId: b.id });
    expect(r28.rows).toHaveLength(0);
    expect(r28.totals.unassessedPeriods).toBe(1);

    // A customer without the dashboard switch: states stay, amounts are absent (besluit F-05).
    const blind = await monthlyReport({ year: 2027, customerId: a.id }, { withAmounts: false });
    expect(blind.rows.map((r) => r.state)).toEqual(["settled", "provisional"]);
    expect(blind.rows.every((r) => r.amount === null)).toBe(true);
    expect(blind.totals.amount).toBeNull();
  });

  it("the final calculation marks every month final", async () => {
    await publish("wet");
    const c = await createFixtureCustomer();
    const v = await car();
    const { reservation, period } = await rental(c.id, v.id, "2027-03-01", "2027-04-30");
    await assessUsagePeriod(period.id, { trigger: "nightly", calculationDate: "2027-03-15" });
    await db.update(reservations).set({ actualReturnDate: "2027-03-20", status: "returned", updatedAt: new Date() }).where(eq(reservations.id, reservation.id));
    await syncUsagePeriodForReservation(reservation.id);
    const report = await monthlyReport({ year: 2027, customerId: c.id });
    expect(report.rows.map((r) => [r.month, r.state])).toEqual([["2027-03", "final"]]);
    expect(report.totals).toMatchObject({ amount: "360.00", settled: "360.00", provisional: "0.00" });
  });

  it("writes a Dutch CSV: BOM, semicolons, decimal commas, quoted fields, no amount column without amounts", () => {
    const row: FiscalReportRow = {
      customerId: 1, customerName: "Klant; met puntkomma", vehicleId: 2, licensePlate: "AB-123-C", vehicle: "Volkswagen Golf",
      usagePeriodId: 3, reservationId: 4, periodStart: "2027-03-01", periodEnd: null, assessmentId: 5, status: "APPLICABLE", statusLabel: "Van toepassing",
      month: "2027-03", days: 31, charged: true, reason: "charged", reasonLabel: "geheven", amount: "360.00", state: "provisional",
      ruleVersionTitle: "Belastingplan 2026", assessedAt: "2027-03-15T02:00:00.000Z",
    };
    const report: FiscalReport = {
      year: 2027, withAmounts: true, rows: [row],
      totals: { amount: "360.00", settled: "0.00", provisional: "360.00", chargedMonths: 1, periods: 1, unassessedPeriods: 0 },
      byCustomer: [], byMonth: [],
    };
    const csv = reportToCsv(report);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Klant;Kenteken;Voertuig;Periode van;Periode tot;Maand;Dagen;Reden;Bedrag;Stand;Status;Regelversie;Beoordeeld op");
    expect(csv).toContain('"Klant; met puntkomma";AB-123-C;Volkswagen Golf;2027-03-01;;2027-03;31;geheven;360,00;voorlopig;Van toepassing;Belastingplan 2026;2027-03-15');
    expect(csv).toContain("Totaal;;;;;;;;360,00");
    expect(csv).toContain("geen fiscaal advies");

    const blind = reportToCsv({ ...report, withAmounts: false, rows: [{ ...row, amount: null }], totals: { ...report.totals, amount: null, settled: null, provisional: null } });
    expect(blind).not.toContain("Bedrag");
    expect(blind).not.toContain("360");
    expect(blind).toContain(";geheven;voorlopig;");
  });
});

describe("beoordeling als PDF", () => {
  it("renders a sheet with the facts and the explanation, smaller without the amounts", async () => {
    await publish("wet");
    const c = await createFixtureCustomer();
    const v = await car();
    const { period } = await rental(c.id, v.id, "2027-03-01", "2027-03-31");
    const { assessment } = await assessUsagePeriod(period.id, { trigger: "manual", calculationDate: "2027-04-02", actor: FIXTURE_ACTOR });
    const context = { customerName: c.name, licensePlate: v.licensePlate, vehicle: `${v.brand} ${v.model}`, withAmounts: true };
    const pdf = await renderAssessmentPdf(assessment, context);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toBe(`Fiscale beoordeling ${assessment.id}`);
    const blind = await renderAssessmentPdf(assessment, { ...context, withAmounts: false });
    expect(blind.subarray(0, 5).toString()).toBe("%PDF-");
    expect(blind.length).toBeLessThan(pdf.length);
  });
});
