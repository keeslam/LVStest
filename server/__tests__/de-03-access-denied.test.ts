/**
 * D14 (besluit B-41, spec section 10): refused attempts are recorded so an
 * administrator can be told, at the next login, who tried what they may not do.
 *
 * - hasPermissionMiddleware writes an `access.denied` audit row (status
 *   failure, details method/path/required) for every 403 it answers, at most
 *   once per user and path per 5 minutes;
 * - POST /api/access-denied is what the no-access page calls ({ page });
 * - GET /api/access-denied?since= lists the rows (MANAGE_USERS);
 * - users.last_login_at is set at login and the previous value comes back as
 *   `previousLoginAt` (login answer, and GET /api/user for the session).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, users, UserPermission } from "../../shared/schema";
import { ACCESS_DENIED_USER_CAP, recordAccessDenied } from "../middleware/permissions";
import { agentFor, anonAgent, cleanupFixtureUsers, type TestAgent } from "./helpers/app";

const deniedRows = (userId: number) =>
  db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.userId, userId), eq(auditLogs.action, "access.denied")))
    .orderBy(auditLogs.id);

describe("D14 - hasPermissionMiddleware records refused attempts", () => {
  let admin: TestAgent;
  beforeAll(async () => {
    admin = await agentFor("admin");
  }, 90_000);
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  it("a 403 writes one access.denied row with method, path and required rights", async () => {
    const user = await agentFor([]);
    const res = await user.get("/api/vehicles");
    expect(res.status).toBe(403);

    const rows = await deniedRows(user.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("failure");
    expect(rows[0].username).toBe(user.username);
    const details = rows[0].details as any;
    expect(details.method).toBe("GET");
    expect(details.path).toBe("/api/vehicles");
    expect(details.required).toEqual([UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES]);
  });

  it("the same user and path again within 5 minutes writes nothing more; another path does", async () => {
    const user = await agentFor([]);
    await user.get("/api/vehicles");
    await user.get("/api/vehicles");
    expect(await deniedRows(user.userId)).toHaveLength(1);

    await user.get("/api/customers");
    const rows = await deniedRows(user.userId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => (r.details as any).path).sort()).toEqual(["/api/customers", "/api/vehicles"]);
  });

  it("after 5 minutes the same attempt is recorded again", async () => {
    const user = await agentFor([]);
    await user.get("/api/vehicles");
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 5 * 60 * 1000 + 1000);
    await user.get("/api/vehicles");
    expect(await deniedRows(user.userId)).toHaveLength(2);
  });

  it("two users refused on the same path each get their own row", async () => {
    const a = await agentFor([]);
    const b = await agentFor([]);
    await a.get("/api/vehicles");
    await b.get("/api/vehicles");
    expect(await deniedRows(a.userId)).toHaveLength(1);
    expect(await deniedRows(b.userId)).toHaveLength(1);
  });

  it("an allowed request and an admin write nothing", async () => {
    const allowed = await agentFor([UserPermission.VIEW_VEHICLES]);
    expect((await allowed.get("/api/vehicles")).status).toBe(200);
    expect(await deniedRows(allowed.userId)).toHaveLength(0);
    expect((await admin.get("/api/vehicles")).status).toBe(200);
    expect(await deniedRows(admin.userId)).toHaveLength(0);
  });

  it("a refused write (POST) is recorded with its method", async () => {
    const user = await agentFor([]);
    const res = await user.post("/api/vehicles").send({});
    expect(res.status).toBe(403);
    const rows = await deniedRows(user.userId);
    expect(rows).toHaveLength(1);
    expect((rows[0].details as any).method).toBe("POST");
  });
});

describe("D14 - the dedupe is per route pattern, with a cap per user (fix round 1)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  it("/api/customers/1 and /api/customers/2 are one refusal, and the first concrete path is kept", async () => {
    const user = await agentFor([]);
    expect((await user.get("/api/customers/1")).status).toBe(403);
    expect((await user.get("/api/customers/2")).status).toBe(403);
    expect((await user.get("/api/customers/3")).status).toBe(403);
    const rows = await deniedRows(user.userId);
    expect(rows).toHaveLength(1);
    expect((rows[0].details as any).path).toBe("/api/customers/1");
  });

  it("different methods or different patterns are still separate rows", async () => {
    const user = await agentFor([]);
    await user.get("/api/customers/1");
    await user.get("/api/customers");
    await user.get("/api/vehicles/7");
    expect(await deniedRows(user.userId)).toHaveLength(3);
  });

  it("the no-access page: /reservations/edit/1, /2 and a case variant are one row", async () => {
    const user = await agentFor([]);
    await user.post("/api/access-denied").send({ page: "/reservations/edit/1" });
    await user.post("/api/access-denied").send({ page: "/reservations/edit/2" });
    await user.post("/api/access-denied").send({ page: "/Reservations/Edit/3" });
    const rows = await deniedRows(user.userId);
    expect(rows).toHaveLength(1);
    expect((rows[0].details as any).page).toBe("/reservations/edit/1");
  });

  it("a user writes at most ACCESS_DENIED_USER_CAP rows per window, then one summary row, then nothing", async () => {
    const user = await agentFor([]);
    const attempt = (i: number) =>
      recordAccessDenied({
        userId: user.userId,
        username: user.username,
        method: "GET",
        path: `/api/probe-${i}`,
        required: ["view_vehicles"],
      });
    for (let i = 0; i < ACCESS_DENIED_USER_CAP + 10; i += 1) await attempt(i);

    const rows = await deniedRows(user.userId);
    expect(rows).toHaveLength(ACCESS_DENIED_USER_CAP + 1);
    const summaries = rows.filter((r) => (r.details as any).summary === true);
    expect(summaries).toHaveLength(1);
    expect(rows[rows.length - 1].id).toBe(summaries[0].id);

    // The window passes: the user is recorded again.
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 16 * 60 * 1000);
    expect(await attempt(9999)).toBe(true);
    expect(await deniedRows(user.userId)).toHaveLength(ACCESS_DENIED_USER_CAP + 2);
  });

  it("a failing audit insert still answers 403, and the next attempt is recorded (no dedupe entry for a failed write)", async () => {
    const user = await agentFor([]);
    const spy = vi.spyOn(db, "insert").mockImplementation(() => {
      throw new Error("audit table unavailable");
    });
    const refused = await user.get("/api/vehicles");
    spy.mockRestore();
    expect(refused.status).toBe(403);
    expect(await deniedRows(user.userId)).toHaveLength(0);

    expect((await user.get("/api/vehicles")).status).toBe(403);
    expect(await deniedRows(user.userId)).toHaveLength(1);
  });

  it("the row never holds body content or the query string", async () => {
    const user = await agentFor([]);
    await user.post("/api/vehicles?token=QUERYSECRET").send({ licensePlate: "BODYSECRET-123", notes: "BODYSECRET-456" });
    const rows = await deniedRows(user.userId);
    expect(rows).toHaveLength(1);
    const text = JSON.stringify(rows[0]);
    expect(text).not.toContain("BODYSECRET");
    expect(text).not.toContain("QUERYSECRET");
    expect(Object.keys(rows[0].details as object).sort()).toEqual(["method", "path", "required"]);
  });
});

describe("D14 - POST /api/access-denied (the no-access page)", () => {
  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  it("records the page the user was refused, with the rights that page needs", async () => {
    const user = await agentFor([]);
    const res = await user.post("/api/access-denied").send({ page: "/maintenance" });
    expect(res.status).toBe(200);
    const rows = await deniedRows(user.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("failure");
    expect(rows[0].details).toMatchObject({
      method: "GET",
      path: "/maintenance",
      page: "/maintenance",
      required: [UserPermission.MANAGE_MAINTENANCE],
    });
  });

  it("is deduped per user and page within 5 minutes", async () => {
    const user = await agentFor([]);
    await user.post("/api/access-denied").send({ page: "/expenses" });
    const again = await user.post("/api/access-denied").send({ page: "/expenses" });
    expect(again.status).toBe(200);
    expect(await deniedRows(user.userId)).toHaveLength(1);
    await user.post("/api/access-denied").send({ page: "/documents" });
    expect(await deniedRows(user.userId)).toHaveLength(2);
  });

  it.each([
    ["no page", {}],
    ["a number", { page: 5 }],
    ["not an address", { page: "maintenance" }],
    ["too long", { page: "/" + "x".repeat(300) }],
  ])("refuses %s with 400", async (_label, body) => {
    const user = await agentFor([]);
    const res = await user.post("/api/access-denied").send(body);
    expect(res.status).toBe(400);
    expect(await deniedRows(user.userId)).toHaveLength(0);
  });

  it("needs a session", async () => {
    const anon = await anonAgent();
    const res = await anon.post("/api/access-denied").send({ page: "/maintenance" });
    expect(res.status).toBe(401);
  });
});

describe("D14 - GET /api/access-denied?since=", () => {
  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  it("lists the refused attempts after `since`, newest first, with who/what/when, for manage_users", async () => {
    const manager = await agentFor([UserPermission.MANAGE_USERS]);
    const colleague = await agentFor([]);
    const since = new Date(Date.now() - 1000).toISOString();
    await colleague.get("/api/vehicles");
    await colleague.post("/api/access-denied").send({ page: "/expenses" });

    const res = await manager.get(`/api/access-denied?since=${encodeURIComponent(since)}`);
    expect(res.status).toBe(200);
    const mine = (res.body.entries as any[]).filter((e) => e.username === colleague.username);
    expect(mine).toHaveLength(2);
    expect(mine[0]).toMatchObject({ method: "GET" });
    expect(typeof mine[0].createdAt).toBe("string");
    expect(mine.map((e) => e.path).sort()).toEqual(["/api/vehicles", "/expenses"]);
    expect(res.body.users).toBeGreaterThanOrEqual(1);
    expect(res.body.count).toBeGreaterThanOrEqual(2);
    // Newest first.
    const times = (res.body.entries as any[]).map((e) => new Date(e.createdAt).getTime());
    expect([...times].sort((x, y) => y - x)).toEqual(times);
  });

  it("only counts rows after `since`", async () => {
    const manager = await agentFor([UserPermission.MANAGE_USERS]);
    const colleague = await agentFor([]);
    await colleague.get("/api/vehicles");
    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await manager.get(`/api/access-denied?since=${encodeURIComponent(future)}`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
    expect(res.body.count).toBe(0);
    expect(res.body.users).toBe(0);
  });

  it("an invalid or missing `since` is a 400", async () => {
    const manager = await agentFor([UserPermission.MANAGE_USERS]);
    expect((await manager.get("/api/access-denied?since=gisteren")).status).toBe(400);
    expect((await manager.get("/api/access-denied")).status).toBe(400);
  });

  it("is refused without manage_users", async () => {
    const user = await agentFor([UserPermission.VIEW_VEHICLES]);
    const res = await user.get(`/api/access-denied?since=${encodeURIComponent(new Date().toISOString())}`);
    expect(res.status).toBe(403);
  });
});

describe("D14 - last login", () => {
  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  const lastLoginOf = async (id: number) =>
    (await db.select({ at: users.lastLoginAt }).from(users).where(eq(users.id, id)))[0].at;

  it("the first login has no previousLoginAt and sets last_login_at", async () => {
    const before = Date.now();
    const user = await agentFor([]); // agentFor() logs in once
    const at = await lastLoginOf(user.userId);
    expect(at).not.toBeNull();
    expect(at!.getTime()).toBeGreaterThanOrEqual(before - 2000);

    const me = await user.get("/api/user");
    expect(me.status).toBe(200);
    expect(me.body.previousLoginAt ?? null).toBeNull();
  });

  it("the next login returns the previous value, and the session keeps it for GET /api/user", async () => {
    const user = await agentFor([]);
    const first = await lastLoginOf(user.userId);

    await new Promise((resolve) => setTimeout(resolve, 20)); // the second login must be strictly later
    const anon = await anonAgent();
    const login = await anon.post("/api/login").send({ username: user.username, password: user.password });
    expect(login.status).toBe(200);
    expect(new Date(login.body.previousLoginAt).getTime()).toBe(first!.getTime());
    expect(login.body.password).toBeUndefined();

    const me = await anon.get("/api/user");
    expect(new Date(me.body.previousLoginAt).getTime()).toBe(first!.getTime());

    const second = await lastLoginOf(user.userId);
    expect(second!.getTime()).toBeGreaterThan(first!.getTime());
  });
});
