/**
 * WAVE 11 — besluit **B-19** (BUG-214): HTTP compression is on in the
 * application itself.
 *
 * Phase 36: no middleware, no dependency, no `content-encoding` on any
 * response. `GET /api/vehicles` went out at 8 MB uncompressed; the same body
 * gzipped is 27–28 times smaller. The decision says: switch it on in the
 * application, not "hope the proxy does it", and skip the work when the proxy
 * already compressed.
 */
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import zlib from "zlib";
import { createRequire } from "module";

import { mountCompression, shouldCompressResponse } from "../middleware/compression";

function appWith(): express.Express {
  const app = express();
  mountCompression(app);
  app.get("/big", (_req, res) => {
    // ~200 kB of repetitive JSON — a small vehicle list, in other words.
    const rows = Array.from({ length: 2000 }, (_, i) => ({
      id: i,
      licensePlate: `AA-11-B${i % 10}`,
      brand: "Volkswagen",
      model: "Transporter",
      remarks: "Niets bijzonders aan dit voertuig, maar wel veel tekst.",
    }));
    res.json(rows);
  });
  app.get("/small", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/already-compressed", (_req, res) => {
    const body = zlib.gzipSync(Buffer.from(JSON.stringify({ hello: "x".repeat(50_000) })));
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Content-Type", "application/json");
    res.end(body);
  });
  return app;
}

describe("B-19 — HTTP compression", () => {
  it("compresses a large JSON response", async () => {
    const res = await request(appWith()).get("/big").set("Accept-Encoding", "gzip");
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
    // supertest inflates for us, so the body is still the real list.
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2000);
  });

  it("leaves a small response alone — it is not worth compressing", async () => {
    const res = await request(appWith()).get("/small").set("Accept-Encoding", "gzip");
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.body).toEqual({ ok: true });
  });

  it("does not compress when the client did not ask", async () => {
    const res = await request(appWith()).get("/big").set("Accept-Encoding", "identity");
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
  });

  it("skips a response an upstream proxy already compressed", async () => {
    const res = await request(appWith()).get("/already-compressed").set("Accept-Encoding", "gzip");
    expect(res.status).toBe(200);
    // Exactly one layer of gzip: supertest inflates it and finds JSON, not
    // another gzip stream.
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(JSON.parse(res.text).hello.length).toBe(50_000);
  });

  it("the filter itself: an existing Content-Encoding means hands off", () => {
    const withEncoding = { getHeader: (n: string) => (n.toLowerCase() === "content-encoding" ? "gzip" : undefined) } as any;
    const without = { getHeader: () => undefined } as any;
    const req = { headers: {} } as any;
    expect(shouldCompressResponse(req, withEncoding)).toBe(false);
    expect(shouldCompressResponse(req, without)).toBe(true);
    expect(shouldCompressResponse({ headers: { "x-no-compression": "1" } } as any, without)).toBe(false);
  });

  it("server/index.ts mounts it", () => {
    const require_ = createRequire(import.meta.url);
    const fs = require_("fs") as typeof import("fs");
    const path = require_("path") as typeof import("path");
    const source = fs.readFileSync(path.join(process.cwd(), "server", "index.ts"), "utf8");
    expect(source).toMatch(/mountCompression\(app\)/);
  });
});
