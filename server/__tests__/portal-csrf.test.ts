import { describe, it, expect } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import { createCsrfMiddleware, attachCsrfToken, csrfProtection } from "../middleware/security/csrf";

function appWith(attach: any, protect: any) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "t", resave: false, saveUninitialized: true }));
  app.use(attach);
  app.use(protect);
  app.get("/api/portal/csrf-token", (_req, res) => res.json({ token: res.locals.csrfToken }));
  app.post("/api/portal/login", (_req, res) => res.json({ ok: true }));
  app.post("/api/portal/thing", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("createCsrfMiddleware", () => {
  const mw = createCsrfMiddleware({ cookieName: "PORTAL-XSRF-TOKEN", sameSite: "lax", exemptPaths: ["/api/portal/login"] });
  const app = appWith(mw.attachCsrfToken, mw.csrfProtection);

  it("sets its own cookie name with SameSite=Lax", async () => {
    const res = await request(app).get("/api/portal/csrf-token");
    const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("PORTAL-XSRF-TOKEN="));
    expect(cookie).toContain("SameSite=Lax");
  });

  it("lets exempt paths through and blocks the rest without a token", async () => {
    expect((await request(app).post("/api/portal/login")).status).toBe(200);
    expect((await request(app).post("/api/portal/thing")).status).toBe(403);
  });

  it("accepts the token it issued", async () => {
    const agent = request.agent(app);
    const first = await agent.get("/api/portal/csrf-token");
    const res = await agent.post("/api/portal/thing").set("X-CSRF-Token", first.body.token);
    expect(res.status).toBe(200);
  });
});

describe("default staff exports", () => {
  it("still use XSRF-TOKEN strict", async () => {
    const app = appWith(attachCsrfToken, csrfProtection);
    const res = await request(app).get("/api/portal/csrf-token");
    const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("XSRF-TOKEN="));
    expect(cookie).toContain("SameSite=Strict");
  });
});
