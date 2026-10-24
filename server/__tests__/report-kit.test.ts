/**
 * Rapporten fase 2 — the shared server report kit: period and paging parsers
 * and the summary/rows/export routes every money report mounts. No database:
 * the mount tests use an in-memory definition on a bare express app.
 */
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import {
  parseReportFilter,
  parseReportPaging,
  defaultReportPeriod,
  isRealDate,
  textDaySql,
  officeDaySql,
  inPeriodSql,
  money,
  oneOf,
  positiveInt,
  mountReport,
  type ReportDefinition,
} from "../services/reports/report-kit";
import { REPORT_EXPORT_LIMIT, type ReportTileTotal } from "../../shared/report-kit";

const T = "2026-10-24";

describe("parseReportFilter", () => {
  it("standaardperiode is het huidige jaar tot vandaag", () => {
    expect(parseReportFilter({}, "2026-10-24")).toEqual({ ok: true, filter: { from: "2026-01-01", to: "2026-10-24", vehicleId: null } });
  });

  it("ongeldige datum, from na to en kapot voertuig", () => {
    expect(parseReportFilter({ from: "2026-02-30" }, T)).toEqual({ ok: false, code: "INVALID_DATE" });
    expect(parseReportFilter({ from: "2026-05-01", to: "2026-04-01" }, T)).toEqual({ ok: false, code: "INVALID_DATE" });
    expect(parseReportFilter({ vehicleId: "abc" }, T)).toEqual({ ok: false, code: "INVALID_VEHICLE" });
    expect((parseReportFilter({ vehicleId: "all" }, T) as any).filter.vehicleId).toBeNull();
    expect((parseReportFilter({ vehicleId: "12" }, T) as any).filter.vehicleId).toBe(12);
  });

  it("lege waarden vallen terug op de standaardperiode; een array is ongeldig", () => {
    expect(parseReportFilter({ from: "", to: "" }, T)).toEqual({ ok: true, filter: { from: "2026-01-01", to: T, vehicleId: null } });
    expect(parseReportFilter({ from: ["2026-01-01"] }, T)).toEqual({ ok: false, code: "INVALID_DATE" });
    expect(parseReportFilter({ vehicleId: "0" }, T)).toEqual({ ok: false, code: "INVALID_VEHICLE" });
  });
});

describe("kleine parsers", () => {
  it("isRealDate, defaultReportPeriod, oneOf en positiveInt", () => {
    expect(isRealDate("2024-02-29")).toBe(true);
    expect(isRealDate("2026-02-29")).toBe(false);
    expect(isRealDate("2026-1-01")).toBe(false);
    expect(defaultReportPeriod("2025-03-04")).toEqual({ from: "2025-01-01", to: "2025-03-04" });
    expect(oneOf("b", ["a", "b"] as const)).toBe("b");
    expect(oneOf("c", ["a", "b"] as const)).toBeNull();
    expect(oneOf(1, ["a"] as const)).toBeNull();
    expect(positiveInt("7", 1)).toBe(7);
    expect(positiveInt("0", 3)).toBe(3);
    expect(positiveInt(undefined, 3)).toBe(3);
  });

  it("paginering begrenst en valt terug", () => {
    expect(parseReportPaging({ pageSize: "1000", sort: "evil", dir: "x" }, ["date", "amount"], "date", "desc"))
      .toEqual({ sort: "date", dir: "desc", page: 1, pageSize: 250 });
    expect(parseReportPaging({}, ["date", "amount"], "amount", "asc"))
      .toEqual({ sort: "amount", dir: "asc", page: 1, pageSize: 50 });
    expect(parseReportPaging({ sort: "amount", dir: "desc", page: "3", pageSize: "25" }, ["date", "amount"], "date", "asc"))
      .toEqual({ sort: "amount", dir: "desc", page: 3, pageSize: 25 });
  });
});

describe("SQL-hulpjes", () => {
  it("textDaySql, officeDaySql, inPeriodSql en money in Postgres", async () => {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const filter = { from: "2026-03-01", to: "2026-03-31", vehicleId: null };
    const result = await db.execute(sql`SELECT
      ${textDaySql(sql`'2026-03-05T10:00'::text`)}::text AS text_day,
      ${textDaySql(sql`'geen datum'::text`)}::text AS text_bad,
      ${officeDaySql(sql`'2026-03-31T23:30:00Z'::timestamptz`)}::text AS office_day,
      ${inPeriodSql(textDaySql(sql`'2026-03-31'::text`), filter)} AS in_period,
      ${inPeriodSql(textDaySql(sql`'2026-04-01'::text`), filter)} AS out_period,
      ${money(sql`(SELECT sum(x) FROM (VALUES (1.005::numeric), (2.1)) v(x))`)} AS amount,
      ${money(sql`(SELECT sum(x) FROM (VALUES (1::numeric)) v(x) WHERE false)`)} AS nothing`);
    expect(result.rows[0]).toEqual({
      text_day: "2026-03-05",
      text_bad: null,
      office_day: "2026-04-01", // 23:30 UTC is 01:30 in Amsterdam (summer time)
      in_period: true,
      out_period: false,
      amount: 3.11,
      nothing: 0,
    });
  });
});

type Row = { id: number; amount: number };
type Summary = { tiles: Record<"a", ReportTileTotal> };

function fakeDefinition(overrides: Partial<ReportDefinition<"a", "date", Row, Summary>> = {}): ReportDefinition<"a", "date", Row, Summary> {
  const rows: Row[] = [{ id: 1, amount: 1 }, { id: 2, amount: 2 }, { id: 3, amount: 3 }];
  return {
    key: "fake-thing",
    tiles: ["a"],
    sorts: ["date"],
    defaultSort: "date",
    defaultDir: "desc",
    summary: async () => ({ tiles: { a: { count: 3, amount: 6 } } }),
    count: async () => rows.length,
    list: async (_f, _t, _o, limit, offset) => rows.slice(offset, offset + limit),
    ...overrides,
  };
}

function appWith(def: ReportDefinition<"a", "date", Row, Summary>) {
  const app = express();
  mountReport(app, "/api/reports/fake", [], def);
  return app;
}

describe("mountReport", () => {
  it("onbekende of ontbrekende tegel is 400 INVALID_TILE", async () => {
    const app = appWith(fakeDefinition());
    const res = await request(app).get("/api/reports/fake/rows?tile=zz");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_TILE");
    expect((await request(app).get("/api/reports/fake/export")).body.code).toBe("INVALID_TILE");
  });

  it("pagina wordt begrensd op de laatste", async () => {
    const res = await request(appWith(fakeDefinition())).get("/api/reports/fake/rows?tile=a&page=99&pageSize=25");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, total: 3, pageSize: 25 });
    expect(res.body.rows).toHaveLength(3);
  });

  it("summary geeft de periode mee en weigert een kapotte datum", async () => {
    const app = appWith(fakeDefinition());
    const bad = await request(app).get("/api/reports/fake/summary?from=2026-13-01");
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("INVALID_DATE");
    const ok = await request(app).get("/api/reports/fake/summary?from=2026-01-01&to=2026-02-01");
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ tiles: { a: { count: 3, amount: 6 } }, from: "2026-01-01", to: "2026-02-01" });
  });

  it("export markeert afgekapt boven de limiet", async () => {
    const def = fakeDefinition({
      list: async (_f, _t, _o, limit) => Array.from({ length: limit }, (_, i) => ({ id: i + 1, amount: 1 })),
    });
    const res = await request(appWith(def)).get("/api/reports/fake/export?tile=a");
    expect(res.status).toBe(200);
    expect(res.body.truncated).toBe(true);
    expect(res.body.rows).toHaveLength(REPORT_EXPORT_LIMIT);
  });

  it("export zonder afkappen", async () => {
    const res = await request(appWith(fakeDefinition())).get("/api/reports/fake/export?tile=a");
    expect(res.body).toEqual({ rows: [{ id: 1, amount: 1 }, { id: 2, amount: 2 }, { id: 3, amount: 3 }], truncated: false });
  });

  it("een fout wordt 500 met de foutcode van het rapport", async () => {
    const def = fakeDefinition({ summary: async () => { throw new Error("boom"); } });
    const res = await request(appWith(def)).get("/api/reports/fake/summary");
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("FAKE_THING_REPORT_FAILED");
  });

  it("de guards draaien voor elke route", async () => {
    const app = express();
    mountReport(app, "/api/reports/fake", [(_req, res) => { res.status(403).json({ code: "NO" }); }], fakeDefinition());
    for (const path of ["summary", "rows?tile=a", "export?tile=a"]) {
      expect((await request(app).get(`/api/reports/fake/${path}`)).status).toBe(403);
    }
  });
});
