/**
 * Audit remediation P11 / A-11-1 and A-11-3 (docs/audit/fysieke-e2e-audit-2026-10-09.md, module 11):
 *
 *  - the only vehicle diagram on the test database was a 1198 x 24 strip. Nothing can be drawn on
 *    it, the damage check silently lost its core function, and nothing warned. An upload that
 *    cannot be used for marking is now refused with a stable code.
 *  - when no diagram fits the vehicle, `match` still answers with the best available one (the
 *    check must stay usable); it now says how good the fit is, so the check can say
 *    "geen diagram voor dit model" instead of showing another model's picture as if it fitted.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createCanvas } from "canvas";
import { eq, like } from "drizzle-orm";
import { useTempUploadsDir, removeTempUploadsDir } from "./helpers/uploads";

const uploadsDir = useTempUploadsDir("lvs-p11-diagram-");

import { db } from "../db";
import { vehicleDiagramTemplates } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { readImageDimensions } from "../utils/image-dimensions";
import { diagramImageProblem } from "../../shared/diagram-image";

const MAKE = "FIXT-P11-MAKE";

function image(width: number, height: number, type: "image/png" | "image/jpeg" = "image/png"): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ddd";
  ctx.fillRect(0, 0, width, height);
  return type === "image/png" ? canvas.toBuffer("image/png") : canvas.toBuffer("image/jpeg");
}

let admin: TestAgent;

beforeAll(async () => {
  admin = await agentFor("admin");
});

afterAll(async () => {
  await db.delete(vehicleDiagramTemplates).where(like(vehicleDiagramTemplates.make, `${MAKE}%`));
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(uploadsDir);
});

describe("A-11-1 - reading the size of an image", () => {
  it("reads PNG and JPEG headers", () => {
    expect(readImageDimensions(image(1198, 24))).toEqual({ width: 1198, height: 24 });
    expect(readImageDimensions(image(640, 320, "image/jpeg"))).toEqual({ width: 640, height: 320 });
  });
  it("returns null for bytes that are not an image it knows", () => {
    expect(readImageDimensions(Buffer.from("not an image"))).toBeNull();
    expect(readImageDimensions(Buffer.alloc(0))).toBeNull();
  });
});

describe("A-11-1 - what is too small or too flat to draw on", () => {
  it("names the 1198 x 24 strip and tiny images, and lets a normal top view through", () => {
    expect(diagramImageProblem(1198, 24)).toBe("too_flat");
    expect(diagramImageProblem(24, 1198)).toBe("too_flat");
    expect(diagramImageProblem(80, 60)).toBe("too_small");
    expect(diagramImageProblem(1200, 600)).toBeNull();
    expect(diagramImageProblem(900, 900)).toBeNull();
  });
});

describe("A-11-1 - the upload route", () => {
  it("refuses a diagram that cannot be drawn on, with a code, and stores nothing", async () => {
    const res = await admin
      .post("/api/vehicle-diagram-templates")
      .field("make", `${MAKE}-flat`)
      .field("model", "Strip")
      .attach("diagram", image(1198, 24), { filename: "strip.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DIAGRAM_IMAGE_TOO_FLAT");
    expect(res.body.width).toBe(1198);
    expect(res.body.height).toBe(24);
    const rows = await db.select().from(vehicleDiagramTemplates).where(eq(vehicleDiagramTemplates.make, `${MAKE}-flat`));
    expect(rows).toEqual([]);
  });

  it("accepts a normal diagram", async () => {
    const res = await admin
      .post("/api/vehicle-diagram-templates")
      .field("make", `${MAKE}-ok`)
      .field("model", "Fine")
      .attach("diagram", image(1200, 600), { filename: "fine.png", contentType: "image/png" });
    expect(res.status).toBe(201);
  });

  it("refuses a replacement image that cannot be drawn on and keeps the old diagram", async () => {
    const [row] = await db.select().from(vehicleDiagramTemplates).where(eq(vehicleDiagramTemplates.make, `${MAKE}-ok`));
    const res = await admin
      .patch(`/api/vehicle-diagram-templates/${row.id}`)
      .field("make", `${MAKE}-ok`)
      .field("model", "Fine")
      .attach("diagram", image(1198, 24), { filename: "strip.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DIAGRAM_IMAGE_TOO_FLAT");
    const [after] = await db.select().from(vehicleDiagramTemplates).where(eq(vehicleDiagramTemplates.id, row.id));
    expect(after.diagramPath).toBe(row.diagramPath);
  });
});

describe("A-11-3 - match says how well the diagram fits", () => {
  it("exact make and model: fit 'model'", async () => {
    const vehicle = await createFixtureVehicle({ brand: `${MAKE}-ok`, model: "Fine" } as any);
    const res = await admin.get(`/api/vehicle-diagram-templates/match/${vehicle.id}`);
    expect(res.status).toBe(200);
    expect(res.body.fit).toBe("model");
  });

  it("another model: the diagram is still offered, marked as a fallback", async () => {
    const vehicle = await createFixtureVehicle({ brand: "FIXT-P11-OTHER", model: "Nothing like it" } as any);
    const res = await admin.get(`/api/vehicle-diagram-templates/match/${vehicle.id}`);
    expect(res.status).toBe(200);
    expect(res.body.fit).toBe("fallback");
  });
});
