import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../services/portal-config", () => ({
  getPortalConfig: async () => ({ allowedFrameOrigins: ["https://lamgroep.nl", "http://lamgroep.local"], notificationEmail: "", portalBaseUrl: "" }),
}));

import { securityHeaders, customSecurityHeaders, portalFrameHeaders } from "../middleware/security/headers";

const app = express();
app.use(securityHeaders);
app.use(customSecurityHeaders);
app.use(portalFrameHeaders);
app.get("*", (_req, res) => res.send("ok"));

describe("portalFrameHeaders", () => {
  it("allows the configured parents on portal paths", async () => {
    const res = await request(app).get("/portaal/login");
    expect(res.headers["x-frame-options"]).toBeUndefined();
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'self' https://lamgroep.nl http://lamgroep.local");
  });
  it("keeps SAMEORIGIN everywhere else", async () => {
    const res = await request(app).get("/vehicles");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["content-security-policy"]).not.toContain("https://lamgroep.nl");
  });
});
