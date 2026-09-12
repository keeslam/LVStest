/**
 * FIX-U — outbound requests and security headers.
 *
 *   BUG-071 — SSRF / port-scan oracle through the CJIB FTPS test route.
 *   BUG-077 — the same through the SMTP test route.
 *   BUG-078 — CSP allows unsafe-inline and unsafe-eval, in production too.
 *   BUG-087 — CSP header injection through the portal's allowedFrameOrigins.
 *   BUG-099 — no timeout on the outgoing geocoding/routing requests.
 *
 * (BUG-079, the response-body leak in the request logger, is covered by
 * `fix-c-leakage.test.ts` — it landed with the leakage cluster.)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import net from "net";
import http from "http";
import express from "express";
import request from "supertest";
import {
  assertPublicHost,
  isPrivateIp,
  isLocalHostname,
  OutboundBlockedError,
  OUTBOUND_BLOCKED_MESSAGE,
  allowsPrivateOutbound,
} from "../utils/security/outboundGuard";
import { buildCspDirectives, portalFrameHeaders } from "../middleware/security/headers";
import { isValidFrameOrigin, normalizeFrameOrigin } from "../../shared/frame-origins";
import { portalConfigSchema } from "../services/portal-config";
import { isAllowedCjibHost } from "../services/cjib/config";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";

let admin: TestAgent;

beforeAll(async () => {
  admin = await agentFor("admin");
});

afterAll(async () => {
  await cleanupFixtureUsers();
});

describe("BUG-071/BUG-077 — the private-range truth table", () => {
  const privateAddresses = [
    "127.0.0.1",
    "127.1.2.3",
    "0.0.0.0",
    "10.0.0.1",
    "172.16.5.4",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // CGNAT
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:10.1.2.3",
  ];

  const publicAddresses = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"];

  it.each(privateAddresses)("rejects %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(publicAddresses)("accepts %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });

  it.each(["localhost", "LOCALHOST", "db.internal", "printer.local", "app.localhost", "x.home.arpa"])(
    "refuses the local name %s without a DNS round trip",
    (name) => {
      expect(isLocalHostname(name)).toBe(true);
    },
  );

  it("does not treat a normal public name as local", () => {
    expect(isLocalHostname("smtp.gmail.com")).toBe(false);
    expect(isLocalHostname("cjib.nl")).toBe(false);
  });

  it("assertPublicHost throws OutboundBlockedError for a literal private address", async () => {
    for (const ip of ["127.0.0.1", "169.254.169.254", "10.0.0.1", "::1"]) {
      await expect(assertPublicHost(ip)).rejects.toBeInstanceOf(OutboundBlockedError);
    }
  });

  it("assertPublicHost throws for localhost and for a name that does not resolve", async () => {
    await expect(assertPublicHost("localhost")).rejects.toBeInstanceOf(OutboundBlockedError);
    await expect(assertPublicHost("no-such-host.invalid")).rejects.toBeInstanceOf(OutboundBlockedError);
  });

  it("every refusal carries the same message — nothing about what is there", async () => {
    const messages = new Set<string>();
    for (const host of ["127.0.0.1", "10.0.0.1", "localhost", "no-such-host.invalid", ""]) {
      await assertPublicHost(host).catch((e) => messages.add((e as Error).message));
    }
    expect(messages.size).toBe(1);
    expect([...messages][0]).toBe(OUTBOUND_BLOCKED_MESSAGE);
  });

  it("the private-range opt-out is off by default and can never be on in production", () => {
    expect(allowsPrivateOutbound()).toBe(false);
    const prevNode = process.env.NODE_ENV;
    const prevFlag = process.env.OUTBOUND_ALLOW_PRIVATE;
    try {
      process.env.OUTBOUND_ALLOW_PRIVATE = "true";
      process.env.NODE_ENV = "development";
      expect(allowsPrivateOutbound()).toBe(true);
      process.env.NODE_ENV = "production";
      expect(allowsPrivateOutbound()).toBe(false);
    } finally {
      process.env.NODE_ENV = prevNode;
      if (prevFlag === undefined) delete process.env.OUTBOUND_ALLOW_PRIVATE;
      else process.env.OUTBOUND_ALLOW_PRIVATE = prevFlag;
    }
  });
});

describe("BUG-071 — the CJIB test route is not a port scanner", () => {
  let openPort = 0;
  let listener: net.Server;

  beforeAll(async () => {
    listener = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
    openPort = (listener.address() as net.AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  });

  const post = (body: Record<string, unknown>) =>
    admin.post("/api/fines/cjib-config/test").send({
      enabled: true,
      username: "u",
      password: "p",
      inboxDir: "/",
      pollMinutes: 60,
      filePattern: ".",
      ...body,
    });

  it("refuses a loopback destination with a generic 400", async () => {
    const res = await post({ host: "127.0.0.1", port: 22 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ ok: false, message: OUTBOUND_BLOCKED_MESSAGE });
  });

  it("answers byte-identically for a closed port and an open one (no oracle)", async () => {
    const closed = await post({ host: "127.0.0.1", port: 9 });
    const open = await post({ host: "127.0.0.1", port: openPort });
    expect(closed.status).toBe(open.status);
    expect(JSON.stringify(closed.body)).toBe(JSON.stringify(open.body));
    expect(closed.status).toBe(400);
    // and it never leaked a directory listing
    expect(closed.body.files).toBeUndefined();
    expect(open.body.files).toBeUndefined();
  });

  it("refuses a public host that is not on the CJIB allowlist", async () => {
    const res = await post({ host: "example.com", port: 990 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(OUTBOUND_BLOCKED_MESSAGE);
  });

  it("the allowlist accepts the CJIB domain and its subdomains only", () => {
    expect(isAllowedCjibHost("cjib.nl")).toBe(true);
    expect(isAllowedCjibHost("ftps.cjib.nl")).toBe(true);
    expect(isAllowedCjibHost("CJIB.NL")).toBe(true);
    expect(isAllowedCjibHost("cjib.nl.evil.com")).toBe(false);
    expect(isAllowedCjibHost("notcjib.nl")).toBe(false);
    expect(isAllowedCjibHost("127.0.0.1")).toBe(false);
    expect(isAllowedCjibHost("")).toBe(false);
  });
});

describe("BUG-077 — the SMTP test route is not a port scanner", () => {
  let openPort = 0;
  let listener: net.Server;

  beforeAll(async () => {
    listener = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
    openPort = (listener.address() as net.AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  });

  const post = (host: string, port: number) =>
    admin.post("/api/app-settings/email/test").send({
      smtpHost: host,
      smtpPort: String(port),
      smtpUser: "u",
      smtpPassword: "p",
      smtpSecure: false,
    });

  it("refuses a private destination with a generic 400", async () => {
    for (const host of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "localhost"]) {
      const res = await post(host, 25);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, userMessage: OUTBOUND_BLOCKED_MESSAGE });
    }
  });

  it("answers byte-identically for a closed port and an open one", async () => {
    const closed = await post("127.0.0.1", 9);
    const open = await post("127.0.0.1", openPort);
    expect(closed.status).toBe(open.status);
    expect(JSON.stringify(closed.body)).toBe(JSON.stringify(open.body));
  });
});

describe("BUG-099 — the outgoing geocoding/routing calls have a deadline", () => {
  let hanging: http.Server;
  let url = "";

  beforeAll(async () => {
    // A server that accepts the connection and then says nothing at all —
    // exactly the failure mode that used to hold a request open indefinitely.
    hanging = http.createServer(() => {
      /* never responds */
    });
    await new Promise<void>((resolve) => hanging.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(hanging.address() as net.AddressInfo).port}/search`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => hanging.close(() => resolve()));
  });

  it("geocodeAddress gives up inside the timeout instead of hanging", async () => {
    const prevUrl = process.env.NOMINATIM_URL;
    const prevTimeout = process.env.GEOCODE_TIMEOUT_MS;
    process.env.NOMINATIM_URL = url;
    process.env.GEOCODE_TIMEOUT_MS = "400";
    try {
      const { geocodeAddress } = await import("../geocoding");
      const started = Date.now();
      const result = await geocodeAddress(`FIXT-timeout-${Date.now()}`);
      const elapsed = Date.now() - started;
      expect(result).toBeNull();
      // 400 ms deadline + the module's 1.1 s self-throttle; anything under the
      // vitest timeout proves the request was aborted rather than left open.
      expect(elapsed).toBeLessThan(5000);
    } finally {
      if (prevUrl === undefined) delete process.env.NOMINATIM_URL;
      else process.env.NOMINATIM_URL = prevUrl;
      if (prevTimeout === undefined) delete process.env.GEOCODE_TIMEOUT_MS;
      else process.env.GEOCODE_TIMEOUT_MS = prevTimeout;
    }
  });

  it("getRoadRouteDistances gives up inside the timeout too", async () => {
    const prevUrl = process.env.OSRM_ROUTE_URL;
    const prevTimeout = process.env.ROUTE_TIMEOUT_MS;
    process.env.OSRM_ROUTE_URL = url;
    process.env.ROUTE_TIMEOUT_MS = "400";
    try {
      const { getRoadRouteDistances } = await import("../geocoding");
      const started = Date.now();
      const result = await getRoadRouteDistances([
        { lat: 52.1, lon: 5.1 },
        { lat: 52.2, lon: 5.2 },
      ]);
      expect(result).toBeNull();
      expect(Date.now() - started).toBeLessThan(4000);
    } finally {
      if (prevUrl === undefined) delete process.env.OSRM_ROUTE_URL;
      else process.env.OSRM_ROUTE_URL = prevUrl;
      if (prevTimeout === undefined) delete process.env.ROUTE_TIMEOUT_MS;
      else process.env.ROUTE_TIMEOUT_MS = prevTimeout;
    }
  });

  it("refuses to hand an unbounded list of stops to the public routing service", async () => {
    const { getRoadRouteDistances } = await import("../geocoding");
    const tooMany = Array.from({ length: 40 }, (_, i) => ({ lat: 52 + i / 100, lon: 5 + i / 100 }));
    await expect(getRoadRouteDistances(tooMany)).resolves.toBeNull();
  });
});

describe("BUG-078 — the production CSP", () => {
  const flatten = (directives: Record<string, string[] | null>) =>
    Object.entries(directives)
      .map(([k, v]) => `${k} ${(v ?? []).join(" ")}`)
      .join("; ");

  it("script-src carries neither unsafe-inline nor unsafe-eval in production", () => {
    const scriptSrc = buildCspDirectives(true).scriptSrc ?? [];
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).toEqual(["'self'"]);
  });

  it("unsafe-eval appears nowhere in the production policy", () => {
    expect(flatten(buildCspDirectives(true))).not.toContain("unsafe-eval");
  });

  it("development keeps the two tokens Vite needs", () => {
    const scriptSrc = buildCspDirectives(false).scriptSrc ?? [];
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'unsafe-eval'");
  });

  it("drops the unused CDN, the blanket https: image source and the plaintext websocket", () => {
    const prod = buildCspDirectives(true);
    expect(flatten(prod)).not.toContain("jsdelivr");
    expect(prod.imgSrc).toEqual(["'self'", "data:", "blob:"]);
    expect(prod.connectSrc).not.toContain("ws:");
    expect(buildCspDirectives(false).connectSrc).toContain("ws:");
  });

  it("helmet still emits a usable policy with the new directive set", async () => {
    // The in-process harness builds the app without server/index.ts, which is
    // where securityHeaders is mounted — so the middleware is exercised
    // directly rather than through a route.
    const { securityHeaders } = await import("../middleware/security/headers");
    const app = express();
    app.use(securityHeaders);
    app.get("/probe", (_req, res) => res.json({ ok: true }));
    const res = await request(app).get("/probe");
    const csp = String(res.headers["content-security-policy"] ?? "");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("jsdelivr");
    expect(csp).toContain("img-src 'self' data: blob:");
  });
});

describe("BUG-087 — allowedFrameOrigins cannot inject a CSP directive", () => {
  const rejected = [
    "https://a.example; script-src *",
    "https://a.example/; script-src *",
    "https://a.example/path",
    "https://a.example/?x=1",
    "https://a.example#frag",
    "https://user:pw@a.example",
    "javascript:alert(1)",
    "data:text/html,<script>1</script>",
    "*",
    "https://*.example.com",
    "'self' https://evil.example",
    "",
    "   ",
  ];

  it.each(rejected)("refuses %j", (value) => {
    expect(isValidFrameOrigin(value)).toBe(false);
  });

  it.each(["https://lamgroep.nl", "http://lamgroep.local", "https://portaal.lamgroep.nl:8443"])(
    "accepts the bare origin %s",
    (value) => {
      expect(isValidFrameOrigin(value)).toBe(true);
      expect(normalizeFrameOrigin(value)).toBe(value);
    },
  );

  it("the portal config schema refuses an injecting origin at save time", () => {
    const bad = portalConfigSchema.safeParse({ allowedFrameOrigins: ["https://a.example/; script-src *"] });
    expect(bad.success).toBe(false);
    const good = portalConfigSchema.safeParse({ allowedFrameOrigins: ["https://lamgroep.nl/"] });
    expect(good.success).toBe(true);
    // stored canonically, without the trailing slash that would break the directive
    expect(good.success && good.data.allowedFrameOrigins).toEqual(["https://lamgroep.nl"]);
  });

  it("the header builder's filter keeps the good origin and drops the poisoned one", () => {
    const configured = ["https://ok.example", "https://evil.example/; script-src *", "*"];
    expect(configured.filter(isValidFrameOrigin)).toEqual(["https://ok.example"]);
  });

  it("a poisoned row written by another path is still dropped from the header", async () => {
    // portalFrameHeaders re-checks, so a portal_config row written through
    // POST /api/app-settings (which does not go through portalConfigSchema)
    // cannot rewrite the policy either.
    const { clearPortalConfigCache } = await import("../services/portal-config");
    const { storage } = await import("../storage");
    const { PORTAL_CONFIG_KEY } = await import("../../shared/portal-types");

    const existing = await storage.getAppSettingByKey(PORTAL_CONFIG_KEY);
    const previous = existing?.value ?? null;
    try {
      const poisoned = {
        allowedFrameOrigins: ["https://ok.example", "https://evil.example/; script-src *"],
        notificationEmail: "",
        portalBaseUrl: "",
        fineAdminFee: 0,
        pickupAddress: "",
        openingHours: "",
        pickupInstructions: "",
        privacyUrl: "",
        phone: "",
      };
      if (existing) await storage.updateAppSetting(existing.id, { value: poisoned, updatedBy: "FIXT" });
      else
        await storage.createAppSetting({
          key: PORTAL_CONFIG_KEY,
          value: poisoned,
          category: "portal",
          description: "FIXT",
          createdBy: "FIXT",
          updatedBy: "FIXT",
        });
      clearPortalConfigCache();

      const headers: Record<string, string> = { "content-security-policy": "default-src 'self'; frame-ancestors 'self'" };
      const res: any = {
        getHeader: (name: string) => headers[name.toLowerCase()],
        setHeader: (name: string, value: string) => {
          headers[name.toLowerCase()] = value;
        },
        removeHeader: (name: string) => {
          delete headers[name.toLowerCase()];
        },
      };
      await new Promise<void>((resolve) => {
        void portalFrameHeaders({ path: "/api/portal/reservations" } as any, res, resolve as any);
      });

      const csp = headers["content-security-policy"];
      // Two independent locks hold here: the schema refuses to parse the
      // poisoned array (so getPortalConfig falls back to the defaults), and
      // portalFrameHeaders filters whatever it is handed. Either way the
      // attacker's directive never reaches the header.
      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp).not.toContain("script-src *");
      expect(csp).not.toContain("evil.example");
    } finally {
      const row = await storage.getAppSettingByKey(PORTAL_CONFIG_KEY);
      if (row && previous !== null) await storage.updateAppSetting(row.id, { value: previous, updatedBy: "FIXT" });
      else if (row) await storage.updateAppSetting(row.id, { value: {}, updatedBy: "FIXT" });
      clearPortalConfigCache();
    }
  });

  it("X-Frame-Options survives when there is no allowed cross-origin parent", async () => {
    const { clearPortalConfigCache } = await import("../services/portal-config");
    const { storage } = await import("../storage");
    const { PORTAL_CONFIG_KEY } = await import("../../shared/portal-types");
    const existing = await storage.getAppSettingByKey(PORTAL_CONFIG_KEY);
    const previous = existing?.value ?? null;
    try {
      if (existing) await storage.updateAppSetting(existing.id, { value: { allowedFrameOrigins: [] }, updatedBy: "FIXT" });
      clearPortalConfigCache();
      const headers: Record<string, string> = {
        "content-security-policy": "default-src 'self'; frame-ancestors 'self'",
        "x-frame-options": "SAMEORIGIN",
      };
      const res: any = {
        getHeader: (n: string) => headers[n.toLowerCase()],
        setHeader: (n: string, v: string) => {
          headers[n.toLowerCase()] = v;
        },
        removeHeader: (n: string) => {
          delete headers[n.toLowerCase()];
        },
      };
      await new Promise<void>((resolve) => {
        void portalFrameHeaders({ path: "/api/portal/reservations" } as any, res, resolve as any);
      });
      expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
      expect(headers["content-security-policy"]).toContain("frame-ancestors 'self'");
    } finally {
      const row = await storage.getAppSettingByKey(PORTAL_CONFIG_KEY);
      if (row && previous !== null) await storage.updateAppSetting(row.id, { value: previous, updatedBy: "FIXT" });
      clearPortalConfigCache();
    }
  });
});
