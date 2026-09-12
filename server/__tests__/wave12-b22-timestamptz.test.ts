/**
 * B-22 / BUG-224 — a document made at 21:18 has to read 21:18.
 *
 * The mechanism, measured in phase 36: every one of the 101 timestamp columns
 * was `timestamp without time zone`. Almost all of them are filled by the
 * column default `now()`, which Postgres evaluates in the **session's** time
 * zone — Europe/Amsterdam for this office. So 21:18:26 Dutch time was stored
 * as the bare wall clock `21:18:26`. Drizzle then reads a tz-less column with
 * `new Date(value + "+0000")`, i.e. it calls that wall clock UTC, the API
 * answers `…T21:18:26Z`, and the screen renders it back in Amsterdam as
 * **23:18:26** — the +120 minutes from the bug report.
 *
 * These tests pin the session zone to Europe/Amsterdam themselves rather than
 * trusting whatever the database server happens to be configured with, so the
 * result does not depend on the machine, and they never assert a literal
 * clock time, so it does not depend on the day or on summer/winter time
 * either. Both offsets (+01:00 and +02:00) are non-zero, which is all the
 * assertion needs.
 */
import { describe, it, expect, afterAll } from "vitest";
import { sql, eq, like } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, customNotifications, documents } from "../../shared/schema";

const OFFICE_ZONE = "Europe/Amsterdam";
/** Generous enough for a slow round trip, far below the 60-minute error. */
const TOLERANCE_MS = 60_000;

/** The wall clock the office reads, for a given instant. */
function wallClockInAmsterdam(instant: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: OFFICE_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(instant);
}

const MARKER = `B22-${Date.now().toString(36)}`;

afterAll(async () => {
  await db.delete(documents).where(like(documents.fileName, "B22-%"));
  await db.delete(auditLogs).where(like(auditLogs.action, "b22.%"));
  await db.delete(customNotifications).where(like(customNotifications.title, "B22-%"));
});

describe("B-22 — the columns carry a time zone", () => {
  it("no table still has a timestamp without one", async () => {
    const rows = await db.execute(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type = 'timestamp without time zone'
      ORDER BY table_name, column_name
    `);
    const stragglers = rows.rows.map((r: any) => `${r.table_name}.${r.column_name}`);
    expect(stragglers, `columns still without a time zone:\n${stragglers.join("\n")}`).toEqual([]);
  });

  it("the ones that matter for BUG-224 are timestamptz", async () => {
    const rows = await db.execute(sql`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (
          ('documents', 'upload_date'),
          ('audit_logs', 'created_at'),
          ('custom_notifications', 'created_at'),
          ('portal_notifications', 'created_at')
        )
    `);
    expect(rows.rows.length).toBe(4);
    for (const row of rows.rows as any[]) {
      expect(row.data_type, `${row.table_name}.${row.column_name}`).toBe("timestamp with time zone");
    }
  });
});

describe("B-22 / BUG-224 — a row written at the office clock reads back at the office clock", () => {
  /**
   * Writes one row with the column default (`now()`) while the session is on
   * Amsterdam time — the production situation — and hands back the instant the
   * database recorded together with the instant that really passed.
   */
  async function defaultNowRoundTrip(
    insert: (tx: any) => Promise<Date>,
  ): Promise<{ stored: Date; before: Date; after: Date; dbWallClock: string }> {
    return db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL TIME ZONE '${OFFICE_ZONE}'`));
      const before = new Date();
      const stored = await insert(tx);
      const after = new Date();
      const [{ wall }] = (await tx.execute(sql`SELECT to_char(now(), 'HH24:MI:SS') AS wall`))
        .rows as any[];
      return { stored, before, after, dbWallClock: wall };
    });
  }

  it("a document keeps the moment it was made (BUG-224)", async () => {
    const { stored, before, after, dbWallClock } = await defaultNowRoundTrip(async (tx) => {
      const [row] = await tx
        .insert(documents)
        .values({
          documentType: "contract",
          fileName: `B22-${MARKER}.pdf`,
          filePath: `/tmp/B22-${MARKER}.pdf`,
          fileSize: 1,
          contentType: "application/pdf",
        })
        .returning();
      return row.uploadDate as Date;
    });

    expect(stored.getTime()).toBeGreaterThanOrEqual(before.getTime() - TOLERANCE_MS);
    expect(stored.getTime()).toBeLessThanOrEqual(after.getTime() + TOLERANCE_MS);
    // And the literal claim from the bug report: the clock the office read
    // when the document was made is the clock the office reads back.
    expect(wallClockInAmsterdam(stored).slice(0, 5)).toBe(dbWallClock.slice(0, 5));
  });

  it("the audit trail keeps the moment it happened", async () => {
    const { stored, before, after, dbWallClock } = await defaultNowRoundTrip(async (tx) => {
      const [row] = await tx
        .insert(auditLogs)
        .values({ action: `b22.${MARKER}`, status: "success" })
        .returning();
      return row.createdAt as Date;
    });

    expect(stored.getTime()).toBeGreaterThanOrEqual(before.getTime() - TOLERANCE_MS);
    expect(stored.getTime()).toBeLessThanOrEqual(after.getTime() + TOLERANCE_MS);
    expect(wallClockInAmsterdam(stored).slice(0, 5)).toBe(dbWallClock.slice(0, 5));
  });

  it("a notification keeps the moment it was raised", async () => {
    const { stored, before, after, dbWallClock } = await defaultNowRoundTrip(async (tx) => {
      const [row] = await tx
        .insert(customNotifications)
        .values({
          title: `B22-${MARKER}`,
          description: "B-22 regression",
          date: new Date().toISOString().slice(0, 10),
        })
        .returning();
      return row.createdAt as Date;
    });

    expect(stored.getTime()).toBeGreaterThanOrEqual(before.getTime() - TOLERANCE_MS);
    expect(stored.getTime()).toBeLessThanOrEqual(after.getTime() + TOLERANCE_MS);
    expect(wallClockInAmsterdam(stored).slice(0, 5)).toBe(dbWallClock.slice(0, 5));
  });

  it("an instant written by the application survives the round trip unchanged", async () => {
    const instant = new Date("2026-06-15T19:18:26.000Z"); // 21:18:26 in Amsterdam
    const [row] = await db
      .insert(documents)
      .values({
        documentType: "contract",
        fileName: `B22-${MARKER}-explicit.pdf`,
        filePath: `/tmp/B22-${MARKER}-explicit.pdf`,
        fileSize: 1,
        contentType: "application/pdf",
        uploadDate: instant,
      })
      .returning();
    const [readBack] = await db.select().from(documents).where(eq(documents.id, row.id));
    expect(readBack.uploadDate.toISOString()).toBe(instant.toISOString());
    expect(wallClockInAmsterdam(readBack.uploadDate)).toBe("21:18:26");
  });
});
