/**
 * Handleiding in de app — `GET /api/manual`, `/api/manual/:chapter` en
 * `/api/manual/afbeeldingen/:file` lezen uitsluitend `docs/gebruikershandleiding/`.
 * Een hoofdstuknaam buiten het patroon `NN-naam`, een `../` of een absoluut pad
 * levert 404, nooit een ander bestand van de server.
 */
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import path from "path";

import { registerManualRoutes, resolveManualPath, getManualDir } from "../routes/manual";
import { buildStaffTestApp } from "./portal-helpers";

const passThrough = (_r: any, _s: any, n: any) => n();
const app = buildStaffTestApp([], (a) => registerManualRoutes(a, { requireAuth: passThrough } as any));

describe("manual routes", () => {
  it("lists the chapters in order with the title from the first heading", async () => {
    const res = await request(app).get("/api/manual");
    expect(res.status).toBe(200);
    const slugs = res.body.map((c: { slug: string }) => c.slug);
    expect(slugs[0]).toBe("00-wat-is-nieuw");
    expect(slugs).toContain("06-transport");
    expect(slugs).toEqual([...slugs].sort());
    // README.md and the PDF are not chapters.
    expect(slugs).not.toContain("README");
    const transport = res.body.find((c: { slug: string }) => c.slug === "06-transport");
    expect(transport.title).toBe("6. Transport");
  });

  it("serves one chapter as markdown", async () => {
    const res = await request(app).get("/api/manual/06-transport");
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe("06-transport");
    expect(res.body.markdown).toMatch(/^# 6\. Transport/);
  });

  it("serves an image from the afbeeldingen folder", async () => {
    const res = await request(app).get("/api/manual/afbeeldingen/01-inlogscherm.png");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("refuses anything outside the manual folder", async () => {
    for (const bad of [
      "/api/manual/..%2Fpackage.json",
      "/api/manual/..%2F..%2Fpackage.json",
      "/api/manual/README",
      "/api/manual/06-transport.md",
      "/api/manual/%2Fetc%2Fpasswd",
      "/api/manual/afbeeldingen/..%2F06-transport.md",
      "/api/manual/afbeeldingen/..%2F..%2Fpackage.json",
      "/api/manual/afbeeldingen/package.json",
    ]) {
      const res = await request(app).get(bad);
      expect(res.status, bad).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain("dependencies");
    }
  });

  it("answers 404 for a well-formed name that does not exist", async () => {
    expect((await request(app).get("/api/manual/99-bestaat-niet")).status).toBe(404);
    expect((await request(app).get("/api/manual/afbeeldingen/99-bestaat-niet.png")).status).toBe(404);
  });

  it("searches all chapters and returns the chapter, the section and a snippet per hit", async () => {
    const res = await request(app).get("/api/manual/zoek?q=transportrapport");
    expect(res.status).toBe(200);
    expect(res.body.query).toBe("transportrapport");
    expect(res.body.hits.length).toBeGreaterThan(0);
    const hit = res.body.hits.find((h: { slug: string }) => h.slug === "06-transport");
    expect(hit).toBeTruthy();
    expect(hit.title).toBe("6. Transport");
    expect(typeof hit.heading).toBe("string");
    expect(hit.snippet.toLowerCase()).toContain("transportrapport");
    // Markdown markers do not leak into the snippet.
    expect(hit.snippet).not.toMatch(/\*\*|!\[|\]\(/);
    // Case does not matter.
    const upper = await request(app).get("/api/manual/zoek?q=TRANSPORTRAPPORT");
    expect(upper.body.hits.length).toBe(res.body.hits.length);
  });

  it("answers an empty list for a query shorter than two characters or without hits", async () => {
    expect((await request(app).get("/api/manual/zoek?q=a")).body).toEqual({ query: "a", hits: [], truncated: false });
    expect((await request(app).get("/api/manual/zoek")).body.hits).toEqual([]);
    expect((await request(app).get("/api/manual/zoek?q=xyzzyq-bestaat-niet")).body.hits).toEqual([]);
  });

  it("caps the number of hits and says so", async () => {
    const res = await request(app).get("/api/manual/zoek?q=de");
    expect(res.body.hits.length).toBeLessThanOrEqual(100);
    expect(res.body.truncated).toBe(true);
  });

  it("runs requireAuth on every route", async () => {
    const locked = express();
    registerManualRoutes(locked, { requireAuth: (_r: any, res: any) => res.status(401).json({ message: "Unauthorized" }) } as any);
    for (const url of ["/api/manual", "/api/manual/06-transport", "/api/manual/afbeeldingen/01-inlogscherm.png", "/api/manual/zoek?q=transport"]) {
      expect((await request(locked).get(url)).status, url).toBe(401);
    }
  });
});

describe("resolveManualPath", () => {
  it("keeps a path inside the folder and rejects escapes", () => {
    expect(resolveManualPath("06-transport.md")).toBe(path.join(getManualDir(), "06-transport.md"));
    expect(resolveManualPath("../package.json")).toBeNull();
    expect(resolveManualPath("afbeeldingen/../../package.json")).toBeNull();
    expect(resolveManualPath(path.resolve("package.json"))).toBeNull();
    expect(resolveManualPath("")).toBeNull();
  });
});
