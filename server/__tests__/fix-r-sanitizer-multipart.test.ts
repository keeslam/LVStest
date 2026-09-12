/**
 * FIX-R (BUG-086) — "De globale input-sanitizer raakt multipart-bodies niet
 * (bewezen stored payload)."
 *
 * `app.use(sanitizeInput)` sits in front of the router, where a multipart body
 * does not exist yet: multer parses it inside the route chain. Phase 6-8 proved
 * a stored payload through exactly that door — a text field sent alongside a
 * file reached the database with its markup intact.
 *
 * `sanitizeUploadedFields` wraps the multer instances so whatever multer parsed
 * goes through the same sanitizer. This test drives the middleware pair
 * directly rather than one of the seventeen upload routes: the property is the
 * middleware's, and asserting it here means it holds for every route that uses
 * a wrapped instance, not only the one route a test happened to pick.
 */
import { describe, it, expect } from "vitest";
import express from "express";
import multer from "multer";
import request from "supertest";
import { sanitizeInput, sanitizeUploadedFields } from "../middleware/security/sanitization";

const PAYLOAD = '<img src=x onerror="alert(1)">Opmerking';
const SCRIPT_PAYLOAD = '<script>alert(1)</script>notitie';

/** The shape server/index.ts builds: the global sanitizer, then the router. */
function makeApp(upload: ReturnType<typeof multer>) {
  const app = express();
  app.use(express.json());
  app.use(sanitizeInput);
  app.post("/upload", upload.single("file"), (req, res) => {
    res.json({ body: req.body, file: req.file ? req.file.originalname : null });
  });
  app.post("/json", (req, res) => {
    res.json({ body: req.body });
  });
  return app;
}

describe("BUG-086 — a multipart text field is sanitized like any other", () => {
  it("strips markup from the fields multer parsed, not only from JSON bodies", async () => {
    const app = makeApp(sanitizeUploadedFields(multer({ storage: multer.memoryStorage() })));

    const response = await request(app)
      .post("/upload")
      .field("notes", PAYLOAD)
      .field("documentType", SCRIPT_PAYLOAD)
      .attach("file", Buffer.from("%PDF-1.4 fake"), "bewijs.pdf")
      .expect(200);

    // The stored value keeps its text and loses its markup.
    expect(response.body.body.notes).toBe("Opmerking");
    expect(response.body.body.documentType).toBe("notitie");
    expect(response.body.body.notes).not.toContain("<img");
    expect(response.body.body.documentType).not.toContain("<script");
    // The upload itself still works — this is a sanitizer, not a blocker.
    expect(response.body.file).toBe("bewijs.pdf");
  });

  it("is what the unwrapped instance does not do — the bug, demonstrated", async () => {
    const app = makeApp(multer({ storage: multer.memoryStorage() }));

    const response = await request(app)
      .post("/upload")
      .field("notes", PAYLOAD)
      .attach("file", Buffer.from("%PDF-1.4 fake"), "bewijs.pdf")
      .expect(200);

    // Unwrapped, the payload goes straight through: this is the state the
    // audit found, and the reason every multer instance is now wrapped.
    expect(response.body.body.notes).toContain("<img");
  });

  it("leaves a JSON body to the global middleware, unchanged", async () => {
    const app = makeApp(sanitizeUploadedFields(multer({ storage: multer.memoryStorage() })));

    const response = await request(app).post("/json").send({ notes: PAYLOAD }).expect(200);

    expect(response.body.body.notes).toBe("Opmerking");
  });

  it("every multer instance in the route files is wrapped", async () => {
    // A new upload route added without the wrapper reopens the hole silently,
    // so the wiring itself is asserted rather than trusted.
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const files = [
      "server/routes.ts",
      "server/routes/app-settings.ts",
      "server/routes/damage-check-templates.ts",
      "server/routes/expenses.ts",
      "server/routes/fines.ts",
      "server/routes/pdf-templates.ts",
      "server/routes/portal.ts",
      "server/routes/report-and-label-templates.ts",
    ];
    const unwrapped: string[] = [];
    for (const file of files) {
      const body = readFileSync(join(process.cwd(), file), "utf8");
      for (const line of body.split("\n")) {
        if (!/=\s*multer\(/.test(line)) continue;
        if (line.includes("sanitizeUploadedFields(multer(")) continue;
        unwrapped.push(`${file}: ${line.trim()}`);
      }
    }
    expect(unwrapped).toEqual([]);
  });
});
