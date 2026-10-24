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
  periodDays,
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
      ${textDaySql(sql`'2026-02-30'::text`)}::text AS text_unreal,
      ${textDaySql(sql`'2026-13-01'::text`)}::text AS text_month13,
      ${textDaySql(sql`'2024-02-29T08:00'::text`)}::text AS text_leap,
      ${officeDaySql(sql`'2026-03-31T23:30:00Z'::timestamptz`)}::text AS office_day,
      ${inPeriodSql(textDaySql(sql`'2026-03-31'::text`), filter)} AS in_period,
      ${inPeriodSql(textDaySql(sql`'2026-04-01'::text`), filter)} AS out_period,
      ${money(sql`(SELECT sum(x) FROM (VALUES (1.005::numeric), (2.1)) v(x))`)} AS amount,
      ${money(sql`(SELECT sum(x) FROM (VALUES (1::numeric)) v(x) WHERE false)`)} AS nothing`);
    expect(result.rows[0]).toEqual({
      text_day: "2026-03-05",
      text_bad: null,
      text_unreal: null,
      text_month13: null,
      text_leap: "2024-02-29",
      office_day: "2026-04-01", // 23:30 UTC is 01:30 in Amsterdam (summer time)
      in_period: true,
      out_period: false,
      amount: 3.11,
      nothing: 0,
    });
  });

  it("textDaySql geeft NULL voor een onechte datum in een kolom (geen 500 voor het hele rapport)", async () => {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const result = await db.execute(sql`SELECT v, ${textDaySql(sql`v`)}::text AS day
      FROM (VALUES (1, '2026-02-30'), (2, '2026-02-28T10:00'), (3, '2026-04-31'), (4, '0000-01-01'), (5, 'kapot')) t(n, v) ORDER BY n`);
    expect(result.rows.map((r: any) => r.day)).toEqual([null, "2026-02-28", null, null, null]);
  });

  it("officeDaySql leest een naieve timestamp als UTC en een timestamptz als moment", async () => {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const result = await db.execute(sql`SELECT
      ${officeDaySql(sql`'2026-03-04T23:30:00'::timestamp`)}::text AS naive_winter,
      ${officeDaySql(sql`'2026-03-31T23:30:00'::timestamp`)}::text AS naive_summer,
      ${officeDaySql(sql`'2026-03-04T23:30:00Z'::timestamptz`)}::text AS tz_winter`);
    expect(result.rows[0]).toEqual({ naive_winter: "2026-03-05", naive_summer: "2026-04-01", tz_winter: "2026-03-05" });
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

  it("sqlReport bouwt tegeltotalen, telling en lijst uit dezelfde tileWhere en tileAmount", async () => {
    const { sql } = await import("drizzle-orm");
    const { sqlReport } = await import("../services/reports/sql-report");
    type K = "a" | "b" | "all";
    const def = sqlReport<K, "id", { id: number; amount: number }, { extra: number }>({
      key: "kit-sql",
      tiles: ["a", "b", "all"],
      sorts: ["id"],
      defaultSort: "id",
      defaultDir: "asc",
      from: sql`(VALUES (1, 10.25::numeric, 'a', '2026-03-01'), (2, 5::numeric, 'a', '2026-05-01'), (3, 2::numeric, 'b', '2026-03-02')) v(id, amt, kind, day)`,
      // "all" ignores the period, like the transport openAllTime tile
      tileWhere: (tile, filter) => tile === "all"
        ? sql`true`
        : sql`kind = ${tile} AND ${inPeriodSql(textDaySql(sql`day`), filter)}`,
      tileAmount: () => sql`amt`,
      select: () => sql`id, amt::float8 AS amount`,
      orderBy: (_s, dir) => sql`id ${sql.raw(dir === "asc" ? "ASC" : "DESC")}`,
      mapRow: (r) => ({ id: Number(r.id), amount: Number(r.amount) }),
      extras: async () => ({ extra: 7 }),
    });
    const filter = { from: "2026-03-01", to: "2026-03-31", vehicleId: null };
    expect(await def.summary(filter)).toEqual({
      tiles: { a: { count: 1, amount: 10.25 }, b: { count: 1, amount: 2 }, all: { count: 3, amount: 17.25 } },
      extra: 7,
    });
    expect(await def.count(filter, "all")).toBe(3);
    expect(await def.list(filter, "a", { sort: "id", dir: "asc" }, 10, 0)).toEqual([{ id: 1, amount: 10.25 }]);
    expect(await def.list(filter, "all", { sort: "id", dir: "desc" }, 2, 1)).toEqual([{ id: 2, amount: 5 }, { id: 1, amount: 10.25 }]);
  });

  it("de guards draaien voor elke route", async () => {
    const app = express();
    mountReport(app, "/api/reports/fake", [(_req, res) => { res.status(403).json({ code: "NO" }); }], fakeDefinition());
    for (const path of ["summary", "rows?tile=a", "export?tile=a"]) {
      expect((await request(app).get(`/api/reports/fake/${path}`)).status).toBe(403);
    }
  });
});

describe("mountReport: maxDays en redact", () => {
  type SecretRow = { id: number; secret: number | null; amount: number };
  type SecretDef = ReportDefinition<"a", "date", SecretRow, Summary>;
  const secretDef = (overrides: Partial<SecretDef> = {}): SecretDef => ({
    key: "fake-thing",
    tiles: ["a"],
    sorts: ["date"],
    defaultSort: "date",
    defaultDir: "desc",
    summary: async () => ({ tiles: { a: { count: 1, amount: 0 } } }),
    count: async () => 1,
    list: async () => [{ id: 1, secret: 42, amount: 0 }],
    ...overrides,
  });
  const appAs = (role: string, def: SecretDef) => {
    const app = express();
    mountReport(app, "/x", [(req, _res, next) => { (req as any).user = { role }; next(); }], def);
    return app;
  };

  it("maxDays: 32 dagen geweigerd, 31 toegestaan", async () => {
    const app = appAs("admin", secretDef({ maxDays: 31 }));
    expect((await request(app).get("/x/summary?from=2026-01-01&to=2026-02-01")).body).toEqual({ message: "Period too long", code: "PERIOD_TOO_LONG" });
    expect((await request(app).get("/x/rows?tile=a&from=2026-01-01&to=2026-02-01")).status).toBe(400);
    expect((await request(app).get("/x/export?tile=a&from=2026-01-01&to=2026-02-01")).body.code).toBe("PERIOD_TOO_LONG");
    expect((await request(app).get("/x/summary?from=2026-01-01&to=2026-01-31")).status).toBe(200);
  });

  it("zonder maxDays is elke periode toegestaan", async () => {
    const app = appAs("admin", secretDef());
    expect((await request(app).get("/x/summary?from=2000-01-01&to=2050-12-31")).status).toBe(200);
  });

  it("redact: niet-admin krijgt secret null in rows en export, admin niet", async () => {
    const def = secretDef({ redact: (r, v) => (v.isAdmin ? r : { ...r, secret: null }) });
    expect((await request(appAs("user", def)).get("/x/rows?tile=a")).body.rows[0].secret).toBeNull();
    expect((await request(appAs("user", def)).get("/x/export?tile=a")).body.rows[0].secret).toBeNull();
    expect((await request(appAs("admin", def)).get("/x/rows?tile=a")).body.rows[0].secret).toBe(42);
    expect((await request(appAs("admin", def)).get("/x/export?tile=a")).body.rows[0].secret).toBe(42);
  });

  it("periodDays telt beide grenzen", () => {
    expect(periodDays({ from: "2024-01-01", to: "2024-12-31", vehicleId: null })).toBe(366);
    expect(periodDays({ from: "2026-03-05", to: "2026-03-05", vehicleId: null })).toBe(1);
  });
});
