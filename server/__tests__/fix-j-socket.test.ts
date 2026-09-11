/**
 * FIX-J — Socket.IO handshake and /health (BUG-005, BUG-093).
 *
 * BUG-005 was reproduced during the audit with a cookie-less socket that
 * received `data-update` events carrying whole vehicle records (license plate,
 * chassis number, mileage). Socket.IO needs a real HTTP server, so this file
 * drives the child server from helpers/childServer.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioClient, type Socket } from "socket.io-client";

import { db } from "../db";
import { users, vehicles } from "../../shared/schema";
import { hashPassword } from "../auth";
import { startChildServer, rawRequest, get, collectCookies, type ChildServer } from "./helpers/childServer";
import { cleanupFixtureUsers } from "./helpers/app";
import { cleanupFixtures, FIXTURE_PLATE_PREFIX } from "./helpers/fixtures";

let server: ChildServer;
const username = `FIXT-user-socket-${Date.now().toString(36)}`;
const password = "fixture-password-1";
let cookies = "";
let csrf = "";

function connect(headers: Record<string, string>): Promise<{ socket: Socket; error?: Error }> {
  return new Promise((resolve) => {
    const socket = ioClient(`http://127.0.0.1:${server.port}`, {
      transports: ["websocket"],
      extraHeaders: headers,
      reconnection: false,
      timeout: 8000,
    });
    socket.on("connect", () => resolve({ socket }));
    socket.on("connect_error", (error) => resolve({ socket, error: error as Error }));
  });
}

describe("FIX-J — Socket.IO and /health", () => {
  beforeAll(async () => {
    await db.insert(users).values({
      username,
      password: await hashPassword(password),
      role: "admin",
      permissions: [],
      active: true,
    });
    server = await startChildServer();

    const loginBody = JSON.stringify({ username, password });
    const login = await rawRequest(server.port, "POST", "/api/login", {
      body: loginBody,
      headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(loginBody)) },
    });
    expect(login.status).toBe(200);
    cookies = collectCookies("", login);
    const probe = await rawRequest(server.port, "GET", "/api/user", { headers: { cookie: cookies } });
    cookies = collectCookies(cookies, probe);
    csrf = /XSRF-TOKEN=([^;]+)/.exec(cookies)?.[1] ?? "";
    expect(csrf).toBeTruthy();
  }, 180_000);

  afterAll(async () => {
    if (server) await server.stop();
    await cleanupFixtures();
    await cleanupFixtureUsers();
  }, 30_000);

  it("BUG-005: a socket without a session cookie is refused", async () => {
    const { socket, error } = await connect({});
    socket.close();
    expect(error).toBeTruthy();
    expect(String(error?.message)).toMatch(/unauthorized/i);
  }, 30_000);

  it("BUG-005: an authenticated socket receives only the id, never the record", async () => {
    const { socket, error } = await connect({ cookie: cookies });
    expect(error).toBeUndefined();
    try {
      const received = new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no data-update within 15s")), 15_000);
        socket.on("data-update", (event: any) => {
          if (event?.entityType !== "vehicles") return;
          clearTimeout(timer);
          resolve(event);
        });
      });

      const plate = `${FIXTURE_PLATE_PREFIX}-SOCK-${Date.now().toString(36)}`.slice(0, 20);
      const body = JSON.stringify({ licensePlate: plate, brand: "FIXT-Brand", model: "Model", chassisNumber: "FIXTCHASSIS123" });
      const created = await rawRequest(server.port, "POST", "/api/vehicles", {
        body,
        headers: {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
          cookie: cookies,
          "x-csrf-token": csrf,
        },
      });
      expect(created.status).toBe(201);

      const event = await received;
      expect(event.action).toBe("created");
      expect(event.data?.id).toBeTypeOf("number");
      const payload = JSON.stringify(event.data);
      expect(payload).not.toContain(plate);
      expect(payload).not.toContain("FIXTCHASSIS123");
      expect(payload).not.toContain("licensePlate");
    } finally {
      socket.close();
    }
  }, 45_000);

  it("BUG-093: /health is sober — no envVars, no userCount", async () => {
    const res = await get(server.port, "/health");
    expect(res.status).toBe(200);
    const body = res.json();
    expect(body.status).toBe("OK");
    expect(body.envVars).toBeUndefined();
    expect(body.database?.userCount).toBeUndefined();
    expect(res.body).not.toContain("SESSION_SECRET");
    expect(res.body).not.toContain("userCount");
  }, 30_000);
});
